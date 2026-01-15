import { getDB } from "../utils/database.js";

// Promisified helpers for the sqlite3 library
const dbAll = (db, sql, params) => 
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });

async function getOrders() { 
    const db = await getDB();
    return await dbAll(db, "SELECT * FROM orders", []);
}

export async function dailyReport(date = new Date()) {
  const orders = await getOrders();
  const day = new Date(date).toISOString().slice(0, 10);
  const today = orders.filter(o => new Date(o.created).toISOString().slice(0, 10) === day);
  const completed = today.filter(o => o.status === "COMPLETED");
  const rejected = today.filter(o => o.status === "REJECTED");
  const pending = today.filter(o => o.status === "PENDING");
  const totalMMK = completed.filter(o => o.direction === "MMK2THB").reduce((s, o) => s + Number(o.amount || 0), 0);
  const totalTHB = completed.filter(o => o.direction === "THB2MMK").reduce((s, o) => s + Number(o.amount || 0), 0);
  return { date: day, totalOrders: today.length, completed: completed.length, rejected: rejected.length, pending: pending.length, totalMMK, totalTHB };
}

export async function monthlyReport(year, month) {
  const orders = await getOrders();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthOrders = orders.filter(o => new Date(o.created).toISOString().startsWith(prefix));
  const completed = monthOrders.filter(o => o.status === "COMPLETED");
  const totalMMK = completed.filter(o => o.direction === "MMK2THB").reduce((s, o) => s + Number(o.amount || 0), 0);
  const totalTHB = completed.filter(o => o.direction === "THB2MMK").reduce((s, o) => s + Number(o.amount || 0), 0);
  return { month: prefix, totalOrders: monthOrders.length, completed: completed.length, totalMMK, totalTHB };
}

export async function exportCSV() {
  const orders = await getOrders();
  const headers = ["id", "reference", "created", "direction", "amount", "receiveAmount", "rateUsed", "txid", "slipUrl", "bankName", "accountNo", "accountName", "status", "userAgent", "updatedAt"];
  const rows = orders.map(o => headers.map(h => `"${(o[h] || "").toString().replace(/"/g, '""')}"`).join(","));
  return [headers.join(","), ...rows].join("\n");
}
