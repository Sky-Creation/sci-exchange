import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import exchangeService from "../services/exchange.service.js";
import { createOrder } from "../services/order.service.js";
import { notifyNewOrder } from "../bot/telegram.js";
import { validateOrder } from "../middleware/validation.js";
import slipService from "../services/slip.service.js"; 

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
    const rates = exchangeService.getRates(); // Now a sync call
    if (!rates) throw new Error("Rates service returned null");
    res.json(rates);
  } catch (err) { console.error("GET /rates Error:", err); res.status(500).json({ error: "Service Unavailable" }); }
});

router.post("/orders", upload.single("slip"), validateOrder, async (req, res) => {
  try {
    const rates = exchangeService.getRates();
    // Simple check if rates are loaded
    if (Object.keys(rates).length === 0) {
        return res.status(403).json({ error: "Rates are not available." });
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

    // The raw QR data from the verified slip
    orderData.qrCode = verification.data.raw;

    // TODO: Manually upload req.file.buffer to Cloudinary if needed and set slipUrl
    // For now, we are just verifying and not storing the slip image itself

    const newOrder = await createOrder(orderData);
    notifyNewOrder(newOrder).catch(console.error);
    res.status(201).json(newOrder);

  } catch (err) { 
      console.error("Order Error:", err); 
      res.status(500).json({ error: "Failed to process order" }); 
  }
});

export default router;
