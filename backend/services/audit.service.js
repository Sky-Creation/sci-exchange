import { getDB } from "../utils/database.js";

export const logAudit = async (action, details) => {
    try {
        const db = await getDB();
        const timestamp = new Date().toISOString();
        
        const stmt = db.prepare("INSERT INTO audit (action, details, timestamp) VALUES (?, ?, ?)");
        await new Promise((resolve, reject) => {
            stmt.run(action, details, timestamp, (err) => {
                if (err) reject(err);
                resolve();
            });
            stmt.finalize();
        });

    } catch (error) {
        console.error("Audit Log Error:", error);
    }
};

export const getAudit = async (limit = 100) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM audit ORDER BY timestamp DESC LIMIT ?", [limit], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};
