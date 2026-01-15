import exchangeService from './exchange.service.js';
import { getSettings } from './settings.service.js';

class RateService {
    async calculate(direction, amount) {
        if (!direction || !amount) {
            throw new Error('Direction and amount are required');
        }

        const rates = await exchangeService.getRates();
        const settings = await getSettings();
        const c = settings;

        let finalRate = 0;
        let receiveAmount = 0;
        let rateLabel = "Standard Rate";

        const baseProfit = (c.base_profit_percent || 0) / 100;

        if (direction === "MMK2THB") {
            const baseRate = rates.mmk_to_thb;
            finalRate = baseRate * (1 - baseProfit);

            if (amount < c.threshold_low_mmk) {
                finalRate *= (1 - c.low_margin_percent / 100);
                rateLabel = "Low Volume Rate";
            } else if (amount > c.threshold_high_mmk) {
                finalRate *= (1 + c.high_discount_percent / 100);
                rateLabel = "High Volume Rate";
            }
            
            receiveAmount = (amount / 100000) * finalRate;

        } else { // THB2MMK
            const baseRate = rates.thb_to_mmk;
            finalRate = baseRate * (1 + baseProfit);

            if (amount < c.threshold_low_thb) {
                finalRate *= (1 + c.low_margin_percent / 100);
                rateLabel = "Low Volume Rate";
            } else if (amount > c.threshold_high_thb) {
                finalRate *= (1 - c.high_discount_percent / 100);
                rateLabel = "High Volume Rate";
            }
            receiveAmount = (amount * 100000) / finalRate;
        }

        return {
            amount,
            direction,
            finalRate: parseFloat(finalRate.toFixed(4)),
            receiveAmount: this.roundSpecial(receiveAmount, direction === 'MMK2THB' ? 'THB' : 'MMK'),
            rateLabel,
        };
    }

    roundSpecial(val, currency) {
        if (currency === 'MMK') {
            return Math.round(val / 50) * 50;
        }
        return Math.round(val);
    }
}

export default new RateService();
