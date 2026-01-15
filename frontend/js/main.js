
import jsQR from "jsqr";

const API_URL = "https://sci-exchange-backend.onrender.com/api";

const state = {
    rates: {
        mmk_to_thb: 0,
        thb_to_mmk: 0,
        effective_mmk_thb: 0,
        effective_thb_mmk: 0,
        expired: false,
        config: {},
    },
    ui: {
        currentDirection: "MMK2THB",
        isCalculating: false,
        userIsActive: false,
        activeTimeout: null,
        refreshInterval: null,
        alignedReceiveAmount: 0,
        scannedQRData: null,
    },
    order: {
        currentOrderData: null,
    },
};

const els = {};

const cacheDom = () => {
    const allElements = document.querySelectorAll("*[id]");
    allElements.forEach(el => {
        const camelCasedId = el.id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        els[camelCasedId] = el;
    });
};

const formatNumber = (val) => {
    if (!val) return "";
    let strVal = val.toString();
    const parts = strVal.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
};

const roundSpecial = (val, currency) => {
    return currency === 'MMK' ? Math.round(val / 50) * 50 : Math.round(val);
};

const apiService = {
    fetchRates: async () => {
        try {
            const response = await fetch(`${API_URL}/rates?t=${new Date().getTime()}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Failed to fetch rates");
            return await response.json();
        } catch (error) {
            console.error(error);
            showError("Failed to load rates. Please try again.");
            return null;
        }
    },
    placeOrder: async (formData) => {
        try {
            const response = await fetch(`${API_URL}/orders`, {
                method: "POST",
                body: formData,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to place order");
            return data;
        } catch (error) {
            console.error(error);
            showError(error.message);
            return null;
        }
    }
};

const loadRates = async (isAutoRefresh = false) => {
    if (!isAutoRefresh && els.refreshRateBtn) {
        els.refreshRateBtn.classList.add("animate-spin");
    }

    const data = await apiService.fetchRates();
    if (data) {
        state.rates = data;
        if (state.rates.expired) {
            handleExpiredRates();
            return;
        }
        updateRatesUI();
    }

    if (!isAutoRefresh && els.refreshRateBtn) {
        els.refreshRateBtn.classList.remove("animate-spin");
    }
};

const handleExpiredRates = () => {
    els.adminRateMmkThb.textContent = "Expired";
    els.adminRateThbMmk.textContent = "Expired";
    els.placeOrderBtn.disabled = true;
    els.placeOrderBtn.textContent = "Rates Expired";
    els.adjustmentBadge.textContent = "Rates outdated.";
    els.adjustmentBadge.classList.remove("opacity-0", "text-green-600", "text-orange-500", "text-gray-500");
    els.adjustmentBadge.classList.add("text-red-500");
    els.amountInput.disabled = true;
    els.receiveInput.disabled = true;
};

const updateRatesUI = () => {
    if (!els.placeOrderBtn) return;
    els.placeOrderBtn.textContent = "Place Order";
    els.amountInput.disabled = false;
    els.receiveInput.disabled = false;
    els.adjustmentBadge.classList.remove("text-red-500");
    
    if (!state.rates.config) {
        state.rates.config = {
            base_profit_percent: 0.2,
            low_margin_percent: 0.2,
            high_discount_percent: 0.1,
            threshold_low_mmk: 50000,
            threshold_high_mmk: 1000000,
            threshold_low_thb: 500,
            threshold_high_thb: 8000,
        };
    }

    const baseProfit = (state.rates.config.base_profit_percent || 0) / 100;
    state.rates.effective_mmk_thb = Math.round(state.rates.mmk_to_thb * (1 - baseProfit));
    state.rates.effective_thb_mmk = Math.round(state.rates.thb_to_mmk * (1 + baseProfit));
    
    if (els.adminRateMmkThb) {
      els.adminRateMmkThb.textContent = state.rates.effective_mmk_thb.toLocaleString();
    }
    if (els.adminRateThbMmk) {
      els.adminRateThbMmk.textContent = state.rates.effective_thb_mmk.toLocaleString();
    }
};


const calculate = (mode) => {
    if (state.rates.expired || state.ui.isCalculating) return;
    state.ui.isCalculating = true;
    
    const { amountInput, receiveInput } = els;
    const { currentDirection, config } = state.rates;
    
    const rawValue = (mode === "forward") ? amountInput.value : receiveInput.value;
    const amount = parseFloat(rawValue.replace(/[^0-9.]/g, '')) || 0;

    if (amount === 0) {
        resetCalculation();
        return;
    }

    let finalRate = 0, result = 0, rateLabel = "Standard Rate";
    
    if (currentDirection === "MMK2THB") {
        let baseRate = state.rates.effective_mmk_thb;
        finalRate = baseRate;
        if (amount < config.threshold_low_mmk) { finalRate = baseRate * (1 - config.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
        else if (amount > config.threshold_high_mmk) { finalRate = baseRate * (1 + config.high_discount_percent / 100); rateLabel = "High Volume Rate"; }
        result = (amount / 100000) * finalRate;
    } else {
        let baseRate = state.rates.effective_thb_mmk;
        finalRate = baseRate;
        if (amount < config.threshold_low_thb) { finalRate = baseRate * (1 + config.low_margin_percent / 100); rateLabel = "Low Volume Rate"; } 
        else if (amount > config.threshold_high_thb) { finalRate = baseRate * (1 - config.high_discount_percent / 100); rateLabel = "High Volume Rate"; }
        result = (amount * 100000) / finalRate;
    }

    const roundedResult = roundSpecial(result, currentDirection === "MMK2THB" ? "THB" : "MMK");
    updateUICalculation(amount, roundedResult, finalRate, rateLabel, mode);

    state.ui.isCalculating = false;
};

const resetCalculation = () => {
    els.amountInput.value = "";
    els.receiveInput.value = "";
    els.resultTextRaw.textContent = "Rate: 0.000";
    els.placeOrderBtn.disabled = true;
    els.adjustmentBadge.classList.add("opacity-0");
    state.ui.isCalculating = false;
};

const updateUICalculation = (sendAmount, receiveAmount, finalRate, rateLabel, mode) => {
    if (mode === "forward") {
        els.receiveInput.value = formatNumber(receiveAmount);
    } else {
        els.amountInput.value = formatNumber(sendAmount);
    }

    let isValid = true, minAmountMsg = "";
    if (state.rates.currentDirection === "MMK2THB" && sendAmount < 10000) { isValid = false; minAmountMsg = "Min 10,000 MMK"; }
    else if (state.rates.currentDirection === "THB2MMK" && sendAmount < 100) { isValid = false; minAmountMsg = "Min 100 THB"; }

    if (!isValid) {
        showWarning(minAmountMsg);
        els.placeOrderBtn.disabled = true;
        return;
    }
    
    showRateInfo(finalRate, rateLabel);
    
    state.order.currentOrderData = {
        amount: sendAmount,
        direction: state.rates.currentDirection,
        receiveText: `${formatNumber(receiveAmount)} ${state.rates.currentDirection === "MMK2THB" ? "฿" : "K"}`,
        rateText: finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    };

    els.placeOrderBtn.disabled = false;
};

const showWarning = (message) => {
    const { adjustmentBadge } = els;
    adjustmentBadge.textContent = message;
    adjustmentBadge.className = "text-xs mt-2 h-4 font-medium transition-opacity text-right text-red-500";
    adjustmentBadge.classList.remove("opacity-0");
};

const showRateInfo = (finalRate, rateLabel) => {
    const { adjustmentBadge, resultTextRaw } = els;
    resultTextRaw.textContent = `Rate: ${finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    adjustmentBadge.textContent = `${rateLabel}: ${finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    adjustmentBadge.className = `text-xs mt-2 h-4 font-medium transition-opacity text-right ${
        rateLabel.includes("High") ? "text-green-600" : rateLabel.includes("Low") ? "text-orange-500" : "text-gray-500"
    }`;
    adjustmentBadge.classList.remove("opacity-0");
};

const setDirection = (dir) => {
    if (state.rates.expired) return;
    state.rates.currentDirection = dir;
    const { toggleMmkThb, toggleThbMmk, amountPrefix, receivePrefix } = els;
    const activeClass = ["bg-white", "text-indigo-600", "shadow-sm"];
    const inactiveClass = ["text-gray-500", "hover:text-indigo-600"];

    if (dir === "MMK2THB") {
        toggleMmkThb.classList.add(...activeClass);
        toggleMmkThb.classList.remove(...inactiveClass);
        toggleThbMmk.classList.remove(...activeClass);
        toggleThbMmk.classList.add(...inactiveClass);
        amountPrefix.textContent = "MMK";
        receivePrefix.textContent = "THB";
    } else {
        toggleThbMmk.classList.add(...activeClass);
        toggleThbMmk.classList.remove(...inactiveClass);
        toggleMmkThb.classList.remove(...activeClass);
        toggleMmkThb.classList.add(...inactiveClass);
        amountPrefix.textContent = "THB";
        receivePrefix.textContent = "MMK";
    }
    resetCalculation();
};

const handleSlipUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    els.fileName.textContent = file.name;
    state.ui.scannedQRData = null;
    els.qrResultArea.classList.add("hidden");

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0, img.width, img.height);
            const imageData = context.getImageData(0, 0, img.width, img.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code && code.data) {
                state.ui.scannedQRData = code.data;
                els.modalError.classList.add("hidden");
                els.qrResultArea.classList.remove("hidden");
                els.qrRawContent.textContent = code.data;
            } else {
                showError("Could not detect QR code on the slip.");
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};


const confirmOrder = async () => {
    if (state.rates.expired) {
        showError("Rates have expired. Please refresh.");
        return;
    }

    const bankName = els.modalBankName.value.trim();
    const accountNo = els.modalAccountNo.value.trim();
    const accountName = els.modalAccountName.value.trim();

    if (!bankName || !accountNo || !accountName) {
        showError("Please fill all bank details.");
        return;
    }

    if (els.modalSlip.files.length === 0) {
        showError("Please upload a payment slip.");
        return;
    }

    if (!state.ui.scannedQRData) {
        showError("No QR code found on the slip.");
        return;
    }

    setModalLoading(true);

    const formData = new FormData();
    formData.append("direction", state.order.currentOrderData.direction);
    formData.append("amount", state.order.currentOrderData.amount);
    formData.append("bankName", bankName);
    formData.append("accountNo", accountNo);
    formData.append("accountName", accountName);
    formData.append("slip", els.modalSlip.files[0]);
    formData.append("qr_code", state.ui.scannedQRData);

    const result = await apiService.placeOrder(formData);
    
    setModalLoading(false);

    if (result) {
        closeModal();
        showSuccessModal(result.reference);
        resetCalculation();
    }
};

const setModalLoading = (isLoading) => {
    els.confirmOrderBtn.disabled = isLoading;
    els.confirmOrderBtn.innerHTML = isLoading ? `<span>Verifying...</span>` : `<span>Confirm & Send</span>`;
};

const showSuccessModal = (reference) => {
    els.successRef.textContent = reference;
    els.successModal.classList.remove("hidden");
    els.successModal.classList.add("flex");
};

const openModal = () => {
    if (!state.order.currentOrderData || state.rates.expired) {
        alert("Rates may have expired. Please refresh.");
        return;
    }
    const { currentOrderData } = state.order;
    els.modalConvertAmount.textContent = `${formatNumber(currentOrderData.amount)} ${currentOrderData.direction === "MMK2THB" ? "MMK" : "THB"}`;
    els.modalRate.textContent = currentOrderData.rateText;
    els.modalReceiveAmount.textContent = currentOrderData.receiveText;
    
    resetModalState();
    
    els.orderModal.classList.remove("hidden");
    els.orderModal.classList.add("flex");
};

const closeModal = () => {
    els.orderModal.classList.add("hidden");
    els.orderModal.classList.remove("flex");
};

const resetModalState = () => {
    els.modalBankName.value = "";
    els.modalAccountNo.value = "";
    els.modalAccountName.value = "";
    els.modalSlip.value = "";
    els.fileName.textContent = "Images Only";
    els.modalError.classList.add("hidden");
    els.qrResultArea.classList.add("hidden");
    els.qrRawContent.textContent = "";
    els.confirmOrderBtn.innerHTML = "<span>Confirm & Send</span>";
    els.confirmOrderBtn.disabled = false;
};

const showError = (msg) => {
    if (els.modalError) {
        els.modalError.textContent = msg;
        els.modalError.classList.remove("hidden");
    }
};


const handleInputActivity = (e) => {
    if (state.rates.expired) return;
    
    state.ui.userIsActive = true;
    updateRefreshRate();
    
    if (state.ui.activeTimeout) clearTimeout(state.ui.activeTimeout);
    state.ui.activeTimeout = setTimeout(() => {
        state.ui.userIsActive = false;
        updateRefreshRate();
    }, 30000);

    const input = e.target;
    const formatted = formatNumber(input.value.replace(/[^0-9]/g, ''));
    if (input.value !== formatted) {
        input.value = formatted;
    }
    
    if (e.target.id === "amount-input") {
        calculate("forward");
    } else {
        calculate("reverse");
    }
};

const updateRefreshRate = () => {
    if (state.ui.refreshInterval) clearInterval(state.ui.refreshInterval);
    state.ui.refreshInterval = setInterval(() => loadRates(true), state.ui.userIsActive ? 5000 : 30000);
};

const bindEvents = () => {
    els.amountInput.addEventListener("input", handleInputActivity);
    els.receiveInput.addEventListener("input", handleInputActivity);
    els.modalAccountNo.addEventListener("input", (e) => e.target.value = e.target.value.replace(/[^0-9]/g, ''));
    
    els.toggleMmkThb.addEventListener("click", () => setDirection("MMK2THB"));
    els.toggleThbMmk.addEventListener("click", () => setDirection("THB2MMK"));

    els.refreshRateBtn.addEventListener("click", () => loadRates(false));
    els.clearButton.addEventListener("click", resetCalculation);
    
    els.placeOrderBtn.addEventListener("click", openModal);
    els.closeModalBtn.addEventListener("click", closeModal);
    els.confirmOrderBtn.addEventListener("click", confirmOrder);

    els.closeSuccessBtn.addEventListener("click", () => {
        els.successModal.classList.add("hidden");
        els.successModal.classList.remove("flex");
    });
    
    els.modalSlip.addEventListener("change", handleSlipUpload);
    els.showQrDetailsBtn.addEventListener("click", () => {
        els.qrRawContent.classList.toggle("hidden");
    });

    setInterval(() => {
        if (els.liveClock) {
            els.liveClock.textContent = new Date().toLocaleTimeString();
        }
    }, 1000);
};

const init = () => {
    cacheDom();
    bindEvents();
    loadRates();
    updateRefreshRate();
};

document.addEventListener('DOMContentLoaded', init);
