const API_URL = "https://sci-exchange-backend.onrender.com/api";

const state = {
    rates: {
        mmk_to_thb: 0,
        thb_to_mmk: 0,
        expired: false,
        currentDirection: "MMK2THB",
    },
    ui: {
        isCalculating: false,
        activeTimeout: null,
        refreshInterval: null,
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
    let strVal = val.toString();
    const parts = strVal.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
};


const apiService = {
    fetchInitialRates: async () => {
        try {
            const response = await fetch(`${API_URL}/rates?t=${new Date().getTime()}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Failed to fetch initial rates");
            return await response.json();
        } catch (error) {
            console.error(error);
            showError("Failed to load rates. Please try again.");
            return null;
        }
    },
    calculate: async (direction, amount) => {
        try {
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
        } catch (error) {
            console.error("Calculation Error:", error);
            showError(error.message, 3000);
            return null;
        }
    },
    placeOrder: async (formData) => {
        // ... (placeOrder logic remains the same)
    }
};

const loadInitialRates = async (isAutoRefresh = false) => {
    if (!isAutoRefresh) {
        els.refreshRateBtn.classList.add("animate-spin");
    }

    const data = await apiService.fetchInitialRates();
    if (data) {
        state.rates = { ...state.rates, ...data };
        if (state.rates.expired) {
            handleExpiredRates();
            return;
        }
        updateStaticRatesUI();
    }

    if (!isAutoRefresh) {
        els.refreshRateBtn.classList.remove("animate-spin");
    }
};

const handleExpiredRates = () => {
    showError("Rates have expired. Please refresh.", null);
    els.placeOrderBtn.disabled = true;
    els.placeOrderBtn.textContent = "Rates Expired";
    els.amountInput.disabled = true;
    els.receiveInput.disabled = true;
};

const updateStaticRatesUI = () => {
    els.amountInput.disabled = false;
    els.receiveInput.disabled = false;
    if(els.adminRateMmkThb) els.adminRateMmkThb.textContent = state.rates.mmk_to_thb;
    if(els.adminRateThbMmk) els.adminRateThbMmk.textContent = state.rates.thb_to_mmk;
}

let calcTimeout;
const handleCalculation = async (inputSource) => {
    clearTimeout(calcTimeout);
    state.ui.isCalculating = true;

    const amountEl = inputSource === 'send' ? els.amountInput : els.receiveInput;
    const receiveEl = inputSource === 'send' ? els.receiveInput : els.amountInput;
    
    const amount = parseFloat(amountEl.value.replace(/[^0-9.]/g, '')) || 0;

    if (amount === 0) {
        resetCalculation(inputSource);
        return;
    }

    // Debounce the API call
    calcTimeout = setTimeout(async () => {
        const result = await apiService.calculate(state.rates.currentDirection, amount);

        state.ui.isCalculating = false;
        if (!result) {
             resetCalculation();
             return;
        }
        
        updateCalculationUI(result, inputSource);

    }, 300); // 300ms debounce
};


const resetCalculation = (inputSource = 'send') => {
    state.ui.isCalculating = false;
    if (inputSource === 'send') {
        els.receiveInput.value = "";
    } else {
        els.amountInput.value = "";
    }
    els.resultTextRaw.textContent = "Rate: 0.000";
    els.adjustmentBadge.classList.add("opacity-0");
    els.placeOrderBtn.disabled = true;
    state.order.currentOrderData = null;
};


const updateCalculationUI = (result, inputSource) => {
    const receiveEl = inputSource === 'send' ? els.receiveInput : els.amountInput;
    const sendEl = inputSource === 'send' ? els.amountInput : els.receiveInput;

    const sendAmount = inputSource === 'send' ? result.amount : result.receiveAmount;
    const receiveAmount = inputSource === 'send' ? result.receiveAmount : result.amount;

    receiveEl.value = formatNumber(receiveAmount);
    sendEl.value = formatNumber(sendAmount);

    let isValid = true;
    let minAmountMsg = "";
    if (state.rates.currentDirection === "MMK2THB" && sendAmount < 10000) { isValid = false; minAmountMsg = "Min 10,000 MMK"; }
    if (state.rates.currentDirection === "THB2MMK" && sendAmount < 100) { isValid = false; minAmountMsg = "Min 100 THB"; }

    if (!isValid) {
        showWarning(minAmountMsg);
        els.placeOrderBtn.disabled = true;
        return;
    }

    showRateInfo(result.finalRate, result.rateLabel);

    state.order.currentOrderData = {
        amount: sendAmount,
        direction: state.rates.currentDirection,
        receiveText: `${formatNumber(receiveAmount)} ${state.rates.currentDirection === "MMK2THB" ? "฿" : "K"}`,
        rateText: result.finalRate.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    };
    
    els.placeOrderBtn.disabled = false;
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
    els.amountInput.value = "";
    els.receiveInput.value = "";
};

const handleInputActivity = (e) => {
    const source = e.target.id === 'amount-input' ? 'send' : 'receive';
    handleCalculation(source);

    const input = e.target;
    const formatted = formatNumber(input.value.replace(/[^0-9]/g, ''));
    if (input.value !== formatted) {
        input.value = formatted;
    }
};

const showWarning = (message) => { /* ... same as before ... */ }
const showRateInfo = (finalRate, rateLabel) => {  /* ... same as before ... */ }
const showError = (msg, duration = null) => { /* ... same as before ... */ }

const init = () => {
    cacheDom();
    setDirection('MMK2THB');
    loadInitialRates();

    // Event Listeners
    els.amountInput.addEventListener("input", handleInputActivity);
    els.receiveInput.addEventListener("input", handleInputActivity);
    els.toggleMmkThb.addEventListener("click", () => setDirection("MMK2THB"));
    els.toggleThbMmk.addEventListener("click", () => setDirection("THB2MMK"));
    els.refreshRateBtn.addEventListener("click", () => loadInitialRates(false));

    // ... other event listeners for modal, etc. remain the same ...

    // Auto-refresh initial rates periodically
    state.ui.refreshInterval = setInterval(() => loadInitialRates(true), 30000);
};

document.addEventListener('DOMContentLoaded', init);
