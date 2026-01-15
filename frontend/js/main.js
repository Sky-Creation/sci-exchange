
const API_URL = "https://sci-exchange-backend.onrender.com/api";

const state = {
    rates: {
        mmk_to_thb: 0,
        thb_to_mmk: 0,
        currentDirection: "MMK2THB",
    },
    ui: {
        currentState: 'loading', // loading, active, expired, error
        isCalculating: false,
        calcTimeout: null,
        refreshInterval: null,
        errorTimeout: null,
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
    if (val === null || val === undefined) return "";
    let strVal = String(val);
    const parts = strVal.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
};

const apiService = {
    fetchInitialRates: async () => {
        const url = `${API_URL}/rates?t=${new Date().getTime()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        try {
            const response = await fetch(url, { cache: "no-store", signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`Network response was not ok (${response.status})`);
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('Request timed out');
            throw error;
        }
    },
    calculate: async (direction, amount) => {
        const response = await fetch(`${API_URL}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction, amount })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || "Calculation failed");
        }
        return await response.json();
    },
    placeOrder: async (formData) => {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Order submission failed");
        }
        return await response.json();
    }
};

const setUIState = (uiState) => {
    state.ui.currentState = uiState;
    const { amountInput, receiveInput, placeOrderBtn, refreshRateBtn, errorBanner, rateInfo } = els;
    const allInputs = [amountInput, receiveInput, placeOrderBtn, els.toggleMmkThb, els.toggleThbMmk];

    // Reset all states
    allInputs.forEach(el => el.disabled = true);
    refreshRateBtn.classList.remove('animate-spin');
    errorBanner.classList.add('hidden');
    rateInfo.classList.remove('hidden');

    switch (uiState) {
        case 'loading':
            refreshRateBtn.classList.add('animate-spin');
            rateInfo.textContent = "Loading rates...";
            break;
        case 'active':
            allInputs.forEach(el => el.disabled = false);
            placeOrderBtn.disabled = true; // Disabled until a valid calculation is made
            updateStaticRatesUI();
            break;
        case 'expired':
            errorBanner.textContent = "Rates have expired. Please refresh.";
            errorBanner.classList.remove('hidden');
            rateInfo.classList.add('hidden');
            updateStaticRatesUI();
            break;
        case 'error':
            errorBanner.textContent = "Rates are currently unavailable. Please try again later.";
            errorBanner.classList.remove('hidden');
            rateInfo.classList.add('hidden');
            if (state.ui.refreshInterval) {
                 clearInterval(state.ui.refreshInterval);
                 state.ui.refreshInterval = null;
            }
            break;
    }
};

const loadInitialRates = async (isAutoRefresh = false) => {
    if (!isAutoRefresh) {
        setUIState('loading');
    }

    try {
        const data = await apiService.fetchInitialRates();
        state.rates = { ...state.rates, ...data };

        if (data.expired) {
            setUIState('expired');
        } else {
            setUIState('active');
            // Start auto-refresh only after the first successful load
            if (!state.ui.refreshInterval) {
                state.ui.refreshInterval = setInterval(() => loadInitialRates(true), 10000);
            }
        }
    } catch (error) {
        console.error("Failed to load rates:", error);
        // Only show full error on manual refresh or if the UI was previously active
        if (!isAutoRefresh || state.ui.currentState === 'active') {
            setUIState('error');
        }
    }
};

const updateStaticRatesUI = () => {
    // This function now only updates the display, state changes are handled by setUIState
    if(els.adminRateMmkThb) els.adminRateMmkThb.textContent = state.rates.mmk_to_thb;
    if(els.adminRateThbMmk) els.adminRateThbMmk.textContent = state.rates.thb_to_mmk;
    resetCalculation();
}

let calcTimeout;
const handleCalculation = async () => {
    clearTimeout(calcTimeout);
    state.ui.isCalculating = true;

    const amount = parseFloat(els.amountInput.value.replace(/[^0-9.]/g, '')) || 0;

    if (amount === 0) {
        resetCalculation();
        return;
    }

    els.placeOrderBtn.disabled = true;

    calcTimeout = setTimeout(async () => {
        try {
            const result = await apiService.calculate(state.rates.currentDirection, amount);
            state.ui.isCalculating = false;
            if (!result) { // Should not happen if API is up, but good practice
                 resetCalculation();
                 return;
            }
            updateCalculationUI(result);
        } catch (error) {
            console.error("Calculation Error:", error);
            showError(error.message, 3000);
            resetCalculation();
        }
    }, 300);
};

const resetCalculation = () => {
    state.ui.isCalculating = false;
    els.receiveInput.value = "";
    if (document.activeElement !== els.amountInput) {
        els.amountInput.value = "";
    }
    els.resultTextRaw.textContent = "Rate: -";
    els.adjustmentBadge.classList.add("opacity-0");
    els.placeOrderBtn.disabled = true;
    state.order.currentOrderData = null;
};

const updateCalculationUI = (result) => {
    els.receiveInput.value = formatNumber(result.receiveAmount);
    
    let isValid = true;
    let minAmountMsg = "";
    if (state.rates.currentDirection === "MMK2THB" && result.amount < 10000) { isValid = false; minAmountMsg = "Min 10,000 MMK"; }
    if (state.rates.currentDirection === "THB2MMK" && result.amount < 100) { isValid = false; minAmountMsg = "Min 100 THB"; }

    if (!isValid) {
        showError(minAmountMsg);
        els.placeOrderBtn.disabled = true;
        return;
    }

    showRateInfo(result.finalRate, result.rateLabel);

    state.order.currentOrderData = {
        amount: result.amount,
        direction: state.rates.currentDirection,
        receiveText: `${formatNumber(result.receiveAmount)} ${state.rates.currentDirection === "MMK2THB" ? "฿" : "K"}`,
        rateText: result.finalRate.toLocaleString(undefined, { maximumFractionDigits: 4 }),
    };
    
    els.placeOrderBtn.disabled = false;
};

const setDirection = (dir) => {
    if (state.ui.currentState !== 'active') return;

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
    els.amountInput.value = "";
};

const handleInputActivity = (e) => {
    // We only calculate based on the amountInput now for simplicity
    if (e.target.id === 'amount-input') {
        handleCalculation();
    }
    
    const input = e.target;
    const formatted = formatNumber(input.value.replace(/[^0-9.]/g, ''));
    if (input.value !== formatted) {
        input.value = formatted;
    }
};

const showError = (msg, duration = 4000) => {
    clearTimeout(state.ui.errorTimeout);
    els.errorBanner.textContent = msg;
    els.errorBanner.classList.remove('hidden');
    if (duration) {
        state.ui.errorTimeout = setTimeout(() => {
            if (state.ui.currentState !== 'error' && state.ui.currentState !== 'expired') {
                 els.errorBanner.classList.add('hidden');
            }
        }, duration);
    }
}

const showRateInfo = (finalRate, rateLabel) => {
    els.resultTextRaw.textContent = `Rate: ${finalRate.toFixed(4)}`;
    els.adjustmentBadge.textContent = rateLabel;
    els.adjustmentBadge.classList.remove("opacity-0");
}

const openOrderModal = () => {
    if (!state.order.currentOrderData) return;
    const data = state.order.currentOrderData;
    els.modalConvertAmount.textContent = `${formatNumber(data.amount)} ${data.direction === "MMK2THB" ? "MMK" : "THB"}`;
    els.modalRate.textContent = data.rateText;
    els.modalReceiveAmount.textContent = data.receiveText;
    els.orderModal.classList.remove('hidden');
};

const closeOrderModal = () => {
    els.orderModal.classList.add('hidden');
    resetModal();
};

const resetModal = () => {
    els.modalBankName.value = '';
    els.modalAccountNo.value = '';
    els.modalAccountName.value = '';
    els.modalSlip.value = '';
    els.fileName.textContent = 'Images Only';
    els.qrResultArea.classList.add('hidden');
    els.modalError.classList.add('hidden');
};

const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    els.fileName.textContent = file.name;
    // QR Detection
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                els.qrResultArea.classList.remove('hidden');
                els.qrRawContent.textContent = code.data;
            } else {
                els.qrResultArea.classList.add('hidden');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

const showQRDetails = () => {
    els.qrRawContent.classList.toggle('hidden');
};

const confirmOrder = async () => {
    const bankName = els.modalBankName.value.trim();
    const accountNo = els.modalAccountNo.value.trim();
    const accountName = els.modalAccountName.value.trim();
    const slip = els.modalSlip.files[0];

    if (!bankName || !accountNo || !accountName || !slip) {
        els.modalError.textContent = 'All fields are required.';
        els.modalError.classList.remove('hidden');
        return;
    }

    const formData = new FormData();
    formData.append('direction', state.order.currentOrderData.direction);
    formData.append('amount', state.order.currentOrderData.amount);
    formData.append('bankName', bankName);
    formData.append('accountNo', accountNo);
    formData.append('accountName', accountName);
    formData.append('slip', slip);

    try {
        const result = await apiService.placeOrder(formData);
        closeOrderModal();
        showSuccessModal(result.reference);
    } catch (error) {
        els.modalError.textContent = error.message;
        els.modalError.classList.remove('hidden');
    }
};

const showSuccessModal = (ref) => {
    els.successRef.textContent = ref;
    els.successModal.classList.remove('hidden');
};

const closeSuccessModal = () => {
    els.successModal.classList.add('hidden');
    resetCalculation();
};

const init = () => {
    cacheDom();
    setDirection('MMK2THB');
    loadInitialRates(); // This will handle setting the initial UI state

    // Event Listeners
    els.amountInput.addEventListener("input", handleInputActivity);
    els.toggleMmkThb.addEventListener("click", () => setDirection("MMK2THB"));
    els.toggleThbMmk.addEventListener("click", () => setDirection("THB2MMK"));
    els.refreshRateBtn.addEventListener("click", () => loadInitialRates(false));
    els.placeOrderBtn.addEventListener("click", openOrderModal);
    els.closeModalBtn.addEventListener("click", closeOrderModal);
    els.confirmOrderBtn.addEventListener("click", confirmOrder);
    els.closeSuccessBtn.addEventListener("click", closeSuccessModal);
    els.modalSlip.addEventListener("change", handleFileUpload);
    els.showQrDetailsBtn.addEventListener("click", showQRDetails);
    els.clearButton.addEventListener("click", () => { resetCalculation(); setDirection('MMK2THB'); });
};

document.addEventListener('DOMContentLoaded', init);
