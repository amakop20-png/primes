/* ══════════════════════════════════════════════════════════════════════
   buy.js — Virtual Numbers & OTP Order Integration
   Requires api.js to be loaded FIRST.
   All API calls use the centralized functions from api.js:
   - getWalletBalance()
   - getCountries()
   - getProducts(country)
   - buyActivation(country, product)
   - getOrder(orderId)
   - finishOrder(orderId)
   - cancelOrder(orderId)
   - banOrder(orderId)
══════════════════════════════════════════════════════════════════════ */

/* ── Module State ── */
let allProducts      = [];   // Products from API for the selected country
let selectedCountry  = '';   // Currently selected country key (e.g. 'usa')
let selectedProduct  = '';   // Currently selected product key (e.g. 'whatsapp')

let currentOrderId   = null; // Active order ID (from backend)
let currentOrderData = null; // Full order object from backend

let pollInterval     = null; // setInterval reference for SMS polling
let isBuying         = false; // Guard against double-click on Buy
let isActionBusy     = false; // Guard against multiple finish/cancel/ban requests

const POLL_INTERVAL_MS = 5000;
const CONVERSION_RATE  = 1500;

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Auth guard — redirect if no token
    if (!requireAuth()) return;

    // Restore theme
    if (localStorage.getItem('dashboardTheme') === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // Restore currency UI
    updateCurrencyDisplay(getCurrency());

    renderUserInfo();
    loadWalletBalanceBuyPage();
    loadCountries();
    attachEventListeners();

    // Restore any in-progress order from previous session
    const savedOrderId = localStorage.getItem('currentOrderId');
    if (savedOrderId) {
        currentOrderId = savedOrderId;
        openOrderModal(currentOrderId);
    }
});

/* ══════════════════════════════════════════
   USER INFO
══════════════════════════════════════════ */
function renderUserInfo() {
    const session     = getSession() || {};
    const displayName  = session.name || session.username || 'User';
    const displayEmail = session.email || '';
    document.querySelectorAll('#Username, .dropdown-name, .username, #buyUsername').forEach(el => {
        el.textContent = displayName;
    });
    document.querySelectorAll('.dropdown-email').forEach(el => {
        el.textContent = displayEmail;
    });
}

/* ══════════════════════════════════════════
   CURRENCY (display helpers, no financial ops)
══════════════════════════════════════════ */
function getCurrency() {
    return localStorage.getItem('primes_currency') || 'NGN';
}

function updateCurrencyDisplay(currency) {
    const sym  = document.getElementById('currencySymbol');
    const name = document.getElementById('currencyName');
    if (sym)  sym.textContent  = currency === 'USD' ? '$' : '₦';
    if (name) name.textContent = currency;
}

function toggleBuyCurrency() {
    const next = getCurrency() === 'NGN' ? 'USD' : 'NGN';
    localStorage.setItem('primes_currency', next);
    updateCurrencyDisplay(next);
    loadWalletBalanceBuyPage();
    // Re-render product cards if products are already loaded
    if (allProducts.length > 0) renderProductCards(allProducts);
    showToast(`💱 Currency switched to ${next}`, 'info');
}

/* ══════════════════════════════════════════
   WALLET BALANCE (buy page)
   Uses: getWalletBalance() from api.js
══════════════════════════════════════════ */
async function loadWalletBalanceBuyPage() {
    const balEl = document.getElementById('buyWalletBalance');
    if (balEl) balEl.textContent = 'Loading…';

    try {
        const data       = await getWalletBalance();
        const balanceNGN = data?.wallet?.balance ?? data?.balance ?? 0;
        const ngn        = parseFloat(balanceNGN) || 0;
        const currency   = getCurrency();
        const displayed  = currency === 'USD' ? (ngn / CONVERSION_RATE) : ngn;
        const symbol     = currency === 'USD' ? '$' : '₦';

        if (balEl) balEl.textContent = symbol + displayed.toLocaleString('en-NG', {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });

        // Store raw NGN for balance reference
        localStorage.setItem('_walletBalance', String(ngn));
    } catch (err) {
        console.error('loadWalletBalanceBuyPage error:', err);
        if (balEl) balEl.textContent = '—';
    }

    // Service status indicator
    const statusEl = document.getElementById('fivesimBalance');
    if (statusEl) {
        statusEl.innerHTML = '<span style="color:#16a34a;font-weight:700;">✅ Online</span>';
    }
}

/* ══════════════════════════════════════════
   COUNTRIES
   Uses: getCountries() from api.js
══════════════════════════════════════════ */
async function loadCountries() {
    const select = document.getElementById('countryFilter');
    if (!select) return;

    select.innerHTML = '<option value="">⏳ Loading countries…</option>';
    select.disabled  = true;

    try {
        const data = await getCountries();

        /*
         * Expected shapes:
         * 1) { countries: { afghanistan: { text_en: "Afghanistan", prefix: { "+93": 1 } }, … } }
         * 2) { usa: { name: "USA", prefix: "+1" }, … }
         */
        const countries = data?.countries || data;

        if (!countries || typeof countries !== 'object') {
            throw new Error('Unexpected countries response format.');
        }

        const entries = Object.entries(countries);
        if (entries.length === 0) throw new Error('No countries returned from API.');

        function getCountryName(key, info) {
            if (!info || typeof info !== 'object') return key.toUpperCase();
            return info.text_en || info.name || info.text_ru || (key.charAt(0).toUpperCase() + key.slice(1));
        }

        function getCountryPrefix(info) {
            if (!info || typeof info !== 'object' || !info.prefix) return '';
            if (typeof info.prefix === 'string') return info.prefix;
            if (typeof info.prefix === 'object') {
                const keys = Object.keys(info.prefix);
                return keys.length > 0 ? keys[0] : '';
            }
            return '';
        }

        const options = entries
            .sort((a, b) => getCountryName(a[0], a[1]).localeCompare(getCountryName(b[0], b[1])))
            .map(([key, info]) => {
                const name = getCountryName(key, info);
                const prefix = getCountryPrefix(info);
                const prefixStr = prefix ? ` (${prefix})` : '';
                return `<option value="${key}">${name}${prefixStr}</option>`;
            })
            .join('');

        select.innerHTML = '<option value="">🌍 Select a Country</option>' + options;
        select.disabled  = false;
        select.addEventListener('change', onCountryChange);
    } catch (err) {
        console.error('loadCountries error:', err);
        select.innerHTML = '<option value="">⚠ Failed to load countries (Click to retry)</option>';
        select.disabled  = false;
        showToast('Unable to load countries. Backend may be waking up, please retry.', 'error');
        select.onclick = () => { if (select.disabled || select.value === '') loadCountries(); };
    }
}

function onCountryChange() {
    const select = document.getElementById('countryFilter');
    selectedCountry = select?.value || '';
    selectedProduct = '';

    if (!selectedCountry) {
        showSelectCountryPrompt();
        return;
    }

    loadProducts(selectedCountry);
}

/* ══════════════════════════════════════════
   PRODUCTS
   Uses: getProducts(country) from api.js
══════════════════════════════════════════ */
async function loadProducts(country) {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) return;

    // Loading skeletons
    cardsGrid.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join('');
    const resultCount = document.getElementById('resultCount');
    if (resultCount) resultCount.textContent = 'Loading products…';

    try {
        const data = await getProducts(country);

        /*
         * Handles both flat shapes { whatsapp: { Price, Qty } }
         * and nested 5SIM operator shapes { whatsapp: { virtual21: { cost, count } } }
         */
        const raw = data?.products || data;

        if (!raw || typeof raw !== 'object') {
            showEmptyState(cardsGrid, 'No products returned from server.');
            return;
        }

        allProducts = Object.entries(raw)
            .filter(([, info]) => info && typeof info === 'object')
            .map(([key, info]) => {
                let price = 0;
                let qty = 0;
                let category = 'activation';

                if (info.Price !== undefined || info.price !== undefined || info.cost !== undefined || info.rate !== undefined) {
                    // Flat format
                    price = parseFloat(info.Price || info.price || info.rate || info.cost || 0);
                    qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                    category = (info.Category || info.category || 'activation').toLowerCase();
                } else {
                    // Operator map format
                    const operators = Object.values(info).filter(v => v && typeof v === 'object');
                    if (operators.length > 0) {
                        const validPrices = operators.map(op => parseFloat(op.cost || op.price || op.rate || 0)).filter(p => p > 0);
                        price = validPrices.length > 0 ? Math.min(...validPrices) : 0;
                        qty = operators.reduce((sum, op) => sum + parseInt(op.count || op.qty || op.quantity || 0, 10), 0);
                        category = (operators[0].category || 'activation').toLowerCase();
                    }
                }

                return {
                    key,
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    price,
                    qty,
                    category
                };
            })
            .filter(p => p.price >= 0);

        if (allProducts.length === 0) {
            showEmptyState(cardsGrid, 'No numbers available for this country right now.');
            return;
        }

        renderProductCards(allProducts);
    } catch (err) {
        console.error('loadProducts error:', err);
        showErrorState(cardsGrid, 'Failed to load products for this country. Please try again.');
    }
}

function renderProductCards(products) {
    const cardsGrid     = document.getElementById('cardsGrid');
    const searchInput   = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const serviceFilter = document.getElementById('serviceFilter')?.value || '';
    const typeFilter    = document.getElementById('typeFilter')?.value || '';
    const resultCount   = document.getElementById('resultCount');
    if (!cardsGrid) return;

    let filtered = products.filter(p => {
        if (searchInput   && !p.name.toLowerCase().includes(searchInput) && !p.key.toLowerCase().includes(searchInput)) return false;
        if (serviceFilter && p.key !== serviceFilter) return false;
        if (typeFilter    && p.category !== typeFilter) return false;
        return true;
    });

    if (resultCount) resultCount.textContent = `${filtered.length} service${filtered.length !== 1 ? 's' : ''} available`;

    if (filtered.length === 0) {
        showEmptyState(cardsGrid, 'No services match your search or filter.');
        return;
    }

    const currency = getCurrency();
    const symbol   = currency === 'USD' ? '$' : '₦';

    cardsGrid.innerHTML = filtered.map(p => {
        const displayPrice = currency === 'USD' ? (p.price / CONVERSION_RATE) : p.price;
        const priceStr     = symbol + displayPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const isSelected   = selectedProduct === p.key;

        return `
        <div class="card${isSelected ? ' selected' : ''}" style="position:relative;cursor:pointer;" onclick="selectProduct('${p.key}')">
            <span class="card-flag" style="font-size:2rem;display:block;margin-bottom:6px;">📱</span>
            <div class="card-title" style="font-weight:800;font-size:15px;color:var(--text);">${p.name}</div>
            <div class="card-meta">
                <span style="font-size:12px;color:var(--muted);">${p.qty > 0 ? p.qty.toLocaleString() + ' available' : 'In stock'}</span>
                <span class="card-service-badge">${p.category}</span>
            </div>
            <div class="card-price">${priceStr}</div>
            <button
                class="btn btn-buy"
                id="buyBtn-${p.key}"
                onclick="event.stopPropagation(); handleBuyClick('${selectedCountry}', '${p.key}', this)"
            >
                🛒 Buy Now
            </button>
        </div>`;
    }).join('');
}

function selectProduct(key) {
    selectedProduct = key;
    renderProductCards(allProducts);
}

/* ══════════════════════════════════════════
   BUY ACTIVATION
   Uses: buyActivation(country, product) from api.js
══════════════════════════════════════════ */
async function handleBuyClick(country, product, btnEl) {
    if (isBuying) return; // Prevent duplicate rapid clicks

    if (!country || !product) {
        showToast('Please select a country and service first.', 'error');
        return;
    }

    isBuying = true;
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '⏳ Purchasing…';
    }

    try {
        const result = await buyActivation(country, product);
        const order  = result?.order || result;

        if (!order || (!order.id && !order._id)) {
            throw new Error('Server did not return a valid order.');
        }

        const orderId = order.id || order._id;

        // Save real backend order ID
        currentOrderId   = orderId;
        currentOrderData = order;
        localStorage.setItem('currentOrderId', String(orderId));

        showToast('✅ Number purchased successfully! Opening order…', 'success');

        // Refresh wallet balance from backend
        await loadWalletBalanceBuyPage();

        // Open SMS modal and start polling
        openOrderModal(orderId, order);
    } catch (err) {
        console.error('buyActivation error:', err);
        showToast(err.message || 'Failed to purchase number. Check your wallet balance.', 'error');
    } finally {
        isBuying = false;
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = '🛒 Buy Now';
        }
    }
}

/* ══════════════════════════════════════════
   ORDER MODAL & DETAILS
   Uses: getOrder(orderId) from api.js
══════════════════════════════════════════ */
async function openOrderModal(orderId, initialOrder = null) {
    currentOrderId = orderId;

    const overlay = document.getElementById('smsModalOverlay');
    if (!overlay) return;

    // Show modal with loading state
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    setModalLoading();

    // Use initial order data if provided, otherwise fetch fresh
    let order = initialOrder;
    if (!order) {
        try {
            const res = await getOrder(orderId);
            order = res?.order || res;
        } catch (err) {
            console.error('fetchOrder error:', err);
            setModalError('Could not load order details: ' + err.message);
            return;
        }
    }

    currentOrderData = order;
    updateOrderUI(order);

    // If order is pending, start polling every 5000ms
    if (order.status === 'PENDING') {
        startPolling(orderId);
    }
}

function setModalLoading() {
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = 'Loading…';
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Fetching order status…';
    const otpBox = document.getElementById('smsOtpBox');
    if (otpBox) otpBox.classList.remove('show');
}

function setModalError(msg) {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = msg;
}

/* ── Update the modal UI from a backend order object ── */
function updateOrderUI(order) {
    if (!order) return;

    // Phone number
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = order.phone || order.number || '—';

    // Order ID
    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = '#' + (order.id || order._id || '—');

    // Expiration
    const expiresEl = document.getElementById('modalExpires');
    if (expiresEl) {
        const exp = order.expires || order.expiresAt || order.created_at;
        expiresEl.textContent = exp ? new Date(exp).toLocaleTimeString() : '—';
    }

    // Status mapping & badge
    const statusDot  = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusMap  = {
        PENDING:  { dot: 'pulse',    text: '⏳ Waiting for SMS (Auto-polling every 5s)…', color: '#f59e0b' },
        RECEIVED: { dot: 'received', text: '✅ SMS Received!',                             color: '#10b981' },
        FINISHED: { dot: 'received', text: '✔ Order Completed',                            color: '#10b981' },
        CANCELED: { dot: '',         text: '❌ Order Cancelled',                           color: '#ef4444' },
        BANNED:   { dot: '',         text: '⚠️ Number Reported & Banned',                  color: '#ef4444' },
    };

    const currentStatus = String(order.status || 'PENDING').toUpperCase();
    const s = statusMap[currentStatus] || { dot: '', text: currentStatus, color: '#888' };

    if (statusDot) {
        statusDot.className = 'dot ' + s.dot;
        statusDot.style.background = s.color;
    }
    if (statusText) statusText.textContent = s.text;

    // OTP / SMS Received Data
    const otpBox      = document.getElementById('smsOtpBox');
    const otpCode     = document.getElementById('otpCode');
    const otpFullText = document.getElementById('otpFullText');

    if (currentStatus === 'RECEIVED' && Array.isArray(order.sms) && order.sms.length > 0) {
        const sms = order.sms[0];
        const otp = sms.code || extractOTP(sms.text);
        if (otpBox) otpBox.classList.add('show');
        if (otpCode) otpCode.textContent = otp || '—';
        if (otpFullText) {
            const sender = sms.sender ? `[Sender: ${sms.sender}] ` : '';
            const time   = sms.created_at || sms.date ? ` (${new Date(sms.created_at || sms.date).toLocaleTimeString()})` : '';
            otpFullText.textContent = `${sender}${sms.text || ''}${time}`;
        }
    } else {
        if (otpBox) otpBox.classList.remove('show');
    }

    // Button States
    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn    = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');

    const isPending  = currentStatus === 'PENDING';
    const isReceived = currentStatus === 'RECEIVED';
    const isFinal    = currentStatus === 'FINISHED' || currentStatus === 'CANCELED' || currentStatus === 'BANNED';

    if (cancelBtn) cancelBtn.disabled = !isPending && !isReceived;
    if (banBtn)    banBtn.disabled    = isFinal;
    if (finishBtn) finishBtn.disabled = !isReceived; // Can finish once SMS is received
}

/** Simple OTP code extraction fallback */
function extractOTP(text) {
    if (!text) return null;
    const match = text.match(/\b(\d{4,8})\b/);
    return match ? match[1] : null;
}

/* ══════════════════════════════════════════
   SMS POLLING
   Uses: getOrder(orderId) from api.js
══════════════════════════════════════════ */
function startPolling(orderId) {
    stopPolling(); // Ensure no duplicate intervals exist

    pollInterval = setInterval(async () => {
        try {
            const res   = await getOrder(orderId);
            const order = res?.order || res;
            if (!order) return;

            currentOrderData = order;
            updateOrderUI(order);

            const status = String(order.status || '').toUpperCase();

            if (status === 'RECEIVED') {
                stopPolling();
                showToast('📨 SMS received! Your verification code is ready.', 'success');
            } else if (status === 'FINISHED' || status === 'CANCELED' || status === 'BANNED') {
                stopPolling();
            }
        } catch (err) {
            console.error('[SMS Polling error]:', err);
        }
    }, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

function closeSmsModal() {
    stopPolling();
    const overlay = document.getElementById('smsModalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

/* ══════════════════════════════════════════
   ORDER ACTIONS
   Uses: finishOrder, cancelOrder, banOrder from api.js
══════════════════════════════════════════ */
async function handleFinishOrder() {
    if (!currentOrderId || isActionBusy) return;

    const btn = document.getElementById('btnFinishOrder');
    isActionBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Finishing…'; }

    try {
        await finishOrder(currentOrderId);
        stopPolling();
        showToast('✅ Order finished and marked complete!', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error('finishOrder error:', err);
        showToast(err.message || 'Failed to finish order.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✅ Done'; }
    } finally {
        isActionBusy = false;
    }
}

async function handleCancelOrder() {
    if (!currentOrderId || isActionBusy) return;
    if (!confirm('Cancel this activation order?')) return;

    const btn = document.getElementById('btnCancelOrder');
    isActionBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }

    try {
        await cancelOrder(currentOrderId);
        stopPolling();
        showToast('✅ Order cancelled successfully.', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error('cancelOrder error:', err);
        showToast(err.message || 'Failed to cancel order.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '❌ Cancel'; }
    } finally {
        isActionBusy = false;
    }
}

async function handleBanOrder() {
    if (!currentOrderId || isActionBusy) return;
    if (!confirm('Report this number as banned/unusable?')) return;

    const btn = document.getElementById('btnBanOrder');
    isActionBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Reporting…'; }

    try {
        await banOrder(currentOrderId);
        stopPolling();
        showToast('⚠️ Number reported as banned.', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error('banOrder error:', err);
        showToast(err.message || 'Failed to report ban.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '⚠️ Report Ban'; }
    } finally {
        isActionBusy = false;
    }
}

/* ══════════════════════════════════════════
   COPY NUMBER
══════════════════════════════════════════ */
function copyNumberToClipboard() {
    const phoneEl = document.getElementById('modalPhone');
    if (!phoneEl) return;
    const num = phoneEl.textContent.trim();
    if (!num || num === '—') return;
    navigator.clipboard.writeText(num).then(() => {
        showToast('📋 Number copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Number: ' + num, 'info');
    });
}

/* ══════════════════════════════════════════
   STATE HELPERS
══════════════════════════════════════════ */
function showSelectCountryPrompt() {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="fa-solid fa-globe"></i>
            <p>Select a country above to see available numbers.</p>
        </div>`;
    const resultCount = document.getElementById('resultCount');
    if (resultCount) resultCount.textContent = '';
    allProducts = [];
}

function showEmptyState(grid, msg) {
    grid.innerHTML = `<div class="state-box" style="grid-column:1/-1;"><i class="fa-solid fa-phone-slash"></i><p>${msg}</p></div>`;
}

function showErrorState(grid, msg) {
    grid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="fa-solid fa-exclamation-circle"></i>
            <p>${msg}</p>
            <button onclick="loadProducts('${selectedCountry}')" style="margin-top:12px;padding:8px 18px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Retry</button>
        </div>`;
}

/* ══════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════ */
function attachEventListeners() {
    // Currency switch
    const currencySwitch = document.getElementById('currencySwitch');
    if (currencySwitch) currencySwitch.addEventListener('click', toggleBuyCurrency);

    // Modal close X
    const modalCloseX = document.getElementById('modalCloseX');
    if (modalCloseX) modalCloseX.addEventListener('click', closeSmsModal);

    // Modal backdrop click
    const modalOverlay = document.getElementById('smsModalOverlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) closeSmsModal();
        });
    }

    // Order action buttons
    const copyBtn   = document.getElementById('btnCopyNumber');
    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn    = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');
    if (copyBtn)   copyBtn.addEventListener('click', copyNumberToClipboard);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancelOrder);
    if (banBtn)    banBtn.addEventListener('click', handleBanOrder);
    if (finishBtn) finishBtn.addEventListener('click', handleFinishOrder);

    // Sidebar settings
    const settingsBtn = document.getElementById('sidebarSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', e => { e.preventDefault(); openSettings(); });
    }

    // Search filter
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', () => {
        if (allProducts.length > 0) renderProductCards(allProducts);
    });

    // Service & type filter
    const serviceFilter = document.getElementById('serviceFilter');
    const typeFilter    = document.getElementById('typeFilter');
    if (serviceFilter) serviceFilter.addEventListener('change', () => {
        if (allProducts.length > 0) renderProductCards(allProducts);
    });
    if (typeFilter) typeFilter.addEventListener('change', () => {
        if (allProducts.length > 0) renderProductCards(allProducts);
    });

    // Toggle aside (mobile)
    const toggleBtnEl  = document.getElementById('toggle-btn');
    const closeAsideEl = document.getElementById('close-btn');
    const asideEl      = document.getElementById('aside');
    if (toggleBtnEl) toggleBtnEl.addEventListener('click', () => asideEl && asideEl.classList.toggle('open'));
    if (closeAsideEl) closeAsideEl.addEventListener('click', () => asideEl && asideEl.classList.remove('open'));

    // Keyboard ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeSmsModal();
    });
}

/* ══════════════════════════════════════════
   SETTINGS PANEL FALLBACKS
══════════════════════════════════════════ */
if (typeof openSettings === 'undefined') {
    window.openSettings = function() {
        const overlay = document.getElementById('settingsOverlay');
        if (overlay) overlay.classList.add('show');
    };
}
if (typeof closeSettings === 'undefined') {
    window.closeSettings = function() {
        const overlay = document.getElementById('settingsOverlay');
        if (overlay) overlay.classList.remove('show');
    };
}
if (typeof saveProfileSettings === 'undefined')  window.saveProfileSettings = function() {};
if (typeof savePasswordSettings === 'undefined') window.savePasswordSettings = function() {};
if (typeof savePreferences === 'undefined')      window.savePreferences = function() {};
if (typeof saveNotifSettings === 'undefined')    window.saveNotifSettings = function() {};
if (typeof confirmDeleteAccount === 'undefined') window.confirmDeleteAccount = function() { localStorage.clear(); window.location.href = 'login.html'; };
if (typeof previewAvatar === 'undefined')        window.previewAvatar = function() {};
if (typeof togglePw === 'undefined') {
    window.togglePw = function(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.querySelector('i').className = input.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    };
}
if (typeof setTheme === 'undefined') {
    window.setTheme = function(theme) {
        if (theme === 'dark') { document.body.classList.add('dark-theme'); localStorage.setItem('dashboardTheme', 'dark'); }
        else                  { document.body.classList.remove('dark-theme'); localStorage.setItem('dashboardTheme', 'light'); }
    };
}

/* ── Page-level cleanup on unload (stop SMS polling) ── */
window.addEventListener('beforeunload', stopPolling);
window.addEventListener('pagehide',    stopPolling);

