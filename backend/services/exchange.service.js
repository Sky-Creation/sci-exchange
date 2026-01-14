import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RATES_FILE = path.join(__dirname, '../data/rates.json');

class ExchangeService {
    
    // FETCH RATES (Frontend calls this)
    getRates() {
        try {
            // Read file fresh every time this function is called
            const rawData = fs.readFileSync(RATES_FILE, 'utf8');
            return JSON.parse(rawData);
        } catch (err) {
            console.error("Error reading rates file:", err);
            return {}; // Return empty or default rates
        }
    }

    // UPDATE RATES (Telegram Bot calls this)
    updateRate(currency, buy, sell) {
        try {
            // 1. Get current rates
            const currentRates = this.getRates();

            // 2. Update memory
            if (!currentRates[currency]) currentRates[currency] = {};
            currentRates[currency].buy = parseFloat(buy);
            currentRates[currency].sell = parseFloat(sell);

            // 3. WRITE TO FILE immediately
            fs.writeFileSync(RATES_FILE, JSON.stringify(currentRates, null, 2));
            
            return true;
        } catch (err) {
            console.error("Error writing rates file:", err);
            return false;
        }
    }
}

export default new ExchangeService();