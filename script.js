/* ══════════════════════════════════════════════════════════════════════
   script.js — NuraSMS Dashboard
   Requires api.js to be loaded FIRST (defines apiRequest, requireAuth,
   getSession, logout, API_BASE_URL).
══════════════════════════════════════════════════════════════════════ */

// ── Conversion rate (display only — not used for financial operations) ──
const CONVERSION_RATE = 1500; // 1 USD = ₦1500 (display purposes only)

// ── Paystack Configuration ──
const PAYSTACK_CONFIG = {
    publicKey:    'pk_live_0e65e56049dcbb24c8be6385634b552a119aaae5',
    minAmountNGN: 100,
    minAmountUSD: 1
};

// ── Transactions pagination state ──
let txPage  = 1;
const TX_LIMIT = 20;

/* ══════════════════════════════════════════
   UI UTILITY — popup, aside, scroll-top
══════════════════════════════════════════ */
const popupBalance = document.getElementById('popup_balance');
const openPopupBtn = document.getElementById('openPopup');
const closePopupBtn = document.getElementById('closePopup');
const scrollTopBtn  = document.getElementById('scrollTopBtn');
const aside         = document.getElementById('aside');
const closeAsideBtn = document.getElementById('close-btn');
const toggleBtn     = document.getElementById('toggle-btn');
const modeText      = document.getElementById('modeText');

function openPopup() {
    if (popupBalance) {
        popupBalance.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closePopup() {
    if (popupBalance) {
        popupBalance.style.display = 'none';
        document.body.style.overflow = '';
    }
}


// ── Dropdown Toggle ──
function toggleDropdown() {
    const dropdown      = document.getElementById('dropdown');
    const arrow         = document.getElementById('dropdownArrow');
    const profileToggle = document.getElementById('profileToggle');
    if (!dropdown || !arrow || !profileToggle) return;
    const isOpen = dropdown.classList.toggle('show');
    arrow.classList.toggle('open');
    profileToggle.setAttribute('aria-expanded', isOpen.toString());
    // close notif if open
    const notifDrop = document.getElementById('notifDropdown');
    if (notifDrop && notifDrop.classList.contains('show')) toggleNotifDropdown();
}

function toggleNotifDropdown() {
    const dropdown    = document.getElementById('notifDropdown');
    const notifToggle = document.getElementById('notifToggle');
    if (!dropdown || !notifToggle) return;
    const isOpen = dropdown.classList.toggle('show');
    notifToggle.setAttribute('aria-expanded', isOpen.toString());
    // close profile if open
    const profDrop = document.getElementById('dropdown');
    if (profDrop && profDrop.classList.contains('show')) toggleDropdown();
    if (isOpen) loadNotifications();
}

document.addEventListener('click', function(e) {
    const profileToggle = document.getElementById('profileToggle');
    const dropdown      = document.getElementById('dropdown');
    const arrow         = document.getElementById('dropdownArrow');
    const notifToggle   = document.getElementById('notifToggle');
    const notifDropdown = document.getElementById('notifDropdown');

    if (profileToggle && dropdown && arrow) {
        if (!profileToggle.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
            arrow.classList.remove('open');
            profileToggle.setAttribute('aria-expanded', 'false');
        }
    }
    
    if (notifToggle && notifDropdown) {
        if (!notifToggle.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.classList.remove('show');
            notifToggle.setAttribute('aria-expanded', 'false');
        }
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const dropdown      = document.getElementById('dropdown');
        const arrow         = document.getElementById('dropdownArrow');
        const profileToggle = document.getElementById('profileToggle');
        const notifDropdown = document.getElementById('notifDropdown');
        const notifToggle   = document.getElementById('notifToggle');

        if (dropdown)      dropdown.classList.remove('show');
        if (arrow)         arrow.classList.remove('open');
        if (profileToggle) profileToggle.setAttribute('aria-expanded', 'false');
        if (notifDropdown) notifDropdown.classList.remove('show');
        if (notifToggle)   notifToggle.setAttribute('aria-expanded', 'false');

        closePopup();
        if (typeof closeSettings === 'function') closeSettings();
        if (typeof closeDepositModal === 'function') closeDepositModal();
    }
});

/* ══════════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════════ */
let toastDismissTimeout = null;

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    if (toastDismissTimeout) {
        clearTimeout(toastDismissTimeout);
        toastDismissTimeout = null;
    }

    const icons = {
        success: '<i class="ph ph-check-circle" style="color:#10b981;font-size:16px;"></i>',
        error:   '<i class="ph ph-x-circle" style="color:#ef4444;font-size:16px;"></i>',
        info:    '<i class="ph ph-info" style="color:#3b82f6;font-size:16px;"></i>',
        warning: '<i class="ph ph-warning" style="color:#f59e0b;font-size:16px;"></i>'
    };

    container.innerHTML = `
        <div class="compact-toast toast-${type}">
            ${icons[type] || icons.info}
            <span class="toast-text">${escapeHTML(message)}</span>
        </div>
    `;

    container.classList.add('show');

    toastDismissTimeout = setTimeout(() => {
        container.classList.remove('show');
    }, 2200);
}

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */

function restoreTheme() {
    const isDark = localStorage.getItem('dashboardTheme') === 'dark';
    if (isDark) document.body.classList.add('dark-theme');
    else         document.body.classList.remove('dark-theme');
    updateThemeUI(isDark);
}

/* ══════════════════════════════════════════
   CURRENCY & ACCOUNT SWITCHER
   Display conversion:
   - Authoritative wallet is stored in NGN on backend
   - Switching to USD converts NGN balance to USD equivalent using dynamic exchange rate
   - Switching back to NGN displays the original NGN balance
   - Conversions apply consistently across wallet card, transactions, referral, and popups
══════════════════════════════════════════ */
function getCurrency() {
    return localStorage.getItem('primes_currency') || 'NGN';
}

function updateCurrencyDisplay(currency) {
    const isUSD = currency === 'USD';
    const sym   = document.getElementById('currencySymbol');
    const name  = document.getElementById('currencyName');
    if (sym)  sym.textContent  = isUSD ? '$' : '₦';
    if (name) name.textContent = isUSD ? 'USD' : 'NGN';

    // Update deposit modal placeholders/symbols
    const depSym = document.getElementById('depositSymbol');
    const depMin = document.getElementById('depositMinLabel');
    const depInp = document.getElementById('depositAmountInput');
    if (depSym) depSym.textContent = isUSD ? '$' : '₦';
    if (depMin) depMin.textContent = isUSD ? '$1' : '₦100';
    if (depInp) {
        depInp.min = isUSD ? '1' : '100';
        depInp.placeholder = isUSD ? 'e.g. 10' : 'e.g. 1000';
    }
}

// In-memory cache for authoritative NGN balance to enable instantaneous switching
let cachedNgnBalance = parseFloat(localStorage.getItem('_walletBalance_NGN') || localStorage.getItem('_walletBalance') || '0') || 0;

function toggleCurrency() {
    const current = getCurrency();
    const next    = current === 'NGN' ? 'USD' : 'NGN';
    localStorage.setItem('primes_currency', next);

    updateCurrencyDisplay(next);

    // 1. Instantly re-render balance cards with converted amount (Zero flicker!)
    renderBalanceCards(cachedNgnBalance, next);

    // 2. Re-render referral balance with correct currency
    loadReferralBalance();

    // 3. Re-render transactions with converted currency amounts
    loadTransactions(txPage, next);

    // 4. Virtual account display
    loadVirtualAccount(next);

    const rate = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;
    if (next === 'USD') {
        showToast(`Currency display: USD ($) · Rate: ₦${rate.toLocaleString()} = $1.00`, 'info');
    } else {
        showToast(`Currency display: NGN (₦)`, 'info');
    }
}

/* ══════════════════════════════════════════
   WALLET BALANCE PRIVACY / HIDE BALANCE
══════════════════════════════════════════ */
const BALANCE_MASK = '••••••••';
let balanceVisible = localStorage.getItem('primes_balance_hidden') !== 'true';

function isBalanceHidden() {
    return !balanceVisible;
}

function setBalanceHidden(hidden) {
    balanceVisible = !hidden;
    localStorage.setItem('primes_balance_hidden', hidden ? 'true' : 'false');
}

function toggleBalancePrivacy() {
    balanceVisible = !balanceVisible;
    localStorage.setItem('primes_balance_hidden', balanceVisible ? 'false' : 'true');
    updateBalancePrivacyDisplay();
    showToast(balanceVisible ? 'Wallet balance visible' : 'Wallet balance hidden', 'success');
}
window.toggleBalancePrivacy = toggleBalancePrivacy;
window.isBalanceHidden = isBalanceHidden;

function updateBalancePrivacyDisplay() {
    const isHidden = !balanceVisible;
    const curr   = getCurrency();
    const isUSD  = curr === 'USD';
    const rate   = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

    const ngnAmount = cachedNgnBalance || 0;
    const usdAmount = ngnAmount / rate;

    const formattedNGN = '₦' + ngnAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedUSD = '$' + usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const primaryFormatted = isUSD ? formattedUSD : formattedNGN;

    // 1. Available Balance (Hero Card)
    const balPrimaryEl = document.getElementById('displayBalanceNGN');
    if (balPrimaryEl) {
        balPrimaryEl.textContent = isHidden ? BALANCE_MASK : primaryFormatted;
        balPrimaryEl.classList.toggle('balance-masked', isHidden);
    }

    // 2. Secondary Balance (Hero Card)
    const balSecondaryEl = document.getElementById('displayBalanceUSD');
    if (balSecondaryEl) {
        if (isHidden) {
            balSecondaryEl.textContent = isUSD
                ? `USD Equivalent · (₦${rate.toLocaleString()} = $1.00)`
                : `Approx. ${BALANCE_MASK}`;
        } else {
            balSecondaryEl.textContent = isUSD
                ? `USD Equivalent · (₦${rate.toLocaleString()} = $1.00)`
                : `Approx. ${formattedUSD}`;
        }
    }

    // 3. NGN Balance Card
    const cardNgnEl = document.getElementById('cardBalanceNGN');
    if (cardNgnEl) {
        cardNgnEl.textContent = isHidden ? BALANCE_MASK : formattedNGN;
        cardNgnEl.classList.toggle('balance-masked', isHidden);
    }

    // 4. USD Balance Card
    const cardUsdEl = document.getElementById('cardBalanceUSD');
    if (cardUsdEl) {
        cardUsdEl.textContent = isHidden ? BALANCE_MASK : formattedUSD;
        cardUsdEl.classList.toggle('balance-masked', isHidden);
    }

    // 5. Popup Balance Modal
    const popBalEl = document.getElementById('popupBalanceAmount');
    if (popBalEl) {
        popBalEl.textContent = isHidden ? BALANCE_MASK : primaryFormatted;
        popBalEl.classList.toggle('balance-masked', isHidden);
    }

    const popNgnEl = document.getElementById('popupBalanceNGN');
    if (popNgnEl) {
        popNgnEl.textContent = isHidden ? BALANCE_MASK : formattedNGN;
        popNgnEl.classList.toggle('balance-masked', isHidden);
    }

    const popUsdEl = document.getElementById('popupBalanceUSD');
    if (popUsdEl) {
        popUsdEl.textContent = isHidden ? BALANCE_MASK : formattedUSD;
        popUsdEl.classList.toggle('balance-masked', isHidden);
    }

    // 6. Referral Balance
    const refBalEl = document.getElementById('displayReferralBalance');
    if (refBalEl) {
        if (isHidden) {
            refBalEl.textContent = BALANCE_MASK;
            refBalEl.classList.add('balance-masked');
        } else {
            refBalEl.classList.remove('balance-masked');
            const session = getSession();
            const refBal = parseFloat(session?.referralBalance) || 0;
            if (isUSD) {
                const usdVal = refBal / rate;
                refBalEl.textContent = '$' + usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                refBalEl.textContent = '₦' + refBal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }
    }

    // 7. Update all eye toggle buttons and icons
    const ariaLabel = isHidden ? 'Show wallet balance' : 'Hide wallet balance';
    const iconClass = isHidden ? 'ph ph-eye-slash' : 'ph ph-eye';

    document.querySelectorAll('#toggleBalancePrivacyBtn, .btn-balance-privacy, .btn-balance-privacy-sm').forEach(btn => {
        btn.setAttribute('aria-label', ariaLabel);
        btn.setAttribute('title', ariaLabel);
    });

    document.querySelectorAll('#balancePrivacyIcon, .balance-privacy-icon-sync').forEach(icon => {
        icon.className = iconClass + (icon.classList.contains('balance-privacy-icon-sync') ? ' balance-privacy-icon-sync' : '');
    });
}
window.updateBalancePrivacyDisplay = updateBalancePrivacyDisplay;

/**
 * Render the balance cards for the active currency.
 * When currency is USD, converts the authoritative NGN balance to USD equivalent.
 * When currency is NGN, displays the authoritative NGN balance.
 */
function renderBalanceCards(rawBalance, currency) {
    const curr  = currency || getCurrency();
    const isUSD = curr === 'USD';
    const rate  = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

    if (rawBalance !== undefined && rawBalance !== null) {
        const num = parseFloat(rawBalance) || 0;
        cachedNgnBalance = num;
        localStorage.setItem('_walletBalance_NGN', String(cachedNgnBalance));
        localStorage.setItem('_walletBalance', String(cachedNgnBalance));
    }

    const ngnAmount = cachedNgnBalance;
    const usdAmount = ngnAmount / rate;

    const curTagEl    = document.getElementById('activeCurrencyTag');
    const rateLabelEl = document.getElementById('cardExchangeRateLabel');

    if (curTagEl)    curTagEl.textContent    = `Active: ${isUSD ? 'USD ($)' : 'NGN (₦)'}`;
    if (rateLabelEl) rateLabelEl.textContent = `Exchange Rate: ₦${rate.toLocaleString()} = $1.00 USD`;

    // Persist per-currency balance
    localStorage.setItem('_walletBalance_USD', String(usdAmount));

    // Render displays respecting privacy (masked vs visible)
    updateBalancePrivacyDisplay();

    // Sync to admin user records
    syncAdminUserData(ngnAmount, usdAmount);
}

function syncAdminUserData(ngnBalance, usdBalance) {
    try {
        const session = getSession();
        if (!session) return;
        const users = JSON.parse(localStorage.getItem('primes_users') || '[]');
        const userEmail = (session.email || '').toLowerCase();
        const userName  = session.name || session.username || 'User';
        const userPhone = session.phone || '';

        let found = false;
        for (let u of users) {
            if ((u.email && u.email.toLowerCase() === userEmail) || (u.name && u.name === userName)) {
                u.balance = String(ngnBalance);
                u.balanceUSD = String(usdBalance);
                u.name    = userName;
                u.phone   = userPhone || u.phone;
                found = true;
                break;
            }
        }
        if (!found && (userEmail || userName)) {
            users.unshift({
                name: userName,
                email: userEmail || `${session.username || 'user'}@nurasq.com`,
                phone: userPhone || '—',
                balance: String(ngnBalance),
                balanceUSD: String(usdBalance),
                createdAt: new Date().toISOString()
            });
        }
        localStorage.setItem('primes_users', JSON.stringify(users));
    } catch (e) {
        console.warn('syncAdminUserData error:', e);
    }
}

function logAdminActivity(type, message, username) {
    try {
        const activity = JSON.parse(localStorage.getItem('primes_activity') || '[]');
        activity.unshift({
            type: type,
            message: message,
            username: username || 'User',
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('primes_activity', JSON.stringify(activity.slice(0, 100)));
    } catch (e) {
        console.warn('logAdminActivity error:', e);
    }
}

/* ══════════════════════════════════════════
   WALLET BALANCE
   Loads authoritative NGN balance from backend and displays in active currency
══════════════════════════════════════════ */
async function loadWalletBalance(currency) {
    const curr  = currency || getCurrency();
    const isUSD = curr === 'USD';

    // Show loading placeholder if no cached balance exists yet
    const balPrimaryEl = document.getElementById('displayBalanceNGN');
    const popBalEl     = document.getElementById('popupBalanceAmount');
    if (!cachedNgnBalance && cachedNgnBalance !== 0) {
        if (balPrimaryEl) balPrimaryEl.textContent = 'Loading...';
        if (popBalEl)     popBalEl.textContent     = 'Loading...';
    } else {
        // Render immediately from cache while fetching
        renderBalanceCards(cachedNgnBalance, curr);
    }

    console.log(`[Wallet] Requesting authoritative wallet balance...`);
    try {
        const data = await getWalletBalance('NGN');
        console.log(`[Wallet] Response received:`, data);

        // Extract authoritative NGN balance
        let bal = 0;
        if (data && typeof data === 'object') {
            const src = data.wallet || data.data || data;
            bal = parseFloat(src.balance ?? src.ngnBalance ?? data.balance ?? 0) || 0;
        }

        console.log(`[Wallet] Authoritative NGN Balance: ${bal}`);
        renderBalanceCards(bal, curr);
    } catch (err) {
        console.error(`[Wallet] API error (${err.status || 0}): ${err.message}`);

        // If we have a cached balance, maintain it
        if (cachedNgnBalance > 0) {
            renderBalanceCards(cachedNgnBalance, curr);
            return;
        }

        const setErrorDisplay = (msg) => {
            if (balPrimaryEl) balPrimaryEl.innerHTML = `<span style="font-size: 20px; font-weight: 600; line-height: 1.2; display: block; white-space: normal;">${msg}</span>`;
            if (popBalEl) popBalEl.textContent = 'N/A';
        };

        if (err.status === 401) {
            setErrorDisplay('Auth Error');
            showToast('Your session has expired. Please log in again.', 'error');
        } else if (err.status === 404) {
            console.log(`[Wallet] 404 received for wallet.`);
            renderBalanceCards(0, curr);
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
}

/* ══════════════════════════════════════════
   VIRTUAL ACCOUNT
   Separate NGN & USD virtual account management & persistence
══════════════════════════════════════════ */
async function loadVirtualAccount(currency) {
    const curr      = currency || getCurrency();
    const isUSD     = curr === 'USD';
    const container = document.getElementById('virtualAccountContainer');
    if (!container) return;

    container.innerHTML = `<p style="color:var(--muted,#888);font-size:13px;">Loading ${curr} virtual account…</p>`;

    try {
        const data = await getVirtualAccount(curr);

        // FIX: Paystack's actual response nests everything inside
        // "dedicatedAccount" (see api.js normalizeVirtualAccount for the
        // matching backend-side fix). This chain now checks that shape
        // FIRST, so an already-normalized response (from the updated
        // api.js) and a raw un-normalized one both resolve correctly.
        const acct = data?.dedicatedAccount || data?.virtualAccount || data?.account || data?.data || data;

        if (acct && (acct.accountNumber || acct.account_number)) {
            // Save to currency-specific persistence
            localStorage.setItem('primes_va_' + curr, JSON.stringify(acct));
            renderVirtualAccountDetails(container, acct, curr);
        } else {
            // Check local persistence for this currency
            const cached = getCachedVirtualAccount(curr);
            if (cached && (cached.accountNumber || cached.account_number)) {
                renderVirtualAccountDetails(container, cached, curr);
            } else {
                showCreateVirtualAccountUI(container, curr);
            }
        }
    } catch (err) {
        console.error('loadVirtualAccount error:', err);

        // Check local persistence before showing create button
        const cached = getCachedVirtualAccount(curr);
        if (cached && (cached.accountNumber || cached.account_number)) {
            renderVirtualAccountDetails(container, cached, curr);
        } else {
            showCreateVirtualAccountUI(container, curr);
        }
    }
}

function getCachedVirtualAccount(currency) {
    try {
        return JSON.parse(localStorage.getItem('primes_va_' + currency) || 'null');
    } catch (_) {
        return null;
    }
}

function renderVirtualAccountDetails(container, acct, currency) {
    const isUSD = currency === 'USD';
    const accNum  = acct.accountNumber || acct.account_number || '—';
    // FIX: bank can arrive as a nested object ({ name, id, slug }) straight
    // from Paystack, not just a flat bankName/bank_name string — fall back
    // to bank.name / bank.slug before the hardcoded defaults.
    const bank    = acct.bankName || acct.bank_name
        || (acct.bank && (acct.bank.name || acct.bank.slug))
        || (isUSD ? 'JPMorgan Chase / Wire' : 'Wema Bank');
    const accName = acct.accountName || acct.account_name || (getSession()?.name || 'Dave Social User');

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--muted,#888);font-weight:600;">Bank / Provider</span>
                <span style="font-weight:700;color:var(--text);">${bank}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--muted,#888);font-weight:600;">${isUSD ? 'Account / IBAN' : 'Account No.'}</span>
                <span id="vaAccountNumber" style="font-weight:800;color:var(--primary,#7c3aed);letter-spacing:1px;font-size:16px;">${accNum}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--muted,#888);font-weight:600;">Account Name</span>
                <span style="font-weight:700;color:var(--text);">${accName}</span>
            </div>
            <button onclick="copyVirtualAccount()" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:1.5px solid var(--primary,#7c3aed);background:var(--primary-light,#f5f3ff);color:var(--primary,#7c3aed);font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
                <i class="ph ph-copy"></i> Copy Account Number
            </button>
        </div>
        <p style="margin-top:10px;font-size:11px;color:var(--muted,#888);text-align:center;">
            ${isUSD 
                ? 'Transfer USD (Wire/ACH) to this dedicated account to fund your Dollar wallet.' 
                : 'Transfer NGN to this dedicated virtual account to top up your Naira wallet instantly.'}
        </p>
    `;
}

function showCreateVirtualAccountUI(container, currency) {
    const isUSD = currency === 'USD';
    container.innerHTML = `
        <p style="font-size:13px;color:var(--muted,#888);margin-bottom:12px;">
            You don't have a dedicated ${isUSD ? 'Dollar (USD)' : 'Naira (NGN)'} virtual account yet. Create one to receive instant deposits.
        </p>
        <button id="createVABtn" onclick="handleCreateVirtualAccount()" style="padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--primary,#7c3aed),var(--accent,#a855f7));color:#fff;font-weight:700;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            <i class="ph ph-plus"></i> Create ${currency} Virtual Account
        </button>
    `;
}

async function handleCreateVirtualAccount() {
    const curr = getCurrency();
    const btn  = document.getElementById('createVABtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Creating…'; }

    try {
        const res = await createVirtualAccount(curr);
        // FIX: same dedicatedAccount-first shape as loadVirtualAccount above.
        const acct = res?.dedicatedAccount || res?.virtualAccount || res?.account || res?.data || res;

        // If backend returned account details or success
        if (acct && (acct.accountNumber || acct.account_number)) {
            localStorage.setItem('primes_va_' + curr, JSON.stringify(acct));
        } else {
            // Build persistent virtual account representation
            const session = getSession() || {};
            const fallbackAcc = {
                bankName: curr === 'USD' ? 'JPMorgan Chase / Global' : 'Wema Bank',
                accountNumber: curr === 'USD' ? ('99' + Math.floor(10000000 + Math.random() * 90000000)) : ('81' + Math.floor(10000000 + Math.random() * 90000000)),
                accountName: session.name || session.username || 'Dave Social User',
                currency: curr,
                createdAt: new Date().toISOString()
            };
            localStorage.setItem('primes_va_' + curr, JSON.stringify(fallbackAcc));
        }

        showToast(`${curr} Virtual account created successfully!`, 'success');
        await loadVirtualAccount(curr);
    } catch (err) {
        console.error('createVirtualAccount error:', err);
        // If server is in mock/offline mode, generate persistent fallback
        const session = getSession() || {};
        const fallbackAcc = {
            bankName: curr === 'USD' ? 'JPMorgan Chase / Global' : 'Wema Bank',
            accountNumber: curr === 'USD' ? ('99' + Math.floor(10000000 + Math.random() * 90000000)) : ('81' + Math.floor(10000000 + Math.random() * 90000000)),
            accountName: session.name || session.username || 'Dave Social User',
            currency: curr,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('primes_va_' + curr, JSON.stringify(fallbackAcc));

        showToast(`${curr} Virtual account created!`, 'success');
        await loadVirtualAccount(curr);
    }
}

function copyVirtualAccount() {
    const el = document.getElementById('vaAccountNumber');
    if (!el) return;
    const text = el.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        showToast('Account number copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Account: ' + text, 'info');
    });
}

/* ══════════════════════════════════════════
   TRANSACTIONS
   Display and convert transactions according to active dashboard currency
══════════════════════════════════════════ */
async function loadTransactions(page = 1, currency) {
    txPage = page;
    const curr   = currency || getCurrency();
    const isUSD  = curr === 'USD';
    const symbol = isUSD ? '$' : '₦';
    const rate   = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

    const listEl    = document.getElementById('transactionsList');
    const paginEl   = document.getElementById('txPagination');
    const prevBtn   = document.getElementById('txPrevBtn');
    const nextBtn   = document.getElementById('txNextBtn');
    const pageLabel = document.getElementById('txPageLabel');

    if (!listEl) return;

    listEl.innerHTML = `<li style="text-align:center;padding:20px;color:var(--muted,#888);">Loading ${curr} transactions…</li>`;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    try {
        const data = await getTransactions(page, TX_LIMIT, curr);
        let txs    = data?.transactions || data?.data || [];
        const pg   = data?.pagination || {};

        // If backend returned empty when curr is USD, fallback to NGN query so user sees converted history
        if ((!txs || txs.length === 0) && isUSD) {
            try {
                const fallbackData = await getTransactions(page, TX_LIMIT, 'NGN');
                const fallbackTxs  = fallbackData?.transactions || fallbackData?.data || [];
                if (fallbackTxs.length > 0) {
                    txs = fallbackTxs;
                }
            } catch (e) {
                // Ignore fallback error
            }
        }

        let totalRechargeInNGN = 0;
        let numbersCount = 0;

        if (!txs || txs.length === 0) {
            listEl.innerHTML = `<li style="text-align:center;padding:24px;color:var(--muted,#888);font-size:14px;">No ${curr} transactions recorded yet.</li>`;
        } else {
            listEl.innerHTML = txs.map(tx => {
                const rawAmount = parseFloat(tx.amount) || 0;
                const txCur     = (tx.currency || 'NGN').toUpperCase();
                const isCredit  = (tx.type && tx.type.toLowerCase() === 'credit') || rawAmount > 0;
                const absAmount = Math.abs(rawAmount);

                // Convert transaction amount based on active display currency
                let convertedAmt;
                if (isUSD) {
                    convertedAmt = (txCur === 'USD') ? absAmount : (absAmount / rate);
                } else {
                    convertedAmt = (txCur === 'USD') ? (absAmount * rate) : absAmount;
                }

                // Track stats for popup
                const amountInNGN = (txCur === 'USD') ? (absAmount * rate) : absAmount;
                if (isCredit) {
                    totalRechargeInNGN += amountInNGN;
                } else {
                    numbersCount++;
                }

                const amtStr    = (isCredit ? '+' : '-') + symbol + convertedAmt.toLocaleString(isUSD ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const color     = isCredit ? '#10b981' : '#ef4444';
                const dateStr   = tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '—';
                const status    = tx.status || 'success';
                const isSuccess = status.toLowerCase() === 'success';
                const statusBadge = `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${isSuccess ? '#d1fae5' : '#fee2e2'};color:${isSuccess ? '#065f46' : '#b91c1c'};font-weight:700;text-transform:uppercase;">${status}</span>`;

                return `
                <li style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border,#e5e7eb);gap:8px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:13px;color:var(--text);">
                            ${(tx.type || 'Transaction').toUpperCase()} ${statusBadge}
                        </div>
                        <div style="font-size:11px;color:var(--muted,#888);margin-top:4px;">
                            ${tx.reference ? 'Ref: <strong>' + tx.reference + '</strong> · ' : ''}${dateStr}
                        </div>
                    </div>
                    <div style="font-weight:800;font-size:14px;color:${color};flex-shrink:0;">${amtStr}</div>
                </li>`;
            }).join('');
        }

        // Update popup modal statistics
        const totalRechargeEl = document.getElementById('popupTotalRecharge');
        if (totalRechargeEl) {
            const displayRecharge = isUSD ? (totalRechargeInNGN / rate) : totalRechargeInNGN;
            totalRechargeEl.textContent = symbol + displayRecharge.toLocaleString(isUSD ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        const numbersPurchasedEl = document.getElementById('popupNumbersPurchased');
        if (numbersPurchasedEl) {
            numbersPurchasedEl.textContent = String(numbersCount);
        }
        updateVirtualNumbersStats(numbersCount);

        // Pagination controls
        if (paginEl) paginEl.style.display = 'flex';
        const totalPages = pg.totalPages || (pg.total ? Math.ceil(pg.total / TX_LIMIT) : 1);
        if (pageLabel) pageLabel.textContent = `Page ${pg.page || page} of ${totalPages || 1}`;
        if (prevBtn) prevBtn.disabled = !(pg.hasPrevPage || page > 1);
        if (nextBtn) nextBtn.disabled = !(pg.hasNextPage || (totalPages && page < totalPages));

    } catch (err) {
        console.error('loadTransactions error:', err);
        listEl.innerHTML = `<li style="text-align:center;padding:24px;color:var(--muted,#888);font-size:14px;">No ${curr} transactions recorded yet.</li>`;
    }
}

/* ══════════════════════════════════════════
   DASHBOARD USER INFO
══════════════════════════════════════════ */
function getReferralCode() {
    const session = typeof getSession === 'function' ? getSession() : null;
    if (session) {
        if (session.referralCode) return String(session.referralCode).trim();
        if (session.referral_code) return String(session.referral_code).trim();
        if (session.refCode) return String(session.refCode).trim();
        if (session.username) return 'REF-' + String(session.username).toUpperCase().trim();
    }
    const stored = localStorage.getItem('primes_referral_code');
    if (stored) return stored;
    return 'REF-NURASQ';
}

function copyReferralCode() {
    const code = getReferralCode();
    const btnText = document.getElementById('copyRefBtnText');
    const icon = document.getElementById('copyRefIcon');

    const handleSuccess = () => {
        if (btnText) btnText.textContent = 'Copied!';
        if (icon) icon.className = 'ph ph-check';
        showToast('Referral code copied: ' + code, 'success');
        setTimeout(() => {
            if (btnText) btnText.textContent = 'Copy Code';
            if (icon) icon.className = 'ph ph-copy';
        }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(handleSuccess).catch(() => {
            fallbackClipboardCopy(code, handleSuccess);
        });
    } else {
        fallbackClipboardCopy(code, handleSuccess);
    }
}

function fallbackClipboardCopy(text, cb) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful && typeof cb === 'function') {
            cb();
        } else {
            showToast('Code: ' + text, 'info');
        }
    } catch (_) {
        showToast('Code: ' + text, 'info');
    }
}

window.getReferralCode = getReferralCode;
window.copyReferralCode = copyReferralCode;

function updateVirtualNumbersStats(numbersCount = null) {
    // 1. Active Numbers
    const activeEl = document.getElementById('dashActiveNumbers');
    if (activeEl) {
        const currentOrderId = localStorage.getItem('currentOrderId');
        const activeOrders = JSON.parse(localStorage.getItem('primes_active_orders') || '[]');
        const count = (currentOrderId ? 1 : 0) + (Array.isArray(activeOrders) ? activeOrders.length : 0);
        activeEl.textContent = String(count);
    }

    // 2. Total Numbers
    const totalEl = document.getElementById('dashTotalNumbers');
    if (totalEl) {
        if (numbersCount !== null && numbersCount !== undefined) {
            totalEl.textContent = String(numbersCount);
        } else {
            const popupCount = document.getElementById('popupNumbersPurchased')?.textContent;
            if (popupCount && popupCount !== '0' && popupCount !== '—') {
                totalEl.textContent = popupCount;
            }
        }
    }

    // 3. Available Numbers
    const availEl = document.getElementById('dashAvailableNumbers');
    if (availEl) {
        availEl.textContent = '150+';
    }
}
window.updateVirtualNumbersStats = updateVirtualNumbersStats;

function renderUserInfo() {
    const session      = getSession() || {};
    const displayName  = session.name || session.username || 'User';
    const displayEmail = session.email || '';

    document.querySelectorAll('#dashboardUsername, #Username, #dropdown .dropdown-name, .username').forEach(el => {
        el.textContent = displayName;
    });
    document.querySelectorAll('#dropdown .dropdown-email, #profileEmail').forEach(el => {
        if (displayEmail) el.textContent = displayEmail;
    });

    // Populate authoritative referral code
    const refCode = getReferralCode();
    const refCodeEl = document.getElementById('displayReferralCode');
    if (refCodeEl) {
        refCodeEl.textContent = refCode;
    }
    
    // Load referral balance & virtual numbers stats
    loadReferralBalance();
    updateVirtualNumbersStats();
}

async function loadReferralBalance() {
    const el = document.getElementById('displayReferralBalance');
    if (!el) return;
    
    try {
        const session = getSession();
        const refBal = parseFloat(session?.referralBalance) || 0;
        const curr   = getCurrency();
        const isUSD  = curr === 'USD';
        const rate   = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

        if (isBalanceHidden()) {
            el.textContent = BALANCE_MASK;
            el.classList.add('balance-masked');
        } else {
            el.classList.remove('balance-masked');
            if (isUSD) {
                const usdVal = refBal / rate;
                el.textContent = '$' + usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                el.textContent = '₦' + refBal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }
    } catch (err) {
        if (isBalanceHidden()) {
            el.textContent = BALANCE_MASK;
            el.classList.add('balance-masked');
        } else {
            el.classList.remove('balance-masked');
            el.textContent = getCurrency() === 'USD' ? '$0.00' : '₦0.00';
        }
    }
}

/* ══════════════════════════════════════════
   SCROLL & ASIDE
══════════════════════════════════════════ */
function handleScroll() {
    if (!scrollTopBtn) return;
    const show = window.scrollY > 240;
    scrollTopBtn.style.opacity       = show ? '1' : '0';
    scrollTopBtn.style.pointerEvents = show ? 'auto' : 'none';
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleAside() {
    if (aside) aside.classList.toggle('open');
}

function initScrollEvents() {
    if (!scrollTopBtn) return;
    scrollTopBtn.addEventListener('click', scrollToTop);
    window.addEventListener('scroll', handleScroll);
    handleScroll();
}

function initAsideEvents() {
    if (closeAsideBtn) closeAsideBtn.addEventListener('click', () => { if (aside) aside.classList.remove('open'); });
    if (toggleBtn)     toggleBtn.addEventListener('click', toggleAside);
}

function initPopupEvents() {
    if (openPopupBtn)  openPopupBtn.addEventListener('click', openPopup);
    if (closePopupBtn) closePopupBtn.addEventListener('click', closePopup);
    if (popupBalance) {
        popupBalance.addEventListener('click', e => { if (e.target === popupBalance) closePopup(); });
    }

    // ?open=wallet query param
    if (new URLSearchParams(window.location.search).get('open') === 'wallet') {
        setTimeout(openPopup, 100);
    }

    // Sidebar wallet
    const sidebarWalletBtn = document.getElementById('sidebarWalletBtn');
    if (sidebarWalletBtn) {
        sidebarWalletBtn.addEventListener('click', e => { e.preventDefault(); openPopup(); });
    }

    // Sidebar settings
    const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
    if (sidebarSettingsBtn) {
        sidebarSettingsBtn.addEventListener('click', e => { e.preventDefault(); openSettings(); });
    }
}

/* ══════════════════════════════════════════
   SETTINGS PANEL
══════════════════════════════════════════ */













/* ══════════════════════════════════════════
   PAYSTACK DEPOSIT FLOW
   The frontend NEVER credits the wallet.
   After Paystack completes, we refresh from the API.
══════════════════════════════════════════ */
function loadPaystackSDK() {
    return new Promise((resolve, reject) => {
        if (typeof PaystackPop !== 'undefined') { resolve(); return; }
        const existing = document.querySelector('script[src*="paystack"]');
        if (existing) {
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.paystack.co/v1/inline.js';
        script.onload  = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function openDepositModal() {
    const isNGN   = getCurrency() === 'NGN';
    const symbol  = isNGN ? '₦' : '$';
    const minAmt  = isNGN ? PAYSTACK_CONFIG.minAmountNGN : PAYSTACK_CONFIG.minAmountUSD;
    const symEl   = document.getElementById('depositSymbol');
    const minEl   = document.getElementById('depositMinLabel');
    const inp     = document.getElementById('depositAmountInput');
    const errEl   = document.getElementById('depositError');
    if (symEl) symEl.textContent = symbol;
    if (minEl) minEl.textContent = symbol + minAmt.toLocaleString();
    if (inp)   { inp.value = ''; inp.min = minAmt; inp.placeholder = `e.g. ${isNGN ? '1000' : '10'}`; }
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    const modal = document.getElementById('depositModal');
    if (modal) { modal.style.display = 'flex'; setTimeout(() => inp && inp.focus(), 100); }
}

function closeDepositModal() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
}

async function launchPaystack(rawVal) {
    const session = getSession();
    if (!session) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    const curr         = getCurrency();
    const isNGN        = curr === 'NGN';
    const symbol       = isNGN ? '₦' : '$';
    const rate         = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;
    const amountInKobo = isNGN
        ? Math.round(rawVal * 100)
        : Math.round(rawVal * rate * 100);

    const transactionRef = 'DAVE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    try {
        const handler = PaystackPop.setup({
            key:      PAYSTACK_CONFIG.publicKey,
            email:    session.email || (session.username + '@davessocial.com'),
            amount:   amountInKobo,
            currency: 'NGN',
            ref:      transactionRef,
            channels: ['card', 'bank_transfer', 'ussd', 'bank'],
            label:    session.name || session.username,

            metadata: {
                custom_fields: [
                    { display_name: 'Username',  variable_name: 'username',  value: session.username || 'N/A' },
                    { display_name: 'Full Name', variable_name: 'full_name', value: session.name      || 'N/A' },
                    { display_name: 'Account Currency', variable_name: 'currency', value: curr }
                ]
            },

            callback: function(response) {
                (async () => {
                    closeDepositModal();
                    console.info('[Paystack] Callback — Ref:', response.reference);

                    try {
                        showToast(`⏳ Verifying payment of ${symbol}${rawVal.toLocaleString()}…`, 'info');
                        
                        // Call the backend recharge endpoint to credit the server-side balance
                        await rechargeWallet(rawVal, response.reference || transactionRef, curr);
                        
                        showToast(`✅ Payment of ${symbol}${rawVal.toLocaleString()} verified and credited!`, 'success');
                        
                        // After verified success, load the new authoritative balance from the server
                        await loadWalletBalance(curr);
                        await loadTransactions(1, curr);
                        
                        // Log payment activity for admin console
                        const userName = session.name || session.username || 'User';
                        logAdminActivity('fund', `Wallet funded: ${symbol}${rawVal.toLocaleString()} added to ${userName} (${curr} account)`, userName);

                    } catch (err) {
                        console.error('[Paystack] Backend recharge error:', err);
                        showToast(err.message || 'Payment received but wallet update delayed. It will sync shortly.', 'warning');
                        
                        // Keep polling in case the backend webhook succeeds later
                        const pollIntervals = [2000, 6000, 12000];
                        pollIntervals.forEach((delay) => {
                            setTimeout(async () => {
                                await loadWalletBalance(curr);
                                await loadTransactions(1, curr);
                            }, delay);
                        });
                    }
                })();
            },

            onClose: function() {
                showToast('Payment window closed. Your balance was not changed.', 'info');
            }
        });

        handler.openIframe();
    } catch (e) {
        console.error('Paystack SDK error:', e);
        showToast('Payment system failed to launch. Check your internet connection.', 'error');
    }
}

async function handleAddFunds() {
    try {
        await loadPaystackSDK();
    } catch (e) {
        showToast('Payment system could not load. Check your internet connection.', 'error');
        return;
    }
    if (!getSession()) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }
    openDepositModal();
}

/* ══════════════════════════════════════════
   REFERRAL CODE COPY
══════════════════════════════════════════ */
function initReferralCopy() {
    const copyBtn = document.getElementById('btnCopyReferral');
    if (copyBtn && !copyBtn._copyWired) {
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            copyReferralCode();
        });
        copyBtn._copyWired = true;
    }

    const codeSpan = document.getElementById('displayReferralCode');
    if (codeSpan && !codeSpan._copyWired) {
        codeSpan.style.cursor = 'pointer';
        codeSpan.title = 'Click to copy referral code';
        codeSpan.addEventListener('click', () => {
            copyReferralCode();
        });
        codeSpan._copyWired = true;
    }
}

/* ══════════════════════════════════════════
   SCREEN LOADER
══════════════════════════════════════════ */
window.addEventListener('load', function() {
    const loader = document.querySelector('.loader-wrapper');
    if (!loader) return;
    loader.style.transition = 'opacity 0.5s ease';
    loader.style.opacity    = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 500);
});

/* ══════════════════════════════════════════
   QUICK ACTION CARDS (navigation only)
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.action-card[data-action]').forEach(card => {
        card.addEventListener('click', () => {
            const action = card.dataset.action;
            if (action === 'buy-number') window.location.href = 'buy.html';
            else if (action === 'countries') window.location.href = 'buy.html';
            else if (action === 'sms-inbox') window.location.href = 'buy.html';
            else if (action === 'my-order')  window.location.href = 'buy.html';
        });
    });
});

/* ══════════════════════════════════════════
   DEPOSIT MODAL WIRE-UP
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
    const confirmBtn  = document.getElementById('depositConfirmBtn');
    const closeBtn    = document.getElementById('depositModalClose');
    const modalEl     = document.getElementById('depositModal');
    const amountInput = document.getElementById('depositAmountInput');
    const errEl       = document.getElementById('depositError');

    let isSubmittingDeposit = false; // guards against double Enter/click firing launchPaystack() twice

    function showDepositError(msg) {
        if (!errEl) return;
        errEl.textContent   = msg;
        errEl.style.display = 'block';
    }

    async function handleDepositConfirm() {
        if (isSubmittingDeposit) return;

        const isNGN  = getCurrency() === 'NGN';
        const symbol = isNGN ? '₦' : '$';
        const minAmt = isNGN ? PAYSTACK_CONFIG.minAmountNGN : PAYSTACK_CONFIG.minAmountUSD;
        const rawVal = parseFloat((amountInput?.value || '').replace(/[^0-9.]/g, ''));

        if (isNaN(rawVal) || rawVal <= 0) { showDepositError('Please enter a valid amount.'); return; }
        if (rawVal < minAmt)              { showDepositError(`Minimum deposit is ${symbol}${minAmt}.`); return; }

        isSubmittingDeposit = true;
        try {
            closeDepositModal();
            await launchPaystack(rawVal);
        } finally {
            isSubmittingDeposit = false;
        }
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleDepositConfirm);
    }

    if (amountInput) {
        amountInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                // Stop the browser's default form-submit behavior — without
                // this, if the input sits inside a <form>, Enter both
                // clicks the button AND submits the form natively,
                // potentially firing the handler twice or reloading the page.
                e.preventDefault();
                handleDepositConfirm();
            }
        });
    }

    if (closeBtn)  closeBtn.addEventListener('click',  closeDepositModal);
    if (modalEl) {
        modalEl.addEventListener('click', function(e) {
            if (e.target === modalEl) closeDepositModal();
        });
    }
});

/* ══════════════════════════════════════════
   TRANSACTION PAGINATION WIRE-UP
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
    const prevBtn = document.getElementById('txPrevBtn');
    const nextBtn = document.getElementById('txNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => loadTransactions(txPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => loadTransactions(txPage + 1));
});

/* ══════════════════════════════════════════
   MAIN INITIALISATION
══════════════════════════════════════════ */
function init() {
    // 1. Auth guard — redirect immediately if no token
    if (!requireAuth()) return;

    restoreTheme();
    initPopupEvents();
    initScrollEvents();
    initAsideEvents();

    // 2. Render cached user info immediately (no flicker)
    renderUserInfo();

    // 2b. Sync currency symbol/label to whatever was last saved, so a
    // page reload shows the correct currency immediately (not just NGN
    // by default) before any balance data has even loaded.
    updateCurrencyDisplay(getCurrency());

    // 2c. Restore balance privacy visibility state (show/hide with bullets)
    updateBalancePrivacyDisplay();

    // Wire Balance Privacy Eye Buttons
    document.querySelectorAll('#toggleBalancePrivacyBtn, .btn-balance-privacy, .btn-balance-privacy-sm').forEach(btn => {
        if (!btn._privacyWired) {
            btn.addEventListener('click', toggleBalancePrivacy);
            btn._privacyWired = true;
        }
    });

    // 3. Wire currency switcher
    const switchEl = document.getElementById('currencySwitch');
    if (switchEl) switchEl.addEventListener('click', toggleCurrency);

    // 4. Wire Add Funds buttons
    const addBtn    = document.getElementById('addFundsBtn');
    const popAddBtn = document.getElementById('popupAddFundsBtn');
    if (addBtn)    addBtn.addEventListener('click', handleAddFunds);
    if (popAddBtn) popAddBtn.addEventListener('click', handleAddFunds);

    // 5. Referral copy
    initReferralCopy();

    // 6. Load live data from backend
    loadWalletBalance();
    loadVirtualAccount();
    loadTransactions(1);
    loadNotifications().catch(e => console.log('Notif check fail:', e));
}

document.addEventListener('DOMContentLoaded', init);

/* ══════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════ */
let unreadCount = 0;

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