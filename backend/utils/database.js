
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "data", "database.db");

let dbPromise;

const initializeDB = () => {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("Error opening database:", err.message);
                return reject(err);
            }
            console.log("Connected to the SQLite database.");
            resolve(db);
        });
    });

    return dbPromise.then(db => {
        return Promise.all([
            db.run(`CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                reference TEXT NOT NULL,
                created TEXT NOT NULL,
                direction TEXT NOT NULL,
                amount REAL NOT NULL,
                receiveAmount REAL NOT NULL,
                rateUsed REAL NOT NULL,
                txid TEXT,
                slipUrl TEXT,
                bankName TEXT,
                accountNo TEXT,
                accountName TEXT,
                status TEXT NOT NULL,
                userAgent TEXT,
                updatedAt TEXT
            )`),
            db.run(`CREATE TABLE IF NOT EXISTS rates (
                name TEXT PRIMARY KEY,
                value REAL NOT NULL,
                updatedAt TEXT NOT NULL
            )`),
            db.run(`CREATE TABLE IF NOT EXISTS archive (
                id TEXT PRIMARY KEY,
                reference TEXT NOT NULL,
                created TEXT NOT NULL,
                direction TEXT NOT NULL,
                amount REAL NOT NULL,
                receiveAmount REAL NOT NULL,
                rateUsed REAL NOT NULL,
                txid TEXT,
                slipUrl TEXT,
                bankName TEXT,
                accountNo TEXT,
                accountName TEXT,
                status TEXT NOT NULL,
                userAgent TEXT,
                updatedAt TEXT
            )`),
            db.run(`CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`),
            db.run(`CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                details TEXT,
                timestamp TEXT NOT NULL
            )`)
        ]).then(() => {
            console.log("Database schema initialized.");
            return db;
        });
    });
};

// Immediately attempt to initialize
initializeDB().catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
});


export const getDB = () => {
    if (!dbPromise) {
        throw new Error("Database not initialized. Check server startup logs.");
    }
    return dbPromise;
};
