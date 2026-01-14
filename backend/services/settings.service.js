import { getDB } from "../utils/database.js";

const defaultSettings = {
    mmk_to_thb_rate: 0.035,
    thb_to_mmk_rate: 28.5,
    discount_enabled: false,
    discount_percentage: 0,
    backup_retention_days: 7, // New setting
};

export const getSettings = async () => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        db.all("SELECT key, value FROM settings", [], (err, rows) => {
            if (err) return reject(err);

            const settings = { ...defaultSettings };
            rows.forEach(row => {
                try {
                    settings[row.key] = JSON.parse(row.value);
                } catch (e) {
                    settings[row.key] = row.value; 
                }
            });
            resolve(settings);
        });
    });
};

export const updateSettings = async (newSettings) => {
    const db = await getDB();
    
    const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");

    const promises = Object.entries(newSettings).map(([key, value]) => {
        return new Promise((resolve, reject) => {
            stmt.run(key, JSON.stringify(value), (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    });

    return Promise.all(promises).then(() => {
        stmt.finalize();
        return { success: true, message: 'Settings updated successfully' };
    }).catch(err => {
        stmt.finalize();
        console.error('Error updating settings:', err);
        throw new Error('Failed to update settings');
    });
};
