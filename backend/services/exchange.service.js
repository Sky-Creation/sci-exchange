import { getDB } from "../utils/database.js";
import { RATE_EXPIRY_MINUTES } from "../config.js";

// A helper to promisify the callback-based sqlite3 API
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

class ExchangeService {

    async getRates() {
        const db = await getDB();

        try {
            const rateRows = await dbAll(db, "SELECT name, value, updatedAt FROM rates", []);
            
            if (!rateRows || rateRows.length === 0) {
                console.log("No rates found in the database.");
                return { expired: true };
            }

            const rates = { expired: true };
            const lastUpdated = new Date(rateRows[0].updatedAt);
            const now = new Date();
            const minutesDiff = (now.getTime() - lastUpdated.getTime()) / 60000;
            
            if (minutesDiff <= RATE_EXPIRY_MINUTES) {
                rates.expired = false;
            } else {
                 console.log(`Rates expired. Last update: ${minutesDiff.toFixed(2)} mins ago.`);
            }

            rateRows.forEach(row => {
                rates[row.name] = row.value;
            });
            
            return rates;

        } catch (err) {
            console.error("Error in getRates:", err);
            return { expired: true, error: "Failed to retrieve rates from the database." };
        }
    }

    async setRates(newRates) {
        const db = await getDB();
        const timestamp = new Date().toISOString();

        try {
            // Use a transaction for atomicity
            await dbRun(db, "BEGIN TRANSACTION");

            for (const [name, value] of Object.entries(newRates)) {
                if (typeof value !== 'number' || !isFinite(value)) {
                    throw new Error(`Invalid value for rate ${name}: ${value}`);
                }
                const sql = `INSERT OR REPLACE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)`;
                await dbRun(db, sql, [name, value, timestamp]);
            }

            await dbRun(db, "COMMIT");
            console.log("Rates successfully updated in the database.");

        } catch (err) {
            console.error("Error in setRates, rolling back transaction:", err);
            try {
                await dbRun(db, "ROLLBACK");
            } catch (rollbackErr) {
                console.error("Fatal: Could not rollback transaction:", rollbackErr);
            }
            throw err; // Re-throw to be caught by the calling function (e.g., in telegram bot)
        }
    }
}

export default new ExchangeService();
