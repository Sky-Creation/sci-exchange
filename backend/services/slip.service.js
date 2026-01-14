import { getOrders } from "./order.service.js";

class SlipService {
  async verifySlip(qrRaw, userAmount) {
    console.log("🔍 [SlipService] Verifying QR:", qrRaw ? "Found" : "Missing");
    if (!qrRaw || qrRaw.trim() === "") throw new Error("REJECTED: No valid QR code detected. Please upload a clear original slip.");

    const isUrl = qrRaw.startsWith("http");
    const isEmvco = qrRaw.startsWith("000201");
    const validKeywords = ["bank", "promptpay", "transfer", "ref", "verify", "slip", "transaction"];
    const hasKeyword = validKeywords.some(k => qrRaw.toLowerCase().includes(k));

    if (!isEmvco && (!isUrl || !hasKeyword)) throw new Error("REJECTED: The uploaded QR code does not appear to be a valid bank transfer slip.");
    if (qrRaw.length < 15) throw new Error("REJECTED: QR code format invalid or too short.");

    const result = await getOrders();
    if ((result.data || []).some(order => order.qrCode === qrRaw && order.status !== "REJECTED")) {
      throw new Error("REJECTED: This slip has already been used. Duplicate detected.");
    }

    const extracted = this.parseQR(qrRaw);
    if (extracted.amount && Math.abs(extracted.amount - userAmount) > 1) console.warn(`⚠️ [SlipService] Amount Mismatch! QR: ${extracted.amount}, User: ${userAmount}`);

    return { isValid: true, extracted: extracted };
  }

  parseQR(qr) {
      const data = { raw: qr, amount: null, bankRef: null };
      try {
          if (qr.startsWith("http")) {
             const url = new URL(qr);
             if (url.searchParams.has("amount")) data.amount = parseFloat(url.searchParams.get("amount"));
             if (url.searchParams.has("ref")) data.bankRef = url.searchParams.get("ref");
          }
      } catch (e) { }
      return data;
  }
}
export const slipService = new SlipService();
