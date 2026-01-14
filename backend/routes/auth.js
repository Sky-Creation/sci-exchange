
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ADMIN_USERNAME, ADMIN_PASSWORD, JWT_SECRET } from "../config.js";
import { verifyOTP } from "../services/otp.service.js";

const router = express.Router();

// A salt for hashing the password. In a real application, you would generate
// and store this securely.
const saltRounds = 10;

// Hash the admin password on startup
let hashedPassword;
bcrypt.hash(ADMIN_PASSWORD, saltRounds, (err, hash) => {
    if (err) {
        console.error("Error hashing password:", err);
        process.exit(1);
    }
    hashedPassword = hash;
});

router.post("/login", async (req, res) => {
    const { username, password, otp } = req.body;

    if (username !== ADMIN_USERNAME) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    try {
        const isMatch = await bcrypt.compare(password, hashedPassword);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error) {
        console.error("Error comparing password:", error);
        return res.status(500).json({ error: "Internal server error" });
    }

    if (otp && !verifyOTP(otp)) {
        return res.status(401).json({ error: "Invalid 2FA Code" });
    }

    const token = jwt.sign({ user: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token });
});

export default router;
