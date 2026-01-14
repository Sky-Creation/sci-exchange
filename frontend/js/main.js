
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

const App = () => {
    return `
    <div class="container mx-auto p-4 max-w-lg bg-white rounded-lg shadow-lg">
        <header class="flex justify-between items-center mb-4">
            <h1 class="text-2xl font-bold text-indigo-600">SCI Exchange</h1>
            <div id="live-clock" class="text-sm font-medium text-gray-600"></div>
        </header>

        <div class="grid grid-cols-2 gap-4 mb-4 text-center">
            <div>
                <p class="text-sm text-gray-500">MMK to THB</p>
                <p id="admin-rate-mmk-thb" class="text-xl font-bold">0</p>
            </div>
            <div>
                <p class="text-sm text-gray-500">THB to MMK</p>
                <p id="admin-rate-thb-mmk" class="text-xl font-bold">0</p>
            </div>
        </div>

        <div class="relative mb-4">
            <div class="flex rounded-md shadow-sm">
                <button id="toggle-mmk-thb" class="flex-1 rounded-l-md px-4 py-2 bg-white text-indigo-600 shadow-sm">MMK to THB</button>
                <button id="toggle-thb-mmk" class="flex-1 rounded-r-md px-4 py-2 text-gray-500 hover:text-indigo-600">THB to MMK</button>
            </div>
        </div>

        <div class="space-y-4">
            <div class="relative">
                <label for="amount-input" class="text-sm font-medium text-gray-700">You Send</label>
                <div class="flex items-center">
                    <input type="text" id="amount-input" class="w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="0">
                    <span id="amount-prefix" class="ml-2 font-medium text-gray-500">MMK</span>
                </div>
            </div>
            <div class="relative">
                <label for="receive-input" class="text-sm font-medium text-gray-700">They Receive</label>
                <div class="flex items-center">
                    <input type="text" id="receive-input" class="w-full p-2 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="0">
                    <span id="receive-prefix" class="ml-2 font-medium text-gray-500">THB</span>
                </div>
            </div>
        </div>

        <div class="flex justify-between items-center mt-4">
            <div id="result-text-raw" class="text-sm text-gray-600">Rate: 0.000</div>
            <div id="adjustment-badge" class="text-xs mt-2 h-4 font-medium transition-opacity text-right opacity-0"></div>
        </div>
        
        <div class="flex items-center justify-between mt-6">
            <button id="refresh-rate-btn" class="p-2 text-gray-500 hover:text-indigo-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M4 4l16 16"></path></svg>
            </button>
            <button id="clear-button" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Clear</button>
            <button id="place-order-btn" class="px-6 py-2 text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400" disabled>Place Order</button>
        </div>

        <div id="order-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3 text-center">
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Confirm Order</h3>
                    <div class="mt-2 px-7 py-3">
                        <p class="text-sm text-gray-500">You are converting <strong id="modal-convert-amount"></strong></p>
                        <p class="text-sm text-gray-500">at a rate of <strong id="modal-rate"></strong></p>
                        <p class="text-lg font-bold text-indigo-600">They will receive <strong id="modal-receive-amount"></strong></p>
                    </div>
                    <div class="space-y-4 text-left">
                        <input type="text" id="modal-bank-name" placeholder="Bank Name" class="w-full p-2 border-gray-300 rounded-md">
                        <input type="text" id="modal-account-no" placeholder="Account Number" class="w-full p-2 border-gray-300 rounded-md">
                        <input type="text" id="modal-account-name" placeholder="Account Name" class="w-full p-2 border-gray-300 rounded-md">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Upload Slip</label>
                            <input type="file" id="modal-slip" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"/>
                            <p id="file-name" class="text-xs text-gray-500 mt-1">PNG, JPG (MAX. 5MB)</p>
                            <div id="qr-result-area" class="hidden mt-2 text-xs text-gray-600">
                                <p>QR Code Detected. <button id="show-qr-details-btn" class="text-indigo-500">Details</button></p>
                                <pre id="qr-raw-content" class="hidden mt-1 p-2 bg-gray-100 rounded"></pre>
                            </div>
                        </div>
                    </div>
                    <div id="modal-error" class="hidden mt-2 text-sm text-red-600"></div>
                    <div class="items-center px-4 py-3">
                        <button id="close-modal-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md mr-2">Cancel</button>
                        <button id="confirm-order-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-md">Confirm & Send</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="success-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
            <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div class="mt-3 text-center">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                        <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg leading-6 font-medium text-gray-900">Order Placed!</h3>
                    <div class="mt-2 px-7 py-3">
                        <p class="text-sm text-gray-500">Your order has been placed successfully. Your reference is <strong id="success-ref"></strong>.</p>
                    </div>
                    <div class="items-center px-4 py-3">
                        <button id="close-success-btn" class="px-4 py-2 bg-green-500 text-white rounded-md">Done</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
};

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
    if (!isAutoRefresh) {
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

    if (!isAutoRefresh) {
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
    
    els.adminRateMmkThb.textContent = state.rates.effective_mmk_thb.toLocaleString();
    els.adminRateThbMmk.textContent = state.rates.effective_thb_mmk.toLocaleString();
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
    const { btnMmkThb, btnThbMmk, amountPrefix, receivePrefix } = els;
    const activeClass = ["bg-white", "text-indigo-600", "shadow-sm"];
    const inactiveClass = ["text-gray-500", "hover:text-indigo-600"];

    if (dir === "MMK2THB") {
        btnMmkThb.classList.add(...activeClass);
        btnMmkThb.classList.remove(...inactiveClass);
        btnThbMmk.classList.remove(...activeClass);
        btnThbMmk.classList.add(...inactiveClass);
        amountPrefix.textContent = "MMK";
        receivePrefix.textContent = "THB";
    } else {
        btnThbMmk.classList.add(...activeClass);
        btnThbMmk.classList.remove(...inactiveClass);
        btnMmkThb.classList.remove(...activeClass);
        btnMmkThb.classList.add(...inactiveClass);
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
    els.fileName.textContent = "PNG, JPG (MAX. 5MB)";
    els.modalError.classList.add("hidden");
    els.qrResultArea.classList.add("hidden");
    els.qrRawContent.textContent = "";
    els.confirmOrderBtn.innerHTML = "<span>Confirm & Send</span>";
    els.confirmOrderBtn.disabled = false;
};

const showError = (msg) => {
    els.modalError.textContent = msg;
    els.modalError.classList.remove("hidden");
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
    
    els.btnMmkThb.addEventListener("click", () => setDirection("MMK2THB"));
    els.btnThbMmk.addEventListener("click", () => setDirection("THB2MMK"));

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
        els.liveClock.textContent = new Date().toLocaleTimeString();
    }, 1000);
};

const init = () => {
    document.getElementById("app").innerHTML = App();
    cacheDom();
    bindEvents();
    loadRates();
    updateRefreshRate();
};

init();
