import express from "express";
import { ADMIN_USERNAME, ADMIN_PASSWORD } from "../config.js";
import { verifyOTP } from "../services/otp.service.js";
import { v4 as uuidv4 } from "uuid";
const router = express.Router();
export const sessions = new Map(); 

router.post("/login", (req, res) => {
    const { username, password, otp } = req.body;
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) { return res.status(401).json({ error: "Invalid credentials" }); }
    if (otp && !verifyOTP(otp)) return res.status(401).json({ error: "Invalid 2FA Code" });
    const token = uuidv4();
    sessions.set(token, { user: "admin", expires: Date.now() + 24 * 60 * 60 * 1000 });
    res.json({ token });
});
export default router;
