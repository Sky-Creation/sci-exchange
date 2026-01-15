import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { adminAuth } from "../middleware/adminAuth.js";
import { getOrders, updateStatus } from "../services/order.service.js";
import { getAudit, logAudit } from "../services/audit.service.js";
import exchangeService from "../services/exchange.service.js";
import { createBackup } from "../services/backup.service.js"; 
import { getSettings, updateSettings } from "../services/settings.service.js";
import { exportCSV } from "../services/report.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

const router = express.Router();
router.use(adminAuth);

router.get("/orders", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";
    res.json(await getOrders(page, limit, search));
  } catch (err) { next(err); }
});

router.post("/orders/:id", async (req, res, next) => {
  try {
    const o = await updateStatus(req.params.id, req.body.status);
    if (!o) return res.status(404).json({ error: "Not found" });
    await logAudit(`Order status updated: ${req.params.id}`, `Status changed to ${req.body.status}`);
    res.json(o);
  } catch (err) { next(err); }
});

router.post("/rates", async (req, res, next) => {
  try {
    await exchangeService.setRates(req.body);
    await logAudit("Exchange rates updated", JSON.stringify(req.body));
    res.json({ message: "Rates updated successfully" });
  } catch (err) { next(err); }
});

router.get("/audit", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(await getAudit(limit));
  } catch (err) { next(err); }
});

router.post("/backup", async (req, res, next) => {
  try {
    const result = await createBackup();
    await logAudit("Backup created", `File: ${result.file}`);
    res.json({ ...result, directUrl: `${req.protocol}://${req.get('host')}/admin/backup/download/${result.file}` });
  } catch (err) { 
    await logAudit("Backup failed", err.message);
    next(err); 
  }
});

router.get("/backup/download/:filename", async (req, res, next) => {
    const filename = req.params.filename;
    if (filename.includes("..") || !filename.startsWith("backup_")) {
        return res.status(403).json({ error: "Invalid filename" });
    }
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

router.get("/settings", async (req, res, next) => {
    try {
        const settings = await getSettings();
        res.json(settings);
    } catch (err) {
        next(err);
    }
});

router.post("/settings", async (req, res, next) => {
    try {
        const result = await updateSettings(req.body);
        await logAudit("Settings updated", JSON.stringify(req.body));
        res.json(result);
    } catch (err) {
        next(err);
    }
});

router.get("/export/csv", async (req, res, next) => {
    try {
        const csv = await exportCSV();
        res.header('Content-Type', 'text/csv');
        res.attachment('orders.csv');
        res.send(csv);
    } catch (err) {
        next(err);
    }
});

export default router;
