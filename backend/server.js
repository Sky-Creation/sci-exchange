import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PORT } from "./config.js";
import { getDB } from "./utils/database.js";

// Routes
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import publicRoutes from "./routes/public.js";

// Services
import { startBot } from "./bot/telegram.js";
import { archiveOldOrders } from "./services/order.service.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
await getDB();

// FIX: CORS Configuration for Netlify Frontend
app.use(cors({
    origin: [
        "https://sci-exchange.netlify.app", // Production Frontend
        "http://localhost:3000",            // Local Backend Dev
        "http://127.0.0.1:5500",            // Local Frontend Dev (Live Server)
        "http://localhost:5500"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());
// We still serve static files as a fallback, but primary frontend is Netlify
app.use(express.static(path.join(__dirname, "../frontend")));

// Routes
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/api", publicRoutes);

// Fallback (Only useful if you visit the backend URL directly)
app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/admin")) {
        return res.status(404).json({ error: "Endpoint not found" });
    }
    res.send("SCI Exchange Backend is Running. Visit https://sci-exchange.netlify.app/ to use the app.");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  startBot();

  // Schedule Archiving Task (Every 24 hours)
  setInterval(() => {
      console.log("⏰ Running daily maintenance...");
      archiveOldOrders();
  }, 24 * 60 * 60 * 1000);
  
  archiveOldOrders();
});
