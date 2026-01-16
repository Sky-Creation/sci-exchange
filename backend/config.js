import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🔧 Loading config...");
console.log("TELEGRAM_BOT_TOKEN exists:", !!process.env.TELEGRAM_BOT_TOKEN);
console.log("TG_ADMIN_IDS:", process.env.TG_ADMIN_IDS);

export const PORT = process.env.PORT || 3000;
export const RATE_EXPIRY_MINUTES = process.env.RATE_EXPIRY_MINUTES ? parseInt(process.env.RATE_EXPIRY_MINUTES) : 1440; // 24 hours

// Absolute paths
export const RATE_FILE = path.join(__dirname, "data/rates.json");
export const ORDERS_FILE = path.join(__dirname, "data/orders.json");
export const ARCHIVE_FILE = path.join(__dirname, "data/archive.json");
export const AUDIT_FILE = path.join(__dirname, "data/audit.json");

export const JWT_SECRET = process.env.JWT_SECRET;
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Telegram
export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TG_ADMINS = process.env.TG_ADMIN_IDS ? process.env.TG_ADMIN_IDS.split(",") : [];

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (process.env.NODE_ENV === 'production') {
    if (!JWT_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
        console.error("FATAL ERROR: Missing required environment variables. Please set JWT_SECRET, ADMIN_USERNAME, and ADMIN_PASSWORD.");
        process.exit(1);
    }
}
