import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { adminAuth } from "../middleware/adminAuth.js";
import { getOrders, updateStatus } from "../services/order.service.js";
import { getAudit } from "../services/audit.service.js";
import { setRates } from "../services/exchange.service.js";
import { createBackup } from "../services/backup.service.js"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

const router = express.Router();
router.use(adminAuth);

router.get("/orders", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";
    res.json(await getOrders(page, limit, search));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/orders/:id", async (req, res) => {
  try {
    const o = await updateStatus(req.params.id, req.body.status);
    if (!o) return res.status(404).json({ error: "Not found" });
    res.json(o);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/rates", async (req, res) => {
  try { res.json(await setRates(req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/audit", async (req, res) => {
  try { res.json(await getAudit()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/backup", async (req, res) => {
  try {
    const result = await createBackup();
    res.json({ ...result, directUrl: `${req.protocol}://${req.get('host')}/admin/backup/download/${result.file}` });
  } catch (err) { res.status(500).json({ error: "Backup failed: " + err.message }); }
});

router.get("/backup/download/:filename", async (req, res) => {
    const filename = req.params.filename;
    if (filename.includes("..") || !filename.startsWith("backup_")) return res.status(403).json({ error: "Invalid filename" });
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) res.download(filePath, filename); else res.status(404).json({ error: "File not found" });
});
export default router;
