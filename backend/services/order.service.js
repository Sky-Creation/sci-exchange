import { v4 as uuidv4 } from "uuid";
import { ORDERS_FILE, ARCHIVE_FILE } from "../config.js"; 
import { readJson, writeJson, getLock } from "../utils/store.js"; 
import { logAudit } from "./audit.service.js";
import { getRates } from "./exchange.service.js"; 

function generateReference(direction, orders) {
  const prefix = direction === "MMK2THB" ? "MMTHB" : "THBMM";
  let isUnique = false, reference = "", attempts = 0;
  while (!isUnique && attempts < 100) {
    const timeBit = Date.now().toString().slice(-4);
    const randomBit = Math.random().toString(36).substring(2, 5).toUpperCase();
    reference = `${prefix}-${timeBit}-${randomBit}`;
    if (!orders.some(o => o.reference === reference)) isUnique = true;
    attempts++;
  }
  return reference;
}

export async function createOrder(orderData) {
  const unlock = await getLock(ORDERS_FILE).lock();
  try {
      const orders = await readJson(ORDERS_FILE);
      if (orderData.txid && orderData.txid.length > 4) {
          if (orders.some(o => o.txid === orderData.txid && o.status !== 'REJECTED')) throw new Error("Transaction ID already used.");
      }
      const rates = await getRates(); 
      if (rates.expired) throw new Error("Rates have expired. Please refresh.");

      const reference = generateReference(orderData.direction, orders);
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
        id: uuidv4(), reference, created: new Date().toISOString(), direction: orderData.direction,
        amount, receiveAmount, rateUsed: finalRate, txid: orderData.txid || "", slipUrl: orderData.slipUrl || "",
        bankName: orderData.bankName || "N/A", accountNo: orderData.accountNo || "N/A", accountName: orderData.accountName || "N/A",
        status: "PENDING", userAgent: orderData.userAgent || "Unknown"
      };

      orders.push(newOrder);
      const fs = await import("fs/promises");
      await fs.writeFile(`${ORDERS_FILE}.tmp`, JSON.stringify(orders, null, 2));
      await fs.rename(`${ORDERS_FILE}.tmp`, ORDERS_FILE);
      unlock(); 
      await logAudit("CREATE_ORDER", newOrder.id);
      return newOrder;
  } catch (err) { unlock(); throw err; }
}

export async function getOrders(page = 1, limit = 50, search = "") {
  let orders = await readJson(ORDERS_FILE);
  if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o => (o.reference && o.reference.toLowerCase().includes(q)) || (o.amount && o.amount.toString().includes(q)) || (o.txid && o.txid.toLowerCase().includes(q)) || (o.accountNo && o.accountNo.includes(q)) || (o.accountName && o.accountName.toLowerCase().includes(q)));
  }
  orders.sort((a, b) => new Date(b.created) - new Date(a.created));
  const total = orders.length;
  return { total, page, totalPages: Math.ceil(total / limit), data: orders.slice((page - 1) * limit, (page - 1) * limit + limit) };
}

export async function updateStatus(id, status) {
  const unlock = await getLock(ORDERS_FILE).lock();
  try {
      const orders = await readJson(ORDERS_FILE);
      const idx = orders.findIndex(x => x.id === id);
      if (idx === -1) throw new Error("Order not found");
      orders[idx].status = status; orders[idx].updatedAt = new Date().toISOString();
      const fs = await import("fs/promises");
      await fs.writeFile(`${ORDERS_FILE}.tmp`, JSON.stringify(orders, null, 2));
      await fs.rename(`${ORDERS_FILE}.tmp`, ORDERS_FILE);
      unlock();
      await logAudit("UPDATE_STATUS", `${id} -> ${status}`);
      return orders[idx];
  } catch (err) { unlock(); return null; }
}

export async function archiveOldOrders() {
    const lockOrder = await getLock(ORDERS_FILE).lock();
    try {
        const orders = await readJson(ORDERS_FILE);
        let archive = [];
        try { archive = JSON.parse(await import("fs/promises").then(fs => fs.readFile(ARCHIVE_FILE, 'utf8'))); } catch(e) { archive = []; }

        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activeOrders = [], toArchive = [];

        orders.forEach(o => {
            if ((o.status === 'COMPLETED' || o.status === 'REJECTED') && new Date(o.created) < thirtyDaysAgo) toArchive.push(o);
            else activeOrders.push(o);
        });

        if (toArchive.length > 0) {
            const fs = await import("fs/promises");
            await fs.writeFile(`${ORDERS_FILE}.tmp`, JSON.stringify(activeOrders, null, 2));
            await fs.rename(`${ORDERS_FILE}.tmp`, ORDERS_FILE);
            await fs.writeFile(`${ARCHIVE_FILE}.tmp`, JSON.stringify([...archive, ...toArchive], null, 2));
            await fs.rename(`${ARCHIVE_FILE}.tmp`, ARCHIVE_FILE);
            console.log(`✅ [System] Archived ${toArchive.length} old orders.`);
        }
    } catch (err) { console.error("Archive Error:", err); } finally { lockOrder(); }
}
