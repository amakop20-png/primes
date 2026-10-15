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
window.openPopup = openPopup;
window.closePopup = closePopup;


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
    const depBadge = document.getElementById('depositCurrBadge');
    if (depSym) depSym.textContent = isUSD ? '$' : '₦';
    if (depMin) depMin.textContent = isUSD ? '$1' : '₦100';
    if (depBadge) depBadge.textContent = `Currency: ${isUSD ? 'USD ($)' : 'NGN (₦)'}`;
    if (depInp) {
        depInp.min = isUSD ? '1' : '100';
        depInp.placeholder = isUSD ? 'e.g. 20' : 'e.g. 2500';
    }

    if (typeof renderDepositPresets === 'function' && document.getElementById('depositModal')?.style.display === 'flex') {
        renderDepositPresets();
    }

    // Update segmented toggle buttons across dashboard and sidebar
    document.querySelectorAll('.curr-segment-ngn').forEach(el => el.classList.toggle('active', !isUSD));
    document.querySelectorAll('.curr-segment-usd').forEach(el => el.classList.toggle('active', isUSD));
}

// In-memory cache for authoritative NGN balance to enable instantaneous switching
let cachedNgnBalance = parseFloat(localStorage.getItem('_walletBalance_NGN') || localStorage.getItem('_walletBalance') || '0') || 0;

function setDashboardCurrency(target) {
    if (!target) return;
    const current = getCurrency();
    if (current.toUpperCase() !== target.toUpperCase()) {
        toggleCurrency();
    }
}
window.setDashboardCurrency = setDashboardCurrency;

function toggleCurrency(e) {
    const current = getCurrency();
    if (e && e.target && e.target.closest) {
        const seg = e.target.closest('[data-curr]');
        if (seg) {
            const targetCurr = seg.getAttribute('data-curr');
            if (targetCurr && targetCurr.toUpperCase() === current.toUpperCase()) {
                return;
            }
        }
    }
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
const BALANCE_MASK_DIGITS = '•••••';
let balanceVisible = localStorage.getItem('primes_balance_hidden') !== 'true';

function isBalanceHidden() {
    return !balanceVisible;
}

function setBalanceHidden(hidden) {
    balanceVisible = !hidden;
    localStorage.setItem('primes_balance_hidden', hidden ? 'true' : 'false');
}

let lastBalanceToggleTimestamp = 0;
function toggleBalancePrivacy(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const now = Date.now();
    if (now - lastBalanceToggleTimestamp < 200) return; // Prevent duplicate trigger
    lastBalanceToggleTimestamp = now;

    balanceVisible = !balanceVisible;
    localStorage.setItem('primes_balance_hidden', balanceVisible ? 'false' : 'true');
    updateBalancePrivacyDisplay();
    showToast(balanceVisible ? 'Wallet balance visible' : 'Wallet balance hidden', 'info');
}
window.toggleBalancePrivacy = toggleBalancePrivacy;
window.isBalanceHidden = isBalanceHidden;

function updateBalancePrivacyDisplay() {
    const isHidden = !balanceVisible;
    const curr   = getCurrency();
    const isUSD  = curr === 'USD';
    const rate   = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;
    const currSym = isUSD ? '$' : '₦';

    const ngnAmount = cachedNgnBalance || 0;
    const usdAmount = ngnAmount / rate;

    const formattedNGN = '₦' + ngnAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedUSD = '$' + usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const primaryFormatted = isUSD ? formattedUSD : formattedNGN;
    const maskedFormatted = currSym + BALANCE_MASK_DIGITS;

    // 1. Available Balance (Card)
    const balPrimaryEl = document.getElementById('displayBalanceNGN');
    if (balPrimaryEl) {
        balPrimaryEl.textContent = isHidden ? maskedFormatted : primaryFormatted;
        balPrimaryEl.classList.toggle('balance-masked', isHidden);
    }

    // 2. Secondary Dual-Currency Balance
    const altFormatted = isUSD ? `≈ ${formattedNGN}` : `≈ ${formattedUSD}`;
    const altSym = isUSD ? '₦' : '$';
    const maskedAlt = `≈ ${altSym}${BALANCE_MASK_DIGITS}`;
    const balSecondaryEl = document.getElementById('displayBalanceUSD');
    if (balSecondaryEl) {
        balSecondaryEl.textContent = isHidden ? maskedAlt : altFormatted;
        balSecondaryEl.classList.toggle('balance-masked', isHidden);
    }

    const rateChipTextEl = document.getElementById('walletRateChipText');
    if (rateChipTextEl) {
        rateChipTextEl.textContent = `1 USD ≈ ₦${rate.toLocaleString()}`;
    }

    // 3. NGN Balance Card
    const cardNgnEl = document.getElementById('cardBalanceNGN');
    if (cardNgnEl) {
        cardNgnEl.textContent = isHidden ? ('₦' + BALANCE_MASK_DIGITS) : formattedNGN;
        cardNgnEl.classList.toggle('balance-masked', isHidden);
    }

    // 4. USD Balance Card
    const cardUsdEl = document.getElementById('cardBalanceUSD');
    if (cardUsdEl) {
        cardUsdEl.textContent = isHidden ? ('$' + BALANCE_MASK_DIGITS) : formattedUSD;
        cardUsdEl.classList.toggle('balance-masked', isHidden);
    }

    // 5. Popup Balance Modal
    const popBalEl = document.getElementById('popupBalanceAmount');
    if (popBalEl) {
        popBalEl.textContent = isHidden ? maskedFormatted : primaryFormatted;
        popBalEl.classList.toggle('balance-masked', isHidden);
    }

    const popNgnEl = document.getElementById('popupBalanceNGN');
    if (popNgnEl) {
        popNgnEl.textContent = isHidden ? ('₦' + BALANCE_MASK_DIGITS) : formattedNGN;
        popNgnEl.classList.toggle('balance-masked', isHidden);
    }

    const popUsdEl = document.getElementById('popupBalanceUSD');
    if (popUsdEl) {
        popUsdEl.textContent = isHidden ? ('$' + BALANCE_MASK_DIGITS) : formattedUSD;
        popUsdEl.classList.toggle('balance-masked', isHidden);
    }

    // 6. Referral Balance
    const refBalEl = document.getElementById('displayReferralBalance');
    if (refBalEl) {
        if (isHidden) {
            refBalEl.textContent = currSym + BALANCE_MASK_DIGITS;
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

let isRefreshingWallet = false;
async function refreshWalletBalanceWithSpin(btn) {
    if (isRefreshingWallet) return;
    isRefreshingWallet = true;

    const refreshBtn = btn || document.getElementById('walletRefreshBtn');
    const icon = refreshBtn ? refreshBtn.querySelector('i') : document.getElementById('walletRefreshIcon');
    if (icon) icon.classList.add('wfin-spin');
    if (refreshBtn) refreshBtn.style.pointerEvents = 'none';

    try {
        await loadWalletBalance();
        showToast('Wallet balance refreshed successfully', 'success');
    } catch (e) {
        showToast('Failed to refresh balance: ' + (e.message || 'Network error'), 'error');
    } finally {
        setTimeout(() => {
            if (icon) icon.classList.remove('wfin-spin');
            if (refreshBtn) refreshBtn.style.pointerEvents = 'auto';
            isRefreshingWallet = false;
        }, 600);
    }
}
window.refreshWalletBalanceWithSpin = refreshWalletBalanceWithSpin;

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
                email: userEmail || `${session.username || 'user'}@nuraxq.com`,
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
                <span id="vaAccountNumber" onclick="copyVirtualAccount()" title="Click to copy account number" style="font-weight:800;color:var(--primary,#7c3aed);letter-spacing:1px;font-size:16px;cursor:pointer;padding:2px 6px;border-radius:6px;transition:background 0.2s;" onmouseover="this.style.background='var(--primary-light,#f5f3ff)'" onmouseout="this.style.background='transparent'">${accNum}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--muted,#888);font-weight:600;">Account Name</span>
                <span style="font-weight:700;color:var(--text);">${accName}</span>
            </div>
            <button id="btnCopyVA" onclick="copyVirtualAccount()" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:1.5px solid var(--primary,#7c3aed);background:var(--primary-light,#f5f3ff);color:var(--primary,#7c3aed);font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;">
                <i class="ph ph-copy" id="vaCopyIcon"></i> <span id="vaCopyText">Copy Account Number</span>
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
    if (!text || text === '—' || text === '-' || text.toLowerCase().includes('loading')) return;

    const copyBtn  = document.getElementById('btnCopyVA');
    const copyIcon = document.getElementById('vaCopyIcon');
    const copyText = document.getElementById('vaCopyText');

    const handleSuccess = () => {
        if (copyBtn) {
            copyBtn.style.background = 'var(--primary,#7c3aed)';
            copyBtn.style.color = '#ffffff';
        }
        if (copyIcon) copyIcon.className = 'ph ph-check';
        if (copyText) copyText.textContent = 'Copied!';
        showToast('Account number copied to clipboard: ' + text, 'success');

        setTimeout(() => {
            if (copyBtn) {
                copyBtn.style.background = 'var(--primary-light,#f5f3ff)';
                copyBtn.style.color = 'var(--primary,#7c3aed)';
            }
            if (copyIcon) copyIcon.className = 'ph ph-copy';
            if (copyText) copyText.textContent = 'Copy Account Number';
        }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(handleSuccess).catch(() => {
            fallbackClipboardCopy(text, handleSuccess, 'Account Number');
        });
    } else {
        fallbackClipboardCopy(text, handleSuccess, 'Account Number');
    }
}
window.copyVirtualAccount = copyVirtualAccount;

/* ══════════════════════════════════════════
   TRANSACTIONS
   Display and convert transactions according to active dashboard currency
══════════════════════════════════════════ */
let currentTransactionsList = [];
let activeTxFilter = 'all';

function normalizeTxFilterType(type) {
    const t = String(type || 'all').toLowerCase().trim();
    if (t === 'deposit' || t === 'deposits' || t === 'credit') return 'deposit';
    if (t === 'purchase' || t === 'purchases' || t === 'debit') return 'purchase';
    return 'all';
}

function classifyTransaction(tx) {
    if (!tx || typeof tx !== 'object') {
        return { isCredit: false, isDeposit: false, isPurchase: false, isReward: false, title: 'Transaction', iconClass: 'tx-type-debit', iconName: 'ph-receipt' };
    }

    const typeStr   = String(tx.type || tx.transactionType || tx.action || tx.category || '').toLowerCase().trim();
    const reasonStr = String(tx.reason || tx.description || tx.memo || tx.note || '').toLowerCase().trim();
    const refStr    = String(tx.reference || tx.ref || '').toLowerCase().trim();
    const rawAmount = parseFloat(tx.amount);

    // Explicit referral/reward checks
    const isReward = typeStr.includes('referral') || typeStr.includes('reward') || reasonStr.includes('referral') || reasonStr.includes('reward');

    // Purchase checks (debit, purchase, activation, buy, number, etc.)
    const isExplicitPurchase = (
        typeStr === 'debit' ||
        typeStr === 'purchase' ||
        typeStr === 'purchases' ||
        typeStr === 'buy' ||
        typeStr === 'activation' ||
        typeStr === 'number_purchase' ||
        reasonStr.includes('purchase') ||
        reasonStr.includes('activation') ||
        reasonStr.includes('buy number') ||
        refStr.startsWith('adm-dr-') ||
        refStr.startsWith('buy-') ||
        refStr.startsWith('act-')
    );

    // Deposit checks (credit, deposit, funding, topup, paystack, etc.)
    const isExplicitDeposit = (
        typeStr === 'credit' ||
        typeStr === 'deposit' ||
        typeStr === 'deposits' ||
        typeStr === 'funding' ||
        typeStr === 'wallet_funding' ||
        typeStr === 'topup' ||
        reasonStr.includes('deposit') ||
        reasonStr.includes('funding') ||
        reasonStr.includes('paystack') ||
        reasonStr.includes('credited') ||
        reasonStr.includes('top-up') ||
        reasonStr.includes('topup') ||
        refStr.startsWith('adm-cr-') ||
        refStr.startsWith('pstk-') ||
        refStr.startsWith('paystack-') ||
        refStr.startsWith('dep-')
    );

    let isDeposit = false;
    let isPurchase = false;

    if (isReward) {
        isDeposit = true;
    } else if (isExplicitPurchase) {
        isPurchase = true;
    } else if (isExplicitDeposit) {
        isDeposit = true;
    } else if (!isNaN(rawAmount)) {
        if (rawAmount < 0) {
            isPurchase = true;
        } else {
            isDeposit = true;
        }
    }

    const isCredit = isDeposit;

    let title = 'Transaction';
    let iconClass = isCredit ? 'tx-type-credit' : 'tx-type-debit';
    let iconName = isCredit ? 'ph-arrow-down-left' : 'ph-sim-card';

    if (isReward) {
        title = 'Referral Reward';
        iconClass = 'tx-type-reward';
        iconName = 'ph-gift';
    } else if (isPurchase) {
        title = 'Number Purchase';
        iconClass = 'tx-type-debit';
        iconName = 'ph-sim-card';
        if (reasonStr && reasonStr.length < 40) {
            title = tx.reason || tx.description || 'Number Purchase';
        }
    } else if (isDeposit) {
        title = 'Wallet Deposit';
        iconClass = 'tx-type-credit';
        iconName = 'ph-arrow-down-left';
        if (reasonStr && (reasonStr.includes('paystack') || reasonStr.includes('admin') || reasonStr.includes('manual')) && reasonStr.length < 40) {
            title = tx.reason || tx.description || 'Wallet Deposit';
        }
    }

    return {
        isCredit,
        isDeposit,
        isPurchase,
        isReward,
        title,
        iconClass,
        iconName
    };
}
window.classifyTransaction = classifyTransaction;

function filterTransactions(type) {
    activeTxFilter = normalizeTxFilterType(type);
    document.querySelectorAll('.tx-filter-btn').forEach(btn => {
        const btnFilter = normalizeTxFilterType(btn.getAttribute('data-tx-filter'));
        btn.classList.toggle('active', btnFilter === activeTxFilter);
    });
    renderCachedTransactions();
}
window.filterTransactions = filterTransactions;

function renderCachedTransactions() {
    const listEl = document.getElementById('transactionsList');
    if (!listEl) return;
    const curr = getCurrency();
    const isUSD = curr === 'USD';
    const symbol = isUSD ? '$' : '₦';
    const rate = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

    const sourceList = Array.isArray(currentTransactionsList) ? currentTransactionsList : [];
    let filtered = sourceList;

    if (activeTxFilter === 'deposit') {
        filtered = sourceList.filter(tx => classifyTransaction(tx).isDeposit);
    } else if (activeTxFilter === 'purchase') {
        filtered = sourceList.filter(tx => classifyTransaction(tx).isPurchase);
    }

    if (!filtered || filtered.length === 0) {
        let emptyTitle = 'No transactions found';
        let emptyDesc = `Your ${curr} transactions will appear here as soon as you fund your wallet or activate a number.`;
        if (activeTxFilter === 'deposit') {
            emptyTitle = 'No deposit transactions';
            emptyDesc = `You have not made any deposits in ${curr} yet. When you fund your wallet, your deposit history will appear here.`;
        } else if (activeTxFilter === 'purchase') {
            emptyTitle = 'No purchase transactions';
            emptyDesc = `You have not made any number purchases in ${curr} yet. Purchased virtual numbers will appear here.`;
        }

        listEl.innerHTML = `
            <li class="tx-empty-state">
                <div class="tx-empty-icon"><i class="ph ph-receipt"></i></div>
                <div class="tx-empty-title">${emptyTitle}</div>
                <p class="tx-empty-desc">${emptyDesc}</p>
            </li>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(tx => {
        const rawAmount = parseFloat(tx.amount) || 0;
        const txCur = (tx.currency || 'NGN').toUpperCase();
        const classified = classifyTransaction(tx);
        const isCredit = classified.isCredit;
        const absAmount = Math.abs(rawAmount);

        let convertedAmt;
        if (isUSD) {
            convertedAmt = (txCur === 'USD') ? absAmount : (absAmount / rate);
        } else {
            convertedAmt = (txCur === 'USD') ? (absAmount * rate) : absAmount;
        }

        const amtStr = (isCredit ? '+' : '−') + symbol + convertedAmt.toLocaleString(isUSD ? 'en-US' : 'en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const dateRaw = tx.createdAt || tx.created_at || tx.date;
        const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const status = String(tx.status || 'success').toLowerCase();
        const isSuccess = status === 'success' || status === 'completed';
        const isPending = status === 'pending';
        const statusClass = isSuccess ? 'status-success' : (isPending ? 'status-pending' : 'status-failed');
        const statusLabel = isSuccess ? 'Success' : (isPending ? 'Pending' : 'Failed');

        const refBadge = tx.reference ? `<span class="tx-ref-badge">${escapeHTML(String(tx.reference))}</span>` : '';

        return `
        <li class="tx-card-row">
            <div class="tx-left-col">
                <div class="tx-icon-bubble ${classified.iconClass}">
                    <i class="ph ${classified.iconName}"></i>
                </div>
                <div class="tx-meta-info">
                    <span class="tx-title-text">${escapeHTML(classified.title)}</span>
                    <div class="tx-sub-row">
                        <span>${dateStr}</span>
                        ${refBadge}
                    </div>
                </div>
            </div>
            <div class="tx-right-col">
                <span class="tx-amount-text ${isCredit ? 'amount-credit' : 'amount-debit'}">${amtStr}</span>
                <span class="tx-status-pill ${statusClass}">${statusLabel}</span>
            </div>
        </li>`;
    }).join('');
}
window.renderCachedTransactions = renderCachedTransactions;

async function loadTransactions(page = 1, currency) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    txPage = validPage;
    const curr   = currency || getCurrency();
    const isUSD  = curr === 'USD';
    const rate   = typeof getExchangeRate === 'function' ? getExchangeRate() : 1500;

    const listEl    = document.getElementById('transactionsList');
    const paginEl   = document.getElementById('txPagination');
    const prevBtn   = document.getElementById('txPrevBtn');
    const nextBtn   = document.getElementById('txNextBtn');
    const pageLabel = document.getElementById('txPageLabel');

    if (!listEl) return;

    listEl.innerHTML = `<li class="tx-loading-state"><i class="ph ph-circle-notch tx-spin"></i><span>Loading ${curr} transactions…</span></li>`;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    try {
        const data = await getTransactions(validPage, TX_LIMIT, curr);
        let txs = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
        const pg = data?.pagination || {};

        // If backend returned empty when curr is USD, fallback to NGN query so user sees converted history
        if ((!txs || txs.length === 0) && isUSD) {
            try {
                const fallbackData = await getTransactions(validPage, TX_LIMIT, 'NGN');
                const fallbackTxs = Array.isArray(fallbackData?.transactions) ? fallbackData.transactions : (Array.isArray(fallbackData?.data) ? fallbackData.data : []);
                if (fallbackTxs.length > 0) {
                    txs = fallbackTxs;
                }
            } catch (e) {
                // Ignore fallback error
            }
        }

        let totalRechargeInNGN = 0;
        let numbersCount = 0;

        txs.forEach(tx => {
            const rawAmount = parseFloat(tx.amount) || 0;
            const txCur     = (tx.currency || 'NGN').toUpperCase();
            const classified = classifyTransaction(tx);
            const isCredit  = classified.isCredit;
            const absAmount = Math.abs(rawAmount);
            const amountInNGN = (txCur === 'USD') ? (absAmount * rate) : absAmount;
            if (isCredit) {
                totalRechargeInNGN += amountInNGN;
            } else {
                numbersCount++;
            }
        });

        currentTransactionsList = txs;
        renderCachedTransactions();

        // Update popup modal statistics
        const totalRechargeEl = document.getElementById('popupTotalRecharge');
        if (totalRechargeEl) {
            const displayRecharge = isUSD ? (totalRechargeInNGN / rate) : totalRechargeInNGN;
            const symbol = isUSD ? '$' : '₦';
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
        if (pageLabel) pageLabel.textContent = `Page ${pg.page || validPage} of ${totalPages || 1}`;
        if (prevBtn) {
            prevBtn.disabled = !(pg.hasPrevPage || validPage > 1);
            prevBtn.onclick = () => {
                if (validPage > 1) loadTransactions(validPage - 1);
            };
        }
        if (nextBtn) {
            nextBtn.disabled = !(pg.hasNextPage || (totalPages && validPage < totalPages));
            nextBtn.onclick = () => {
                if (totalPages && validPage < totalPages) loadTransactions(validPage + 1);
            };
        }

    } catch (err) {
        console.error('loadTransactions error:', err);
        listEl.innerHTML = `<li class="tx-empty-state"><div class="tx-empty-title">Error</div><p class="tx-empty-desc">Could not load ${curr} transactions. Please try again.</p></li>`;
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
    return 'REF-NURAXQ';
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

function fallbackClipboardCopy(text, cb, label = 'Copied') {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful && typeof cb === 'function') {
            cb();
        } else if (successful) {
            showToast(`${label}: ${text}`, 'success');
        } else {
            showToast(`${label}: ${text}`, 'info');
        }
    } catch (_) {
        showToast(`${label}: ${text}`, 'info');
    }
}

window.getReferralCode = getReferralCode;
window.copyReferralCode = copyReferralCode;

/* ══════════════════════════════════════════
   VIRTUAL NUMBERS & ACTIVE NUMBERS (API-CONNECTED)
   - Fetches live order verification status from /api/order/:id
   - Updates count on purchase, activation, complete, cancel, expiration
   - Automatically synchronizes across tabs via StorageEvent
   - Preserves state accurately across page refreshes
══════════════════════════════════════════ */
async function loadActiveNumbers() {
    const activeEl = document.getElementById('dashActiveNumbers');
    const subEl    = document.getElementById('dashActiveSub');

    // Fast initial render from cached count to eliminate UI flicker
    const cachedCount = localStorage.getItem('primes_active_count');
    if (activeEl && cachedCount !== null) {
        activeEl.textContent = cachedCount;
        if (subEl) {
            const n = parseInt(cachedCount, 10) || 0;
            subEl.textContent = n > 0 
                ? (n === 1 ? 'Waiting for SMS verification' : `${n} active verifications`) 
                : 'No active verifications';
        }
    }

    // Collect candidate order IDs from localStorage
    let activeOrders = [];
    try {
        const stored = JSON.parse(localStorage.getItem('primes_active_orders') || '[]');
        if (Array.isArray(stored)) {
            activeOrders = stored;
        }
    } catch (_) {
        activeOrders = [];
    }

    const currentOrderId = localStorage.getItem('currentOrderId');
    if (currentOrderId) {
        const strId = String(currentOrderId);
        if (!activeOrders.some(o => (typeof o === 'object' ? String(o.id || o.orderId || o._id) === strId : String(o) === strId))) {
            activeOrders.push({ id: strId, status: 'PENDING' });
        }
    }

    if (activeOrders.length === 0) {
        if (activeEl) activeEl.textContent = '0';
        if (subEl) subEl.textContent = 'No active verifications';
        localStorage.setItem('primes_active_count', '0');
        localStorage.setItem('primes_active_orders', JSON.stringify([]));
        return 0;
    }

    // Verify candidate orders against backend /api/order/:id
    const terminalStatuses = ['FINISHED', 'CANCELED', 'BANNED', 'TIMEOUT', 'EXPIRED'];
    const stillActive = [];

    for (const item of activeOrders) {
        const orderId = typeof item === 'object' ? (item.id || item.orderId || item._id) : item;
        if (!orderId) continue;

        try {
            if (typeof getOrder === 'function') {
                const res = await getOrder(orderId);
                const orderData = res?.order || res?.data || res;
                const status = (orderData?.status || '').toUpperCase();

                if (terminalStatuses.includes(status)) {
                    // Terminal state reached: prune
                    if (localStorage.getItem('currentOrderId') === String(orderId)) {
                        localStorage.removeItem('currentOrderId');
                    }
                } else {
                    // Active (e.g. PENDING or RECEIVED)
                    const orderPhone = orderData?.phone || res?.phone || (typeof item === 'object' ? item.phone : '') || '';
                    const updatedObj = typeof item === 'object' 
                        ? { ...item, phone: orderPhone || item.phone || '', status: status || 'PENDING' } 
                        : { id: String(orderId), phone: orderPhone, status: status || 'PENDING' };
                    stillActive.push(updatedObj);

                    // Check for genuine OTP arrival to trigger sound notification (with event-level deduplication)
                    let validSmsItems = [];
                    if (Array.isArray(orderData?.sms)) {
                        validSmsItems = orderData.sms;
                    } else if (orderData?.sms && typeof orderData?.sms === 'object') {
                        validSmsItems = [orderData.sms];
                    } else if (typeof orderData?.sms === 'string' && orderData.sms.trim()) {
                        validSmsItems = [{ text: orderData.sms.trim() }];
                    }

                    const topCode = orderData?.code || orderData?.smsCode || orderData?.otp;
                    if (validSmsItems.length === 0 && topCode && String(topCode).trim()) {
                        validSmsItems = [{ code: String(topCode).trim() }];
                    }

                    validSmsItems.forEach((smsItem, sIdx) => {
                        let c = '';
                        let t = '';
                        if (typeof smsItem === 'object' && smsItem !== null) {
                            c = smsItem.code || smsItem.otp || smsItem.pin || '';
                            t = smsItem.text || smsItem.message || '';
                        } else if (typeof smsItem === 'string') {
                            t = smsItem.trim();
                        }
                        if (c || t) {
                            const eventId = `${orderId}_${c || t.slice(0, 30)}_${sIdx}`;
                            if (window.NuraSound && typeof window.NuraSound.playOtpChime === 'function') {
                                window.NuraSound.playOtpChime(orderId, eventId);
                            }
                        }
                    });
                }
            } else {
                stillActive.push(item);
            }
        } catch (err) {
            const status = err?.status || err?.statusCode;
            if (status === 404) {
                // Order does not exist on server: prune
                if (localStorage.getItem('currentOrderId') === String(orderId)) {
                    localStorage.removeItem('currentOrderId');
                }
            } else {
                // Network error or 5xx: keep optimistically
                stillActive.push(item);
            }
        }
    }

    // Update verified cache in localStorage
    localStorage.setItem('primes_active_orders', JSON.stringify(stillActive));
    const activeCount = stillActive.length;
    localStorage.setItem('primes_active_count', String(activeCount));

    if (activeEl) {
        activeEl.textContent = String(activeCount);
    }
    if (subEl) {
        subEl.textContent = activeCount > 0
            ? (activeCount === 1 ? 'Waiting for SMS verification' : `${activeCount} active verifications`)
            : 'No active verifications';
    }

    return activeCount;
}

function updateVirtualNumbersStats(numbersCount = null) {
    // 1. Active Numbers (rendered from cache or fallback)
    const activeEl = document.getElementById('dashActiveNumbers');
    const subEl    = document.getElementById('dashActiveSub');
    if (activeEl) {
        const cached = localStorage.getItem('primes_active_count');
        if (cached !== null) {
            activeEl.textContent = cached;
            if (subEl) {
                const n = parseInt(cached, 10) || 0;
                subEl.textContent = n > 0 
                    ? (n === 1 ? 'Waiting for SMS verification' : `${n} active verifications`) 
                    : 'No active verifications';
            }
        } else {
            let count = 0;
            try {
                const list = JSON.parse(localStorage.getItem('primes_active_orders') || '[]');
                count = Array.isArray(list) ? list.length : 0;
                const cur = localStorage.getItem('currentOrderId');
                if (cur && !list.some(o => (typeof o === 'object' ? String(o.id) === String(cur) : String(o) === String(cur)))) {
                    count++;
                }
            } catch (_) {}
            activeEl.textContent = String(count);
            if (subEl) {
                subEl.textContent = count > 0 
                    ? (count === 1 ? 'Waiting for SMS verification' : `${count} active verifications`) 
                    : 'No active verifications';
            }
        }
    }

    // 2. Total Numbers
    const totalEl = document.getElementById('dashTotalNumbers');
    if (totalEl) {
        if (numbersCount !== null && numbersCount !== undefined) {
            totalEl.textContent = String(numbersCount);
            localStorage.setItem('primes_total_numbers', String(numbersCount));
        } else {
            const cachedTotal = localStorage.getItem('primes_total_numbers');
            if (cachedTotal !== null) {
                totalEl.textContent = cachedTotal;
            } else {
                const popupCount = document.getElementById('popupNumbersPurchased')?.textContent;
                if (popupCount && popupCount !== '0' && popupCount !== '—') {
                    totalEl.textContent = popupCount;
                }
            }
        }
    }

    // 3. Available Numbers
    const availEl = document.getElementById('dashAvailableNumbers');
    if (availEl) {
        availEl.textContent = '150+';
    }
}
window.loadActiveNumbers = loadActiveNumbers;
window.updateVirtualNumbersStats = updateVirtualNumbersStats;

function renderUserInfo() {
    const session      = getSession() || {};
    const displayName  = session.name || session.username || 'User';
    const displayEmail = session.email || '';

    document.querySelectorAll('#dashboardUsername, #Username, #dropdown .dropdown-name, #dropdownUsername, .username, #sidebarUserName').forEach(el => {
        el.textContent = displayName;
    });
    document.querySelectorAll('#dropdown .dropdown-email, #dropdownEmail, #profileEmail, #sidebarUserEmail').forEach(el => {
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

function initScrollEvents() {
    window.addEventListener('scroll', handleScroll, { passive: true });
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', scrollToTop);
    }
}

function isDesktopSidebarView() {
    return window.innerWidth > 768;
}

function toggleSidebar() {
    if (isDesktopSidebarView()) {
        document.body.classList.toggle('sidebar-collapsed');
        const isCollapsed = document.body.classList.contains('sidebar-collapsed');
        try { localStorage.setItem('primes_sidebar_collapsed', isCollapsed ? 'true' : 'false'); } catch (_) {}
        updateSidebarUIState();
    } else {
        if (!aside) return;
        aside.classList.toggle('open');
        const isOpen = aside.classList.contains('open');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (backdrop) backdrop.classList.toggle('active', isOpen);
        document.body.classList.toggle('sidebar-mobile-open', isOpen);
    }
}

function closeSidebarMobile() {
    if (aside) aside.classList.remove('open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-mobile-open');
}

function updateSidebarUIState() {
    const isDesktop = isDesktopSidebarView();
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    
    const sidebarIcon = document.getElementById('sidebarToggleIcon');
    const headerIcon  = document.getElementById('headerToggleIcon');
    const closeBtn    = document.getElementById('close-btn');
    const headerBtn   = document.getElementById('toggle-btn');

    if (isDesktop) {
        if (sidebarIcon) {
            sidebarIcon.className = isCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-left';
        }
        if (closeBtn) {
            closeBtn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
            closeBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }
        if (headerIcon) {
            headerIcon.className = isCollapsed ? 'ph ph-list' : 'ph ph-text-align-left';
        }
        if (headerBtn) {
            headerBtn.setAttribute('title', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
            headerBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
        }
    } else {
        if (sidebarIcon) {
            sidebarIcon.className = 'ph ph-x';
        }
        if (closeBtn) {
            closeBtn.setAttribute('title', 'Close sidebar');
            closeBtn.setAttribute('aria-label', 'Close sidebar');
        }
        if (headerIcon) {
            headerIcon.className = 'ph ph-list';
        }
        if (headerBtn) {
            headerBtn.setAttribute('title', 'Open navigation menu');
            headerBtn.setAttribute('aria-label', 'Open navigation menu');
        }
    }
}

function toggleAside() {
    toggleSidebar();
}

function initAsideEvents() {
    // Restore desktop preference
    if (isDesktopSidebarView() && localStorage.getItem('primes_sidebar_collapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
    }
    updateSidebarUIState();

    if (closeAsideBtn) {
        closeAsideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isDesktopSidebarView()) {
                toggleSidebar();
            } else {
                closeSidebarMobile();
            }
        });
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebar();
        });
    }

    // Auto-close mobile drawer on link/widget click inside sidebar
    if (aside) {
        aside.querySelectorAll('a, .sidebar-user-widget, [onclick]').forEach((el) => {
            el.addEventListener('click', () => {
                if (!isDesktopSidebarView() && !el.closest('#close-btn')) {
                    closeSidebarMobile();
                }
            });
        });
    }

    // Escape key closes mobile sidebar drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !isDesktopSidebarView() && aside && aside.classList.contains('open')) {
            closeSidebarMobile();
        }
    });

    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            closeSidebarMobile();
        });
    }

    window.addEventListener('resize', () => {
        if (isDesktopSidebarView()) {
            closeSidebarMobile();
        }
        updateSidebarUIState();
    });
}

window.toggleSidebar = toggleSidebar;
window.closeSidebarMobile = closeSidebarMobile;

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

function renderDepositPresets() {
    const isUSD = getCurrency() === 'USD';
    const presetsContainer = document.getElementById('depositPresets');
    if (!presetsContainer) return;
    
    const amounts = isUSD ? [5, 10, 20, 50, 100] : [1000, 2500, 5000, 10000, 20000];
    const sym = isUSD ? '$' : '₦';
    const currentInputVal = parseFloat(document.getElementById('depositAmountInput')?.value) || 0;

    presetsContainer.innerHTML = amounts.map(amt => {
        const isActive = currentInputVal === amt ? ' active' : '';
        return `
            <button type="button" class="dep-preset-chip${isActive}" data-amt="${amt}" onclick="selectDepositPreset(${amt}, this)">
                +${sym}${amt.toLocaleString()}
            </button>
        `;
    }).join('');
}
window.renderDepositPresets = renderDepositPresets;

function selectDepositPreset(amt, btn) {
    const inp = document.getElementById('depositAmountInput');
    const errEl = document.getElementById('depositError');
    if (inp) {
        inp.value = amt;
        inp.focus();
    }
    if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
    }
    document.querySelectorAll('.dep-preset-chip').forEach(el => el.classList.remove('active'));
    if (btn) btn.classList.add('active');
}
window.selectDepositPreset = selectDepositPreset;

function openDepositModal() {
    const isNGN   = getCurrency() === 'NGN';
    const symbol  = isNGN ? '₦' : '$';
    const minAmt  = isNGN ? PAYSTACK_CONFIG.minAmountNGN : PAYSTACK_CONFIG.minAmountUSD;
    const symEl   = document.getElementById('depositSymbol');
    const minEl   = document.getElementById('depositMinLabel');
    const inp     = document.getElementById('depositAmountInput');
    const errEl   = document.getElementById('depositError');
    const badgeEl = document.getElementById('depositCurrBadge');
    if (symEl) symEl.textContent = symbol;
    if (minEl) minEl.textContent = symbol + minAmt.toLocaleString();
    if (badgeEl) badgeEl.textContent = `Currency: ${isNGN ? 'NGN (₦)' : 'USD ($)'}`;
    if (inp)   { inp.value = ''; inp.min = minAmt; inp.placeholder = `e.g. ${isNGN ? '2500' : '20'}`; }
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    renderDepositPresets();
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
                        
                        // Create in-app user notification
                        if (typeof createNotification === 'function') {
                            createNotification({
                                title: 'Wallet Funded',
                                message: `Your wallet was credited with ${symbol}${rawVal.toLocaleString()} (${curr}). Ref: ${response.reference || transactionRef}`,
                                type: 'wallet'
                            });
                        }

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
function dismissScreenLoader() {
    if (window.__loaderFailsafe) {
        clearTimeout(window.__loaderFailsafe);
        window.__loaderFailsafe = null;
    }
    const loaders = document.querySelectorAll('.loader-wrapper, #loaderWrapper');
    loaders.forEach(loader => {
        loader._dismissed = true;
        loader.classList.add('hidden');
        loader.style.transition = 'opacity 0.3s ease, visibility 0.3s ease';
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
        loader.style.pointerEvents = 'none';
        setTimeout(() => {
            try {
                loader.style.display = 'none';
                loader.setAttribute('aria-hidden', 'true');
            } catch (_) {}
        }, 350);
    });
}

window.dismissScreenLoader = dismissScreenLoader;
window.addEventListener('load', dismissScreenLoader);
document.addEventListener('DOMContentLoaded', () => { setTimeout(dismissScreenLoader, 300); });
setTimeout(dismissScreenLoader, 1800);

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
let isDashboardInitialized = false;

function init() {
    if (isDashboardInitialized) {
        dismissScreenLoader();
        return;
    }

    // 1. Auth guard — redirect immediately if no token
    if (!requireAuth()) {
        // Leave loader up during redirection to protect sensitive UI from flashing
        return;
    }

    try {
        isDashboardInitialized = true;

        restoreTheme();
        initPopupEvents();
        initScrollEvents();
        initAsideEvents();

        // 2. Render cached user info immediately (no flicker)
        renderUserInfo();

        // 2b. Sync currency symbol/label to whatever was last saved
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

        // 7. Multi-tab and cross-page synchronization
        window.addEventListener('storage', (e) => {
            if (e.key === 'currentOrderId' || e.key === 'primes_active_orders' || e.key === 'primes_active_count' || e.key === 'primes_order_update') {
                loadActiveNumbers().catch(() => {});
            }
        });

        // 8. Sync sound notification UI state
        if (window.NuraSound && typeof window.NuraSound.updateSoundUI === 'function') {
            window.NuraSound.updateSoundUI();
        }

        // 9. Periodically poll active orders to detect incoming OTP and trigger chime
        setInterval(() => {
            const count = parseInt(localStorage.getItem('primes_active_count') || '0', 10);
            const hasCurrent = !!localStorage.getItem('currentOrderId');
            if (count > 0 || hasCurrent) {
                loadActiveNumbers().catch(() => {});
            }
        }, 10000);

    } catch (err) {
        console.error('[Dashboard Init Error]', err);
    } finally {
        // ALWAYS dismiss the loader once the UI shell is initialized!
        dismissScreenLoader();
    }

    // 6. Load live data independently in background (individual catch blocks so no endpoint blocks another or the UI)
    loadWalletBalance().catch(e => console.warn('Wallet balance fetch warning:', e));
    loadVirtualAccount().catch(e => console.warn('Virtual account fetch warning:', e));
    loadTransactions(1).catch(e => console.warn('Transactions fetch warning:', e));
    loadActiveNumbers().catch(e => console.warn('Active numbers fetch warning:', e));
    if (typeof loadNotifications === 'function') {
        loadNotifications().catch(() => {});
    }
    if (typeof initDevicePushEngine === 'function') {
        initDevicePushEngine().catch(() => {});
    }
    if (typeof checkForAnnouncements === 'function') {
        try { checkForAnnouncements(); } catch (e) { console.warn('Announcement check warning:', e); }
    }
}

document.addEventListener('DOMContentLoaded', init);

/* ══════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════ */
let unreadCount = 0;

async function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;

    try {
        let notifs = [];
        if (typeof window.getNotifications === 'function') {
            const res = await window.getNotifications();
            if (res && Array.isArray(res.notifications)) notifs = res.notifications;
            else if (res && Array.isArray(res.data)) notifs = res.data;
            else if (Array.isArray(res)) notifs = res;
        } else {
            const storageKey = typeof getUserNotificationKey === 'function' ? getUserNotificationKey() : 'primes_notifications';
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(stored)) notifs = stored;
        }

        renderNotifications(notifs || []);
    } catch (_) {
        renderNotifications([]);
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
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); background: ${n.read ? 'transparent' : 'rgba(124, 58, 237, 0.05)'}; display:flex; gap: 12px; align-items: flex-start;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${n.read ? 'transparent' : 'var(--primary)'}; margin-top: 6px; flex-shrink: 0;"></div>
            <div style="flex: 1; min-width: 0;">
                <p style="font-size: 13px; font-weight: 700; color: var(--text); margin: 0 0 4px; word-break: break-word;">${escapeHTML(n.title || 'Notification')}</p>
                <p style="font-size: 12px; color: var(--muted); margin: 0 0 4px; line-height: 1.4; word-break: break-word;">${escapeHTML(n.message || '')}</p>
                <p style="font-size: 10px; color: var(--muted); margin: 0;">${new Date(n.createdAt || Date.now()).toLocaleString()}</p>
            </div>
        </div>
    `).join('');
}

async function markAllNotifRead() {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
    if (typeof window.markAllNotificationsRead === 'function') {
        try {
            await window.markAllNotificationsRead();
        } catch (_) {}
    }
    loadNotifications();
}

window.loadNotifications = loadNotifications;
window.markAllNotifRead = markAllNotifRead;

/* ══════════════════════════════════════════
   REAL DEVICE WEB PUSH NOTIFICATIONS ENGINE
   Seamless Webpushr / Browser Service Worker integration
   Supports background desktop & mobile push alerts
══════════════════════════════════════════ */
let swRegistration = null;

async function initDevicePushEngine() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
        updateDevicePushUIState('unsupported');
        return;
    }

    try {
        swRegistration = await navigator.serviceWorker.register('/webpushr-sw.js', { scope: '/' });
        console.log('[Push] Service worker registered successfully');
    } catch (swErr) {
        console.warn('[Push] Service worker registration notice:', swErr);
    }

    updateDevicePushUIState(Notification.permission);
}

function updateDevicePushUIState(status) {
    const perm = status || (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    
    const badgeDropdown = document.getElementById('pushPermissionBadge');
    const badgeSettings = document.getElementById('settingsPushStatusBadge');
    const btnDropdown   = document.getElementById('btnEnableDevicePush');
    const btnSettings   = document.getElementById('settingsPushBtn');

    const setBadge = (el, text, bg, color) => {
        if (!el) return;
        el.textContent = text;
        el.style.background = bg;
        el.style.color = color;
    };

    if (perm === 'granted') {
        setBadge(badgeDropdown, 'Active', 'rgba(16, 185, 129, 0.15)', '#10b981');
        setBadge(badgeSettings, 'Enabled', 'rgba(16, 185, 129, 0.15)', '#10b981');
        if (btnDropdown) {
            btnDropdown.disabled = true;
            btnDropdown.style.background = 'rgba(16, 185, 129, 0.15)';
            btnDropdown.style.color = '#10b981';
            btnDropdown.innerHTML = '<i class="ph ph-check-circle"></i><span>Notifications Active</span>';
        }
        if (btnSettings) {
            btnSettings.disabled = true;
            btnSettings.innerHTML = '<i class="ph ph-check"></i> Enabled';
            btnSettings.classList.remove('sbtn-primary');
            btnSettings.classList.add('sbtn-outline');
        }
    } else if (perm === 'denied') {
        setBadge(badgeDropdown, 'Blocked', 'rgba(239, 68, 68, 0.15)', '#ef4444');
        setBadge(badgeSettings, 'Blocked', 'rgba(239, 68, 68, 0.15)', '#ef4444');
        if (btnDropdown) {
            btnDropdown.disabled = false;
            btnDropdown.style.background = 'rgba(239, 68, 68, 0.1)';
            btnDropdown.style.color = '#ef4444';
            btnDropdown.innerHTML = '<i class="ph ph-warning-circle"></i><span>Permission Blocked in Browser</span>';
            btnDropdown.onclick = () => showToast('Notifications are blocked in your browser settings. Please enable them in site settings.', 'warning');
        }
        if (btnSettings) {
            btnSettings.disabled = false;
            btnSettings.innerHTML = '<i class="ph ph-lock"></i> Blocked';
            btnSettings.onclick = () => showToast('Notifications are blocked in your browser settings. Please enable them in site settings.', 'warning');
        }
    } else if (perm === 'unsupported') {
        setBadge(badgeDropdown, 'Not Supported', 'rgba(148, 163, 184, 0.15)', '#94a3b8');
        setBadge(badgeSettings, 'Not Supported', 'rgba(148, 163, 184, 0.15)', '#94a3b8');
        if (btnDropdown) btnDropdown.style.display = 'none';
        if (btnSettings) btnSettings.style.display = 'none';
    } else {
        setBadge(badgeDropdown, 'Not Enabled', 'rgba(124, 58, 237, 0.12)', 'var(--primary)');
        setBadge(badgeSettings, 'Action Needed', 'rgba(124, 58, 237, 0.12)', 'var(--primary)');
        if (btnDropdown) {
            btnDropdown.disabled = false;
            btnDropdown.style.background = 'var(--primary)';
            btnDropdown.style.color = '#fff';
            btnDropdown.innerHTML = '<i class="ph ph-device-mobile"></i><span>Enable Device Notifications</span>';
            btnDropdown.onclick = enableDeviceNotifications;
        }
        if (btnSettings) {
            btnSettings.disabled = false;
            btnSettings.innerHTML = '<i class="ph ph-bell"></i> Enable';
            btnSettings.onclick = enableDeviceNotifications;
        }
    }
}

async function enableDeviceNotifications(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    if (!('Notification' in window)) {
        showToast('Push notifications are not supported by this browser.', 'warning');
        return;
    }

    try {
        const result = await Notification.requestPermission();
        updateDevicePushUIState(result);

        if (result === 'granted') {
            showToast('✅ Real device notifications enabled successfully!', 'success');

            // Send welcoming confirmation notification to verify device pipeline
            sendNativeDeviceNotification({
                title: 'NuraXQ Notifications Active',
                message: 'You will now receive instant OTP codes and wallet deposit updates on this device.',
                tag: 'welcome'
            });

            // If Webpushr SDK is active, trigger subscription
            if (typeof window.webpushr === 'function') {
                try {
                    window.webpushr('subscribe', function(res) {
                        console.log('[Webpushr] User subscribed:', res);
                    });
                } catch (_) {}
            }
        } else if (result === 'denied') {
            showToast('Notification permission was blocked. Check browser address bar to allow.', 'warning');
        }
    } catch (err) {
        console.error('[Push] Error requesting permission:', err);
        showToast('Could not enable notifications: ' + (err.message || 'Permission error'), 'error');
    }
}

function sendNativeDeviceNotification(options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = options.title || 'NuraXQ Update';
    const body  = options.message || options.body || '';
    const icon  = options.icon || 'nuraxq-icon.png';
    const tag   = options.tag || ('nuraxq_' + Date.now());

    if (swRegistration && swRegistration.showNotification) {
        swRegistration.showNotification(title, {
            body: body,
            icon: icon,
            badge: icon,
            tag: tag,
            vibrate: [200, 100, 200],
            data: { url: options.url || window.location.href }
        }).catch(() => {
            try { new Notification(title, { body, icon, tag }); } catch (_) {}
        });
    } else {
        try { new Notification(title, { body, icon, tag }); } catch (_) {}
    }
}

window.enableDeviceNotifications = enableDeviceNotifications;
window.sendNativeDeviceNotification = sendNativeDeviceNotification;
window.updateDevicePushUIState = updateDevicePushUIState;

// Trigger device push on in-app notification creations
window.addEventListener('primes_notification_created', (e) => {
    if (e && e.detail && Notification.permission === 'granted') {
        const n = e.detail;
        sendNativeDeviceNotification({
            title: n.title || 'NuraXQ Notification',
            message: n.message || '',
            tag: n.id || 'notif'
        });
    }
});

/* ── Quick Service & Country Selection (Reference Layout) ── */
function selectQuickCountry(country) {
    const pillUSA = document.getElementById('dashPillUSA');
    const pillAll = document.getElementById('dashPillAll');
    if (country === 'USA') {
        pillUSA?.classList.add('active');
        pillAll?.classList.remove('active');
    } else {
        pillAll?.classList.add('active');
        pillUSA?.classList.remove('active');
    }
}

function handleQuickServiceSelect(val) {
    if (!val) return;
    const isUSA = document.getElementById('dashPillUSA')?.classList.contains('active');
    const countryParam = isUSA ? '&country=usa' : '';
    if (val === 'all') {
        window.location.href = 'buy.html?tab=products' + countryParam;
    } else {
        window.location.href = `buy.html?tab=products&service=${encodeURIComponent(val)}${countryParam}`;
    }
}

window.selectQuickCountry = selectQuickCountry;
window.handleQuickServiceSelect = handleQuickServiceSelect;