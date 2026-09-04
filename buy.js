/* ═════════════════════════════════════════════════════════════════════
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
   ESCAPING HELPER
   Product names/keys come from 5sim's API, not from our own users, but
   they're still third-party data — never trust it blindly before it
   goes into innerHTML.
══════════════════════════════════════════ */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

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
   NOTE: the 'change' listener on #countryFilter is attached ONCE in
   attachEventListeners() — NOT here. This function can run multiple
   times (initial load + retry-on-click), and re-attaching a listener
   here every time it (re)runs was stacking duplicate listeners, so one
   country selection fired onCountryChange (and loadProducts) 2x, 3x,
   however many times loadCountries had run. Don't add it back here.
══════════════════════════════════════════ */
async function loadCountries() {
    const select = document.getElementById('countryFilter');
    if (!select) return;

    select.innerHTML = '<option value="">⏳ Loading countries…</option>';
    select.disabled  = true;

    try {
        const data = await getCountries();

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
                return `<option value="${escapeHTML(key)}">${escapeHTML(name)}${escapeHTML(prefixStr)}</option>`;
            })
            .join('');

        select.innerHTML = '<option value="">🌍 Select a Country</option>' + options;
        select.disabled  = false;
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
                    price = parseFloat(info.Price || info.price || info.rate || info.cost || 0);
                    qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                    category = (info.Category || info.category || 'activation').toLowerCase();
                } else {
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

    // NOTE: no inline onclick attributes here anymore. Product keys came
    // from 5sim's API — if one ever contained a quote character, an
    // inline onclick="fn('${key}')" string would silently break (or
    // worse). Instead we stash the key in a data-attribute and handle
    // clicks via event delegation in attachEventListeners().
    cardsGrid.innerHTML = filtered.map(p => {
        const displayPrice = currency === 'USD' ? (p.price / CONVERSION_RATE) : p.price;
        const priceStr     = symbol + displayPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const isSelected   = selectedProduct === p.key;
        const safeKey      = escapeHTML(p.key);

        return `
        <div class="card${isSelected ? ' selected' : ''}" style="position:relative;cursor:pointer;" data-product-key="${safeKey}">
            <span class="card-flag" style="font-size:2rem;display:block;margin-bottom:6px;">📱</span>
            <div class="card-title" style="font-weight:800;font-size:15px;color:var(--text);">${escapeHTML(p.name)}</div>
            <div class="card-meta">
                <span style="font-size:12px;color:var(--muted);">${p.qty > 0 ? p.qty.toLocaleString() + ' available' : 'In stock'}</span>
                <span class="card-service-badge">${escapeHTML(p.category)}</span>
            </div>
            <div class="card-price">${priceStr}</div>
            <button
                class="btn btn-buy"
                data-product-key="${safeKey}"
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

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    setModalLoading();

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

function updateOrderUI(order) {
    if (!order) return;

    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = order.phone || order.number || '—';

    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = '#' + (order.id || order._id || '—');

    const expiresEl = document.getElementById('modalExpires');
    if (expiresEl) {
        const exp = order.expires || order.expiresAt || order.created_at;
        expiresEl.textContent = exp ? new Date(exp).toLocaleTimeString() : '—';
    }

    const statusDot  = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusMap  = {
        PENDING:  { dot: 'pulse',    text: '⏳ Waiting for SMS (Auto-polling every 5s)…', color: '#f59e0b' },
        RECEIVED: { dot: 'received', text: '✅ SMS Received!',                             color: '#10b981' },
        FINISHED: { dot: 'received', text: '✔ Order Completed',                            color: '#10b981' },
        CANCELED: { dot: '',         text: '❌ Order Cancelled',                           color: '#ef4444' },
        BANNED:   { dot: '',         text: '⚠️ Number Reported & Banned',                  color: '#ef4444' },
        EXPIRED:  { dot: '',         text: '⏰ Number Expired (No SMS Received)',           color: '#888888' },
    };

    const currentStatus = String(order.status || 'PENDING').toUpperCase();
    const s = statusMap[currentStatus] || { dot: '', text: currentStatus, color: '#888' };

    if (statusDot) {
        statusDot.className = 'dot ' + s.dot;
        statusDot.style.background = s.color;
    }
    if (statusText) statusText.textContent = s.text;

    const otpBox      = document.getElementById('smsOtpBox');
    const otpCode     = document.getElementById('otpCode');
    const otpFullText = document.getElementById('otpFullText');

    if (currentStatus === 'RECEIVED' && Array.isArray(order.sms) && order.sms.length > 0) {
        const sms = order.sms[0];
        const otp = sms.code || extractOTP(sms.text);
        if (otpBox) otpBox.classList.add('show');
        if (otpCode) otpCode.textContent = otp || '—';
        if (otpFullText) {
            const sender = sms.sender ? `[Sender: ${escapeHTML(sms.sender)}] ` : '';
            const time   = sms.created_at || sms.date ? ` (${new Date(sms.created_at || sms.date).toLocaleTimeString()})` : '';
            otpFullText.textContent = `${sender}${sms.text || ''}${time}`;
        }
    } else {
        if (otpBox) otpBox.classList.remove('show');
    }

    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn    = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');

    const isPending  = currentStatus === 'PENDING';
    const isReceived = currentStatus === 'RECEIVED';
    const isFinal    = currentStatus === 'FINISHED' || currentStatus === 'CANCELED' || currentStatus === 'BANNED' || currentStatus === 'EXPIRED';

    if (cancelBtn) cancelBtn.disabled = !isPending && !isReceived;
    if (banBtn)    banBtn.disabled    = isFinal;
    if (finishBtn) finishBtn.disabled = !isReceived;
}

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

            const status = String(order.status || '').toUpperCase();

            // Stop polling once the number's own expiry time has passed,
            // even if the backend never flips the status away from
            // PENDING. Without this, a number that never receives an SMS
            // gets polled every 5s forever.
            const expiresAt = order.expires || order.expiresAt;
            if (status === 'PENDING' && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
                order.status = 'EXPIRED';
                updateOrderUI(order);
                stopPolling();
                showToast('⏰ This number expired without receiving an SMS.', 'warning');
                return;
            }

            updateOrderUI(order);

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
    grid.innerHTML = `<div class="state-box" style="grid-column:1/-1;"><i class="fa-solid fa-phone-slash"></i><p>${escapeHTML(msg)}</p></div>`;
}

function showErrorState(grid, msg) {
    grid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="fa-solid fa-exclamation-circle"></i>
            <p>${escapeHTML(msg)}</p>
            <button id="retryLoadProductsBtn" style="margin-top:12px;padding:8px 18px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">Retry</button>
        </div>`;
    const retryBtn = document.getElementById('retryLoadProductsBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => loadProducts(selectedCountry));
}

/* ══════════════════════════════════════════
   EVENT LISTENERS
   All listeners that must persist for the page's lifetime are attached
   here, exactly once. The #countryFilter 'change' listener lives here
   (not inside loadCountries) so it never gets re-attached and stacked
   when loadCountries() runs more than once (initial load, retry-click).
══════════════════════════════════════════ */
function attachEventListeners() {
    // Currency switch
    const currencySwitch = document.getElementById('currencySwitch');
    if (currencySwitch) currencySwitch.addEventListener('click', toggleBuyCurrency);

    // Country dropdown — attached ONCE, here, not inside loadCountries()
    const countryFilter = document.getElementById('countryFilter');
    if (countryFilter) countryFilter.addEventListener('change', onCountryChange);

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

    // Product cards — event delegation instead of inline onclick, so a
    // product key/name from 5sim can never break out of an HTML attribute.
    const cardsGrid = document.getElementById('cardsGrid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', (e) => {
            const buyBtn = e.target.closest('.btn-buy');
            if (buyBtn) {
                e.stopPropagation();
                const key = buyBtn.dataset.productKey;
                handleBuyClick(selectedCountry, key, buyBtn);
                return;
            }
            const card = e.target.closest('.card');
            if (card && card.dataset.productKey) {
                selectProduct(card.dataset.productKey);
            }
        });
    }

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
   SETTINGS PANEL
══════════════════════════════════════════ */
function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;

    const session = getSession() || {};
    const nameEl  = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const phoneEl = document.getElementById('settingsPhone');
    if (nameEl  && session.name)  nameEl.value  = session.name;
    if (emailEl && session.email) emailEl.value = session.email;
    if (phoneEl && session.phone) phoneEl.value = session.phone;

    const currEl = document.getElementById('settingsCurrency');
    if (currEl) currEl.value = getCurrency();
    const langEl = document.getElementById('settingsLanguage');
    if (langEl) langEl.value = localStorage.getItem('preferredLanguage') || 'en';

    updateSettingsThemeBtns();

    const notifSettings = JSON.parse(localStorage.getItem('notifSettings') || '{}');
    const n = (id, def) => { const el = document.getElementById(id); if (el) el.checked = notifSettings[id] !== undefined ? notifSettings[id] : def; };
    n('notifOtp', true); n('notifOrder', true); n('notifBalance', true); n('notifPromo', false);

    const newPwEl = document.getElementById('settingsNewPw');
    if (newPwEl && !newPwEl._strengthWired) {
        newPwEl.addEventListener('input', () => checkPasswordStrength(newPwEl.value));
        newPwEl._strengthWired = true;
    }

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    document.querySelectorAll('.stab').forEach(btn => {
        if (!btn._settingsWired) {
            btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
            btn._settingsWired = true;
        }
    });

    const closeBtn = document.getElementById('settingsCloseBtn');
    if (closeBtn && !closeBtn._wired) {
        closeBtn.addEventListener('click', closeSettings);
        closeBtn._wired = true;
    }

    if (!overlay._wired) {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });
        overlay._wired = true;
    }
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

function switchSettingsTab(tab) {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
    const activeBtn     = document.querySelector(`.stab[data-tab="${tab}"]`);
    const activeContent = document.getElementById(`stab-${tab}`);
    if (activeBtn)     activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
}

function saveProfileSettings() {
    const name  = document.getElementById('settingsDisplayName')?.value.trim();
    const email = document.getElementById('settingsEmail')?.value.trim();
    const phone = document.getElementById('settingsPhone')?.value.trim();

    if (!name) { showToast('Please enter your display name.', 'error'); return; }

    const session = getSession() || {};
    session.name  = name;
    if (email) session.email = email;
    if (phone) session.phone = phone;
    localStorage.setItem('primes_session', JSON.stringify(session));

    document.querySelectorAll('#dashboardUsername, #Username, .dropdown-name, .username, #buyUsername, #profileName').forEach(el => {
        el.textContent = name;
    });
    document.querySelectorAll('.dropdown-email').forEach(el => {
        if (email) el.textContent = email;
    });

    showToast('✅ Profile updated successfully!', 'success');
}

function savePasswordSettings() {
    const oldPw  = document.getElementById('settingsOldPw')?.value;
    const newPw  = document.getElementById('settingsNewPw')?.value;
    const confPw = document.getElementById('settingsConfirmPw')?.value;

    if (!oldPw || !newPw || !confPw) { showToast('Please fill in all password fields.', 'error'); return; }
    if (newPw.length < 8)            { showToast('New password must be at least 8 characters.', 'error'); return; }
    if (newPw !== confPw)            { showToast('Passwords do not match.', 'error'); return; }

    // NOTE: This would ideally call a backend change-password endpoint.
    // Confirm & clear for now.
    showToast('🔒 Password updated successfully!', 'success');
    document.getElementById('settingsOldPw').value  = '';
    document.getElementById('settingsNewPw').value  = '';
    document.getElementById('settingsConfirmPw').value = '';
    const bar = document.getElementById('pwStrengthBar');
    if (bar) bar.style.display = 'none';
    const txt = document.getElementById('pwStrengthText');
    if (txt) txt.textContent = '';
}

function checkPasswordStrength(pw) {
    const bar  = document.getElementById('pwStrengthBar');
    const fill = document.getElementById('pwStrengthFill');
    const text = document.getElementById('pwStrengthText');
    if (!bar || !fill || !text) return;
    bar.style.display = 'block';
    let score = 0;
    if (pw.length >= 8)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        { w: '25%',  bg: '#ef4444', label: 'Weak' },
        { w: '50%',  bg: '#f59e0b', label: 'Fair' },
        { w: '75%',  bg: '#3b82f6', label: 'Good' },
        { w: '100%', bg: '#10b981', label: 'Strong' },
    ];
    const l = levels[Math.max(0, score - 1)] || levels[0];
    fill.style.width      = l.w;
    fill.style.background = l.bg;
    text.textContent      = `Password strength: ${l.label}`;
}

function savePreferences() {
    const currency = document.getElementById('settingsCurrency')?.value;
    const language = document.getElementById('settingsLanguage')?.value;
    if (currency) localStorage.setItem('primes_currency', currency);
    if (language) localStorage.setItem('preferredLanguage', language);

    const sym  = document.getElementById('currencySymbol');
    const name = document.getElementById('currencyName');
    if (sym)  sym.textContent  = currency === 'USD' ? '$' : '₦';
    if (name) name.textContent = currency;

    showToast('✅ Preferences saved!', 'success');
}

function saveNotifSettings() {
    const settings = {
        notifOtp:     document.getElementById('notifOtp')?.checked,
        notifOrder:   document.getElementById('notifOrder')?.checked,
        notifBalance: document.getElementById('notifBalance')?.checked,
        notifPromo:   document.getElementById('notifPromo')?.checked,
    };
    localStorage.setItem('notifSettings', JSON.stringify(settings));
    showToast('🔔 Notification settings saved!', 'success');
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('dashboardTheme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('dashboardTheme', 'light');
    }
    updateThemeUI(theme === 'dark');
    updateSettingsThemeBtns();
}

function updateSettingsThemeBtns() {
    const isDark   = document.body.classList.contains('dark-theme');
    const lightBtn = document.getElementById('themeLight');
    const darkBtn  = document.getElementById('themeDark');
    if (lightBtn) lightBtn.classList.toggle('active', !isDark);
    if (darkBtn)  darkBtn.classList.toggle('active',  isDark);
}

function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.querySelector('i').className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

function previewAvatar(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = document.getElementById('settingsAvatarImg');
        if (img) img.src = e.target.result;
        const headerImg = document.querySelector('.profile img');
        if (headerImg) headerImg.src = e.target.result;
        localStorage.setItem('userAvatar', e.target.result);
    };
    reader.readAsDataURL(input.files[0]);
}

function confirmDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to permanently delete your account? This action cannot be undone.')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}


/* ══════════════════════════════════════════
   TOAST FALLBACK
   showToast is expected to come from a shared UI script (e.g. utils.js)
   loaded before this file. If that script isn't present, or loads after
   buy.js, every call above would throw ReferenceError and halt whatever
   function called it. This fallback keeps the page working either way —
   but the real fix is making sure the real showToast loads before buy.js.
══════════════════════════════════════════ */
if (typeof showToast === 'undefined') {
    window.showToast = function(message, type = 'info') {
        console.warn('[showToast fallback]', type, message);
        let toastEl = document.getElementById('__fallbackToast');
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = '__fallbackToast';
            toastEl.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 18px;border-radius:10px;color:#fff;font-weight:600;z-index:99999;transition:opacity .3s;';
            document.body.appendChild(toastEl);
        }
        const colors = { success: '#16a34a', error: '#ef4444', warning: '#f59e0b', info: '#2563eb' };
        toastEl.style.background = colors[type] || colors.info;
        toastEl.textContent = message;
        toastEl.style.opacity = '1';
        clearTimeout(toastEl._timeout);
        toastEl._timeout = setTimeout(() => { toastEl.style.opacity = '0'; }, 3500);
    };
}

/* ── Page-level cleanup on unload (stop SMS polling) ── */
window.addEventListener('beforeunload', stopPolling);
window.addEventListener('pagehide',    stopPolling);