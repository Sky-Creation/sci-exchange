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
import { adminAuth } from "./middleware/adminAuth.js";

// Services
import { startBot } from "./bot/telegram.js";
import { archiveOldOrders } from "./services/order.service.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
getDB();

const allowedOrigins = ["https://sci-exchange.netlify.app"];
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:5500", "http://localhost:5500");
}

// Core Middleware
app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());

// API Routes - These must come before serving the frontend
app.use("/auth", authRoutes);
app.use("/admin", adminAuth, adminRoutes);
app.use("/api", publicRoutes);

// Serve Frontend Static Files
const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

// SPA Catch-All Route - This must come after API routes and static files
app.get("*", (req, res) => {
    // Any request that is not an API call and not a static file will serve the index.html
    res.sendFile(path.join(frontendPath, "index.html"));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    console.error("Central Error Handler:", err);
    if (!res.headersSent) {
        res.status(err.status || 500).json({ error: err.message || 'Something broke!' });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  startBot();

  // Schedule Archiving Task (Every 24 hours)
  setInterval(async () => {
      try {
        console.log("⏰ Running daily maintenance...");
        const result = await archiveOldOrders();
        console.log(`✅ Daily maintenance complete. Archived ${result.archivedCount} orders.`);
      } catch (error) {
        console.error("Daily maintenance failed:", error);
      }
  }, 24 * 60 * 60 * 1000);
  
  // Run once on startup
  archiveOldOrders();
});
