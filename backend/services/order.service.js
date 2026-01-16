import { v4 as uuidv4 } from "uuid";
import { getDB } from "../utils/database.js";
import { logAudit } from "./audit.service.js";
import exchangeService from "./exchange.service.js";
import { getSettings } from "./settings.service.js";

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

const dbGet = (db, sql, params) => 
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });

/**
 * Rounds amounts to appropriate precision for currency display
 * @param {number} val - The amount to round
 * @param {string} currency - The currency type ('MMK' or 'THB')
 * @returns {number} - The rounded amount
 */
const roundSpecial = (val, currency) => {
    if (currency === 'MMK') {
        return Math.round(val / 50) * 50;
    }
    return Math.round(val);
};


const generateReference = async (direction) => {
    const db = await getDB();
    const prefix = direction === "MMK2THB" ? "MMTHB" : "THBMM";
    let isUnique = false;
    let reference = "";
    let attempts = 0;

    while (!isUnique && attempts < 100) {
        const timeBit = Date.now().toString().slice(-4);
        const randomBit = Math.random().toString(36).substring(2, 5).toUpperCase();
        reference = `${prefix}-${timeBit}-${randomBit}`;

        const existingOrder = await dbGet(db, "SELECT id FROM orders WHERE reference = ?", [reference]);
        if (!existingOrder) {
            isUnique = true;
        }
        attempts++;
    }
    if (!isUnique) throw new Error("Failed to generate a unique reference after 100 attempts.");
    return reference;
};

export const createOrder = async (orderData) => {
    const db = await getDB();
    const rates = await exchangeService.getRates(); // Must await this async call
    const settings = await getSettings();

    if (rates.expired) {
        throw new Error("Cannot create order, rates have expired.");
    }

    // Validate against existing TXID
    if (orderData.txid && orderData.txid.length > 4) {
        const existingOrder = await dbGet(db, "SELECT id FROM orders WHERE txid = ? AND status != 'REJECTED'", [orderData.txid]);
        if (existingOrder) {
            throw new Error("Transaction ID already used.");
        }
    }

    const reference = await generateReference(orderData.direction);
    const amount = Number(orderData.amount);
    const baseProfit = (settings.base_profit_percent || 0) / 100;
    let finalRate = 0, receiveAmount = 0;

    if (orderData.direction === "MMK2THB") {
        finalRate = rates.mmk_to_thb * (1 - baseProfit);
        receiveAmount = (amount / 100000) * finalRate;
    } else { // THB2MMK
        finalRate = rates.thb_to_mmk * (1 + baseProfit);
        receiveAmount = amount * finalRate;
    }

    const newOrder = {
        id: uuidv4(),
        reference,
        created: new Date().toISOString(),
        direction: orderData.direction,
        amount: parseFloat(amount.toFixed(2)),
        receiveAmount: roundSpecial(receiveAmount, orderData.direction === 'MMK2THB' ? 'THB' : 'MMK'),
        rateUsed: parseFloat(finalRate.toFixed(5)),
        txid: orderData.txid || "",
        slipUrl: orderData.slipUrl || "",
        bankName: orderData.bankName || "N/A",
        accountNo: orderData.accountNo || "N/A",
        accountName: orderData.accountName || "N/A",
        status: "PENDING",
        userAgent: orderData.userAgent || "Unknown",
        updatedAt: null
    };

    const sql = `INSERT INTO orders (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    await dbRun(db, sql, Object.values(newOrder));
    await logAudit("CREATE_ORDER", newOrder.id);
    
    return newOrder;
};

export const getOrders = async (page = 1, limit = 50, search = "") => {
    const db = await getDB();
    const offset = (page - 1) * limit;
    let whereClause = "";
    const params = [];

    if (search) {
        const q = `%${search.toLowerCase()}%`;
        whereClause = `WHERE lower(reference) LIKE ? OR lower(amount) LIKE ? OR lower(txid) LIKE ? OR lower(accountNo) LIKE ? OR lower(accountName) LIKE ?`;
        params.push(q, q, q, q, q);
    }

    const totalRow = await dbGet(db, `SELECT COUNT(*) as count FROM orders ${whereClause}`, params);
    const total = totalRow.count;

    const data = await dbAll(db, `SELECT * FROM orders ${whereClause} ORDER BY created DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);

    return { total, page, totalPages: Math.ceil(total / limit), data };
};

export const updateStatus = async (id, status) => {
    const db = await getDB();
    const updatedAt = new Date().toISOString();
    const result = await dbRun(db, "UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?", [status, updatedAt, id]);

    if (result.changes === 0) {
        throw new Error(`Order with ID ${id} not found.`);
    }

    await logAudit("UPDATE_STATUS", `${id} -> ${status}`);
    return await dbGet(db, "SELECT * FROM orders WHERE id = ?", [id]);
};

export const archiveOldOrders = async () => {
    const db = await getDB();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const toArchive = await dbAll(db, "SELECT * FROM orders WHERE (status = 'COMPLETED' OR status = 'REJECTED') AND created < ?", [thirtyDaysAgo.toISOString()]);

    if (toArchive.length > 0) {
        await dbRun(db, "BEGIN TRANSACTION");
        try {
            const insertSql = `INSERT OR IGNORE INTO archive (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const deleteSql = `DELETE FROM orders WHERE id IN (${toArchive.map(() => '?').join(',')})`;

            for (const order of toArchive) {
                await dbRun(db, insertSql, Object.values(order));
            }
            
            await dbRun(db, deleteSql, toArchive.map(o => o.id));
            
            await dbRun(db, "COMMIT");
            console.log(`✅ [System] Archived ${toArchive.length} old orders.`);
            await logAudit("ARCHIVE_ORDERS", `Archived ${toArchive.length} orders.`);
        } catch (err) {
            await dbRun(db, "ROLLBACK");
            console.error("Error archiving orders, transaction rolled back:", err);
            throw err;
        }
    }
};
