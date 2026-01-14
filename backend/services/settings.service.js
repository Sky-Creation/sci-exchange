import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

export const getSettings = async () => {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            // If the file doesn't exist, return default settings
            return {
                mmk_to_thb_rate: 0.035,
                thb_to_mmk_rate: 28.5,
                discount_enabled: false,
                discount_percentage: 0
            };
        }
        throw err;
    }
};

export const updateSettings = async (newSettings) => {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(newSettings, null, 4));
        return { success: true, message: 'Settings updated successfully' };
    } catch (err) {
        console.error('Error writing settings file:', err);
        throw new Error('Failed to update settings');
    }
};