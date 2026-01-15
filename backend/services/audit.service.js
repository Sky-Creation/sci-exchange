import { getDB } from "../utils/database.js";

// Promisified helper for the sqlite3 library
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

export const logAudit = async (action, details) => {
    // The calling function is responsible for handling errors.
    // This ensures that if logging fails, it can be caught by the parent operation (e.g., inside a transaction).
    const db = await getDB();
    const timestamp = new Date().toISOString();
    const sql = "INSERT INTO audit (action, details, timestamp) VALUES (?, ?, ?)";
    
    // Let errors propagate up to the caller
    await dbRun(db, sql, [action, details, timestamp]);
};

export const getAudit = async (limit = 100) => {
    const db = await getDB();
    const sql = "SELECT * FROM audit ORDER BY timestamp DESC LIMIT ?";
    return await dbAll(db, sql, [limit]);
};
