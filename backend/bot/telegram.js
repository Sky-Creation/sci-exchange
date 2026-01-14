import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_TOKEN, TG_ADMINS } from "../config.js";
import { getRates, setRates, updateConfig } from "../services/exchange.service.js";
import { getOrders, updateStatus } from "../services/order.service.js";
import { generateOTP } from "../services/otp.service.js";

let bot = null; function isAdmin(id) { return TG_ADMINS.includes(String(id)); }

export function startBot() {
  if (!TELEGRAM_TOKEN) { console.log("⚠️ Telegram Token not provided."); return; }
  if (bot) return;
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  bot.on('polling_error', (error) => { if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) return; console.error(`❌ Telegram Polling Error: ${error.message}`); });
  console.log("🤖 Telegram bot started");

  bot.onText(/\/help/, msg => { if (!isAdmin(msg.from.id)) return; bot.sendMessage(msg.chat.id, `🛠 *Admin Commands*\n/rate - View rates\n/setrate <MMK> <THB>\n/setbase <Percent>\n/setmargin <Low%> <High%>\n/orders`, { parse_mode: "Markdown" }); });

  bot.onText(/\/rate/, async msg => {
    if (!isAdmin(msg.from.id)) return; const r = await getRates(); const c = r.config || {};
    const status = r.expired ? "🔴 EXPIRED" : "🟢 ACTIVE";
    bot.sendMessage(msg.chat.id, `📊 *Settings* (${status})\nMMK→THB: ${r.mmk_to_thb}\nTHB→MMK: ${r.thb_to_mmk}\nProfit: ${c.base_profit_percent}%`, { parse_mode: "Markdown" });
  });

  bot.onText(/\/setrate (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return; 
    const r = await setRates({ mmk_to_thb: match[1], thb_to_mmk: match[2] });
    bot.sendMessage(msg.chat.id, `✅ *Rates Updated*\nMMK→THB: ${r.mmk_to_thb}\nTHB→MMK: ${r.thb_to_mmk}`, { parse_mode: "Markdown" });
  });

  bot.onText(/\/setbase (\d+(?:\.\d+)?)/, async (msg, match) => { if (!isAdmin(msg.from.id)) return; await updateConfig({ base_profit_percent: parseFloat(match[1]) }); bot.sendMessage(msg.chat.id, `✅ Profit Updated`); });
  
  bot.onText(/\/setmargin (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/, async (msg, match) => { if (!isAdmin(msg.from.id)) return; await updateConfig({ low_margin_percent: parseFloat(match[1]), high_discount_percent: parseFloat(match[2]) }); bot.sendMessage(msg.chat.id, `✅ Margins Updated`); });

  bot.onText(/\/orders/, async msg => {
    if (!isAdmin(msg.from.id)) return; const allOrders = await getOrders(); const orders = allOrders.data ? allOrders.data.filter(o => o.status === "PENDING") : [];
    if (!orders.length) return bot.sendMessage(msg.chat.id, "No pending orders.");
    orders.forEach(o => {
      bot.sendMessage(msg.chat.id, `🧾 ${o.reference} | ${o.amount}\nTo: ${o.accountNo} (${o.accountName})`, { reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `APPROVE_${o.id}` }], [{ text: "❌ Reject", callback_data: `REJECT_${o.id}` }]] } });
    });
  });

  bot.onText(/\/2fa/, msg => { if (!isAdmin(msg.from.id)) return; const code = generateOTP(String(msg.from.id)); bot.sendMessage(msg.chat.id, `🔐 2FA Code: ${code} (5 min)`); });

  bot.on("callback_query", async q => {
    if (!isAdmin(q.from.id)) return; const [action, id] = q.data.split("_");
    try { if (action === "APPROVE") await updateStatus(id, "COMPLETED"); if (action === "REJECT") await updateStatus(id, "REJECTED"); bot.answerCallbackQuery(q.id, { text: "Updated" }); } catch (err) { console.error("Callback Error:", err); }
  });
}

export async function notifyNewOrder(order) {
  if (!bot) return;
  const msg = `🔔 *New Order*\nRef: \`${order.reference}\`\n${order.direction}: ${order.amount.toLocaleString()}\nTo: ${order.accountNo}`;
  TG_ADMINS.forEach(id => { bot.sendMessage(id, msg, { parse_mode: "Markdown" }).catch(() => {}); });
}
