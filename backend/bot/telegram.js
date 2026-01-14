import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_TOKEN, TG_ADMINS } from "../config.js";
import { getSettings, updateSettings } from "../services/settings.service.js";
import { getOrders, updateStatus } from "../services/order.service.js";
import { generateOTP } from "../services/otp.service.js";
import exchangeService from '../services/exchange.service.js';

let bot = null; 
function isAdmin(id) { 
    return TG_ADMINS.includes(String(id)); 
}

export function startBot() {
  if (!TELEGRAM_TOKEN) { 
      console.log("⚠️ Telegram Token not provided."); 
      return; 
  }
  if (bot) return;
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  bot.on('polling_error', (error) => { 
      if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) return; 
      console.error(`❌ Telegram Polling Error: ${error.message}`); 
  });
  console.log("🤖 Telegram bot started");

  bot.onText(/\/help/, msg => { 
      if (!isAdmin(msg.from.id)) return; 
      bot.sendMessage(msg.chat.id, `🛠 *Admin Commands*\n/settings - View settings\n/update <CURRENCY> <BUY> <SELL> - Set exchange rates\n/setdiscount <percentage> - Set discount percentage\n/orders - View pending orders`, { parse_mode: "Markdown" }); 
  });

  bot.onText(/\/settings/, async msg => {
    if (!isAdmin(msg.from.id)) return; 
    const settings = await getSettings();
    bot.sendMessage(msg.chat.id, `📊 *Current Settings*\nMMK→THB Rate: ${settings.mmk_to_thb_rate}\nTHB→MMK Rate: ${settings.thb_to_mmk_rate}\nDiscount: ${settings.discount_percentage}%`, { parse_mode: "Markdown" });
  });

  bot.onText(/\/update (.+) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/, (msg, match) => {
    if (!isAdmin(msg.from.id)) return;
    const [currency, buy, sell] = [match[1], match[2], match[3]];
    const success = exchangeService.updateRate(currency, buy, sell);
    
    if (success) {
        bot.sendMessage(msg.chat.id, `✅ Rates for ${currency} updated.\nBuy: ${buy}\nSell: ${sell}`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ Failed to update rates.`);
    }
  });

  bot.onText(/\/setdiscount (\d+(?:\.\d+)?)/, async (msg, match) => { 
      if (!isAdmin(msg.from.id)) return; 
      const newSettings = { 
          discount_percentage: parseFloat(match[1]) 
      }; 
      const settings = await getSettings(); 
      await updateSettings({...settings, ...newSettings}); 
      bot.sendMessage(msg.chat.id, `✅ Discount Updated to ${newSettings.discount_percentage}%`); 
  });

  bot.onText(/\/orders/, async msg => {
    if (!isAdmin(msg.from.id)) return; 
    const allOrders = await getOrders(); 
    const orders = allOrders.data ? allOrders.data.filter(o => o.status === "PENDING") : [];
    if (!orders.length) return bot.sendMessage(msg.chat.id, "No pending orders.");
    orders.forEach(o => {
      bot.sendMessage(msg.chat.id, `🧾 ${o.reference} | ${o.amount}\nTo: ${o.accountNo} (${o.accountName})`, { reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `APPROVE_${o.id}` }], [{ text: "❌ Reject", callback_data: `REJECT_${o.id}` }]] } });
    });
  });

  bot.onText(/\/2fa/, msg => { 
      if (!isAdmin(msg.from.id)) return; 
      const code = generateOTP(String(msg.from.id)); 
      bot.sendMessage(msg.chat.id, `🔐 2FA Code: ${code} (5 min)`); 
  });

  bot.on("callback_query", async q => {
    if (!isAdmin(q.from.id)) return; 
    const [action, id] = q.data.split("_");
    try { 
        if (action === "APPROVE") await updateStatus(id, "COMPLETED"); 
        if (action === "REJECT") await updateStatus(id, "REJECTED"); 
        bot.answerCallbackQuery(q.id, { text: "Updated" }); 
    } catch (err) { 
        console.error("Callback Error:", err); 
    }
  });
}

export async function notifyNewOrder(order) {
  if (!bot) return;
  const msg = `🔔 *New Order*\nRef: \`${order.reference}\`\n${order.direction}: ${order.amount.toLocaleString()}\nTo: ${order.accountNo}`;
  TG_ADMINS.forEach(id => { bot.sendMessage(id, msg, { parse_mode: "Markdown" }).catch(() => {}); });
}
