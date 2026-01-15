import { getDB } from "../utils/database.js";
import { RATE_EXPIRY_MINUTES } from "../config.js";

class ExchangeService {

    getRates() {
        const db = getDB(); // Assuming getDB provides a synchronous connection from a pool
        const rates = { expired: true }; // Default to expired

        try {
            // This is a simplified example. In a real app, you might use a more robust data loading method.
            // For this specific case, we assume the rates are in memory or a simple file, not from a complex async source.
            const rateData = db.prepare("SELECT name, value, updatedAt FROM rates").all();
            
            if (!rateData.length) {
                console.log("No rates found in the database.");
                return rates; // Returns { expired: true }
            }

            const lastUpdated = new Date(rateData[0].updatedAt);
            const now = new Date();
            const minutesDiff = (now.getTime() - lastUpdated.getTime()) / 60000;
            
            if (minutesDiff > RATE_EXPIRY_MINUTES) {
                console.log(`Rates have expired. Last update was ${minutesDiff.toFixed(2)} minutes ago.`);
                rates.expired = true;
            } else {
                rates.expired = false;
            }

            rateData.forEach(row => {
                rates[row.name] = row.value;
            });

            return rates;

        } catch (err) {
            console.error("Error getting rates from DB:", err);
            return { expired: true, error: "Failed to retrieve rates." }; // Ensure it's always considered expired on error
        }
    }

    async setRates(newRates) {
        const db = await getDB();
        const stmt = db.prepare("INSERT OR REPLACE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)");
        const timestamp = new Date().toISOString();

        const promises = Object.entries(newRates).map(([name, value]) => {
            if (typeof value !== 'number' || !isFinite(value)) {
                return Promise.reject(new Error(`Invalid value for rate ${name}: ${value}`));
            }
            return new Promise((resolve, reject) => {
                stmt.run(name, value, timestamp, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
        });

        return Promise.all(promises).then(() => {
            stmt.finalize();
        }).catch(err => {
            stmt.finalize();
            console.error("Error setting rates:", err);
            throw err; 
        });
    }
}

export default new ExchangeService();
