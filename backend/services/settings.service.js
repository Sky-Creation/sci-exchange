import { getDB } from "../utils/database.js";
import { logAudit } from "./audit.service.js";

// Promisified helpers for the sqlite3 library
const dbRun = (db, sql, params) => 
    new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });

const dbAll = (db, sql, params) => 
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });

const defaultSettings = {
    mmk_to_thb_rate: 0.035,
    thb_to_mmk_rate: 28.5,
    discount_enabled: false,
    discount_percentage: 0,
    backup_retention_days: 7,
    base_profit_percent: 0,
    threshold_low_mmk: 100000,
    low_margin_percent: 0,
    threshold_high_mmk: 1000000,
    high_discount_percent: 0,
    threshold_low_thb: 1000,
    threshold_high_thb: 10000,
};

export const getSettings = async () => {
    const db = await getDB();
    const rows = await dbAll(db, "SELECT key, value FROM settings", []);
    
    const settings = { ...defaultSettings };
    rows.forEach(row => {
        try {
            // Values are stored as JSON strings, so they must be parsed.
            settings[row.key] = JSON.parse(row.value);
        } catch (e) {
            // Fallback for values that aren't valid JSON.
            settings[row.key] = row.value; 
        }
    });
    return settings;
};

export const updateSettings = async (newSettings) => {
    const db = await getDB();
    
    await dbRun(db, "BEGIN TRANSACTION");
    try {
        const sql = "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)";
        for (const [key, value] of Object.entries(newSettings)) {
            // Store all values as JSON strings for consistency
            await dbRun(db, sql, [key, JSON.stringify(value)]);
        }
        await dbRun(db, "COMMIT");
        
        await logAudit("UPDATE_SETTINGS", JSON.stringify(newSettings));
        return { success: true, message: 'Settings updated successfully' };

    } catch (err) {
        await dbRun(db, "ROLLBACK");
        console.error('Error updating settings, transaction rolled back:', err);
        throw new Error('Failed to update settings');
    }
};
