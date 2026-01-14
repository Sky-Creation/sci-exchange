
import { RATE_EXPIRY_MINUTES } from "../config.js";
import { getDB } from "../utils/database.js";

const defaultConfig = {
    base_profit_percent: 0.2,
    low_margin_percent: 0.2,
    high_discount_percent: 0.1,
    threshold_low_mmk: 50000,
    threshold_high_mmk: 1000000,
    threshold_low_thb: 500,
    threshold_high_thb: 8000
};

export const getRates = async () => {
    const db = await getDB();
    const rows = await new Promise((resolve, reject) => {
        db.all("SELECT * FROM rates", [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });

    if (rows.length === 0) {
        return { mmk_to_thb: 0, thb_to_mmk: 0, updated: null, config: defaultConfig, expired: true };
    }

    const rates = {
        config: { ...defaultConfig }
    };
    let lastUpdate = null;

    rows.forEach(row => {
        if (row.name === 'mmk_to_thb' || row.name === 'thb_to_mmk') {
            rates[row.name] = row.value;
            if (!lastUpdate || new Date(row.updatedAt) > new Date(lastUpdate)) {
                lastUpdate = row.updatedAt;
            }
        } else {
            rates.config[row.name] = row.value;
        }
    });

    rates.updated = lastUpdate;
    const ageMin = lastUpdate ? (Date.now() - new Date(lastUpdate).getTime()) / 60000 : Infinity;
    rates.expired = ageMin > RATE_EXPIRY_MINUTES;

    return rates;
};

export const setRates = async ({ mmk_to_thb, thb_to_mmk }) => {
    const db = await getDB();
    const updatedAt = new Date().toISOString();

    const stmt = db.prepare("REPLACE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)");
    stmt.run('mmk_to_thb', Number(mmk_to_thb), updatedAt);
    stmt.run('thb_to_mmk', Number(thb_to_mmk), updatedAt);
    stmt.finalize();

    return getRates();
};

export const updateConfig = async (newConfig) => {
    const db = await getDB();
    const updatedAt = new Date().toISOString();
    const stmt = db.prepare("REPLACE INTO rates (name, value, updatedAt) VALUES (?, ?, ?)");

    for (const [key, value] of Object.entries(newConfig)) {
        stmt.run(key, value, updatedAt);
    }
    stmt.finalize();

    return getRates();
};
