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
getDB();

const allowedOrigins = ["https://sci-exchange.netlify.app"];
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:5500", "http://localhost:5500");
}

app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// Routes
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/api", publicRoutes);

app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/admin")) {
        return res.status(404).json({ error: "Endpoint not found" });
    }
    res.send("SCI Exchange Backend is Running. Visit the frontend to use the app.");
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
      startBot();
  }

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
  
  archiveOldOrders();
});
