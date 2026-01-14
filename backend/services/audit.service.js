import { AUDIT_FILE } from "../config.js";
import { readJson, writeJson, initStore } from "../utils/store.js";

initStore(AUDIT_FILE, []);
export async function logAudit(action, target) {
  try {
    const logs = await readJson(AUDIT_FILE);
    logs.push({ time: new Date(), action, target });
    await writeJson(AUDIT_FILE, logs);
  } catch (error) { console.error("Audit Log Error:", error); }
}
export async function getAudit() { return await readJson(AUDIT_FILE); }
