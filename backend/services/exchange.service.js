import { getDB } from "../utils/database.js";

class ExchangeService {

    async getRates() {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            db.all("SELECT name, value FROM rates", [], (err, rows) => {
                if (err) return reject(err);
                const rates = {};
                rows.forEach(row => {
                    rates[row.name] = row.value;
                });
                resolve(rates);
            });
        });
    }

    async setRates(newRates) {
        const db = await getDB();
        const stmt = db.prepare("INSERT OR REPLACE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)");
        const timestamp = new Date().toISOString();

        const promises = Object.entries(newRates).map(([name, value]) => {
            // Basic validation
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
            throw err; // Re-throw to be caught by the route handler
        });
    }
}

export default new ExchangeService();
