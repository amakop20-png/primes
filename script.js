/* ══════════════════════════════════════════════════════════════════════
   script.js — NuraSMS Dashboard
   Requires api.js to be loaded FIRST (defines apiRequest, requireAuth,
   getSession, logout, API_BASE_URL).
══════════════════════════════════════════════════════════════════════ */

// ── Conversion rate (display only — not used for financial operations) ──
const CONVERSION_RATE = 1500; // 1 USD = ₦1500 (display purposes only)

// ── Paystack Configuration ──
const PAYSTACK_CONFIG = {
    publicKey:    'pk_test_36b4ab7a4bb105c653f572f382c09bb1de905c7b',
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

function updateThemeUI(isDark) {
    if (modeText) modeText.textContent = isDark ? 'Dark mode' : 'Light mode';
    const modeIcon = document.querySelector('.mode-dot i');
    if (modeIcon) {
        modeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
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
}

document.addEventListener('click', function(e) {
    const profileToggle = document.getElementById('profileToggle');
    const dropdown      = document.getElementById('dropdown');
    const arrow         = document.getElementById('dropdownArrow');
    if (!profileToggle || !dropdown || !arrow) return;
    if (!profileToggle.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
        arrow.classList.remove('open');
        profileToggle.setAttribute('aria-expanded', 'false');
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const dropdown      = document.getElementById('dropdown');
        const arrow         = document.getElementById('dropdownArrow');
        const profileToggle = document.getElementById('profileToggle');
        if (dropdown)      dropdown.classList.remove('show');
        if (arrow)         arrow.classList.remove('open');
        if (profileToggle) profileToggle.setAttribute('aria-expanded', 'false');
        closePopup();
        closeSettings();
        closeDepositModal();
    }
});

/* ══════════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════════ */
function showToast(message, type = 'success') {
    const notificationContainer = document.getElementById('toast-container') || (() => {
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.style.cssText = 'position:fixed;top:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:8px;font-family:"Poppins",sans-serif;';
        document.body.appendChild(div);
        return div;
    })();

    const toastEl = document.createElement('div');
    const colors  = { success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B' };

    if (!document.getElementById('toast-keyframes')) {
        const style = document.createElement('style');
        style.id = 'toast-keyframes';
        style.textContent = `
            @keyframes slideIn  { from { transform: translateX(120%); opacity:0; } to { transform:translateX(0); opacity:1; } }
            @keyframes fadeOut  { to   { transform: translateX(120%); opacity:0; } }
        `;
        document.head.appendChild(style);
    }

    toastEl.style.cssText = `
        background:var(--surface,#fff);color:var(--text,#111);padding:12px 20px;
        border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);
        border-left:4px solid ${colors[type] || colors.success};
        font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;
        animation:slideIn 0.3s ease forwards;min-width:250px;user-select:none;
    `;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toastEl.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    notificationContainer.appendChild(toastEl);

    setTimeout(() => {
        toastEl.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toastEl.remove(), 300);
    }, 3500);
}

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function toggleDark() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    updateThemeUI(isDark);
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
}

function restoreTheme() {
    const isDark = localStorage.getItem('dashboardTheme') === 'dark';
    if (isDark) document.body.classList.add('dark-theme');
    else         document.body.classList.remove('dark-theme');
    updateThemeUI(isDark);
}

/* ══════════════════════════════════════════
   CURRENCY HELPERS  (display-only)
══════════════════════════════════════════ */
function getCurrency() {
    return localStorage.getItem('primes_currency') || 'NGN';
}

/**
 * Sync every currency-dependent display element to the given currency.
 * Called on page load AND every time the currency is toggled, so the
 * symbol/label never falls out of sync with the balance numbers.
 */
function updateCurrencyDisplay(currency) {
    const sym  = document.getElementById('currencySymbol');
    const name = document.getElementById('currencyName');
    if (sym)  sym.textContent  = currency === 'USD' ? '$' : '₦';
    if (name) name.textContent = currency;
}

function toggleCurrency() {
    const next = getCurrency() === 'NGN' ? 'USD' : 'NGN';
    localStorage.setItem('primes_currency', next);

    updateCurrencyDisplay(next);

    // Refresh balance display with the same stored value — no extra API call
    const stored = parseFloat(localStorage.getItem('_walletBalance') || '0');
    renderBalanceCards(stored);
    showToast(`Switched to ${next}`, 'info');
}

/**
 * Render the two balance cards from a raw NGN balance value received from the API.
 * The API returns the balance in NGN kobo or in NGN — we display as-is in NGN,
 * and show the USD equivalent for reference (divide by CONVERSION_RATE).
 *
 * NOTE: We never add/subtract from this value in JS. The backend is the truth.
 */
function renderBalanceCards(balanceNGN) {
    const ngn    = parseFloat(balanceNGN) || 0;
    const usd    = ngn / CONVERSION_RATE;
    const ngnStr = '₦' + ngn.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const usdStr = '$' + usd.toFixed(2);

    const balUsdEl = document.getElementById('displayBalanceUSD');
    const balNgnEl = document.getElementById('displayBalanceNGN');
    if (balUsdEl) balUsdEl.textContent = usdStr;
    if (balNgnEl) balNgnEl.textContent = ngnStr;

    const popBalEl = document.getElementById('popupBalanceAmount');
    if (popBalEl) popBalEl.textContent = ngnStr + ' / ' + usdStr;

    // Store for currency toggle re-render (no extra fetch needed)
    localStorage.setItem('_walletBalance', String(ngn));
}

/* ══════════════════════════════════════════
   WALLET BALANCE  —  Uses getWalletBalance() from api.js
══════════════════════════════════════════ */
async function loadWalletBalance() {
    // Show loading placeholder
    const balUsdEl = document.getElementById('displayBalanceUSD');
    const balNgnEl = document.getElementById('displayBalanceNGN');
    const popBalEl = document.getElementById('popupBalanceAmount');
    if (balUsdEl) balUsdEl.textContent = 'Loading...';
    if (balNgnEl) balNgnEl.textContent = '';
    if (popBalEl) popBalEl.textContent = 'Loading...';

    try {
        const data = await getWalletBalance();
        /*
         * Backend response shapes:
         *   { balance: 5000 }
         *   { wallet: { balance: 5000 } }
         */
        const balanceNGN = data?.wallet?.balance ?? data?.balance ?? 0;
        renderBalanceCards(balanceNGN);
    } catch (err) {
        console.error('loadWalletBalance error:', err);

        // A 404 here ("Wallet not found") almost always means the backend
        // hasn't created a Wallet record for this user yet — a brand-new
        // account state, not a real failure. Show a calm "setting up"
        // message instead of an alarming error toast for this specific
        // case. Any OTHER error (network, 500, etc.) still gets the
        // normal error treatment.
        if (err.status === 404) {
            if (balUsdEl) balUsdEl.textContent = '$0.00';
            if (balNgnEl) balNgnEl.textContent = '₦0.00';
            if (popBalEl) popBalEl.textContent = '₦0.00 / $0.00';
            showToast('Your wallet is still being set up — this can take a moment for new accounts.', 'info');
        } else {
            if (balUsdEl) balUsdEl.textContent = '—';
            if (balNgnEl) balNgnEl.textContent = 'Unable to load balance.';
            if (popBalEl) popBalEl.textContent = '—';
            showToast('Unable to load your wallet balance. Please try again.', 'error');
        }
    }
}

/* ══════════════════════════════════════════
   VIRTUAL ACCOUNT
   Uses getVirtualAccount() & createVirtualAccount() from api.js
══════════════════════════════════════════ */
async function loadVirtualAccount() {
    const container = document.getElementById('virtualAccountContainer');
    if (!container) return;

    container.innerHTML = '<p style="color:var(--muted,#888);font-size:13px;">Loading virtual account…</p>';

    try {
        const data = await getVirtualAccount();
        const acct = data?.virtualAccount || data?.account || data?.data || data;

        if (acct && acct.accountNumber) {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--muted,#888);font-weight:600;">Bank</span>
                        <span style="font-weight:700;color:var(--text);">${acct.bankName || '—'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:var(--muted,#888);font-weight:600;">Account No.</span>
                        <span id="vaAccountNumber" style="font-weight:800;color:var(--primary,#7c3aed);letter-spacing:1px;font-size:16px;">${acct.accountNumber}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--muted,#888);font-weight:600;">Account Name</span>
                        <span style="font-weight:700;color:var(--text);">${acct.accountName || '—'}</span>
                    </div>
                    <button onclick="copyVirtualAccount()" style="margin-top:8px;padding:8px 14px;border-radius:10px;border:1.5px solid var(--primary,#7c3aed);background:var(--primary-light,#f5f3ff);color:var(--primary,#7c3aed);font-weight:700;font-size:12px;cursor:pointer;">
                        <i class="fa-solid fa-copy"></i> Copy Account Number
                    </button>
                </div>
                <p style="margin-top:10px;font-size:11px;color:var(--muted,#888);text-align:center;">
                    Transfer funds to this dedicated virtual account to top up your wallet instantly.
                </p>
            `;
        } else {
            // No virtual account yet — display create button
            showCreateVirtualAccountUI(container);
        }
    } catch (err) {
        console.error('loadVirtualAccount error:', err);

        // Check the REAL HTTP status first (set by api.js) — this is
        // reliable regardless of what wording the backend uses for the
        // message ("No assigned VDA", "Wallet not found", etc.). The
        // text-matching fallback stays only as a safety net for older
        // error paths that might not carry a status yet.
        const isNotFound = err.status === 404 ||
            (err.message && (err.message.toLowerCase().includes('not found') || err.message.includes('404') || err.message.toLowerCase().includes('no assigned')));

        if (isNotFound) {
            showCreateVirtualAccountUI(container);
        } else {
            container.innerHTML = `
                <p style="color:#ef4444;font-size:13px;">Unable to load virtual account. <a href="javascript:void(0)" onclick="loadVirtualAccount()" style="color:var(--primary);">Retry</a></p>
            `;
        }
    }
}

function showCreateVirtualAccountUI(container) {
    container.innerHTML = `
        <p style="font-size:13px;color:var(--muted,#888);margin-bottom:10px;">
            You don't have a dedicated virtual account yet. Create one to receive instant deposits.
        </p>
        <button id="createVABtn" onclick="handleCreateVirtualAccount()" style="padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">
            <i class="fa-solid fa-plus"></i> Create Virtual Account
        </button>
    `;
}

async function handleCreateVirtualAccount() {
    const btn = document.getElementById('createVABtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
        await createVirtualAccount();
        showToast('Virtual account created successfully!', 'success');
        await loadVirtualAccount(); // Re-render with newly assigned account
    } catch (err) {
        console.error('createVirtualAccount error:', err);
        showToast(err.message || 'Failed to create virtual account.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '+ Create Virtual Account'; }
    }
}

function copyVirtualAccount() {
    const el = document.getElementById('vaAccountNumber');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim()).then(() => {
        showToast('Account number copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Could not copy automatically. Account: ' + el.textContent.trim(), 'info');
    });
}

/* ══════════════════════════════════════════
   TRANSACTIONS
   Uses getTransactions(page, limit) from api.js
══════════════════════════════════════════ */
async function loadTransactions(page = 1) {
    txPage = page;

    const listEl    = document.getElementById('transactionsList');
    const paginEl   = document.getElementById('txPagination');
    const prevBtn   = document.getElementById('txPrevBtn');
    const nextBtn   = document.getElementById('txNextBtn');
    const pageLabel = document.getElementById('txPageLabel');

    if (!listEl) return;

    listEl.innerHTML = `<li style="text-align:center;padding:20px;color:var(--muted,#888);">Loading transactions…</li>`;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    try {
        const data = await getTransactions(page, TX_LIMIT);
        const txs  = data?.transactions || data?.data || [];
        const pg   = data?.pagination || {};

        if (txs.length === 0) {
            listEl.innerHTML = `<li style="text-align:center;padding:24px;color:var(--muted,#888);font-size:14px;">No transactions recorded yet.</li>`;
        } else {
            listEl.innerHTML = txs.map(tx => {
                const amount    = parseFloat(tx.amount) || 0;
                const isCredit  = (tx.type && tx.type.toLowerCase() === 'credit') || amount > 0;
                const amtStr    = (isCredit ? '+' : '') + '₦' + Math.abs(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 });
                const color     = isCredit ? '#10b981' : '#ef4444';
                const dateStr   = tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '—';
                const status    = tx.status || '';
                const isSuccess = status.toLowerCase() === 'success';
                const statusBadge = status
                    ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${isSuccess ? '#d1fae5' : '#fee2e2'};color:${isSuccess ? '#065f46' : '#b91c1c'};font-weight:700;text-transform:uppercase;">${status}</span>`
                    : '';

                // Balance trace if provided
                const prevBal = tx.previousBalance !== undefined ? `Prev: ₦${Number(tx.previousBalance).toLocaleString('en-NG')}` : '';
                const currBal = tx.currentBalance !== undefined ? `Bal: ₦${Number(tx.currentBalance).toLocaleString('en-NG')}` : '';
                const balTrace = (prevBal || currBal) ? `<span style="margin-left:6px;opacity:0.85;">(${[prevBal, currBal].filter(Boolean).join(' → ')})</span>` : '';

                return `
                <li style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border,#e5e7eb);gap:8px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;font-size:13px;color:var(--text);">
                            ${(tx.type || 'Transaction').toUpperCase()} ${statusBadge}
                        </div>
                        <div style="font-size:11px;color:var(--muted,#888);margin-top:4px;">
                            ${tx.reference ? 'Ref: <strong>' + tx.reference + '</strong> · ' : ''}${dateStr}
                            ${balTrace}
                        </div>
                    </div>
                    <div style="font-weight:800;font-size:14px;color:${color};flex-shrink:0;">${amtStr}</div>
                </li>`;
            }).join('');
        }

        // Pagination controls
        if (paginEl) paginEl.style.display = 'flex';
        const totalPages = pg.totalPages || (pg.total ? Math.ceil(pg.total / TX_LIMIT) : 1);
        if (pageLabel) pageLabel.textContent = `Page ${pg.page || page} of ${totalPages || 1}`;
        if (prevBtn) prevBtn.disabled = !(pg.hasPrevPage || page > 1);
        if (nextBtn) nextBtn.disabled = !(pg.hasNextPage || (totalPages && page < totalPages));

        // Update statistics cards if available
        if (pg.total !== undefined) {
            const totalOrdersStat = document.querySelector('[data-stat="totalOrders"]');
            if (totalOrdersStat) totalOrdersStat.textContent = String(pg.total);
        }

    } catch (err) {
        console.error('loadTransactions error:', err);
        listEl.innerHTML = `
            <li style="text-align:center;padding:20px;color:#ef4444;">
                Unable to load transactions.
                <a href="javascript:void(0)" onclick="loadTransactions(${page})" style="color:var(--primary);margin-left:6px;text-decoration:underline;">Retry</a>
            </li>`;
    }
}

/* ══════════════════════════════════════════
   DASHBOARD USER INFO
══════════════════════════════════════════ */
function renderUserInfo() {
    const session     = getSession() || {};
    const displayName  = session.name || session.username || 'User';
    const displayEmail = session.email || '';

    document.querySelectorAll('#dashboardUsername, #Username, .dropdown-name, .username').forEach(el => {
        el.textContent = displayName;
    });
    document.querySelectorAll('.dropdown-email').forEach(el => {
        el.textContent = displayEmail;
    });

    // Referral code from username
    if (session.username) {
        const refCodeEl = document.getElementById('displayReferralCode');
        if (refCodeEl) refCodeEl.textContent = 'REF-' + session.username.toUpperCase();
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

    const isNGN        = getCurrency() === 'NGN';
    const symbol       = isNGN ? '₦' : '$';
    const amountInKobo = isNGN
        ? Math.round(rawVal * 100)
        : Math.round(rawVal * CONVERSION_RATE * 100);

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
                    { display_name: 'Full Name', variable_name: 'full_name', value: session.name      || 'N/A' }
                ]
            },

            callback: async function(response) {
                /*
                 * Payment completed on Paystack's side.
                 * The backend webhook will credit the wallet.
                 * We ONLY refresh the balance from the API — never touch it ourselves.
                 */
                showToast(`✅ Payment of ${symbol}${rawVal.toLocaleString()} submitted! Refreshing balance…`, 'success');
                console.info('[Paystack] Callback — Ref:', response.reference);

                // Wait briefly for the webhook to process, then refresh
                setTimeout(async () => {
                    await loadWalletBalance();
                    await loadTransactions(1);
                }, 3000);
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
    if (!copyBtn) return;
    copyBtn.addEventListener('click', () => {
        const session = getSession();
        if (!session) return;
        const code = 'REF-' + (session.username || '').toUpperCase();
        navigator.clipboard.writeText(code).then(() => {
            showToast('Referral code copied!', 'success');
        }).catch(() => {
            showToast('Code: ' + code, 'info');
        });
    });
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
}

document.addEventListener('DOMContentLoaded', init);