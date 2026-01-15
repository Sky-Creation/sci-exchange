import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import exchangeService from "../services/exchange.service.js";
import { createOrder } from "../services/order.service.js";
import { notifyNewOrder } from "../bot/telegram.js";
import { validateOrder } from "../middleware/validation.js";
import slipService from "../services/slip.service.js"; 
import rateService from "../services/rate.service.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage to get file buffer
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/rates", (req, res) => {
  try {
    // getRates is now a synchronous function
    const rates = exchangeService.getRates();
    res.json(rates);
  } catch (err) { 
    console.error("GET /rates Error:", err);
    // Send a structured error response that the frontend can use
    res.status(500).json({ error: "Service Unavailable", expired: true }); 
  }
});

router.post("/calculate", async (req, res, next) => {
    try {
        const { direction, amount } = req.body;
        
        // Server-side validation
        if (!direction || !amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: "Invalid direction or amount" });
        }

        const result = await rateService.calculate(direction, amount);
        res.json(result);
    } catch (err) {
        // Pass errors to the centralized error handler
        next(err);
    }
});

router.post("/orders", upload.single("slip"), validateOrder, async (req, res) => {
  try {
    const rates = exchangeService.getRates();
    
    // CRITICAL FIX: Check the expired flag before allowing an order
    if (rates.expired) {
        return res.status(403).json({ error: "Rates have expired. Please refresh and try again." });
    }
    
    const orderData = req.body;
    orderData.userAgent = req.headers["user-agent"];
    orderData.amount = parseFloat(orderData.amount);

    if (!req.file) {
        return res.status(400).json({ error: 'Slip image is required.' });
    }

    const verification = await slipService.verifySlip(req.file.buffer);

    if (!verification.valid) {
        return res.status(400).json({ error: verification.message });
    }

    orderData.qrCode = verification.data.raw;

    // Note: Cloudinary upload logic can be added here if needed

    const newOrder = await createOrder(orderData);
    notifyNewOrder(newOrder).catch(console.error); // Send notification without holding up the response
    res.status(201).json(newOrder);

  } catch (err) { 
      console.error("Order Submission Error:", err); 
      res.status(500).json({ error: "Failed to process order. Please try again later." }); 
  }
});

export default router;
