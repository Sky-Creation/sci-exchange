
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../utils/database.js";
import { logAudit } from "./audit.service.js";
import exchangeService from "./exchange.service.js";

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

        const existingOrder = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM orders WHERE reference = ?", [reference], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!existingOrder) {
            isUnique = true;
        }
        attempts++;
    }
    return reference;
};

export const createOrder = async (orderData) => {
    const db = await getDB();
    const rates = exchangeService.getRates();

    if (Object.keys(rates).length === 0) {
        throw new Error("Rates are not available. Please try again later.");
    }

    if (orderData.txid && orderData.txid.length > 4) {
        const existingOrder = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM orders WHERE txid = ? AND status != 'REJECTED'", [orderData.txid], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
        if (existingOrder) {
            throw new Error("Transaction ID already used.");
        }
    }

    const reference = await generateReference(orderData.direction);
    const amount = Number(orderData.amount);
    const baseProfit = (rates.config.base_profit_percent || 0) / 100;
    const c = rates.config;
    let finalRate = 0, receiveAmount = 0;

    if (orderData.direction === "MMK2THB") {
        let baseRate = rates.mmk_to_thb;
        finalRate = Math.round(baseRate * (1 - baseProfit));
        if (amount < c.threshold_low_mmk) finalRate *= (1 - c.low_margin_percent / 100);
        else if (amount > c.threshold_high_mmk) finalRate *= (1 + c.high_discount_percent / 100);
        receiveAmount = Math.floor((amount / 100000) * finalRate);
    } else {
        let baseRate = rates.thb_to_mmk;
        finalRate = Math.round(baseRate * (1 + baseProfit));
        if (amount < c.threshold_low_thb) finalRate *= (1 + c.low_margin_percent / 100);
        else if (amount > c.threshold_high_thb) finalRate *= (1 - c.high_discount_percent / 100);
        receiveAmount = Math.floor(((amount * 100000) / finalRate) / 50) * 50;
    }

    const newOrder = {
        id: uuidv4(),
        reference,
        created: new Date().toISOString(),
        direction: orderData.direction,
        amount,
        receiveAmount,
        rateUsed: finalRate,
        txid: orderData.txid || "",
        slipUrl: orderData.slipUrl || "",
        bankName: orderData.bankName || "N/A",
        accountNo: orderData.accountNo || "N/A",
        accountName: orderData.accountName || "N/A",
        status: "PENDING",
        userAgent: orderData.userAgent || "Unknown",
        updatedAt: null
    };

    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO orders (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        stmt.run(newOrder.id, newOrder.reference, newOrder.created, newOrder.direction, newOrder.amount, newOrder.receiveAmount, newOrder.rateUsed, newOrder.txid, newOrder.slipUrl, newOrder.bankName, newOrder.accountNo, newOrder.accountName, newOrder.status, newOrder.userAgent, newOrder.updatedAt, async function(err) {
            if (err) {
                reject(err);
            } else {
                await logAudit("CREATE_ORDER", newOrder.id);
                resolve(newOrder);
            }
        });
        stmt.finalize();
    });
};

export const getOrders = async (page = 1, limit = 50, search = "") => {
    const db = await getDB();
    const offset = (page - 1) * limit;

    let whereClause = "";
    let params = [];

    if (search) {
        const q = `%${search.toLowerCase()}%`;
        whereClause = `WHERE lower(reference) LIKE ? OR lower(amount) LIKE ? OR lower(txid) LIKE ? OR lower(accountNo) LIKE ? OR lower(accountName) LIKE ?`;
        params = [q, q, q, q, q];
    }

    const total = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM orders ${whereClause}`, params, (err, row) => {
            if (err) reject(err);
            resolve(row.count);
        });
    });

    const data = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM orders ${whereClause} ORDER BY created DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    return { total, page, totalPages: Math.ceil(total / limit), data };
};

export const updateStatus = async (id, status) => {
    const db = await getDB();
    const updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
        db.run("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?", [status, updatedAt, id], async function(err) {
            if (err) {
                reject(err);
            } else {
                await logAudit("UPDATE_STATUS", `${id} -> ${status}`);
                db.get("SELECT * FROM orders WHERE id = ?", [id], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            }
        });
    });
};

export const archiveOldOrders = async () => {
    const db = await getDB();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const toArchive = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM orders WHERE (status = 'COMPLETED' OR status = 'REJECTED') AND created < ?", [thirtyDaysAgo.toISOString()], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    if (toArchive.length > 0) {
        const stmt = db.prepare(`INSERT OR IGNORE INTO archive (id, reference, created, direction, amount, receiveAmount, rateUsed, txid, slipUrl, bankName, accountNo, accountName, status, userAgent, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        toArchive.forEach(order => {
            stmt.run(order.id, order.reference, order.created, order.direction, order.amount, order.receiveAmount, order.rateUsed, order.txid, order.slipUrl, order.bankName, order.accountNo, order.accountName, order.status, order.userAgent, order.updatedAt);
        });
        stmt.finalize();

        db.run("DELETE FROM orders WHERE id IN (?)", toArchive.map(o => o.id), () => {
             console.log(`✅ [System] Archived ${toArchive.length} old orders.`);
        });
    }
};
