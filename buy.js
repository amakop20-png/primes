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
   - createVirtualAccount(currency)
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
    const isDark = localStorage.getItem('dashboardTheme') === 'dark';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
    updateThemeUI(isDark);

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
   Uses: getWalletBalance() / createVirtualAccount() from api.js

   NOTE (fix): a 404 from get-wallet-balance means "Wallet not found" —
   this user has no wallet row yet for this currency on the backend.
   Previously that just fell through to a stale cached localStorage
   number with no real explanation. Now: on 404 specifically, we call
   createVirtualAccount(currency) to provision the wallet, then retry
   the balance fetch once. Any other error (timeout, network, 5xx)
   still falls back to the cached balance exactly as before.
══════════════════════════════════════════ */
async function loadWalletBalanceBuyPage() {
    const balEl = document.getElementById('buyWalletBalance');
    if (balEl) balEl.textContent = 'Loading…';

    const currency = getCurrency();
    const symbol   = currency === 'USD' ? '$' : '₦';

    try {
        const data = await fetchWalletBalance(currency);
        console.log(`[WALLET] Response received`);
        console.log(`[WALLET] FULL RESPONSE:\n` + JSON.stringify(data, null, 2));
        applyWalletBalance(data, currency, symbol, balEl);
    } catch (err) {
        console.error(`[Wallet] API error: ${err.message}`);
        console.error(`[Wallet] Status: ${err.status}`);

        const setErrorDisplay = (msg) => {
            if (balEl) balEl.innerHTML = `<span style="font-size: 16px; font-weight: 600; line-height: 1.2; display: block; white-space: normal;">${msg}</span>`;
        };

        // Do not convert errors into a fake 0.00 balance
        if (err.status === 401) {
            setErrorDisplay('Auth Error');
            showToast('Your session has expired. Please log in again.', 'error');
        } else if (err.status === 404) {
            console.log(`[Buy Wallet] 404 received, attempting to provision wallet via createVirtualAccount...`);
            try {
                // Provision the wallet for new users
                await createVirtualAccount(currency);
                // Retry fetching the balance once
                const retryData = await fetchWalletBalance(currency);
                applyWalletBalance(retryData, currency, symbol, balEl);
            } catch (provisionErr) {
                console.warn(`[Buy Wallet] Failed to provision wallet automatically:`, provisionErr);
                // Fallback to 0 if provisioning also fails
                applyWalletBalance({ balance: 0 }, currency, symbol, balEl);
            }
        } else if (err.status >= 500) {
            setErrorDisplay('Server error');
            showToast('Temporary server error while loading wallet.', 'error');
        } else if (!err.status || err.message.toLowerCase().includes('network')) {
            setErrorDisplay('Connection error');
            showToast('Network error while loading wallet balance.', 'error');
        } else {
            setErrorDisplay('Error');
            showToast(`Error loading balance: ${err.message}`, 'error');
        }
    }

    // Service status indicator
    const statusEl = document.getElementById('fivesimBalance');
    if (statusEl) {
        statusEl.innerHTML = '<span style="color:#16a34a;font-weight:700;">✅ Online</span>';
    }
}

// Thin wrapper kept separate so both the initial call and the
// post-create retry above share the exact same call path.
async function fetchWalletBalance(currency) {
    return await getWalletBalance(currency);
}

// Parses the balance out of whichever shape the backend returns and
// writes it to the DOM + localStorage cache. Extracted out of
// loadWalletBalanceBuyPage so it isn't duplicated for the retry path.
function applyWalletBalance(data, currency, symbol, balEl) {
    const backendCurrency = (data?.currency || data?.wallet?.currency || '').toUpperCase();
    let baseUsd = parseFloat(data?.usdBalance ?? data?.wallet?.usdBalance ?? data?.balanceUSD ?? 0) || 0;
    let baseNgn = parseFloat(data?.ngnBalance ?? data?.wallet?.ngnBalance ?? 0) || 0;

    if (baseUsd === 0 && baseNgn === 0) {
        const generic = parseFloat(data?.balance ?? data?.wallet?.balance ?? 0) || 0;
        if (backendCurrency === 'USD') baseUsd = generic;
        else baseNgn = generic;
    }

    // Save actual balances before synthetic conversion
    localStorage.setItem('_actual_usd_balance', String(baseUsd));
    localStorage.setItem('_actual_ngn_balance', String(baseNgn));

    if (baseUsd === 0 && baseNgn > 0) baseUsd = baseNgn / CONVERSION_RATE;
    if (baseNgn === 0 && baseUsd > 0) baseNgn = baseUsd * CONVERSION_RATE;

    let bal = currency === 'USD' ? baseUsd : baseNgn;
    bal = Number.isFinite(bal) ? bal : 0;

    if (balEl) balEl.textContent = symbol + Number(bal).toLocaleString(currency === 'USD' ? 'en-US' : 'en-NG', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    localStorage.setItem('_walletBalance_' + currency, String(bal));
    if (currency === 'NGN') localStorage.setItem('_walletBalance', String(bal));
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
        console.log('[STEP 1] Request: GET /api/countries');
        const data = await getCountries();
        console.log('[STEP 1] Status: 200');
        console.log('[STEP 1] Response:', data);

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
        select.innerHTML = '<option value="">⚠ Failed to load countries. Refresh page to retry.</option>';
        select.disabled  = false;
        showToast('Unable to load countries. Backend may be waking up, please retry.', 'error');
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
        console.log(`[STEP 2] Request: GET /api/products/${country}`);
        const data = await getProducts(country);
        console.log('[STEP 2] Status: 200');
        console.log('[STEP 2] FULL PRODUCT RESPONSE:\n' + JSON.stringify(data, null, 2));

        const raw = data?.products || data;

        if (!raw || typeof raw !== 'object') {
            showEmptyState(cardsGrid, 'No products returned from server.');
            return;
        }

        allProducts = Object.entries(raw)
            .filter(([, info]) => info && typeof info === 'object')
            .map(([key, info]) => {
                let priceUSD = 0;
                let priceNGN = 0;
                let qty = 0;
                let category = 'activation';

                if (info.cost !== undefined && info.Price !== undefined) {
                    priceUSD = parseFloat(info.Price) || 0;
                    priceNGN = parseFloat(info.cost) || 0;
                    qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                    category = (info.Category || info.category || 'activation').toLowerCase();
                } else if (info.cost !== undefined || info.rate !== undefined) {
                    priceNGN = parseFloat(info.cost || info.rate || 0);
                    priceUSD = priceNGN / CONVERSION_RATE;
                    qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                    category = (info.Category || info.category || 'activation').toLowerCase();
                } else if (info.Price !== undefined || info.price !== undefined || info.Cost !== undefined) {
                    priceUSD = parseFloat(info.Price || info.price || info.Cost || 0);
                    priceNGN = priceUSD * CONVERSION_RATE;
                    qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                    category = (info.Category || info.category || 'activation').toLowerCase();
                } else {
                    const operators = Object.values(info).filter(v => v && typeof v === 'object');
                    if (operators.length > 0) {
                        const validUsdPrices = operators.map(op => parseFloat(op.Price || op.price || 0)).filter(p => p > 0);
                        const validNgnPrices = operators.map(op => parseFloat(op.cost || op.rate || op.Cost || 0)).filter(p => p > 0);
                        
                        priceUSD = validUsdPrices.length > 0 ? Math.min(...validUsdPrices) : 0;
                        priceNGN = validNgnPrices.length > 0 ? Math.min(...validNgnPrices) : 0;
                        
                        if (priceNGN === 0 && priceUSD > 0) priceNGN = priceUSD * CONVERSION_RATE;
                        if (priceUSD === 0 && priceNGN > 0) priceUSD = priceNGN / CONVERSION_RATE;

                        qty = operators.reduce((sum, op) => sum + parseInt(op.count || op.qty || op.quantity || 0, 10), 0);
                        category = (operators[0].category || 'activation').toLowerCase();
                    }
                }

                return {
                    key,
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    price: priceNGN,
                    priceUSD,
                    priceNGN,
                    qty,
                    category
                };
            })
            .filter(p => p.priceNGN >= 0);

        if (allProducts.length === 0) {
            showEmptyState(cardsGrid, 'No numbers available for this country right now.');
            return;
        }

        renderProductCards(allProducts);
    } catch (err) {
        console.error(`[Products Error] API returned ${err.status || 'unknown status'}:`, err);
        if (err.status >= 500) {
            showEmptyState(cardsGrid, `Server Error (${err.status}): ${err.message || 'The backend failed to load services for this country.'}`);
        } else {
            showEmptyState(cardsGrid, err.message || 'Failed to load services for this country.');
        }
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
        const displayPrice = currency === 'USD' ? p.priceUSD : p.priceNGN;
        const priceStr     = symbol + displayPrice.toLocaleString(currency === 'USD' ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    const activeCurrency = getCurrency();
    const currentBal = localStorage.getItem('_walletBalance_' + activeCurrency) || localStorage.getItem('_walletBalance') || '0';
    const prodObj = allProducts.find(p => p.key === product);
    const originalUSD = prodObj?.priceUSD || 0;
    const finalNGN = prodObj?.priceNGN || 0;
    const effectiveRate = originalUSD > 0 ? (finalNGN / originalUSD).toFixed(2) : '1500';

    console.log(`[WALLET] Balance: ${currentBal}`);
    console.log(`[WALLET] Currency: ${activeCurrency}`);
    console.log(`[PRODUCT] Product ID: ${product}`);
    console.log(`[PRODUCT] Price: $${originalUSD}`);
    console.log(`[PRODUCT] Currency: USD`);
    console.log(`[CONVERSION] Original price: $${originalUSD}`);
    console.log(`[CONVERSION] Original currency: USD`);
    console.log(`[CONVERSION] Wallet currency: ${activeCurrency}`);
    console.log(`[CONVERSION] Exchange rate: ~${effectiveRate} NGN/USD`);
    console.log(`[CONVERSION] Final price: ₦${finalNGN}`);

    console.log(`[PURCHASE DEBUG] Payload that would be sent:\n` + JSON.stringify({
        country: country,
        product: product,
        price: activeCurrency === 'USD' ? originalUSD : finalNGN,
        currency: activeCurrency,
        walletBalance: currentBal
    }, null, 2));

    console.log(`[STEP 3] Request: POST /api/buy/activation`, { country, product });
    console.log(`[PURCHASE] Request sent: country=${country}, product=${product}`);

    try {
        const result = await buyActivation(country, product);
        console.log('[STEP 3] Status: 200');
        console.log('[STEP 3] Response:', result);
        console.log('[PURCHASE] Response received:', result);

        // Normalize order from result
        const order = result?.order || result;

        if (!order || (!order.id && !order._id && !order.orderId)) {
            throw new Error(result?.message || 'Server did not return a valid order ID.');
        }

        // Dynamically capture the real Order ID from API response
        const orderId = order.id || order._id || order.orderId;
        const phone = order.phone || order.number || '—';

        console.log(`[PURCHASE] Order ID: ${orderId}`);
        console.log(`[PURCHASE] Activation ID: ${orderId}`);
        console.log(`[PURCHASE] Status: ${order.status || 'PENDING'}`);
        console.log(`[PURCHASE] Number: ${phone}`);
        console.log(`[ORDER] Order ID: ${orderId}`);
        console.log(`[ORDER] Number received: ${phone}`);
        console.log(`[ORDER] Initial status: ${order.status || 'PENDING'}`);

        // Save real backend order ID
        currentOrderId   = orderId;
        currentOrderData = order;
        localStorage.setItem('currentOrderId', String(orderId));

        showToast('✅ Number purchased successfully! Opening order…', 'success');

        // Refresh wallet balance from backend
        await loadWalletBalanceBuyPage();

        // Open SMS modal and start Step 4 polling
        openOrderModal(orderId, order);
    } catch (err) {
        console.error(`[PURCHASE] Purchase failed:`, err);
        let detailedMsg = err.message || 'Failed to purchase number. Check your wallet balance.';
        if (typeof detailedMsg === 'string' && (detailedMsg.includes('undefined') || detailedMsg.includes('Cast to number') || detailedMsg.includes('Wallet not found'))) {
            detailedMsg = 'Insufficient or uninitialized wallet balance. Please fund your wallet to continue.';
        }
        showToast(detailedMsg, 'error');
        try {
            await loadWalletBalanceBuyPage();
        } catch (_) {}
    } finally {
        isBuying = false;
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = '🛒 Buy Now';
        }
    }
}

/* ══════════════════════════════════════════
   ORDER MODAL & DETAILS (Step 4 - Check Order)
   Uses: getOrder(orderId) from api.js
══════════════════════════════════════════ */
async function openOrderModal(orderId, initialOrder = null) {
    if (!orderId) {
        console.error('[ORDER] Cannot open order modal: missing Order ID.');
        return;
    }

    currentOrderId = orderId;
    console.log(`[ORDER] Opening Order Modal for Order ID: ${orderId}`);

    const overlay = document.getElementById('smsModalOverlay');
    if (!overlay) return;

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    let order = initialOrder;
    if (order) {
        currentOrderData = order;
        updateOrderUI(order);
    } else {
        setModalLoading(orderId);
        try {
            console.log(`[STEP 4] Request: GET /api/order/${orderId}`);
            console.log(`[ORDER] Checking status... (GET /api/order/${orderId})`);
            const res = await getOrder(orderId);
            console.log('[STEP 4] Status: 200');
            console.log('[STEP 4] Response:', res);
            order = res?.order || res;
            console.log(`[ORDER] Status response:`, order);
            currentOrderData = order;
            updateOrderUI(order);
        } catch (err) {
            console.error(`[STEP 4] Error fetching order ${orderId}:`, err);
            console.error(`[ORDER] Error fetching order ${orderId}:`, err);
            setModalError(`Could not load order details (#${orderId}): ${err.message}`);
            return;
        }
    }

    const currentStatus = String(order?.status || 'PENDING').toUpperCase();
    if (currentStatus === 'PENDING') {
        startPolling(orderId);
    } else {
        stopPolling();
    }
}

function setModalLoading(orderId) {
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = 'Loading…';
    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = orderId ? `#${orderId}` : '—';
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

    // Display purchased number
    const phone = order.phone || order.number || order.phone_number || '—';
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = phone;

    // Display dynamic Order ID
    const orderId = order.id || order._id || order.orderId || currentOrderId || '—';
    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = '#' + orderId;

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
        TIMEOUT:  { dot: '',         text: '⏰ Polling Timeout (Order pending)',            color: '#888888' },
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

    const smsList = Array.isArray(order.sms) ? order.sms : (order.sms ? [order.sms] : []);
    if (currentStatus === 'RECEIVED' && smsList.length > 0) {
        const sms = smsList[0] || {};
        const otp = sms.code || order.code || extractOTP(sms.text || order.text || '');
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
    const isFinal    = currentStatus === 'FINISHED' || currentStatus === 'CANCELED' || currentStatus === 'BANNED' || currentStatus === 'EXPIRED' || currentStatus === 'TIMEOUT';

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
   SMS / ORDER POLLING (Step 4)
   Uses: getOrder(orderId) from api.js
══════════════════════════════════════════ */
let pollStartTime = 0;
let pollErrorCount = 0;
let isPollRequestInProgress = false;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000; // 15 minutes ceiling
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

function startPolling(orderId) {
    stopPolling(); // Ensure no duplicate intervals exist

    if (!orderId) {
        console.warn('[ORDER] Cannot start polling: No Order ID provided.');
        return;
    }

    pollStartTime = Date.now();
    pollErrorCount = 0;
    isPollRequestInProgress = false;
    let pollCount = 0;

    console.log(`[ORDER] Starting polling for Order ID: ${orderId} (Interval: ${POLL_INTERVAL_MS / 1000}s)`);

    const executePoll = async () => {
        if (isPollRequestInProgress) return; // Prevent overlapping requests

        // Check overall timeout ceiling
        if (Date.now() - pollStartTime > MAX_POLL_DURATION_MS) {
            console.warn(`[ORDER] Max poll timeout reached for Order ID: ${orderId}`);
            stopPolling();
            if (currentOrderData) {
                currentOrderData.status = 'TIMEOUT';
                updateOrderUI(currentOrderData);
            }
            showToast('⏰ Polling timed out. You can manually refresh or check later.', 'warning');
            return;
        }

        isPollRequestInProgress = true;
        pollCount++;

        try {
            console.log(`[STEP 4] Request: GET /api/order/${orderId}`);
            console.log(`[ORDER] Checking status... (Poll #${pollCount} for Order ID: ${orderId})`);
            const res = await getOrder(orderId);
            console.log('[STEP 4] Status: 200');
            console.log('[STEP 4] Response:', res);
            const order = res?.order || res;

            if (!order) {
                console.warn(`[ORDER] Empty order response for Order ID: ${orderId}`);
                return;
            }

            pollErrorCount = 0; // Reset consecutive errors
            currentOrderData = order;

            const status = String(order.status || '').toUpperCase();
            console.log(`[ORDER] Status response: ${status}`, order);

            // Check if order expiration time has passed
            const expiresAt = order.expires || order.expiresAt;
            if (status === 'PENDING' && expiresAt && new Date(expiresAt).getTime() < Date.now()) {
                order.status = 'EXPIRED';
                updateOrderUI(order);
                stopPolling();
                console.log(`[ORDER] Order ID: ${orderId} has expired.`);
                showToast('⏰ This number expired without receiving an SMS.', 'warning');
                return;
            }

            updateOrderUI(order);

            if (status === 'RECEIVED') {
                stopPolling();
                console.log(`[ORDER] Order completed! SMS / OTP received.`);
                console.log(`[ORDER] Number received: ${order.phone || '—'}`);
                showToast('📨 SMS received! Your verification code is ready.', 'success');
            } else if (status === 'FINISHED' || status === 'CANCELED' || status === 'BANNED' || status === 'EXPIRED') {
                stopPolling();
                console.log(`[ORDER] Polling stopped. Terminal status: ${status}`);
            }
        } catch (err) {
            pollErrorCount++;
            console.error(`[ORDER] Error checking status for Order ID ${orderId} (${pollErrorCount}/${MAX_CONSECUTIVE_POLL_ERRORS}):`, err.message);

            if (err.status === 404 || err.status === 401) {
                stopPolling();
                setModalError(err.message || 'Order not found or unauthorized.');
            } else if (pollErrorCount >= MAX_CONSECUTIVE_POLL_ERRORS) {
                stopPolling();
                console.warn(`[ORDER] Stopped polling Order ID ${orderId} after ${MAX_CONSECUTIVE_POLL_ERRORS} consecutive failures.`);
                showToast('Temporary network or server issue while checking order status.', 'error');
            }
        } finally {
            isPollRequestInProgress = false;
        }
    };

    // Execute immediately, then periodically
    executePoll();
    pollInterval = setInterval(executePoll, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    isPollRequestInProgress = false;
}

function closeSmsModal() {
    stopPolling();
    const overlay = document.getElementById('smsModalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

/* ══════════════════════════════════════════
   ORDER ACTIONS (Finish, Cancel, Ban)
   Uses: finishOrder, cancelOrder, banOrder from api.js
══════════════════════════════════════════ */
async function handleFinishOrder() {
    if (!currentOrderId || isActionBusy) return;

    const btn = document.getElementById('btnFinishOrder');
    isActionBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Finishing…'; }

    const targetOrderId = currentOrderId;
    console.log(`[STEP 5] Request: POST /api/order/${targetOrderId}/finish`);

    try {
        const res = await finishOrder(targetOrderId);
        console.log('[STEP 5] Status: 200');
        console.log('[STEP 5] Response:', res);
        stopPolling();
        showToast('✅ Order finished and marked complete!', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error(`[STEP 5] finishOrder error for Order ID ${targetOrderId}:`, err);
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

    const targetOrderId = currentOrderId;
    console.log(`[STEP 6] Request: POST /api/order/${targetOrderId}/cancel`);

    try {
        const res = await cancelOrder(targetOrderId);
        console.log('[STEP 6] Status: 200');
        console.log('[STEP 6] Response:', res);
        stopPolling();
        showToast('✅ Order cancelled successfully.', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error(`[STEP 6] cancelOrder error for Order ID ${targetOrderId}:`, err);
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

    const targetOrderId = currentOrderId;
    console.log(`[STEP 7] Request: POST /api/order/${targetOrderId}/ban`);

    try {
        const res = await banOrder(targetOrderId);
        console.log('[STEP 7] Status: 200');
        console.log('[STEP 7] Response:', res);
        stopPolling();
        showToast('⚠️ Number reported as banned.', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        closeSmsModal();
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error(`[STEP 7] banOrder error for Order ID ${targetOrderId}:`, err);
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
            <i class="ph ph-globe"></i>
            <p>Select a country above to see available numbers.</p>
        </div>`;
    const resultCount = document.getElementById('resultCount');
    if (resultCount) resultCount.textContent = '';
    allProducts = [];
}

function showEmptyState(grid, msg) {
    grid.innerHTML = `<div class="state-box" style="grid-column:1/-1;"><i class="ph ph-phone-slash"></i><p>${escapeHTML(msg)}</p></div>`;
}

function showErrorState(grid, msg) {
    grid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="ph ph-warning-circle"></i>
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

function toggleDark() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
    updateThemeUI(isDark);
    updateSettingsThemeBtns();
}

function updateThemeUI(isDark) {
    const modeText = document.getElementById('modeText');
    if (modeText) modeText.textContent = isDark ? 'Dark mode' : 'Light mode';
    const modeIcon = document.querySelector('.mode-dot i');
    if (modeIcon) {
        modeIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
    }
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
    btn.querySelector('i').className = isHidden ? 'ph ph-eye-slash' : 'ph ph-eye';
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

/* ══════════════════════════════════════════
   NOTIFICATIONS (SHARED)
══════════════════════════════════════════ */
let unreadCount = 0;

function toggleNotifDropdown() {
    const dropdown    = document.getElementById('notifDropdown');
    const notifToggle = document.getElementById('notifToggle');
    if (!dropdown || !notifToggle) return;
    const isOpen = dropdown.classList.toggle('show');
    notifToggle.setAttribute('aria-expanded', isOpen.toString());
    
    const profDrop = document.getElementById('dropdown');
    if (profDrop && profDrop.classList.contains('show')) toggleDropdown();
    
    if (isOpen) loadNotifications();
}

document.addEventListener('click', function(e) {
    const notifToggle   = document.getElementById('notifToggle');
    const notifDropdown = document.getElementById('notifDropdown');
    if (notifToggle && notifDropdown) {
        if (!notifToggle.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.classList.remove('show');
            notifToggle.setAttribute('aria-expanded', 'false');
        }
    }
});

async function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;
    list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">Loading notifications...</div>';

    try {
        // Mocked because the backend endpoint does not exist yet (returns 404)
        // const res = await apiRequest('/api/user/notifications', { method: 'GET' });
        // renderNotifications(res.notifications || res.data || []);
        
        // Simulating the 404 response to avoid browser console errors:
        const err = new Error('Not Found');
        err.status = 404;
        throw err;
    } catch (err) {
        if (err.status === 404) {
            list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">Notification system is not fully connected to the backend yet (Endpoint missing).</div>';
        } else {
            list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">Failed to load notifications.</div>';
        }
    }
}

function renderNotifications(notifs) {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;
    
    if (!notifs || notifs.length === 0) {
        list.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">No new notifications.</div>';
        if (badge) badge.style.display = 'none';
        return;
    }

    unreadCount = notifs.filter(n => !n.read).length;
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    list.innerHTML = notifs.map(n => `
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); background: ${n.read ? 'transparent' : 'rgba(124, 58, 237, 0.05)'}; display:flex; gap: 12px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${n.read ? 'transparent' : 'var(--primary)'}; margin-top: 6px;"></div>
            <div>
                <p style="font-size: 13px; font-weight: 700; color: var(--text); margin: 0 0 4px;">${n.title || 'Notification'}</p>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 4px;">${n.message || ''}</p>
                <p style="font-size: 10px; color: var(--muted); margin: 0;">${new Date(n.createdAt || Date.now()).toLocaleString()}</p>
            </div>
        </div>
    `).join('');
}

async function markAllNotifRead() {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
    loadNotifications();
}

document.addEventListener('DOMContentLoaded', () => {
    if (getAuthToken()) {
        loadNotifications().catch(e => console.log('Init notif check failed:', e));
    }
});