import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

export const adminAuth = (req, res, next) => {
    const token = (req.headers["authorization"] || "").split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired" });
        }
        return res.status(401).json({ error: "Invalid token" });
    }
};
