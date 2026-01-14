import { RATE_FILE, RATE_EXPIRY_MINUTES } from "../config.js";
import { readJson, writeJson, initStore } from "../utils/store.js";

initStore(RATE_FILE, { 
    mmk_to_thb: 0, thb_to_mmk: 0, updated: new Date().toISOString(), 
    config: { base_profit_percent: 0.2, low_margin_percent: 0.2, high_discount_percent: 0.1, threshold_low_mmk: 50000, threshold_high_mmk: 1000000, threshold_low_thb: 500, threshold_high_thb: 8000 }
});

export async function getRates() {
  const r = await readJson(RATE_FILE);
  if (!r.updated) return { ...r, expired: true };
  const lastUpdate = new Date(r.updated).getTime();
  const ageMin = (Date.now() - lastUpdate) / 60000;
  return { ...r, expired: ageMin > RATE_EXPIRY_MINUTES };
}

export async function setRates({ mmk_to_thb, thb_to_mmk }) {
  const r = await readJson(RATE_FILE);
  r.mmk_to_thb = Number(mmk_to_thb);
  r.thb_to_mmk = Number(thb_to_mmk);
  r.updated = new Date().toISOString(); 
  await writeJson(RATE_FILE, r);
  return r;
}

export async function updateConfig(newConfig) {
  const r = await readJson(RATE_FILE);
  r.config = { ...r.config, ...newConfig };
  r.updated = new Date().toISOString(); 
  await writeJson(RATE_FILE, r);
  return r;
}
