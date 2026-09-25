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

let orderPollInterval = null; // Single active polling interval for the active order
let countdownInterval = null; // Countdown timer interval
let remainingTime    = 300;  // 300 seconds / 5-minute countdown timeout
let pollInterval     = null; // Reference for SMS polling
let isBuying         = false; // Guard against double-click on Buy
let isActionBusy     = false; // Guard against multiple finish/cancel/ban requests

let allCountriesData = []; // Cached array of { key, name, prefix } from getCountries()
const productsByCountryCache = new Map(); // Cache of products per country

const POLL_INTERVAL_MS = 5000;
function getConversionRate() {
    if (typeof getExchangeRate === 'function') return getExchangeRate();
    if (typeof window !== 'undefined' && typeof window.getExchangeRate === 'function') return window.getExchangeRate();
    const stored = parseFloat(localStorage.getItem('primes_api_exchange_rate') || localStorage.getItem('adminRate'));
    return (stored && stored > 0) ? stored : 1500;
}
const CONVERSION_RATE = 1500;

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
document.addEventListener('DOMContentLoaded', async () => {
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
    updateBuyBalancePrivacyDisplay();

    renderUserInfo();
    loadWalletBalanceBuyPage();
    attachEventListeners();

    // Check URL parameters for tab and country
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const countryParam = urlParams.get('country');

    try {
        await loadCountries();
    } catch (e) {
        console.error('Initial country load failed:', e);
    }

    if (countryParam) {
        await selectCountry(countryParam);
    } else if (tabParam === 'products') {
        switchBuyTab('products');
    } else {
        switchBuyTab(tabParam || 'countries');
    }

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
══════════════════════════════════════════ */
async function loadWalletBalanceBuyPage() {
    const balEl = document.getElementById('buyWalletBalance');
    if (balEl) balEl.textContent = 'Loading…';

    const currency = getCurrency();
    const symbol   = currency === 'USD' ? '$' : '₦';

    try {
        const data = await fetchWalletBalance(currency);
        console.log(`[Wallet] ${currency} balance response received:`, data);
        applyWalletBalance(data, currency, symbol, balEl);
    } catch (err) {
        console.error(`[Wallet] API error (${err.status || 0}): ${err.message}`);

        const setErrorDisplay = (msg) => {
            if (balEl) balEl.innerHTML = `<span style="font-size: 16px; font-weight: 600; line-height: 1.2; display: block; white-space: normal;">${msg}</span>`;
        };

        if (err.status === 401) {
            setErrorDisplay('Auth Error');
            showToast('Your session has expired. Please log in again.', 'error');
        } else if (err.status === 404) {
            console.log(`[Buy Wallet] 404: No ${currency} wallet found.`);
            applyWalletBalance({ balance: 0 }, currency, symbol, balEl);
        } else if (err.status >= 500) {
            setErrorDisplay('Server error');
            showToast(`Server error: ${err.message}`, 'error');
        } else if (!err.status || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('failed to fetch')) {
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

/* ══════════════════════════════════════════
   WALLET BALANCE PRIVACY / HIDE BALANCE
══════════════════════════════════════════ */
const BALANCE_MASK = '••••••••';

function isBalanceHidden() {
    return localStorage.getItem('primes_balance_hidden') === 'true';
}

function setBalanceHidden(hidden) {
    localStorage.setItem('primes_balance_hidden', hidden ? 'true' : 'false');
}

let cachedBuyBalanceAmount = 0;
let cachedBuyCurrency = 'NGN';
let cachedBuySymbol = '₦';

function toggleBalancePrivacy() {
    const willHide = !isBalanceHidden();
    setBalanceHidden(willHide);
    updateBuyBalancePrivacyDisplay();
    if (typeof showToast === 'function') {
        showToast(willHide ? '🙈 Wallet balance hidden' : '👁️ Wallet balance visible', 'info');
    }
}
window.toggleBalancePrivacy = toggleBalancePrivacy;
window.isBalanceHidden = isBalanceHidden;

function updateBuyBalancePrivacyDisplay() {
    const balEl = document.getElementById('buyWalletBalance');
    const hidden = isBalanceHidden();
    if (balEl) {
        if (hidden) {
            balEl.textContent = BALANCE_MASK;
            balEl.classList.add('balance-masked');
        } else {
            balEl.classList.remove('balance-masked');
            balEl.textContent = cachedBuySymbol + Number(cachedBuyBalanceAmount).toLocaleString(cachedBuyCurrency === 'USD' ? 'en-US' : 'en-NG', {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
        }
    }
    const ariaLabel = hidden ? 'Show wallet balance' : 'Hide wallet balance';
    const iconClass = hidden ? 'ph ph-eye-slash' : 'ph ph-eye';
    const btn = document.getElementById('toggleBuyBalancePrivacyBtn');
    const icon = document.getElementById('buyBalancePrivacyIcon');
    if (btn) {
        btn.setAttribute('aria-label', ariaLabel);
        btn.setAttribute('title', ariaLabel);
    }
    if (icon) {
        icon.className = iconClass;
    }
}
window.updateBuyBalancePrivacyDisplay = updateBuyBalancePrivacyDisplay;

// Parses the balance out of whichever shape the backend returns and
// writes it to the DOM + localStorage cache without cross-currency synthesis.
function applyWalletBalance(data, currency, symbol, balEl) {
    const bal = normalizeWalletBalance(data, currency);
    cachedBuyBalanceAmount = Number(bal) || 0;
    cachedBuyCurrency = currency;
    cachedBuySymbol = symbol;

    updateBuyBalancePrivacyDisplay();

    localStorage.setItem('_walletBalance_' + currency, String(bal));
    if (currency === 'NGN') localStorage.setItem('_walletBalance', String(bal));
    return bal;
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

        allCountriesData = entries.map(([key, info]) => {
            const name = getCountryName(key, info);
            const prefix = getCountryPrefix(info);
            return { key, name, prefix };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Update Countries Header Badges
        const countBadge = document.getElementById('countriesCountBadge');
        if (countBadge) countBadge.textContent = String(allCountriesData.length);
        const statsPill = document.getElementById('countriesStatsPill');
        if (statsPill) statsPill.textContent = `${allCountriesData.length} Countries`;
        const countMeta = document.getElementById('countrySearchCount');
        const options = allCountriesData
            .map(c => {
                const prefixStr = c.prefix ? ` (${c.prefix})` : '';
                return `<option value="${escapeHTML(c.key)}">${escapeHTML(c.name)}${escapeHTML(prefixStr)}</option>`;
            })
            .join('');

        select.innerHTML = '<option value="">Select a Country</option>' + options;
        select.disabled  = false;

        // If a country was previously selected or requested via URL, load it
        if (selectedCountry) {
            select.value = selectedCountry;
            await selectCountry(selectedCountry);
        } else if (allCountriesData.length > 0) {
            const defaultCountry = allCountriesData.find(c => c.key === 'nigeria' || c.key === 'usa') || allCountriesData[0];
            if (defaultCountry) {
                select.value = defaultCountry.key;
                await selectCountry(defaultCountry.key);
            }
        }
    } catch (err) {
        console.error('loadCountries error:', err);
        select.innerHTML = '<option value="">⚠ Failed to load countries. Refresh page to retry.</option>';
        select.disabled  = false;
        const grid = document.getElementById('countryCardsGrid');
        if (grid) {
            grid.innerHTML = `
            <div class="state-box" style="grid-column:1/-1;">
                <i class="ph ph-warning-circle"></i>
                <p>Unable to load countries. Backend may be waking up.</p>
                <button type="button" class="btn btn-primary" onclick="loadCountries()" style="margin-top:10px;padding:8px 18px;border-radius:10px;">Retry</button>
            </div>`;
        }
        showToast('Unable to load countries. Backend may be waking up, please retry.', 'error');
    }
}

/* ══════════════════════════════════════════
   COUNTRY FLAGS (Standard ISO regional indicator conversion)
══════════════════════════════════════════ */
function getCountryFlagEmoji(countryKey) {
    if (!countryKey) return '🌍';
    const key = String(countryKey).toLowerCase();
    const isoMap = {
        usa: 'US', us: 'US', unitedstates: 'US', america: 'US',
        russia: 'RU', ukraine: 'UA', kazakhstan: 'KZ', china: 'CN',
        philippines: 'PH', myanmar: 'MM', indonesia: 'ID', malaysia: 'MY',
        kenya: 'KE', tanzania: 'TZ', vietnam: 'VN', kyrgyzstan: 'KG',
        israel: 'IL', hongkong: 'HK', poland: 'PL', england: 'GB', uk: 'GB',
        greatbritain: 'GB', unitedkingdom: 'GB', madagascar: 'MG', congo: 'CG',
        nigeria: 'NG', macao: 'MO', egypt: 'EG', india: 'IN', ireland: 'IE',
        cambodia: 'KH', laos: 'LA', haiti: 'HT', ivorycoast: 'CI', gambia: 'GM',
        serbia: 'RS', yemen: 'YE', southafrica: 'ZA', romania: 'RO', colombia: 'CO',
        estonia: 'EE', azerbaijan: 'AZ', canada: 'CA', morocco: 'MA', ghana: 'GH',
        argentina: 'AR', uzbekistan: 'UZ', cameroon: 'CM', chad: 'TD',
        germany: 'DE', lithuania: 'LT', croatia: 'HR', sweden: 'SE',
        iraq: 'IQ', netherlands: 'NL', latvia: 'LV', austria: 'AT',
        belarus: 'BY', thailand: 'TH', saudiarabia: 'SA', mexico: 'MX',
        taiwan: 'TW', spain: 'ES', iran: 'IR', algeria: 'DZ', slovenia: 'SI',
        bangladesh: 'BD', senegal: 'SN', turkey: 'TR', czech: 'CZ',
        srilanka: 'LK', peru: 'PE', pakistan: 'PK', newzealand: 'NZ',
        brazil: 'BR', afghanistan: 'AF', uganda: 'UG', angola: 'AO',
        cyprus: 'CY', france: 'FR', belgium: 'BE', bulgaria: 'BG',
        hungary: 'HU', moldova: 'MD', italy: 'IT', paraguay: 'PY',
        tunisia: 'TN', uae: 'AE', zimbabwe: 'ZW', kuwait: 'KW',
        portugal: 'PT', denmark: 'DK', singapore: 'SG', qatar: 'QA',
        greece: 'GR', jordan: 'JO', georgia: 'GE', armenia: 'AM',
        finland: 'FI', norway: 'NO', australia: 'AU', japan: 'JP',
        korea: 'KR', southkorea: 'KR', chile: 'CL', ecuador: 'EC'
    };

    const code = (isoMap[key] || key.slice(0, 2)).toUpperCase();
    if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
        const codePoints = [...code].map(c => 127397 + c.charCodeAt(0));
        try {
            return String.fromCodePoint(...codePoints);
        } catch (_) {}
    }
    return '🌍';
}

/* ══════════════════════════════════════════
   1. DEDICATED COUNTRY CARDS & SEARCH
══════════════════════════════════════════ */
function renderCountryCards(countries) {
    const grid = document.getElementById('countryCardsGrid');
    if (!grid) return;

    if (!countries || countries.length === 0) {
        grid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="ph ph-magnifying-glass"></i>
            <p>No countries match your search.</p>
            <span style="font-size:12px;color:var(--muted);">Try typing another country name or dialing code.</span>
        </div>`;
        return;
    }

    grid.innerHTML = countries.map(c => {
        const flag = getCountryFlagEmoji(c.key);
        const prefixStr = c.prefix ? escapeHTML(c.prefix) : 'Global';
        const isSelected = selectedCountry === c.key;

        return `
        <div class="country-card${isSelected ? ' is-selected' : ''}" data-country-key="${escapeHTML(c.key)}">
            <div class="country-card-header">
                <div class="country-flag-box" title="${escapeHTML(c.name)}">${flag}</div>
                <span class="country-dial-badge">${prefixStr}</span>
            </div>
            <div class="country-card-name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</div>
            <div class="country-card-meta">${isSelected ? '✓ Currently Selected' : 'Instant OTP Delivery'}</div>
            <button type="button" class="btn-select-country" data-country-key="${escapeHTML(c.key)}">
                <span>${isSelected ? 'Selected' : 'Select Country'}</span>
                <i class="ph ph-arrow-right"></i>
            </button>
        </div>`;
    }).join('');
}

function handleCountrySearch() {
    const input = document.getElementById('countrySearchInput');
    const clearBtn = document.getElementById('countrySearchClearBtn');
    const select = document.getElementById('countryFilter');
    const query = (input?.value || '').trim().toLowerCase();

    if (clearBtn) {
        clearBtn.style.display = query ? 'inline-flex' : 'none';
    }

    if (!select) return;

    if (!query) {
        const opts = allCountriesData.map(c => {
            const prefixStr = c.prefix ? ` (${c.prefix})` : '';
            return `<option value="${escapeHTML(c.key)}">${escapeHTML(c.name)}${escapeHTML(prefixStr)}</option>`;
        }).join('');
        select.innerHTML = '<option value="">Select a Country</option>' + opts;
        if (selectedCountry) select.value = selectedCountry;
        return;
    }

    const cleanQ = query.replace(/^\+/, '');
    const filtered = allCountriesData.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(query);
        const keyMatch  = c.key.toLowerCase().includes(query);
        const prefixMatch = c.prefix && (
            c.prefix.toLowerCase().includes(query) ||
            c.prefix.replace('+', '').includes(cleanQ)
        );
        return nameMatch || keyMatch || prefixMatch;
    });

    const opts = filtered.map(c => {
        const prefixStr = c.prefix ? ` (${c.prefix})` : '';
        return `<option value="${escapeHTML(c.key)}">${escapeHTML(c.name)}${escapeHTML(prefixStr)}</option>`;
    }).join('');

    select.innerHTML = `<option value="">Matches (${filtered.length})</option>` + opts;

    if (filtered.length === 1 && query.length >= 2) {
        select.value = filtered[0].key;
        selectCountry(filtered[0].key);
    } else if (selectedCountry && filtered.some(c => c.key === selectedCountry)) {
        select.value = selectedCountry;
    }
}

/* ══════════════════════════════════════════
   2. DEDICATED PRODUCT SEARCH & TAB SWITCH
══════════════════════════════════════════ */
function handleProductSearch() {
    const input = document.getElementById('productSearchInput');
    const clearBtn = document.getElementById('productSearchClearBtn');
    const query = (input?.value || '').trim().toLowerCase();

    if (clearBtn) {
        clearBtn.style.display = query ? 'flex' : 'none';
    }

    // Keep hidden input in sync for compatibility
    const legacyInput = document.getElementById('searchInput');
    if (legacyInput) legacyInput.value = input?.value || '';

    if (allProducts && allProducts.length > 0) {
        renderProductCards(allProducts);
    }
}

function switchBuyTab(tab) {
    const countriesSec  = document.getElementById('countriesSection');
    const productsSec   = document.getElementById('productsSection');
    const tabCountries  = document.getElementById('tabCountriesBtn');
    const tabProducts   = document.getElementById('tabProductsBtn');
    const sideCountries = document.getElementById('sidebarCountriesLink');
    const sideProducts  = document.getElementById('sidebarProductsLink');

    if (tab === 'countries') {
        if (countriesSec) countriesSec.style.display = 'block';
        if (productsSec)  productsSec.style.display  = 'none';
        if (tabCountries) tabCountries.classList.add('active');
        if (tabProducts)  tabProducts.classList.remove('active');
        if (sideCountries) sideCountries.classList.add('active');
        if (sideProducts)  sideProducts.classList.remove('active');

        // Focus search if user switched to countries
        const cSearch = document.getElementById('countrySearchInput');
        if (cSearch && !cSearch.value) {
            setTimeout(() => cSearch.focus(), 80);
        }
    } else {
        if (countriesSec) countriesSec.style.display = 'none';
        if (productsSec)  productsSec.style.display  = 'block';
        if (tabProducts)  tabProducts.classList.add('active');
        if (tabCountries) tabCountries.classList.remove('active');
        if (sideProducts)  sideProducts.classList.add('active');
        if (sideCountries) sideCountries.classList.remove('active');

        // If no country is selected, prompt user
        if (!selectedCountry) {
            showSelectCountryPrompt();
        } else if (allProducts && allProducts.length > 0) {
            renderProductCards(allProducts);
        }
    }

    // Update URL param without page reload
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url.toString());
    } catch (_) {}
}
window.switchBuyTab = switchBuyTab;

function onCountryChange() {
    const select = document.getElementById('countryFilter');
    selectedCountry = select?.value || '';
    selectedProduct = '';

    if (!selectedCountry) {
        showSelectCountryPrompt();
        return;
    }

    selectCountry(selectedCountry);
}

/* ══════════════════════════════════════════
   3. REAL SERVICE BRAND ICONS
══════════════════════════════════════════ */
function getServiceBrandIcon(key, name) {
    const raw = ((key || '') + ' ' + (name || '')).toLowerCase();

    // 1. WhatsApp
    if (raw.includes('whatsapp') || raw === 'wa') {
        return {
            className: 'brand-whatsapp',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413Z"/></svg>`
        };
    }

    // 2. Telegram
    if (raw.includes('telegram') || raw === 'tg') {
        return {
            className: 'brand-telegram',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.832.946z"/></svg>`
        };
    }

    // 3. Instagram
    if (raw.includes('instagram') || raw === 'ig') {
        return {
            className: 'brand-instagram',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`
        };
    }

    // 4. Facebook
    if (raw.includes('facebook') || raw === 'fb') {
        return {
            className: 'brand-facebook',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
        };
    }

    // 5. TikTok
    if (raw.includes('tiktok')) {
        return {
            className: 'brand-tiktok',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`
        };
    }

    // 6. Google / Gmail / YouTube
    if (raw.includes('google') || raw.includes('gmail') || raw === 'go') {
        return {
            className: 'brand-google',
            svg: `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.25 21.3 7.34 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.27C.46 8.2 0 10.05 0 12s.46 3.8 1.27 5.43l4.01-3.14z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.7 1.27 6.57l4.01 3.14c.95-2.83 3.6-4.96 6.72-4.96z"/></svg>`
        };
    }

    // 7. Signal
    if (raw.includes('signal')) {
        return {
            className: 'brand-signal',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.086 21.08a.75.75 0 00.94.94l3.912-1.352A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 1.5c4.694 0 8.5 3.806 8.5 8.5s-3.806 8.5-8.5 8.5a8.47 8.47 0 01-4.148-1.08.75.75 0 00-.535-.078l-3.082 1.065 1.065-3.082a.75.75 0 00-.078-.535A8.47 8.47 0 013.5 12c0-4.694 3.806-8.5 8.5-8.5zm-3.25 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm3.25 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm3.25 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z"/></svg>`
        };
    }

    // 8. Twitter / X
    if (raw.includes('twitter') || raw === 'x' || raw.includes('tweet')) {
        return {
            className: 'brand-twitter',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
        };
    }

    // 9. Discord
    if (raw.includes('discord')) {
        return {
            className: 'brand-discord',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`
        };
    }

    // 10. Snapchat
    if (raw.includes('snapchat') || raw === 'snap') {
        return {
            className: 'brand-snapchat',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.206.75c-4.457 0-7.397 3.197-7.397 6.822 0 1.55.617 3.327 1.488 4.417.207.26.23.454.09.73-.178.353-.695.733-1.378 1.037-.417.185-.758.374-.758.625 0 .428.618.736 1.637.893.284.044.479.167.57.36.14.298-.057.876-.893 1.633-.944.854-1.288 1.572-1.288 2.122 0 .807.728 1.42 2.378 1.42.535 0 1.134-.067 1.838-.21.436-.09.77-.024 1.01.211.58.572 1.492 1.44 2.703 1.44 1.216 0 2.13-.873 2.71-1.445.24-.236.574-.3 1.012-.211.7.143 1.3.21 1.834.21 1.65 0 2.377-.613 2.377-1.42 0-.55-.343-1.268-1.287-2.122-.836-.757-1.033-1.335-.893-1.633.09-.193.285-.316.57-.36 1.018-.157 1.636-.465 1.636-.893 0-.251-.34-.44-.758-.625-.683-.304-1.2-.684-1.378-1.037-.14-.276-.117-.47.09-.73.871-1.09 1.488-2.867 1.488-4.417 0-3.625-2.94-6.822-7.398-6.822z"/></svg>`
        };
    }

    // 11. Netflix
    if (raw.includes('netflix')) {
        return {
            className: 'brand-netflix',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.398 0v24c1.17-.469 2.338-.937 3.51-1.406V0zm11.704 0v24c-1.17-.469-2.338-.937-3.51-1.406V0zM8.908 0l6.194 22.594c-.958-.383-1.916-.767-2.875-1.15L8.908 5.766z"/></svg>`
        };
    }

    // 12. Spotify
    if (raw.includes('spotify')) {
        return {
            className: 'brand-spotify',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`
        };
    }

    // 13. Amazon
    if (raw.includes('amazon')) {
        return {
            className: 'brand-amazon',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.918 18.064c-3.774 2.766-8.794 4.22-13.628 1.488-.344-.195-.038-.57.34-.418 4.49 1.83 9.424.93 13.064-1.42.414-.268.69.183.224.35m1.34-1.205c-.244-.316-1.597-.15-2.21-.077-.184.022-.213-.134-.047-.253 1.077-.775 2.847-.552 3.056-.289.21.263-.056 2.05-1.08 2.894-.158.13-.308.06-.237-.11.233-.56.762-1.848.518-2.165M23.076 10.975c-.328-.423-.846-.665-1.517-.704-1.018-.06-2.13.355-3.085 1.134v-1.04H16.03v10.02h2.444v-5.263c.69-.536 1.353-.8 1.94-.766.452.025.753.22 1.02.668.27.447.377 1.132.377 2.127v3.234h2.443v-3.743c0-1.47-.23-2.617-.687-3.376-.456-.76-1.127-1.144-1.99-1.15-1.03-.008-2.02.463-2.903 1.385l.088-.415h-2.444v.93c.96-.867 2.056-1.328 3.23-1.328.665 0 1.25.137 1.72.4.47.263.81.65 1.002 1.14.37-.478.85-.85 1.405-1.096.556-.247 1.18-.37 1.83-.36 1.15.018 2.05.378 2.65 1.054.6.677.89 1.64.89 2.834v5.867H26.37v-6.23c0-.986-.145-1.745-.436-2.235-.29-.49-.75-.74-1.36-.74-.75 0-1.45.334-2.04.98-.59.645-.9 1.494-.9 2.5v5.715h-2.44V10.975z"/></svg>`
        };
    }

    // 14. Apple
    if (raw.includes('apple')) {
        return {
            className: 'brand-apple',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.64-.78 1.08-1.86.96-2.95-1 .04-2.14.67-2.81 1.45-.59.68-1.1 1.78-.96 2.84 1.12.09 2.19-.57 2.81-1.34z"/></svg>`
        };
    }

    // 15. Microsoft
    if (raw.includes('microsoft') || raw.includes('ms')) {
        return {
            className: 'brand-microsoft',
            svg: `<svg viewBox="0 0 24 24"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/><path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#ffb900" d="M13 13h10v10H13z"/></svg>`
        };
    }

    // 16. LinkedIn
    if (raw.includes('linkedin')) {
        return {
            className: 'brand-linkedin',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`
        };
    }

    // 17. Tinder
    if (raw.includes('tinder')) {
        return {
            className: 'brand-tinder',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.827 2.046c-.328.618-.466 1.424-.466 2.197 0 2.222 1.666 4.04 3.864 4.04 1.34 0 2.502-.638 3.23-1.636.326.96.486 2.02.486 3.14 0 5.405-4.444 9.787-9.92 9.787C4.545 19.574.1 15.192.1 9.787c0-2.883 1.258-5.467 3.252-7.24.478 1.442 1.543 2.656 2.94 3.32-.475-1.554-.378-3.388.358-4.996C8.807.135 11.233.02 12.827 2.046z"/></svg>`
        };
    }

    // 18. OpenAI / ChatGPT
    if (raw.includes('openai') || raw.includes('chatgpt')) {
        return {
            className: 'brand-openai',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.771-4.205 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.746-7.074zm-9.022 12.608a4.475 4.475 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zm-1.57-9.3a4.485 4.485 0 012.342-1.974v5.679a.792.792 0 00.39.682l5.844 3.37-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.03 9.004zm15.656 3.125l-5.844-3.37 2.02-1.168a.076.076 0 01.071 0l4.83 2.791a4.494 4.494 0 01-.674 8.105v-5.676a.79.79 0 00-.403-.682zm2.715-3.023l-.142-.086-4.782-2.758a.775.775 0 00-.781 0l-5.843 3.369V7.3a.08.08 0 01.033-.062L14.26 4.05a4.5 4.5 0 016.14 1.646 4.473 4.473 0 01.536 3.014zM8.33 13.5l2.457-1.417 2.457 1.419v2.834l-2.457 1.417-2.457-1.417V13.5z"/></svg>`
        };
    }

    // 19. PayPal
    if (raw.includes('paypal')) {
        return {
            className: 'brand-paypal',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.82.876 4.965-.03.14-.07.29-.115.44-.73 3.68-3.18 5.75-6.666 5.75H9.684l-1.39 7.02c-.062.39-.398.67-.79.67z"/></svg>`
        };
    }

    // Default professional device/SMS verification icon
    return {
        className: 'brand-default',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`
    };
}

/* ══════════════════════════════════════════
   PRODUCTS
   Uses: getProducts(country) from api.js
══════════════════════════════════════════ */
async function loadProducts(country) {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) return;

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

        const convRate = getConversionRate();
        allProducts = Object.entries(raw)
            .filter(([, info]) => info && typeof info === 'object')
            .map(([key, info]) => {
                let priceUSD = 0;
                let priceNGN = 0;
                let qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
                let category = (info.Category || info.category || 'activation').toLowerCase();
                const isNativeNGN = String(info.currency || '').toUpperCase() === 'NGN';

                if (isNativeNGN && (info.cost !== undefined || info.Cost !== undefined)) {
                    priceNGN = parseFloat(info.cost !== undefined ? info.cost : info.Cost) || 0;
                    priceUSD = info.Price !== undefined ? parseFloat(info.Price) : (priceNGN / convRate);
                } else if (info.cost !== undefined && info.Price !== undefined) {
                    priceNGN = parseFloat(info.cost) || 0;
                    priceUSD = parseFloat(info.Price) || 0;
                } else if (info.cost !== undefined || info.rate !== undefined) {
                    priceNGN = parseFloat(info.cost || info.rate || 0);
                    priceUSD = priceNGN / convRate;
                } else if (info.Price !== undefined || info.price !== undefined || info.Cost !== undefined) {
                    priceUSD = parseFloat(info.Price || info.price || info.Cost || 0);
                    priceNGN = priceUSD * convRate;
                } else {
                    const operators = Object.values(info).filter(v => v && typeof v === 'object');
                    if (operators.length > 0) {
                        const validUsdPrices = operators.map(op => parseFloat(op.Price || op.price || 0)).filter(p => p > 0);
                        const validNgnPrices = operators.map(op => parseFloat(op.cost || op.rate || op.Cost || 0)).filter(p => p > 0);

                        priceUSD = validUsdPrices.length > 0 ? Math.min(...validUsdPrices) : 0;
                        priceNGN = validNgnPrices.length > 0 ? Math.min(...validNgnPrices) : 0;

                        if (priceNGN === 0 && priceUSD > 0) priceNGN = priceUSD * convRate;
                        if (priceUSD === 0 && priceNGN > 0) priceUSD = priceNGN / convRate;

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
                    isNativeNGN,
                    qty,
                    category
                };
            })
            .filter(p => p.priceNGN >= 0);

        productsByCountryCache.set(country, allProducts);

        const serviceFilter = document.getElementById('serviceFilter');
        if (serviceFilter) {
            const currentVal = serviceFilter.value;
            const uniqueServices = Array.from(new Set(allProducts.map(p => p.key))).sort();
            const serviceOpts = ['<option value=""><i class="ph ph-device-mobile"></i> All Services</option>'];
            uniqueServices.forEach(sKey => {
                const prod = allProducts.find(p => p.key === sKey);
                serviceOpts.push(`<option value="${escapeHTML(sKey)}">${escapeHTML(prod?.name || sKey)}</option>`);
            });
            serviceFilter.innerHTML = serviceOpts.join('');
            if (currentVal && uniqueServices.includes(currentVal)) {
                serviceFilter.value = currentVal;
            }
        }

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
    const pSearchInput  = document.getElementById('productSearchInput')?.value.toLowerCase() || '';
    const legacySearch  = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const searchInput   = pSearchInput || legacySearch;
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
        const displayPrice = currency === 'USD' ? p.priceUSD : p.priceNGN;
        const priceStr     = symbol + displayPrice.toLocaleString(currency === 'USD' ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const isSelected   = selectedProduct === p.key;
        const safeKey      = escapeHTML(p.key);
        const iconData     = getServiceBrandIcon(p.key, p.name);

        return `
        <div class="card${isSelected ? ' selected' : ''}" data-product-key="${safeKey}">
            <div class="card-top">
                <div class="service-icon-badge ${iconData.className}">
                    ${iconData.svg}
                </div>
                <div class="card-name-group">
                    <span class="card-title">${escapeHTML(p.name)}</span>
                    <span class="card-category-tag">${escapeHTML(p.category)}</span>
                </div>
            </div>
            <div class="card-bottom">
                <div class="card-price-info">
                    <span class="card-price">${priceStr}</span>
                    <span class="card-stock">${p.qty > 0 ? p.qty.toLocaleString() + ' in stock' : 'Available'}</span>
                </div>
                <button
                    type="button"
                    class="btn btn-buy"
                    data-product-key="${safeKey}"
                >
                    <i class="ph ph-shopping-bag"></i> Buy Number
                </button>
            </div>
        </div>`;
    }).join('');
}

function selectProduct(key) {
    selectedProduct = key;
    renderProductCards(allProducts);
}

async function selectCountry(countryKey, targetProductKey = null) {
    if (!countryKey) return;
    selectedCountry = countryKey;
    selectedProduct = targetProductKey || '';

    // Update select dropdown for compatibility
    const countrySelect = document.getElementById('countryFilter');
    if (countrySelect) {
        countrySelect.value = countryKey;
    }

    // Find country details
    const countryObj = allCountriesData.find(c => c.key === countryKey);
    const countryName = countryObj ? countryObj.name : countryKey.toUpperCase();
    const countryPrefix = countryObj?.prefix ? ` (${countryObj.prefix})` : '';
    const flag = getCountryFlagEmoji(countryKey);

    // Update Active Country banner
    const acFlag = document.getElementById('activeCountryFlag');
    const acTitle = document.getElementById('activeCountryTitle');
    const acPill = document.getElementById('activeCountryPill');
    if (acPill) {
        acPill.textContent = `${countryName}${countryPrefix}`;
        acPill.style.display = 'inline-flex';
    }

    // If cached, load immediately, else fetch from API
    if (productsByCountryCache.has(countryKey)) {
        allProducts = productsByCountryCache.get(countryKey);
        renderProductCards(allProducts);
        if (targetProductKey) {
            selectProduct(targetProductKey);
            const card = document.querySelector(`.card[data-product-key="${targetProductKey}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } else {
        await loadProducts(countryKey);
        if (targetProductKey) {
            selectProduct(targetProductKey);
            const card = document.querySelector(`.card[data-product-key="${targetProductKey}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}
window.selectCountry = selectCountry;

function handleSearchInput() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const dropdown = document.getElementById('searchResultsDropdown');
    const rawVal = input?.value || '';
    const query = rawVal.trim().toLowerCase();

    if (clearBtn) {
        clearBtn.style.display = query ? 'block' : 'none';
    }

    if (!query) {
        if (dropdown) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
        }
        if (selectedCountry && allProducts.length > 0) {
            renderProductCards(allProducts);
        } else if (!selectedCountry) {
            showSelectCountryPrompt();
        }
        return;
    }

    // 1. If country is selected, filter product cards in real time
    if (selectedCountry && allProducts.length > 0) {
        renderProductCards(allProducts);
    } else if (!selectedCountry) {
        // If no country is selected yet, display matching countries in cards grid
        renderCountrySearchCards(query);
    }

    // 2. Render live search results dropdown
    renderSearchResultsDropdown(query);
}

function renderCountrySearchCards(query) {
    const cardsGrid = document.getElementById('cardsGrid');
    const resultCount = document.getElementById('resultCount');
    if (!cardsGrid) return;

    const cleanQ = query.replace(/^\+/, '');
    const matched = allCountriesData.filter(c => {
        return c.name.toLowerCase().includes(query) ||
               c.key.toLowerCase().includes(query) ||
               (c.prefix && (c.prefix.toLowerCase().includes(query) || c.prefix.replace('+', '').includes(cleanQ)));
    });

    if (resultCount) {
        resultCount.textContent = `${matched.length} countr${matched.length === 1 ? 'y' : 'ies'} found for "${query}"`;
    }

    if (matched.length === 0) {
        cardsGrid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
            <i class="ph ph-magnifying-glass"></i>
            <p>No countries or numbers match "<strong>${escapeHTML(query)}</strong>".</p>
            <span style="font-size:12px;color:var(--muted);">Try searching by country name (e.g. USA, Nigeria) or dial code (+1, +234).</span>
        </div>`;
        return;
    }

    cardsGrid.innerHTML = matched.slice(0, 12).map(c => `
        <div class="card country-search-card" style="position:relative;cursor:pointer;" data-country-key="${escapeHTML(c.key)}">
            <div class="card-icon-badge"><i class="ph ph-globe"></i></div>
            <div class="card-title" style="font-weight:800;font-size:15px;color:var(--text);">${escapeHTML(c.name)}</div>
            <div class="card-meta">
                <span style="font-size:13px;font-weight:700;color:var(--primary);">${c.prefix ? escapeHTML(c.prefix) : 'Available'}</span>
                <span class="card-service-badge">Country</span>
            </div>
            <button
                type="button"
                class="btn btn-primary"
                style="margin-top:12px;width:100%;padding:9px;border-radius:10px;font-size:13px;"
                data-country-key="${escapeHTML(c.key)}"
            >
                View Numbers <i class="ph ph-arrow-right"></i>
            </button>
        </div>
    `).join('');
}

function renderSearchResultsDropdown(query) {
    const dropdown = document.getElementById('searchResultsDropdown');
    if (!dropdown) return;

    const currency = getCurrency();
    const symbol   = currency === 'USD' ? '$' : '₦';
    const cleanQ   = query.replace(/^\+/, '');

    // A. Match countries & dial codes from authoritative /api/countries
    const matchedCountries = allCountriesData.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(query);
        const keyMatch  = c.key.toLowerCase().includes(query);
        const prefixMatch = c.prefix && (
            c.prefix.toLowerCase().includes(query) ||
            c.prefix.replace('+', '').includes(cleanQ)
        );
        return nameMatch || keyMatch || prefixMatch;
    }).slice(0, 6);

    // B. Match products in current country if loaded
    let matchedCurrentProducts = [];
    if (allProducts.length > 0) {
        matchedCurrentProducts = allProducts.filter(p => {
            return p.name.toLowerCase().includes(query) ||
                   p.key.toLowerCase().includes(query) ||
                   p.category.toLowerCase().includes(query);
        }).slice(0, 8);
    }

    // C. Check if query matches a known country + product pattern (e.g. "usa whatsapp", "+1 telegram")
    let crossMatchCountry = null;
    let crossMatchProductKey = null;
    for (const c of allCountriesData) {
        const cName = c.name.toLowerCase();
        const cKey = c.key.toLowerCase();
        const cPref = (c.prefix || '').replace('+', '').toLowerCase();

        if (query.startsWith(cName + ' ') || query.startsWith(cKey + ' ') || (cPref && query.startsWith('+' + cPref + ' ')) || (cPref && query.startsWith(cPref + ' '))) {
            crossMatchCountry = c;
            const remainder = query
                .replace(cName, '')
                .replace(cKey, '')
                .replace('+' + cPref, '')
                .replace(cPref, '')
                .trim();
            if (remainder) crossMatchProductKey = remainder;
            break;
        }
    }

    let html = '';

    // If query matches a combined country + product
    if (crossMatchCountry && crossMatchProductKey) {
        const c = crossMatchCountry;
        html += `
        <div class="search-section-header">Direct Match</div>
        <div class="search-item" data-action="select-country-product" data-country="${escapeHTML(c.key)}" data-product="${escapeHTML(crossMatchProductKey)}">
            <div class="search-item-info">
                <span class="search-item-icon-box"><i class="ph ph-sim-card"></i></span>
                <div>
                    <div class="search-item-title">${escapeHTML(crossMatchProductKey.toUpperCase())} in ${escapeHTML(c.name)}</div>
                    <div class="search-item-subtitle">${c.prefix ? escapeHTML(c.prefix) + ' • ' : ''}Ready to purchase</div>
                </div>
            </div>
            <div class="search-item-action">
                <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:11px;border-radius:8px;">View & Buy</button>
            </div>
        </div>`;
    }

    // Render matching products from currently active country
    if (matchedCurrentProducts.length > 0 && selectedCountry) {
        const currentCountryObj = allCountriesData.find(c => c.key === selectedCountry);
        const countryLabel = currentCountryObj ? `${currentCountryObj.name} (${currentCountryObj.prefix || ''})` : selectedCountry.toUpperCase();
        html += `<div class="search-section-header">Available Numbers in ${escapeHTML(countryLabel)}</div>`;
        matchedCurrentProducts.forEach(p => {
            const displayPrice = currency === 'USD' ? p.priceUSD : p.priceNGN;
            const priceStr = symbol + displayPrice.toLocaleString(currency === 'USD' ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const stockLabel = p.qty > 0 ? `${p.qty} in stock` : 'In stock';
            html += `
            <div class="search-item" data-action="buy-product" data-country="${escapeHTML(selectedCountry)}" data-product="${escapeHTML(p.key)}">
                <div class="search-item-info">
                    <span class="search-item-icon-box"><i class="ph ph-sim-card"></i></span>
                    <div>
                        <div class="search-item-title">${escapeHTML(p.name)}</div>
                        <div class="search-item-subtitle">${stockLabel} • ${escapeHTML(p.category)}</div>
                    </div>
                </div>
                <div class="search-item-action">
                    <span style="color:var(--text);font-weight:800;font-size:13px;margin-right:8px;">${priceStr}</span>
                    <button type="button" class="btn btn-buy btn-sm" data-product-key="${escapeHTML(p.key)}" style="padding:4px 12px;font-size:12px;border-radius:8px;"><i class="ph ph-shopping-bag"></i> Buy</button>
                </div>
            </div>`;
        });
    }

    // Render matching countries / dial codes
    if (matchedCountries.length > 0) {
        html += `<div class="search-section-header">Matching Countries & Numbers (${matchedCountries.length})</div>`;
        matchedCountries.forEach(c => {
            const isCurrentlySelected = selectedCountry === c.key;
            html += `
            <div class="search-item" data-action="select-country" data-country="${escapeHTML(c.key)}">
                <div class="search-item-info">
                    <span class="search-item-icon-box"><i class="ph ph-globe"></i></span>
                    <div>
                        <div class="search-item-title">${escapeHTML(c.name)} ${c.prefix ? `<span style="color:var(--primary);font-weight:700;">(${escapeHTML(c.prefix)})</span>` : ''}</div>
                        <div class="search-item-subtitle">${isCurrentlySelected ? '✓ Currently selected' : 'Click to view available numbers'}</div>
                    </div>
                </div>
                <div class="search-item-action">
                    <span style="font-size:12px;color:var(--primary);font-weight:700;">Select <i class="ph ph-arrow-right"></i></span>
                </div>
            </div>`;
        });
    }

    // If empty results
    if (matchedCountries.length === 0 && matchedCurrentProducts.length === 0 && (!crossMatchCountry || !crossMatchProductKey)) {
        html += `
        <div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;">
            <i class="ph ph-magnifying-glass" style="font-size:26px;color:var(--muted);display:inline-block;margin-bottom:6px;"></i>
            <div style="font-weight:700;color:var(--text);margin-bottom:4px;">No matching results for "${escapeHTML(query)}"</div>
            <div>Try searching by country name (e.g. <em>Nigeria</em>, <em>USA</em>), dial code (e.g. <em>+234</em>, <em>+1</em>), or select a country from the dropdown above.</div>
        </div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

/* ══════════════════════════════════════════
   BUY ACTIVATION
   Uses: buyActivation(country, product) from api.js
══════════════════════════════════════════ */
async function handleBuyClick(country, product, btnEl) {
    if (isBuying) return;

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
    const sym = activeCurrency === 'USD' ? '$' : '₦';

    const prodObj = allProducts.find(p => p.key === product);
    const isNativeNGN = prodObj?.isNativeNGN || false;

    let productPrice = 0;
    let convertedProductPrice = null;

    if (activeCurrency === 'USD') {
        productPrice = prodObj?.priceUSD || 0;
        if (isNativeNGN) {
            convertedProductPrice = productPrice;
        }
    } else {
        productPrice = prodObj?.priceNGN || 0;
    }

    console.log(`[PRODUCT] Product ID: ${product}`);
    console.log(`[PRODUCT] Native Currency: ${isNativeNGN ? 'NGN' : 'USD'}`);
    console.log(`[PRODUCT] Authoritative Product Price: ${sym}${productPrice}`);
    if (convertedProductPrice !== null) {
        console.log(`[PRODUCT] Converted Product Price: $${convertedProductPrice}`);
    }

    let walletBalance = 0;
    try {
        console.log(`[Purchase] Querying authoritative backend wallet balance for ${activeCurrency}...`);
        const walletRes = await fetchWalletBalance(activeCurrency);
        walletBalance = normalizeWalletBalance(walletRes, activeCurrency);
        console.log(`[WALLET] Authoritative Backend Wallet Balance: ${sym}${walletBalance}`);

        const buyBalEl = document.getElementById('buyWalletBalance');
        if (buyBalEl) {
            buyBalEl.textContent = sym + Number(walletBalance).toLocaleString(activeCurrency === 'USD' ? 'en-US' : 'en-NG', {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
        }
    } catch (balErr) {
        console.error('[Purchase] Could not fetch authoritative balance:', balErr.message);
        isBuying = false;
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="ph ph-shopping-bag"></i> Buy Now';
        }
        showToast(balErr.message || 'Unable to connect to server to verify wallet balance.', 'error');
        return;
    }

    if (walletBalance < productPrice) {
        isBuying = false;
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="ph ph-shopping-bag"></i> Buy Now';
        }
        showToast(`Insufficient balance: Required ${sym}${productPrice.toLocaleString()}, available balance is ${sym}${walletBalance.toLocaleString()}. Please fund your wallet.`, 'error');
        return;
    }

    console.log(`[PURCHASE DEBUG] Validation passed: balance (${sym}${walletBalance}) >= price (${sym}${productPrice})`);
    console.log("[PURCHASE] API URL:", `${API_BASE_URL}/api/buy/activation`);
    console.log("[PURCHASE] Payload:", {
        country,
        product,
        currency: activeCurrency
    });
    console.log("[PURCHASE] Has auth token:", !!getAuthToken());

    try {
        // Requirement 7: Clear old order ID & old OTP/SMS before purchasing
        stopPolling('Resetting for new purchase');
        currentOrderId = null;
        currentOrderData = null;
        localStorage.removeItem('currentOrderId');

        // Reset modal UI immediately so old order data is never shown
        setModalLoading(null);

        const response = await buyActivation(country, product, activeCurrency);
        console.log("[PURCHASE] Backend response:", response);

        // Requirement 1: Get the exact NEW order ID from the backend response
        const orderId = response?.order?.id || response?.id || response?.orderId || response?.data?.id || response?.activationId;

        if (!orderId) {
            throw new Error(response?.message || 'Server did not return a valid activation or order ID.');
        }

        // Save the new order ID
        currentOrderId = orderId;
        localStorage.setItem("currentOrderId", String(orderId));
        console.log("[ORDER] New order ID:", orderId);
        console.log("[OTP] Order ID:", orderId);

        showToast('✅ Number purchased successfully! Opening order…', 'success');

        await loadWalletBalanceBuyPage();

        // Requirement 2 & 3: Use the new order ID to fetch order, get number, and poll
        openOrderModal(orderId);
    } catch (error) {
        console.error("[PURCHASE] Network/backend error:", error);
        console.error("[PURCHASE] Error status:", error?.status);
        console.error("[PURCHASE] Error message:", error?.message);

        let displayError = error.message || 'Failed to purchase number.';
        if (displayError.includes('400') || displayError.toLowerCase().includes('status code 400')) {
            displayError = 'Nura SQ upstream provider error (Code 400): This service is currently unavailable or out of stock from the provider. Your wallet was not charged.';
        } else if (displayError.toLowerCase().includes('insufficient')) {
            displayError = `Insufficient balance: Provider price for available numbers in this service exceeds current balance (${sym}${walletBalance}). Please fund your wallet.`;
        }
        showToast(displayError, 'error');

        try {
            await loadWalletBalanceBuyPage();
        } catch (_) {}
    } finally {
        isBuying = false;
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="ph ph-shopping-bag"></i> Buy Now';
        }
    }
}

/* ══════════════════════════════════════════
   ORDER MODAL & DETAILS (Step 4 - Check Order)
   Uses: getOrder(orderId) from api.js
══════════════════════════════════════════ */
async function openOrderModal(orderId) {
    if (!orderId) {
        console.error('[OTP] Missing order ID');
        return;
    }

    currentOrderId = orderId;
    localStorage.setItem('currentOrderId', String(orderId));
    console.log(`[ORDER] Opening Order Modal for Order ID: ${orderId}`);

    const overlay = document.getElementById('smsModalOverlay');
    if (!overlay) return;

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Clear old UI and show loading state with new order ID
    setModalLoading(orderId);

    // Keep the 5-minute activation timer
    startCountdown();

    // Fetch and poll the order using order ID as the single source of truth
    startOrderPolling(orderId);
}

function setModalLoading(orderId) {
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = 'Loading…';
    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = orderId ? `#${orderId}` : '—';
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = 'Waiting for SMS...';
    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.className = 'dot pulse';
        statusDot.style.background = '#f59e0b';
    }
    const otpBox = document.getElementById('smsOtpBox');
    if (otpBox) {
        otpBox.classList.remove('code-received');
        otpBox.classList.add('code-waiting');
    }
    const otpCode = document.getElementById('otpCode');
    if (otpCode) otpCode.textContent = 'Waiting for code...';
    const otpFullText = document.getElementById('otpFullText');
    if (otpFullText) otpFullText.textContent = 'Send your verification SMS to this number. Code will appear automatically.';
    const copyCodeBtn = document.getElementById('btnCopyCode');
    if (copyCodeBtn) copyCodeBtn.style.display = 'none';
    const inboxList = document.getElementById('smsInboxList');
    if (inboxList) {
        inboxList.style.display = 'none';
        inboxList.innerHTML = '';
    }
    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn    = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');
    if (cancelBtn) cancelBtn.disabled = false;
    if (banBtn)    banBtn.disabled    = false;
    if (finishBtn) finishBtn.disabled = true;
}

function setModalError(msg) {
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.textContent = msg;
    const otpCode = document.getElementById('otpCode');
    if (otpCode) otpCode.textContent = 'Error';
    const otpFullText = document.getElementById('otpFullText');
    if (otpFullText) otpFullText.textContent = msg;
}

function parseOrderSms(order) {
    if (!order) return { hasReceivedSms: false, otp: null, fullText: '', sender: '', smsTime: '', smsList: [] };

    let rawSmsList = [];
    if (Array.isArray(order.sms)) {
        rawSmsList = order.sms;
    } else if (order.sms && typeof order.sms === 'object') {
        rawSmsList = [order.sms];
    } else if (typeof order.sms === 'string' && order.sms.trim()) {
        rawSmsList = [{ text: order.sms.trim() }];
    }

    const topLevelCode = order.code || order.smsCode || order.otp || order.verification_code || order.passcode;
    const topLevelText = order.text || order.smsText || order.message;

    let otp = null;
    let fullText = '';
    let sender = '';
    let smsTime = '';
    const validSmsList = [];

    // Filter and inspect valid SMS items from list
    for (let i = 0; i < rawSmsList.length; i++) {
        const item = rawSmsList[i];
        if (typeof item === 'string' && item.trim()) {
            validSmsList.push(item.trim());
        } else if (item && typeof item === 'object') {
            const hasContent = String(item.code || item.otp || item.pin || '').trim() !== '' ||
                               String(item.text || item.message || '').trim() !== '';
            if (hasContent) {
                validSmsList.push(item);
            }
        }
    }

    if (validSmsList.length > 0) {
        const latestSms = validSmsList[validSmsList.length - 1];
        if (typeof latestSms === 'string') {
            fullText = latestSms;
            otp = extractOTP(latestSms);
        } else if (latestSms && typeof latestSms === 'object') {
            const itemCode = latestSms.code || latestSms.otp || latestSms.pin;
            const itemText = latestSms.text || latestSms.message;
            otp = (itemCode && String(itemCode).trim()) ? String(itemCode).trim() : extractOTP(itemText || '');
            fullText = (itemText && String(itemText).trim()) ? String(itemText).trim() : (otp ? `Verification code: ${otp}` : '');
            sender = latestSms.sender || latestSms.from || '';
            smsTime = latestSms.created_at || latestSms.date || '';
        }
    }

    if (!otp && topLevelCode && String(topLevelCode).trim()) {
        otp = String(topLevelCode).trim();
    }
    if (!otp && topLevelText && String(topLevelText).trim()) {
        otp = extractOTP(String(topLevelText).trim());
    }
    if (!fullText && topLevelText && String(topLevelText).trim()) {
        fullText = String(topLevelText).trim();
    }
    if (!fullText && otp) {
        fullText = `Verification code: ${otp}`;
    }

    // CRITICAL: hasReceivedSms is TRUE ONLY when an actual OTP or actual message text is present.
    // Empty array or status "RECEIVED" without an actual SMS/text/code MUST NOT trigger hasReceivedSms!
    const hasReceivedSms = Boolean((otp && String(otp).trim()) || (fullText && String(fullText).trim()));

    return {
        hasReceivedSms,
        otp: otp || null,
        fullText: fullText || '',
        sender,
        smsTime,
        smsList: validSmsList
    };
}

function updateOrderUI(order) {
    if (!order) return;

    const phone = order.phone || order.number || order.phone_number || '—';
    const phoneEl = document.getElementById('modalPhone');
    if (phoneEl) phoneEl.textContent = phone;

    const orderId = order.id || order._id || order.orderId || currentOrderId || '—';
    const orderIdEl = document.getElementById('modalOrderId');
    if (orderIdEl) orderIdEl.textContent = '#' + orderId;

    const expiresEl = document.getElementById('modalExpires');
    if (expiresEl) {
        const exp = order.expires || order.expiresAt || order.created_at;
        expiresEl.textContent = exp ? new Date(exp).toLocaleTimeString() : '—';
    }

    const statusDot   = document.getElementById('statusDot');
    const statusText  = document.getElementById('statusText');
    const otpBox      = document.getElementById('smsOtpBox');
    const otpCode     = document.getElementById('otpCode');
    const otpFullText = document.getElementById('otpFullText');
    const copyCodeBtn = document.getElementById('btnCopyCode');

    const parsed = parseOrderSms(order);
    const { hasReceivedSms, otp, fullText, sender, smsTime, smsList } = parsed;
    const currentStatus = String(order.status || 'PENDING').toUpperCase();

    // Show Code Received ONLY when an actual SMS with real code/text has arrived
    if (hasReceivedSms) {
        if (otpBox) {
            otpBox.classList.remove('code-waiting');
            otpBox.classList.add('code-received');
        }
        if (otpCode) {
            otpCode.textContent = otp || 'Code received';
        }
        if (otpFullText) {
            const senderLabel = sender ? `[${escapeHTML(sender)}] ` : '';
            const timeLabel   = smsTime ? ` (${new Date(smsTime).toLocaleTimeString()})` : '';
            otpFullText.textContent = `Message: ${senderLabel}${fullText || 'SMS received'}${timeLabel}`;
        }
        if (copyCodeBtn) {
            copyCodeBtn.style.display = otp ? 'inline-flex' : 'none';
        }
        if (statusDot) {
            statusDot.className = 'dot received';
            statusDot.style.background = '#10b981';
        }
        if (statusText) {
            statusText.textContent = currentStatus === 'FINISHED' ? 'Order Completed' : 'SMS Received';
        }
    } else {
        if (otpBox) {
            otpBox.classList.remove('code-received');
            otpBox.classList.add('code-waiting');
        }
        if (copyCodeBtn) {
            copyCodeBtn.style.display = 'none';
        }

        if (currentStatus === 'FINISHED') {
            if (statusDot) {
                statusDot.className = 'dot';
                statusDot.style.background = '#6b7280';
            }
            if (statusText) statusText.textContent = 'Order Finished';
            if (otpCode) otpCode.textContent = 'No code received';
            if (otpFullText) otpFullText.textContent = 'This order was completed.';
        } else if (currentStatus === 'TIMEOUT' || currentStatus === 'EXPIRED') {
            if (statusDot) {
                statusDot.className = 'dot';
                statusDot.style.background = '#ef4444';
            }
            if (statusText) {
                statusText.textContent = currentStatus === 'TIMEOUT'
                    ? 'Order Timed Out (No SMS received from provider)'
                    : 'Number Expired (No SMS Received)';
            }
            if (otpCode) otpCode.textContent = 'No code received';
            if (otpFullText) otpFullText.textContent = 'Activation window expired without receiving an SMS from provider.';
        } else if (currentStatus === 'CANCELED') {
            if (statusDot) {
                statusDot.className = 'dot';
                statusDot.style.background = '#ef4444';
            }
            if (statusText) statusText.textContent = 'Order Cancelled';
            if (otpCode) otpCode.textContent = 'Order Cancelled';
            if (otpFullText) otpFullText.textContent = 'This number was cancelled before an SMS arrived.';
        } else if (currentStatus === 'BANNED') {
            if (statusDot) {
                statusDot.className = 'dot';
                statusDot.style.background = '#ef4444';
            }
            if (statusText) statusText.textContent = 'Number Reported & Banned';
            if (otpCode) otpCode.textContent = 'Number Banned';
            if (otpFullText) otpFullText.textContent = 'Number was reported and banned.';
        } else {
            // PENDING, or any status before an actual SMS arrives -> active waiting
            if (statusDot) {
                statusDot.className = 'dot pulse';
                statusDot.style.background = '#f59e0b';
            }
            if (statusText) statusText.textContent = 'Waiting for SMS...';
            if (otpCode) otpCode.textContent = 'Waiting for code...';
            if (otpFullText) otpFullText.textContent = 'Send your verification SMS to this number. Code will appear automatically.';
        }
    }

    const inboxList = document.getElementById('smsInboxList');
    if (inboxList) {
        if (smsList.length > 0) {
            inboxList.style.display = 'block';
            inboxList.innerHTML = smsList.map((m, idx) => {
                const mText = typeof m === 'string' ? m : (m.text || m.code || m.message || '');
                const mSender = typeof m === 'object' && m.sender ? escapeHTML(m.sender) : 'SMS';
                const mTime = typeof m === 'object' && (m.created_at || m.date) ? new Date(m.created_at || m.date).toLocaleTimeString() : '';
                return `<div style="padding:10px 14px;margin-bottom:8px;background:var(--border-light);border-radius:10px;font-size:12px;text-align:left;border:1px solid var(--border);">
                    <div style="font-weight:700;color:var(--text);margin-bottom:2px;">#${idx + 1} [${mSender}] ${mTime ? '· ' + mTime : ''}</div>
                    <div style="color:var(--muted);">${escapeHTML(mText)}</div>
                </div>`;
            }).join('');
        } else {
            inboxList.style.display = 'none';
            inboxList.innerHTML = '';
        }
    }

    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn    = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');

    const isFinal = currentStatus === 'FINISHED' || currentStatus === 'CANCELED' || currentStatus === 'BANNED' || currentStatus === 'EXPIRED' || currentStatus === 'TIMEOUT';

    if (cancelBtn) cancelBtn.disabled = isFinal || hasReceivedSms;
    if (banBtn)    banBtn.disabled    = isFinal;
    if (finishBtn) finishBtn.disabled = !hasReceivedSms;
}

function extractOTP(text) {
    if (!text) return null;
    const str = String(text).trim();

    const labeledMatch = str.match(/(?:code(?:\s+is)?|otp(?:\s+is)?|pin(?:\s+is)?|passcode(?:\s+is)?|verification(?:\s+code)?|código)[\s:=#\-]+([0-9A-Za-z]{4,8})\b/i);
    if (labeledMatch && labeledMatch[1] && /\d/.test(labeledMatch[1])) {
        return labeledMatch[1];
    }

    const prefixedMatch = str.match(/\b(?:G|FB|VK|WA|TG)[-\s]?(\d{4,8})\b/i);
    if (prefixedMatch && prefixedMatch[1]) {
        return prefixedMatch[1];
    }

    const hyphenatedMatch = str.match(/\b(\d{3}[-\s]\d{3})\b/);
    if (hyphenatedMatch && hyphenatedMatch[1]) {
        return hyphenatedMatch[1];
    }

    const startMatch = str.match(/^([0-9]{4,8})\b/);
    if (startMatch && startMatch[1]) {
        return startMatch[1];
    }

    const endMatch = str.match(/[:\s]([0-9]{4,8})[.\s]*$/);
    if (endMatch && endMatch[1]) {
        return endMatch[1];
    }

    const matches = str.match(/\b(\d{4,8})\b/g);
    if (matches && matches.length > 0) {
        const filtered = matches.filter(m => !['2024', '2025', '2026', '2027'].includes(m));
        if (filtered.length > 0) return filtered[0];
        return matches[0];
    }

    return null;
}

/* ══════════════════════════════════════════
   SMS / ORDER POLLING (Step 4)
   Uses: getOrder(orderId) from api.js

   FIX SUMMARY (this pass):
   - Every stopPolling() call now takes a `reason` string, and the
     interval is only ever cleared/logged there — so there is exactly
     one place that decides "polling has stopped" and why.
   - startPolling() logs the Order ID + wall-clock start time up front,
     so "is this actually ticking, and for which order" is answerable
     from the console alone.
   - Each tick logs elapsed time + attempt count, and the moment an
     SMS/OTP is detected, the actual extracted code is logged (not just
     "received").
   - Duplicate intervals for the same or a different order remain
     impossible: startPolling() unconditionally calls stopPolling()
     first, and pollInterval is a single module-level handle.
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   COUNTDOWN TIMER & ORDER POLLING (Step 4)
   Endpoint: GET https://nurasms-api.onrender.com/api/order/:orderId
   Uses: getOrder(orderId) from api.js with Authorization: Bearer ACCESS_TOKEN
══════════════════════════════════════════ */
let isPollRequestInProgress = false;

function startCountdown() {
    clearInterval(countdownInterval);

    remainingTime = 300;
    updateCountdown();

    countdownInterval = setInterval(() => {
        remainingTime--;

        updateCountdown();

        if (remainingTime <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;

            handleOrderTimeout();
        }
    }, 1000);
}

function updateCountdown() {
    const timer = document.getElementById("countdown");

    if (!timer) return;

    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;

    timer.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function handleOrderTimeout() {
    console.log('[TIMER] 5-minute timeout reached. Stopping polling.');
    stopPolling('5-minute activation timeout reached');

    const statusDot   = document.getElementById('statusDot');
    const statusText  = document.getElementById('statusText');
    const otpCode     = document.getElementById('otpCode');
    const otpFullText = document.getElementById('otpFullText');
    const finishBtn   = document.getElementById('btnFinishOrder');
    const cancelBtn   = document.getElementById('btnCancelOrder');
    const banBtn      = document.getElementById('btnBanOrder');

    if (statusDot) {
        statusDot.className = 'dot';
        statusDot.style.background = '#ef4444';
    }
    if (statusText) {
        statusText.textContent = 'Order Timed Out (No SMS received)';
    }
    if (otpCode) {
        otpCode.textContent = 'No code received';
    }
    if (otpFullText) {
        otpFullText.textContent = 'The 5-minute activation window expired without receiving an SMS from the provider. You can cancel this number to receive a refund.';
    }

    if (finishBtn) finishBtn.disabled = true;
    if (banBtn)    banBtn.disabled    = true;
    if (cancelBtn) cancelBtn.disabled = false;

    showToast('⏰ Activation timed out after 5 minutes. You can cancel this number to get a refund.', 'error');
}

function startOrderPolling(orderId) {
    if (!orderId) {
        console.error("[OTP] Missing order ID");
        return;
    }

    clearInterval(orderPollInterval);

    checkOrder(orderId);

    orderPollInterval = setInterval(() => {
        checkOrder(orderId);
    }, 5000);
}

async function checkOrder(orderId) {
    if (!orderId) {
        console.error("[OTP] Missing order ID for checkOrder");
        return;
    }
    if (isPollRequestInProgress) return;
    isPollRequestInProgress = true;

    try {
        const response = await getOrder(orderId);

        // Normalize response whether backend returns { order: { id, phone, status, sms } } or top-level properties
        const orderData = response?.order || {};
        const currentStatus = String(response?.status || orderData?.status || 'PENDING').toUpperCase();
        const smsList = Array.isArray(response?.sms) ? response.sms : (Array.isArray(orderData?.sms) ? orderData.sms : []);

        console.log("[OTP] Order ID:", orderId);
        console.log("[OTP] API response:", response);
        console.log("[OTP] Status:", currentStatus);
        console.log("[OTP] SMS:", smsList);
        console.log("[OTP] SMS count:", smsList.length);

        // Requirement 3: Get the number from the order response
        const phone = orderData?.phone || response?.phone || orderData?.phoneNumber || response?.phoneNumber || orderData?.number || response?.number;
        if (phone && phone !== '—') {
            const phoneEl = document.getElementById('modalPhone');
            if (phoneEl) phoneEl.textContent = phone;
        }

        const activeId = orderData?.id || response?.id || orderId;
        const orderIdEl = document.getElementById('modalOrderId');
        if (orderIdEl) orderIdEl.textContent = '#' + activeId;

        // Keep currentOrderData synchronized
        currentOrderData = {
            ...orderData,
            ...response,
            id: activeId,
            phone: phone || currentOrderData?.phone || '—',
            status: currentStatus,
            sms: smsList
        };

        const parsed = parseOrderSms(currentOrderData);

        // Update UI
        updateOrderUI(currentOrderData);

        // Requirement 5 & 6:
        // Only show "Code Received" when an actual SMS/code has been returned from order endpoint
        if (parsed.hasReceivedSms) {
            console.log("[OTP] Real SMS code received for order ID:", orderId, parsed);

            // Retrieve the actual code: if sms.code exists use it, or parsed.otp
            const firstSms = smsList[0];
            const smsCode = (firstSms && typeof firstSms === 'object' && firstSms.code) ? firstSms.code : parsed.otp;
            const smsText = (firstSms && typeof firstSms === 'object' && firstSms.text) ? firstSms.text : (parsed.fullText || (typeof firstSms === 'string' ? firstSms : ''));
            const smsSender = (firstSms && typeof firstSms === 'object' && firstSms.sender) ? firstSms.sender : parsed.sender;

            if (smsCode) {
                displayOTP(smsCode);
            } else {
                displayOTP('Code received');
            }

            // Also display the SMS text when available
            if (smsText) {
                displaySMS(smsText, smsSender);
            }

            stopPolling(`SMS code received for order ${orderId}`);
            return;
        }

        // Terminal failure / finished states (only if no SMS was received above)
        const terminalStates = ['FINISHED', 'CANCELED', 'BANNED', 'TIMEOUT', 'EXPIRED'];
        if (terminalStates.includes(currentStatus)) {
            console.log(`[POLL] Terminal status reached: ${currentStatus}. Stopping polling.`);
            stopPolling(`Terminal status reached: ${currentStatus}`);
            return;
        }

        // If PENDING or waiting for SMS: keep UI updated as waiting
        const statusText = document.getElementById('statusText');
        if (statusText) statusText.textContent = 'Waiting for SMS...';
    } catch (err) {
        console.error("[OTP] Error checking order:", err);
        console.error("[OTP] Error status:", err?.status);
        console.error("[OTP] Error message:", err?.message);

        const statusText = document.getElementById('statusText');
        const otpFullText = document.getElementById('otpFullText');
        const statusDot = document.getElementById('statusDot');

        if (statusDot) {
            statusDot.className = 'dot';
            statusDot.style.background = '#ef4444';
        }

        const statusCode = err?.status || err?.statusCode;
        const errMsg = err?.message || 'Error checking order status';

        if (statusCode === 401) {
            if (statusText) statusText.textContent = 'Session Expired (401)';
            if (otpFullText) otpFullText.textContent = 'Your session has expired. Please log in again to view your order.';
            stopPolling('Authentication error (401)');
            showToast('Session expired. Please log in again.', 'error');
        } else if (statusCode === 404) {
            if (statusText) statusText.textContent = 'Order Not Found (404)';
            if (otpFullText) otpFullText.textContent = `Order #${orderId} was not found on the server.`;
            stopPolling('Order not found (404)');
            showToast(`Order #${orderId} not found.`, 'error');
        } else if (statusCode === 500) {
            if (statusText) statusText.textContent = 'Server Error (500)';
            if (otpFullText) otpFullText.textContent = `Backend server error (${errMsg}). Retrying...`;
        } else {
            if (statusText) statusText.textContent = 'Connection Error';
            if (otpFullText) otpFullText.textContent = `Could not refresh status: ${errMsg}. Retrying...`;
        }
    } finally {
        isPollRequestInProgress = false;
    }
}

function displayOTP(code) {
    let otp = code;
    if (!otp && currentOrderData) {
        const parsed = parseOrderSms(currentOrderData);
        otp = parsed.otp;
    }

    console.log("[OTP] Displaying OTP code:", otp);

    const otpCode = document.getElementById('otpCode');
    if (otpCode) {
        otpCode.textContent = otp || 'Code received';
    }

    const otpBox = document.getElementById('smsOtpBox');
    if (otpBox) {
        otpBox.classList.remove('code-waiting');
        otpBox.classList.add('code-received');
    }

    const copyCodeBtn = document.getElementById('btnCopyCode');
    if (copyCodeBtn && otp) {
        copyCodeBtn.style.display = 'inline-flex';
    }

    const statusDot = document.getElementById('statusDot');
    if (statusDot) {
        statusDot.className = 'dot received';
        statusDot.style.background = '#10b981';
    }

    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = 'SMS Received';
    }

    const finishBtn = document.getElementById('btnFinishOrder');
    if (finishBtn) finishBtn.disabled = false;

    const cancelBtn = document.getElementById('btnCancelOrder');
    if (cancelBtn) cancelBtn.disabled = true;
}

function displaySMS(text, sender = '') {
    console.log("[OTP] Displaying complete SMS:", text);

    const otpFullText = document.getElementById('otpFullText');
    if (otpFullText) {
        const senderLabel = sender ? `[${escapeHTML(sender)}] ` : '';
        otpFullText.textContent = `Message: ${senderLabel}${text || ''}`;
    }

    const inboxList = document.getElementById('smsInboxList');
    if (inboxList && text) {
        inboxList.style.display = 'block';
        const senderLabel = sender ? escapeHTML(sender) : 'SMS';
        inboxList.innerHTML = `<div style="padding:10px 14px;margin-bottom:8px;background:var(--border-light);border-radius:10px;font-size:12px;text-align:left;border:1px solid var(--border);">
            <div style="font-weight:700;color:var(--text);margin-bottom:2px;">[${senderLabel}]</div>
            <div style="color:var(--muted);">${escapeHTML(text)}</div>
        </div>`;
    }

    showToast('📨 SMS received! Your verification code is ready.', 'success');
}

function stopPolling(reason = 'Manual stop / cleanup') {
    if (orderPollInterval) {
        console.log(`[POLL] Stopping polling — Reason: ${reason}`);
        clearInterval(orderPollInterval);
        orderPollInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    isPollRequestInProgress = false;
}

function stopOrderPolling(reason) {
    stopPolling(reason);
}

function startPolling(orderId) {
    startOrderPolling(orderId);
}

window.countdownInterval = countdownInterval;
window.remainingTime     = remainingTime;
window.startCountdown    = startCountdown;
window.updateCountdown   = updateCountdown;
window.orderPollInterval = orderPollInterval;
window.startOrderPolling = startOrderPolling;
window.checkOrder        = checkOrder;
window.displayOTP        = displayOTP;
window.displaySMS        = displaySMS;
window.stopOrderPolling  = stopOrderPolling;

function closeSmsModal() {
    stopPolling('Order modal closed by user');
    const overlay = document.getElementById('smsModalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

async function refreshInbox() {
    if (!currentOrderId) return;
    const btn = document.getElementById('btnRefreshInbox');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Refreshing…';
    }
    try {
        const res = await getOrder(currentOrderId);
        const order = res?.order || res?.data || res;
        if (order) {
            currentOrderData = order;
            updateOrderUI(order);
            showToast('Inbox refreshed', 'info');
        }
    } catch (err) {
        showToast(err.message || 'Failed to refresh inbox.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Refresh Inbox';
        }
    }
}
window.refreshInbox = refreshInbox;

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
        stopPolling(`Order finished by user (Order ID: ${targetOrderId})`);
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

/* ══════════════════════════════════════════
   CANCEL NUMBER CONFIRMATION MODAL
══════════════════════════════════════════ */
function showCancelConfirmModal() {
    const modal = document.getElementById('cancelConfirmOverlay');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    const keepBtn = document.getElementById('btnKeepNumber');
    if (keepBtn) {
        setTimeout(() => keepBtn.focus(), 80);
    }
}

function hideCancelConfirmModal() {
    const modal = document.getElementById('cancelConfirmOverlay');
    if (!modal) return;
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');

    const confirmBtn = document.getElementById('btnConfirmCancelNumber');
    const keepBtn    = document.getElementById('btnKeepNumber');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        const textSpan = confirmBtn.querySelector('.btn-text');
        const spinSpan = confirmBtn.querySelector('.btn-spinner');
        if (textSpan) textSpan.style.display = '';
        if (spinSpan) spinSpan.style.display = 'none';
    }
    if (keepBtn) keepBtn.disabled = false;
}

function handleCancelOrder() {
    if (!currentOrderId || isActionBusy) return;
    showCancelConfirmModal();
}

async function executeCancelOrder() {
    if (!currentOrderId || isActionBusy) return;

    const confirmBtn = document.getElementById('btnConfirmCancelNumber');
    const keepBtn    = document.getElementById('btnKeepNumber');
    const cancelBtn  = document.getElementById('btnCancelOrder');

    isActionBusy = true;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        const textSpan = confirmBtn.querySelector('.btn-text');
        const spinSpan = confirmBtn.querySelector('.btn-spinner');
        if (textSpan) textSpan.style.display = 'none';
        if (spinSpan) spinSpan.style.display = 'inline-flex';
    }
    if (keepBtn) keepBtn.disabled = true;
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling…';
    }

    const targetOrderId = currentOrderId;
    console.log(`[STEP 6] Request: POST /api/order/${targetOrderId}/cancel`);

    try {
        const res = await cancelOrder(targetOrderId);
        console.log('[STEP 6] Status: 200', res);
        stopPolling(`Order cancelled by user (Order ID: ${targetOrderId})`);
        hideCancelConfirmModal();
        closeSmsModal();
        showToast('✅ Number has been successfully cancelled.', 'success');
        localStorage.removeItem('currentOrderId');
        currentOrderId   = null;
        currentOrderData = null;
        await loadWalletBalanceBuyPage();
    } catch (err) {
        console.error(`[STEP 6] cancelOrder error for Order ID ${targetOrderId}:`, err);
        hideCancelConfirmModal();
        showToast(err.message || 'Failed to cancel number. Please try again.', 'error');
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.innerHTML = '<i class="ph ph-x-circle"></i> Cancel Number';
        }
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
        stopPolling(`Order banned by user (Order ID: ${targetOrderId})`);
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
   COPY VERIFICATION CODE
══════════════════════════════════════════ */
function copyOtpCodeToClipboard() {
    const otpCode = document.getElementById('otpCode');
    if (!otpCode) return;
    const code = otpCode.textContent.trim();
    if (!code || code === '—' || code === 'Waiting for code...' || code.includes('No code') || code.includes('Cancelled') || code.includes('Banned') || code.includes('Error')) return;

    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Verification code copied to clipboard!', 'success');
        const btn = document.getElementById('btnCopyCode');
        if (btn) {
            btn.classList.add('copied');
            btn.innerHTML = '<i class="ph ph-check"></i> Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = '<i class="ph ph-copy"></i> Copy Code';
            }, 2000);
        }
    }).catch(() => {
        showToast('Code: ' + code, 'info');
    });
}
window.copyOtpCodeToClipboard = copyOtpCodeToClipboard;

/* ══════════════════════════════════════════
   STATE HELPERS
══════════════════════════════════════════ */
function showSelectCountryPrompt() {
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) return;
    cardsGrid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;padding:48px 24px;text-align:center;">
            <div style="width:64px;height:64px;border-radius:50%;background:rgba(124,58,237,0.1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;color:var(--primary);font-size:32px;">
                <i class="ph ph-globe"></i>
            </div>
            <h3 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Choose a Country</h3>
            <p style="color:var(--muted);max-width:380px;margin:0 auto 18px;font-size:14px;line-height:1.5;">Select a country first to view available phone numbers and activation services.</p>
            <button type="button" class="btn btn-primary" onclick="switchBuyTab('countries')" style="display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:12px;font-weight:700;">
                <i class="ph ph-magnifying-glass"></i> Browse Countries
            </button>
        </div>`;
    const resultCount = document.getElementById('resultCount');
    if (resultCount) resultCount.textContent = 'Select a country to view products';
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
    // Top Tabs: Countries vs Products
    const tabCountriesBtn = document.getElementById('tabCountriesBtn');
    const tabProductsBtn  = document.getElementById('tabProductsBtn');
    if (tabCountriesBtn) tabCountriesBtn.addEventListener('click', () => switchBuyTab('countries'));
    if (tabProductsBtn)  tabProductsBtn.addEventListener('click',  () => switchBuyTab('products'));

    // Dedicated Country Search
    const countrySearchInput = document.getElementById('countrySearchInput');
    const countryClearBtn    = document.getElementById('countrySearchClearBtn');
    if (countrySearchInput) {
        countrySearchInput.addEventListener('input', handleCountrySearch);
    }
    if (countryClearBtn) {
        countryClearBtn.addEventListener('click', () => {
            if (countrySearchInput) {
                countrySearchInput.value = '';
                handleCountrySearch();
                countrySearchInput.focus();
            }
        });
    }

    // Dedicated Country Cards Grid Click Delegation
    const countryCardsGrid = document.getElementById('countryCardsGrid');
    if (countryCardsGrid) {
        countryCardsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('[data-country-key]');
            if (card) {
                const cKey = card.dataset.countryKey;
                if (cKey) selectCountry(cKey);
            }
        });
    }

    // Dedicated Product Search
    const productSearchInput = document.getElementById('productSearchInput');
    const productClearBtn    = document.getElementById('productSearchClearBtn');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', handleProductSearch);
    }
    if (productClearBtn) {
        productClearBtn.addEventListener('click', () => {
            if (productSearchInput) {
                productSearchInput.value = '';
                handleProductSearch();
                productSearchInput.focus();
            }
        });
    }

    const currencySwitch = document.getElementById('currencySwitch');
    if (currencySwitch) currencySwitch.addEventListener('click', toggleBuyCurrency);

    const countryFilter = document.getElementById('countryFilter');
    if (countryFilter) countryFilter.addEventListener('change', onCountryChange);

    const modalCloseX = document.getElementById('modalCloseX');
    if (modalCloseX) modalCloseX.addEventListener('click', closeSmsModal);

    const modalOverlay = document.getElementById('smsModalOverlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) closeSmsModal();
        });
    }

    const copyBtn    = document.getElementById('btnCopyNumber');
    const copyOtpBtn = document.getElementById('btnCopyCode');
    const cancelBtn  = document.getElementById('btnCancelOrder');
    const banBtn     = document.getElementById('btnBanOrder');
    const finishBtn  = document.getElementById('btnFinishOrder');
    if (copyBtn)    copyBtn.addEventListener('click', copyNumberToClipboard);
    if (copyOtpBtn) copyOtpBtn.addEventListener('click', copyOtpCodeToClipboard);
    if (cancelBtn)  cancelBtn.addEventListener('click', handleCancelOrder);
    if (banBtn)     banBtn.addEventListener('click', handleBanOrder);
    if (finishBtn)  finishBtn.addEventListener('click', handleFinishOrder);

    const keepNumberBtn    = document.getElementById('btnKeepNumber');
    const confirmCancelBtn = document.getElementById('btnConfirmCancelNumber');
    const cancelOverlay    = document.getElementById('cancelConfirmOverlay');
    if (keepNumberBtn)    keepNumberBtn.addEventListener('click', hideCancelConfirmModal);
    if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', executeCancelOrder);
    if (cancelOverlay) {
        cancelOverlay.addEventListener('click', (e) => {
            if (e.target === cancelOverlay && !isActionBusy) {
                hideCancelConfirmModal();
            }
        });
    }

    const cardsGrid = document.getElementById('cardsGrid');
    if (cardsGrid) {
        cardsGrid.addEventListener('click', (e) => {
            const buyBtn = e.target.closest('.btn-buy');
            if (buyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const key = buyBtn.dataset.productKey;
                handleBuyClick(selectedCountry, key, buyBtn);
                return;
            }
            const countryCard = e.target.closest('[data-country-key]');
            if (countryCard) {
                const cKey = countryCard.dataset.countryKey;
                if (cKey) {
                    selectCountry(cKey);
                    return;
                }
            }
            const card = e.target.closest('.card');
            if (card && card.dataset.productKey) {
                selectProduct(card.dataset.productKey);
            }
        });
    }

    const settingsBtn = document.getElementById('sidebarSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', e => { e.preventDefault(); openSettings(); });
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const searchDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) handleSearchInput();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                handleSearchInput();
                searchInput.focus();
            }
        });
    }

    if (searchDropdown) {
        searchDropdown.addEventListener('click', async (e) => {
            const buyBtn = e.target.closest('.btn-buy');
            if (buyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const key = buyBtn.dataset.productKey;
                searchDropdown.style.display = 'none';
                handleBuyClick(selectedCountry, key, buyBtn);
                return;
            }

            const item = e.target.closest('.search-item');
            if (!item) return;

            const action = item.dataset.action;
            const countryKey = item.dataset.country;
            const productKey = item.dataset.product;

            if (action === 'select-country') {
                searchDropdown.style.display = 'none';
                await selectCountry(countryKey);
            } else if (action === 'buy-product') {
                searchDropdown.style.display = 'none';
                selectProduct(productKey);
                const card = document.querySelector(`.card[data-product-key="${productKey}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else if (action === 'select-country-product') {
                searchDropdown.style.display = 'none';
                await selectCountry(countryKey, productKey);
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box-container')) {
            const dropdown = document.getElementById('searchResultsDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    const serviceFilter = document.getElementById('serviceFilter');
    const typeFilter    = document.getElementById('typeFilter');
    if (serviceFilter) serviceFilter.addEventListener('change', () => {
        if (allProducts.length > 0) renderProductCards(allProducts);
    });
    if (typeFilter) typeFilter.addEventListener('change', () => {
        if (allProducts.length > 0) renderProductCards(allProducts);
    });

    const toggleBtnEl  = document.getElementById('toggle-btn');
    const closeAsideEl = document.getElementById('close-btn');
    const asideEl      = document.getElementById('aside');
    if (toggleBtnEl) toggleBtnEl.addEventListener('click', () => asideEl && asideEl.classList.toggle('open'));
    if (closeAsideEl) closeAsideEl.addEventListener('click', () => asideEl && asideEl.classList.remove('open'));

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const cancelModal = document.getElementById('cancelConfirmOverlay');
            if (cancelModal && (cancelModal.classList.contains('show') || cancelModal.style.display === 'flex')) {
                hideCancelConfirmModal();
                return;
            }
            closeSmsModal();
        }
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
    if (window.saveProfileSettings && window.saveProfileSettings !== saveProfileSettings) {
        return window.saveProfileSettings();
    }

    console.log("[PROFILE] Saving profile...");

    const nameEl  = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const phoneEl = document.getElementById('settingsPhone');

    const name  = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';

    const session = getSession() || {};
    const displayName = name || session.name || session.username;

    if (nameEl && !displayName) { 
        showToast('Please enter your display name.', 'error'); 
        return; 
    }

    try {
        if (displayName) session.name = displayName;
        if (email) session.email = email;
        if (phone) session.phone = phone;

        if (window.pendingAvatarData) {
            localStorage.setItem('userAvatar', window.pendingAvatarData);
            session.avatar = window.pendingAvatarData;
            window.pendingAvatarData = null;
        }

        localStorage.setItem('primes_session', JSON.stringify(session));

        if (typeof updateProfileUI === 'function') {
            updateProfileUI();
        }

        console.log("[PROFILE] Profile saved successfully");
        showToast('✅ Profile saved successfully!', 'success');
    } catch (err) {
        console.error("[PROFILE] Error saving profile:", err);
        showToast('Failed to save profile: ' + (err.message || 'Storage error'), 'error');
    }
}

function savePasswordSettings() {
    const oldPw  = document.getElementById('settingsOldPw')?.value;
    const newPw  = document.getElementById('settingsNewPw')?.value;
    const confPw = document.getElementById('settingsConfirmPw')?.value;

    if (!oldPw || !newPw || !confPw) { showToast('Please fill in all password fields.', 'error'); return; }
    if (newPw.length < 8)            { showToast('New password must be at least 8 characters.', 'error'); return; }
    if (newPw !== confPw)            { showToast('Passwords do not match.', 'error'); return; }

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
    if (typeof window.handleAvatarFileSelect === 'function') {
        window.handleAvatarFileSelect(input);
        return;
    }
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    console.log("[PROFILE] File selected:", file);
    const reader = new FileReader();
    reader.onload = e => {
        window.pendingAvatarData = e.target.result;
        const img = document.getElementById('settingsAvatarImg') || document.getElementById('profileAvatar');
        if (img) {
            img.src = e.target.result;
            img.style.display = 'block';
        }
        console.log("[PROFILE] Image preview created");
    };
    reader.readAsDataURL(file);
}

function confirmDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to permanently delete your account? This action cannot be undone.')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}


/* ══════════════════════════════════════════
   TOAST FALLBACK
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
window.addEventListener('beforeunload', () => stopPolling('Page unloading (beforeunload)'));
window.addEventListener('pagehide',    () => stopPolling('Page hidden (pagehide)'));

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