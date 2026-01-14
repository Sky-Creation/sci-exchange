
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "data", "database.db");

let db;
let dbInitialized = false;
let dbInitializationPromise = null;

const initializeDB = () => {
    if (dbInitializationPromise) {
        return dbInitializationPromise;
    }

    dbInitializationPromise = new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("Error opening database:", err.message);
                reject(err);
            } else {
                console.log("Connected to the SQLite database.");

                db.serialize(() => {
                    // Create Orders Table
                    db.run(`CREATE TABLE IF NOT EXISTS orders (
                        id TEXT PRIMARY KEY,
                        reference TEXT,
                        created TEXT,
                        direction TEXT,
                        amount REAL,
                        receiveAmount REAL,
                        rateUsed REAL,
                        txid TEXT,
                        slipUrl TEXT,
                        bankName TEXT,
                        accountNo TEXT,
                        accountName TEXT,
                        status TEXT,
                        userAgent TEXT,
                        updatedAt TEXT
                    )`);

                    // Create Rates Table
                    db.run(`CREATE TABLE IF NOT EXISTS rates (
                        name TEXT PRIMARY KEY,
                        value REAL,
                        updatedAt TEXT
                    )`);

                    // Create Archive Table
                    db.run(`CREATE TABLE IF NOT EXISTS archive (
                        id TEXT PRIMARY KEY,
                        reference TEXT,
                        created TEXT,
                        direction TEXT,
                        amount REAL,
                        receiveAmount REAL,
                        rateUsed REAL,
                        txid TEXT,
                        slipUrl TEXT,
                        bankName TEXT,
                        accountNo TEXT,
                        accountName TEXT,
                        status TEXT,
                        userAgent TEXT,
                        updatedAt TEXT
                    )`);

                    // Create Settings Table
                    db.run(`CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )`);

                    // Create Audit Table
                    db.run(`CREATE TABLE IF NOT EXISTS audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        action TEXT,
                        details TEXT,
                        timestamp TEXT
                    )`, (err) => {
                        if (err) {
                            console.error("Error creating audit table:", err.message);
                            reject(err);
                        } else {
                            dbInitialized = true;
                            resolve(db);
                        }
                    });
                });
            }
        });
    });

    return dbInitializationPromise;
};

export const getDB = async () => {
    if (!dbInitialized) {
        await initializeDB();
    }
    return db;
};
