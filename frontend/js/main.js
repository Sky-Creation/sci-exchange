// FIX: Frontend is on Netlify, so we MUST point to Render backend
const API = "https://sci-exchange-backend.onrender.com";

let rates = { mmk_to_thb: 0, thb_to_mmk: 0, effective_mmk_thb: 0, effective_thb_mmk: 0, expired: false, config: {} };
let currentDirection = "MMK2THB", currentOrderData = null, userIsActive = false, activeTimeout = null, refreshInterval = null, isCalculating = false, alignedReceiveAmount = 0, scannedQRData = null;

const els = {
  mmkThbRate: document.getElementById("admin-rate-mmk-thb"),
  thbMmkRate: document.getElementById("admin-rate-thb-mmk"),
  amountInput: document.getElementById("amount-input"),
  receiveInput: document.getElementById("receive-input"), 
  btnMmkThb: document.getElementById("toggle-mmk-thb"),
  btnThbMmk: document.getElementById("toggle-thb-mmk"),
  resultTextRaw: document.getElementById("result-text-raw"),
  refreshBtn: document.getElementById("refresh-rate-btn"),
  clearBtn: document.getElementById("clear-button"),
  amountPrefix: document.getElementById("amount-prefix"),
  receivePrefix: document.getElementById("receive-prefix"),
  liveClock: document.getElementById("live-clock"),
  badge: document.getElementById("adjustment-badge"),
  placeOrderBtn: document.getElementById("place-order-btn"),
  orderModal: document.getElementById("order-modal"),
  successModal: document.getElementById("success-modal"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  closeSuccessBtn: document.getElementById("close-success-btn"),
  confirmOrderBtn: document.getElementById("confirm-order-btn"),
  modalConvert: document.getElementById("modal-convert-amount"),
  modalRate: document.getElementById("modal-rate"),
  modalReceive: document.getElementById("modal-receive-amount"),
  modalBankName: document.getElementById("modal-bank-name"), 
  modalAccountNo: document.getElementById("modal-account-no"),
  modalAccountName: document.getElementById("modal-account-name"),
  modalSlip: document.getElementById("modal-slip"),
  modalFileName: document.getElementById("file-name"),
  modalError: document.getElementById("modal-error"),
  qrResultArea: document.getElementById("qr-result-area"),
  qrShowDetailsBtn: document.getElementById("show-qr-details-btn"),
  qrRawContent: document.getElementById("qr-raw-content"),
  successRef: document.getElementById("success-ref")
};

function roundInt(num) { return Math.round(num); }
function cleanNumber(val) { return val.replace(/[^0-9.]/g, ''); }
function formatNumber(val) { if (!val) return ""; let strVal = val.toString(); const parts = strVal.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return parts.join('.'); }
function roundSpecial(val, currency) { return currency === 'MMK' ? Math.round(val / 50) * 50 : Math.round(val); }

function findNicestSourceAmount(targetVal, rate, direction) {
    let exactSource = (direction === "MMK2THB") ? (targetVal * 100000) / rate : (targetVal * rate) / 100000;
    const steps = [100000, 50000, 10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
    for (let step of steps) {
        const candidate = Math.round(exactSource / step) * step;
        let forwardResult = (direction === "MMK2THB") ? Math.round((candidate / 100000) * rate) : Math.round(((candidate * 100000) / rate) / 50) * 50;
        if (Math.abs(forwardResult - targetVal) < ((direction === "THB2MMK") ? 50.01 : 1.01)) return candidate;
    }
    return exactSource;
}

async function loadRates(isAutoRefresh = false) {
  if (!isAutoRefresh) els.refreshBtn.classList.add("animate-spin");
  try {
    const res = await fetch(`${API}/api/rates?t=${new Date().getTime()}`, { cache: "no-store" });
    const data = await res.json();
    rates = data;
    if (rates.expired) {
        els.mmkThbRate.textContent = "Expired"; els.thbMmkRate.textContent = "Expired"; els.placeOrderBtn.disabled = true; els.placeOrderBtn.textContent = "Rates Expired"; 
        els.badge.textContent = "Rates outdated."; els.badge.classList.remove("opacity-0"); els.badge.classList.add("text-red-500"); els.amountInput.disabled = true; els.receiveInput.disabled = true; return;
    } else {
        els.placeOrderBtn.textContent = "Place Order"; els.amountInput.disabled = false; els.receiveInput.disabled = false; els.badge.classList.remove("text-red-500");
    }
    if (!rates.config) rates.config = { base_profit_percent: 0.2, low_margin_percent: 0.2, high_discount_percent: 0.1, threshold_low_mmk: 50000, threshold_high_mmk: 1000000, threshold_low_thb: 500, threshold_high_thb: 8000 };
    if (!isAutoRefresh) { els.amountInput.value = ""; els.receiveInput.value = ""; els.resultTextRaw.textContent = "0.000"; els.badge.classList.add("opacity-0"); els.placeOrderBtn.disabled = true; }
    
    const baseProfit = (rates.config.base_profit_percent || 0) / 100;
    rates.effective_mmk_thb = roundInt(rates.mmk_to_thb * (1 - baseProfit));
    rates.effective_thb_mmk = roundInt(rates.thb_to_mmk * (1 + baseProfit));
    els.mmkThbRate.textContent = rates.effective_mmk_thb.toLocaleString(); els.thbMmkRate.textContent = rates.effective_thb_mmk.toLocaleString();
    if (isAutoRefresh) {
        if (document.activeElement === els.amountInput) calculateForward();
        else if (document.activeElement === els.receiveInput) calculateReverse();
    }
  } catch (err) { if (!isAutoRefresh) { els.mmkThbRate.textContent = "Error"; els.thbMmkRate.textContent = "Error"; } } finally { if (!isAutoRefresh) els.refreshBtn.classList.remove("animate-spin"); }
}

function calculateForward() {
  if (rates.expired || isCalculating) return;
  isCalculating = true;
  const rawValue = cleanNumber(els.amountInput.value);
  const amount = parseFloat(rawValue) || 0;
  const c = rates.config;
  let finalRate = 0, result = 0, rateLabel = "Standard Rate";
  
  if (amount === 0) { els.receiveInput.value = ""; els.resultTextRaw.textContent = "0.000"; els.placeOrderBtn.disabled = true; els.badge.classList.add("opacity-0"); isCalculating = false; return; }

  if (currentDirection === "MMK2THB") {
    let baseRate = rates.effective_mmk_thb; finalRate = baseRate;
    if (amount < c.threshold_low_mmk) { finalRate = baseRate * (1 - c.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
    else if (amount > c.threshold_high_mmk) { finalRate = baseRate * (1 + c.high_discount_percent / 100); rateLabel = "High Volume Rate"; }
    result = (amount / 100000) * finalRate;
  } else {
    let baseRate = rates.effective_thb_mmk; finalRate = baseRate;
    if (amount < c.threshold_low_thb) { finalRate = baseRate * (1 + c.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
    else if (amount > c.threshold_high_thb) { finalRate = baseRate * (1 - c.high_discount_percent / 100); rateLabel = "High Volume Rate"; }
    result = (amount * 100000) / finalRate;
  }
  updateUI(amount, roundSpecial(result, currentDirection === "MMK2THB" ? "THB" : "MMK"), finalRate, rateLabel, "FORWARD");
  isCalculating = false;
}

function calculateReverse() {
    if (rates.expired || isCalculating) return;
    isCalculating = true;
    const rawValue = cleanNumber(els.receiveInput.value);
    let targetAmount = parseFloat(rawValue) || 0;
    const c = rates.config;
    if (targetAmount === 0) { els.amountInput.value = ""; els.resultTextRaw.textContent = "0.000"; els.placeOrderBtn.disabled = true; els.badge.classList.add("opacity-0"); isCalculating = false; return; }
    targetAmount = roundSpecial(targetAmount, currentDirection === "MMK2THB" ? "THB" : "MMK");

    let finalRate = 0, rateLabel = "Standard Rate";
    if (currentDirection === "MMK2THB") {
        const baseR = rates.effective_mmk_thb;
        let s3 = (targetAmount * 100000) / baseR;
        if (s3 < c.threshold_low_mmk) { finalRate = baseR * (1 - c.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
        else if (s3 > c.threshold_high_mmk) { finalRate = baseR * (1 + c.high_discount_percent / 100); rateLabel = "High Volume Rate"; } 
        else finalRate = baseR;
    } else {
        const baseR = rates.effective_thb_mmk;
        let s3 = (targetAmount * baseR) / 100000;
        if (s3 < c.threshold_low_thb) { finalRate = baseR * (1 + c.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
        else if (s3 > c.threshold_high_thb) { finalRate = baseR * (1 - c.high_discount_percent / 100); rateLabel = "High Volume Rate"; } 
        else finalRate = baseR;
    }

    let niceSource = findNicestSourceAmount(targetAmount, finalRate, currentDirection);
    const roundedSend = roundSpecial(niceSource, currentDirection === "MMK2THB" ? "MMK" : "THB");
    alignedReceiveAmount = (currentDirection === "MMK2THB") ? roundSpecial((roundedSend / 100000) * finalRate, "THB") : roundSpecial(((roundedSend * 100000) / finalRate), "MMK");
    updateUI(roundedSend, alignedReceiveAmount, finalRate, rateLabel, "REVERSE");
    isCalculating = false;
}

function updateUI(sendAmount, receiveAmount, finalRate, rateLabel, mode) {
    if (mode === "FORWARD") els.receiveInput.value = formatNumber(receiveAmount); else els.amountInput.value = formatNumber(sendAmount);
    let isValid = true, minAmountMsg = "";
    if (currentDirection === "MMK2THB" && sendAmount < 10000) { isValid = false; minAmountMsg = "Min 10,000 MMK"; } 
    else if (currentDirection === "THB2MMK" && sendAmount < 100) { isValid = false; minAmountMsg = "Min 100 THB"; }

    if (!isValid) { els.badge.textContent = minAmountMsg; els.badge.className = "text-xs mt-2 h-4 font-medium transition-opacity text-right text-red-500"; els.badge.classList.remove("opacity-0"); els.placeOrderBtn.disabled = true; return; }

    els.resultTextRaw.textContent = `Rate: ${finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    currentOrderData = { amount: sendAmount, direction: currentDirection, receiveText: `${formatNumber(receiveAmount)} ${currentDirection === "MMK2THB" ? "฿" : "K"}`, rateText: finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 }) };
    els.placeOrderBtn.disabled = false;
    els.badge.textContent = `${rateLabel}: ${finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    els.badge.className = "text-xs mt-2 h-4 font-medium transition-opacity text-right " + (rateLabel.includes("High") ? "text-green-600" : rateLabel.includes("Low") ? "text-orange-500" : "text-gray-500");
    els.badge.classList.remove("opacity-0");
}

function handleInput(e) {
  if (rates.expired) return;
  userIsActive = true; updateRefreshRate();
  if (activeTimeout) clearTimeout(activeTimeout);
  activeTimeout = setTimeout(() => { userIsActive = false; updateRefreshRate(); }, 30000);
  const input = e.target; const formatted = formatNumber(input.value.replace(/[^0-9]/g, ''));
  if (input.value !== formatted) input.value = formatted;
  if (e.target.id === "amount-input") calculateForward(); else calculateReverse();
}

els.receiveInput.addEventListener("blur", () => { if (alignedReceiveAmount > 0) els.receiveInput.value = formatNumber(alignedReceiveAmount); });
function handleNumericInput(e) { e.target.value = e.target.value.replace(/[^0-9]/g, ''); }
function updateRefreshRate() { if (refreshInterval) clearInterval(refreshInterval); refreshInterval = setInterval(() => loadRates(true), userIsActive ? 5000 : 30000); }
function setDirection(dir) {
  if (rates.expired) return;
  currentDirection = dir;
  const activeClass = ["bg-white", "text-indigo-600", "shadow-sm"], inactiveClass = ["text-gray-500", "hover:text-indigo-600"];
  if (dir === "MMK2THB") {
    els.btnMmkThb.classList.add(...activeClass); els.btnMmkThb.classList.remove(...inactiveClass); 
    els.btnThbMmk.classList.remove(...activeClass); els.btnThbMmk.classList.add(...inactiveClass); 
    els.amountPrefix.textContent = "MMK"; els.receivePrefix.textContent = "THB";
  } else {
    els.btnThbMmk.classList.add(...activeClass); els.btnThbMmk.classList.remove(...inactiveClass); 
    els.btnMmkThb.classList.remove(...activeClass); els.btnMmkThb.classList.add(...inactiveClass); 
    els.amountPrefix.textContent = "THB"; els.receivePrefix.textContent = "MMK";
  }
  els.amountInput.value = ""; els.receiveInput.value = ""; els.badge.classList.add("opacity-0"); els.resultTextRaw.textContent = "0.000"; els.placeOrderBtn.disabled = true; alignedReceiveAmount = 0;
}

function openModal() {
    if (!currentOrderData || rates.expired) { alert("Rates expired. Please refresh."); return; }
    els.modalConvert.textContent = `${formatNumber(currentOrderData.amount)} ${currentDirection === "MMK2THB" ? "MMK" : "THB"}`; 
    els.modalRate.textContent = currentOrderData.rateText; els.modalReceive.textContent = currentOrderData.receiveText;
    if(els.modalBankName) els.modalBankName.value = ""; els.modalAccountNo.value = ""; els.modalAccountName.value = ""; els.modalSlip.value = ""; els.modalFileName.textContent = "PNG, JPG (MAX. 5MB)"; els.modalError.classList.add("hidden"); els.qrResultArea.classList.add("hidden"); els.qrRawContent.textContent = "";
    els.confirmOrderBtn.innerHTML = "<span>Confirm & Send</span>"; els.confirmOrderBtn.disabled = false;
    els.orderModal.classList.remove("hidden"); els.orderModal.classList.add("flex");
}

function closeModal() { els.orderModal.classList.add("hidden"); els.orderModal.classList.remove("flex"); }

async function confirmOrder() {
    if (rates.expired) { showError("Rates expired."); return; }
    const bankName = els.modalBankName ? els.modalBankName.value.trim() : "N/A", accountNo = els.modalAccountNo.value.trim(), accountName = els.modalAccountName.value.trim();
    if (!bankName || !accountNo || !accountName) { showError("Please fill all fields."); return; }
    if (els.modalSlip.files.length === 0) { showError("Please upload a Slip."); return; }
    if (!scannedQRData) { showError("No QR code found on slip."); return; }
    
    els.confirmOrderBtn.disabled = true; els.confirmOrderBtn.innerHTML = `Verifying...`;
    const formData = new FormData(); 
    formData.append("direction", currentDirection); formData.append("amount", currentOrderData.amount); 
    formData.append("bankName", bankName); formData.append("accountNo", accountNo); formData.append("accountName", accountName); 
    formData.append("slip", els.modalSlip.files[0]); formData.append("qr_code", scannedQRData);
    
    try {
        const res = await fetch(`${API}/api/orders`, { method: "POST", body: formData }); const data = await res.json();
        if (res.ok) { closeModal(); els.successRef.textContent = data.reference; els.successModal.classList.remove("hidden"); els.successModal.classList.add("flex"); els.amountInput.value = ""; els.receiveInput.value = ""; els.badge.classList.add("opacity-0"); els.placeOrderBtn.disabled = true; } 
        else throw new Error(data.error || "Failed to place order");
    } catch (err) { showError(err.message); els.confirmOrderBtn.innerHTML = "<span>Try Again</span>"; els.confirmOrderBtn.disabled = false; }
}

function showError(msg) { els.modalError.textContent = msg; els.modalError.classList.remove("hidden"); if(els.modalError.parentElement.classList.contains("hidden")) els.modalError.parentElement.classList.remove("hidden"); }

els.qrShowDetailsBtn.addEventListener("click", () => { els.qrRawContent.classList.toggle("hidden"); });
els.modalSlip.addEventListener("change", function(e) {
    if (this.files && this.files[0]) {
        els.modalFileName.textContent = this.files[0].name; scannedQRData = null; els.qrResultArea.classList.add("hidden");
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image(); img.onload = function() {
                const canvas = document.createElement("canvas"); const context = canvas.getContext("2d");
                canvas.width = img.width; canvas.height = img.height; context.drawImage(img, 0, 0, img.width, img.height);
                const imageData = context.getImageData(0, 0, img.width, img.height); const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code && code.data) { scannedQRData = code.data; els.modalError.classList.add("hidden"); } else { els.qrResultArea.classList.add("hidden"); showError("Could not detect QR code."); }
            }; img.src = event.target.result;
        }; reader.readAsDataURL(this.files[0]);
    }
});

els.amountInput.addEventListener("input", handleInput); els.receiveInput.addEventListener("input", handleInput); els.modalAccountNo.addEventListener("input", handleNumericInput);
els.btnMmkThb.addEventListener("click", () => setDirection("MMK2THB")); els.btnThbMmk.addEventListener("click", () => setDirection("THB2MMK"));
els.refreshBtn.addEventListener("click", () => loadRates(false)); els.clearBtn.addEventListener("click", () => { els.amountInput.value = ""; els.receiveInput.value = ""; els.badge.classList.add("opacity-0"); els.placeOrderBtn.disabled = true; });
els.placeOrderBtn.addEventListener("click", openModal); els.closeModalBtn.addEventListener("click", closeModal); els.confirmOrderBtn.addEventListener("click", confirmOrder); els.closeSuccessBtn.addEventListener("click", () => { els.successModal.classList.add("hidden"); els.successModal.classList.remove("flex"); });
setInterval(() => { els.liveClock.textContent = new Date().toLocaleTimeString(); }, 1000);
loadRates(); updateRefreshRate();
