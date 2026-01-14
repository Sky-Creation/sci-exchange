
import { getDB } from "../utils/database.js";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ordersPath = path.join(__dirname, "..", "data", "orders.json");
const archivePath = path.join(__dirname, "..", "data", "archive.json");
const ratesPath = path.join(__dirname, "..", "data", "rates.json");

const migrate = async () => {
    const db = await getDB();

    try {
        // Migrate Orders
        const ordersData = await fs.readFile(ordersPath, "utf8");
        const orders = JSON.parse(ordersData);

        if (orders.length > 0) {
            const stmt = db.prepare(`INSERT OR IGNORE INTO orders (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            orders.forEach(order => {
                stmt.run(order.id, order.reference, order.created, order.direction, order.amount, order.receiveAmount, order.rateUsed, order.txid, order.slipUrl, order.bankName, order.accountNo, order.accountName, order.status, order.userAgent, order.updatedAt);
            });
            stmt.finalize();
            console.log(`${orders.length} orders migrated.`);
        }

        // Migrate Archive
        try {
            const archiveData = await fs.readFile(archivePath, "utf8");
            const archive = JSON.parse(archiveData);

            if (archive.length > 0) {
                const stmt = db.prepare(`INSERT OR IGNORE INTO archive (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                archive.forEach(order => {
                    stmt.run(order.id, order.reference, order.created, order.direction, order.amount, order.receiveAmount, order.rateUsed, order.txid, order.slipUrl, order.bankName, order.accountNo, order.accountName, order.status, order.userAgent, order.updatedAt);
                });
                stmt.finalize();
                console.log(`${archive.length} archived orders migrated.`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            console.log('archive.json not found, skipping archive migration.');
        }

        // Migrate Rates
        const ratesData = await fs.readFile(ratesPath, "utf8");
        const rates = JSON.parse(ratesData);

        if (rates) {
            const stmt = db.prepare(`INSERT OR IGNORE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)`)
            for (const [key, value] of Object.entries(rates)) {
                if (key !== 'config' && key !== 'expired') { // Assuming 'config' and 'expired' are not rates
                    stmt.run(key, value, new Date().toISOString());
                }
            }
            stmt.finalize();
            console.log(`Rates migrated.`);
        }

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        db.close(() => {
            console.log("Database connection closed.");
        });
    }
};

migrate();
