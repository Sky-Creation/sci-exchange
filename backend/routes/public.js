import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { getRates } from "../services/exchange.service.js";
import { createOrder } from "../services/order.service.js";
import { notifyNewOrder } from "../bot/telegram.js";
import { validateOrder } from "../middleware/validation.js";
import { slipService } from "../services/slip.service.js"; 

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({ cloudinary, params: { folder: 'customer_slips', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] } });
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/rates", async (req, res) => {
  try {
    const rates = await getRates();
    if (!rates) throw new Error("Rates service returned null");
    res.json(rates);
  } catch (err) { console.error("GET /rates Error:", err); res.status(500).json({ error: "Service Unavailable" }); }
});

router.post("/orders", upload.single("slip"), validateOrder, async (req, res) => {
  try {
    const rates = await getRates();
    if (rates.expired) return res.status(403).json({ error: "Rates expired." });
    
    const orderData = req.body;
    orderData.userAgent = req.headers["user-agent"];
    orderData.amount = parseFloat(orderData.amount);
    const qrRaw = req.body.qr_code;
    
    try {
        const verify = await slipService.verifySlip(qrRaw, orderData.amount);
        orderData.verificationMetadata = verify;
    } catch (e) {
        if (req.file && req.file.filename) await cloudinary.uploader.destroy(req.file.filename);
        return res.status(400).json({ error: e.message });
    }

    if (req.file) orderData.slipUrl = req.file.path;
    orderData.qrCode = qrRaw;
    const newOrder = await createOrder(orderData);
    notifyNewOrder(newOrder).catch(console.error);
    res.status(201).json(newOrder);

  } catch (err) { console.error("Order Error:", err); res.status(500).json({ error: "Failed to process order" }); }
});
export default router;
