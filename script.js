const popupBalance = document.getElementById('popup_balance');
const openPopupBtn = document.getElementById('openPopup');
const closePopupBtn = document.getElementById('closePopup');
const scrollTopBtn = document.getElementById('scrollTopBtn');
const aside = document.getElementById('aside');
const closeAsideBtn = document.getElementById('close-btn');
const toggleBtn = document.getElementById('toggle-btn');
const modeText = document.getElementById('modeText');

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
    if (modeText) {
        modeText.textContent = isDark ? 'Dark mode' : 'Light mode';
    }
    const modeIcon = document.querySelector('.mode-dot i');
    if (modeIcon) {
        if (isDark) {
            modeIcon.className = 'fa-solid fa-sun';
        } else {
            modeIcon.className = 'fa-solid fa-moon';
        }
    }
}

function toggleDark() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    updateThemeUI(isDark);
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
}

function restoreTheme() {
    const storedTheme = localStorage.getItem('dashboardTheme');
    const isDark = storedTheme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    updateThemeUI(isDark);
}

function handleScroll() {
    if (!scrollTopBtn) return;
    const show = window.scrollY > 240;
    scrollTopBtn.style.opacity = show ? '1' : '0';
    scrollTopBtn.style.pointerEvents = show ? 'auto' : 'none';
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleAside() {
    if (!aside) return;
    aside.classList.toggle('open');
}

function initPopupEvents() {
    if (openPopupBtn) openPopupBtn.addEventListener('click', openPopup);
    if (closePopupBtn) closePopupBtn.addEventListener('click', closePopup);
    if (popupBalance) {
        popupBalance.addEventListener('click', event => {
            if (event.target === popupBalance) {
                closePopup();
            }
        });
    }

    // Support ?open=wallet query parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'wallet') {
        setTimeout(openPopup, 100);
    }

    // Bind sidebar Wallet click
    const sidebarWalletBtn = document.getElementById('sidebarWalletBtn');
    if (sidebarWalletBtn) {
        sidebarWalletBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openPopup();
        });
    }

    // Bind sidebar Settings click
    const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
    if (sidebarSettingsBtn) {
        sidebarSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });
    }
}

/* ══════════════════════════════════════
   SETTINGS PANEL
══════════════════════════════════════ */
function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;

    // Pre-fill profile fields from session
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const nameEl  = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const phoneEl = document.getElementById('settingsPhone');
    if (nameEl && session.name)   nameEl.value  = session.name;
    if (emailEl && session.email) emailEl.value = session.email;
    if (phoneEl && session.phone) phoneEl.value = session.phone;

    // Pre-fill preferences
    const currEl = document.getElementById('settingsCurrency');
    if (currEl) currEl.value = localStorage.getItem('preferredCurrency') || 'NGN';
    const langEl = document.getElementById('settingsLanguage');
    if (langEl) langEl.value = localStorage.getItem('preferredLanguage') || 'en';

    // Highlight current theme
    updateSettingsThemeBtns();

    // Pre-fill notifications
    const notifSettings = JSON.parse(localStorage.getItem('notifSettings') || '{}');
    const n = (id, def) => { const el = document.getElementById(id); if (el) el.checked = notifSettings[id] !== undefined ? notifSettings[id] : def; };
    n('notifOtp', true); n('notifOrder', true); n('notifBalance', true); n('notifPromo', false);

    // Password strength watcher
    const newPwEl = document.getElementById('settingsNewPw');
    if (newPwEl && !newPwEl._strengthWired) {
        newPwEl.addEventListener('input', () => checkPasswordStrength(newPwEl.value));
        newPwEl._strengthWired = true;
    }

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Tab switching
    document.querySelectorAll('.stab').forEach(btn => {
        if (!btn._settingsWired) {
            btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
            btn._settingsWired = true;
        }
    });

    // Close button
    const closeBtn = document.getElementById('settingsCloseBtn');
    if (closeBtn && !closeBtn._wired) {
        closeBtn.addEventListener('click', closeSettings);
        closeBtn._wired = true;
    }

    // Click outside to close
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
    const activeBtn = document.querySelector(`.stab[data-tab="${tab}"]`);
    const activeContent = document.getElementById(`stab-${tab}`);
    if (activeBtn)     activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
}

function saveProfileSettings() {
    const name  = document.getElementById('settingsDisplayName')?.value.trim();
    const email = document.getElementById('settingsEmail')?.value.trim();
    const phone = document.getElementById('settingsPhone')?.value.trim();

    if (!name) { showToast('Please enter your display name.', 'error'); return; }

    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    session.name  = name;
    if (email) session.email = email;
    if (phone) session.phone = phone;
    localStorage.setItem('primes_session', JSON.stringify(session));

    // Update visible username in header
    const usernameEl = document.getElementById('buyUsername') || document.getElementById('profileName');
    if (usernameEl) usernameEl.textContent = name;

    showToast('✅ Profile updated successfully!', 'success');
}

function savePasswordSettings() {
    const oldPw  = document.getElementById('settingsOldPw')?.value;
    const newPw  = document.getElementById('settingsNewPw')?.value;
    const confPw = document.getElementById('settingsConfirmPw')?.value;

    if (!oldPw || !newPw || !confPw) { showToast('Please fill in all password fields.', 'error'); return; }
    if (newPw.length < 8)            { showToast('New password must be at least 8 characters.', 'error'); return; }
    if (newPw !== confPw)            { showToast('Passwords do not match.', 'error'); return; }

    // In a real app this would call your backend. For now we confirm & clear.
    showToast('🔒 Password updated successfully!', 'success');
    document.getElementById('settingsOldPw').value  = '';
    document.getElementById('settingsNewPw').value  = '';
    document.getElementById('settingsConfirmPw').value = '';
    document.getElementById('pwStrengthBar').style.display = 'none';
    document.getElementById('pwStrengthText').textContent = '';
}

function checkPasswordStrength(pw) {
    const bar  = document.getElementById('pwStrengthBar');
    const fill = document.getElementById('pwStrengthFill');
    const text = document.getElementById('pwStrengthText');
    if (!bar || !fill || !text) return;

    bar.style.display = 'block';
    let score = 0;
    if (pw.length >= 8)              score++;
    if (/[A-Z]/.test(pw))            score++;
    if (/[0-9]/.test(pw))            score++;
    if (/[^A-Za-z0-9]/.test(pw))     score++;

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
    if (currency) localStorage.setItem('preferredCurrency', currency);
    if (language) localStorage.setItem('preferredLanguage', language);

    // Sync currency switch in buy page
    if (currency === 'USD') {
        const sym  = document.getElementById('currencySymbol');
        const name = document.getElementById('currencyName');
        if (sym)  sym.textContent  = '$';
        if (name) name.textContent = 'USD';
        localStorage.setItem('buyPageCurrency', 'USD');
    } else {
        const sym  = document.getElementById('currencySymbol');
        const name = document.getElementById('currencyName');
        if (sym)  sym.textContent  = '₦';
        if (name) name.textContent = 'NGN';
        localStorage.setItem('buyPageCurrency', 'NGN');
    }

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
    const isDark = document.body.classList.contains('dark-theme');
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
        // Also update header profile image
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



function initScrollEvents() {
    if (!scrollTopBtn) return;
    scrollTopBtn.addEventListener('click', scrollToTop);
    window.addEventListener('scroll', handleScroll);
    handleScroll();
}

function initAsideEvents() {
    if (closeAsideBtn) closeAsideBtn.addEventListener('click', () => {
        aside.classList.remove('open');
    });
    if (toggleBtn) toggleBtn.addEventListener('click', toggleAside);
}

function init() {
    restoreTheme();
    initPopupEvents();
    initScrollEvents();
    initAsideEvents();
    initDashboard();
}

document.addEventListener('DOMContentLoaded', init);

// ======================================
// ACCOUNT & DASHBOARD OPERATIONS
// ======================================
const CONVERSION_RATE = 1500; // 1 USD = ₦1,500

function showToast(message, type = 'success') {
    const notificationContainer = document.getElementById('toast-container') || (() => {
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.style.cssText = 'position: fixed; top: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; font-family: "Poppins", sans-serif;';
        document.body.appendChild(div);
        return div;
    })();
    
    const toast = document.createElement('div');
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#3B82F6'
    };
    
    // Add keyframes inline style if not already added
    if (!document.getElementById('toast-keyframes')) {
        const style = document.createElement('style');
        style.id = 'toast-keyframes';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                to { transform: translateX(120%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    toast.style.cssText = `
        background: var(--surface);
        color: var(--text);
        padding: 12px 20px;
        border-radius: 10px;
        box-shadow: var(--shadow-lg);
        border-left: 4px solid ${colors[type] || colors.success};
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease forwards;
        min-width: 250px;
        user-select: none;
    `;
    
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;
    notificationContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getLiveUser() {
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    if (!session || !session.username) return null;
    const users = JSON.parse(localStorage.getItem('primes_users') || '[]');
    let user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());

    // ── Auto-create record for users who registered before the fix ──
    if (!user) {
        user = {
            username:        session.username,
            email:           session.email || '',
            name:            session.name  || session.username,
            role:            session.role  || 'user',
            balance:         0.00,
            totalRecharge:   0.00,
            referralBalance: 0.00,
            referralCount:   0,
            numbersPurchased:0,
            referrals:       [],
            transactions:    [],
            createdAt:       new Date().toISOString()
        };
        users.push(user);
        localStorage.setItem('primes_users', JSON.stringify(users));
    }

    // ── Ensure all fields exist (migration guard) ──
    let changed = false;
    if (user.balance === undefined)          { user.balance = 0.00; changed = true; }
    if (user.referralBalance === undefined)  { user.referralBalance = 0.00; changed = true; }
    if (user.referralCount === undefined)    { user.referralCount = 0; changed = true; }
    if (user.referrals === undefined)        { user.referrals = []; changed = true; }
    if (user.transactions === undefined)     { user.transactions = []; changed = true; }
    if (user.numbersPurchased === undefined) { user.numbersPurchased = 0; changed = true; }
    if (user.totalRecharge === undefined)    { user.totalRecharge = 0.00; changed = true; }

    if (changed) {
        const index = users.findIndex(u => u.username.toLowerCase() === user.username.toLowerCase());
        users[index] = user;
        localStorage.setItem('primes_users', JSON.stringify(users));
    }
    return user;
}

function saveLiveUser(updatedUser) {
    const users = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const index = users.findIndex(u => u.username.toLowerCase() === updatedUser.username.toLowerCase());
    if (index !== -1) {
        users[index] = updatedUser;
        localStorage.setItem('primes_users', JSON.stringify(users));
    }
}

function getCurrency() {
    return localStorage.getItem('primes_currency') || 'USD';
}

function toggleCurrency() {
    const nextCurrency = getCurrency() === 'USD' ? 'NGN' : 'USD';
    localStorage.setItem('primes_currency', nextCurrency);
    renderDashboard();
    showToast(`Switched currency to ${nextCurrency}`, 'info');
}

function formatCurrency(val) {
    const p = parseFloat(val) || 0;
    const naira = p * CONVERSION_RATE;
    const usdStr = '$' + p.toFixed(2);
    const nairaStr = '₦' + naira.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    const currency = getCurrency();
    if (currency === 'USD') {
        return `${usdStr} (${nairaStr})`;
    } else {
        return `${nairaStr} (${usdStr})`;
    }
}

function renderDashboard() {
    const user = getLiveUser();
    if (!user) return;

    const currency = getCurrency();
    
    // Update Currency Switcher Labels
    const symbolEl = document.getElementById('currencySymbol');
    const nameEl = document.getElementById('currencyName');
    if (symbolEl) symbolEl.textContent = currency === 'USD' ? '$' : '₦';
    if (nameEl) nameEl.textContent = currency;

    // Main Balance Displays
    const balanceEl = document.getElementById('displayBalance');
    if (balanceEl) balanceEl.textContent = formatCurrency(user.balance);

    const refBalEl = document.getElementById('displayReferralBalance');
    if (refBalEl) refBalEl.textContent = formatCurrency(user.referralBalance);

    const refCodeEl = document.getElementById('displayReferralCode');
    if (refCodeEl) refCodeEl.textContent = 'REF-' + user.username.toUpperCase();

    // Popup Overview Stats
    const popBalEl = document.getElementById('popupBalanceAmount');
    if (popBalEl) popBalEl.textContent = formatCurrency(user.balance);

    const popPurchasedEl = document.getElementById('popupNumbersPurchased');
    if (popPurchasedEl) popPurchasedEl.textContent = user.numbersPurchased;

    const popRechargeEl = document.getElementById('popupTotalRecharge');
    if (popRechargeEl) popRechargeEl.textContent = formatCurrency(user.totalRecharge);

    // Render Transactions List
    const listEl = document.getElementById('transactionsList');
    if (listEl) {
        if (!user.transactions || user.transactions.length === 0) {
            listEl.innerHTML = `<li style="justify-content: center; color: var(--muted);">No transactions yet.</li>`;
        } else {
            listEl.innerHTML = user.transactions.map(tx => {
                const isPositive = tx.amount >= 0;
                const sign = isPositive ? '+' : '-';
                const colorClass = isPositive ? 'positive' : 'negative';
                return `
                    <li>
                        <span class="transaction-type">
                            ${tx.type === 'Recharge' ? '🔌' : tx.type === 'Purchase' ? '🛒' : '🎁'} 
                            ${tx.description}
                        </span>
                        <span class="transaction-amount ${colorClass}">${sign} ${formatCurrency(Math.abs(tx.amount))}</span>
                    </li>
                `;
            }).join('');
        }
    }
}
// ── Paystack Configuration ──
const PAYSTACK_CONFIG = {
    publicKey:   'pk_live_3ca1325fab85ff43b8f4232cbf01cd76077a021c',
    minAmountNGN: 100,   // ₦100 minimum
    minAmountUSD: 1,     // $1 minimum
};

// ── Dynamically load Paystack SDK if not present ──
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

// ── Open the styled deposit modal ──
function openDepositModal() {
    const currency = getCurrency();
    const isNGN    = currency === 'NGN';
    const symbol   = isNGN ? '₦' : '$';
    const minAmt   = isNGN ? PAYSTACK_CONFIG.minAmountNGN : PAYSTACK_CONFIG.minAmountUSD;

    // Update modal labels
    const symEl = document.getElementById('depositSymbol');
    const minEl = document.getElementById('depositMinLabel');
    const inp   = document.getElementById('depositAmountInput');
    const errEl = document.getElementById('depositError');
    if (symEl) symEl.textContent = symbol;
    if (minEl) minEl.textContent = symbol + minAmt.toLocaleString();
    if (inp)   { inp.value = ''; inp.min = minAmt; inp.placeholder = `e.g. ${isNGN ? '1000' : '10'}`; }
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    // Show modal as flex
    const modal = document.getElementById('depositModal');
    if (modal) { modal.style.display = 'flex'; setTimeout(() => inp && inp.focus(), 100); }
}

function closeDepositModal() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
}

// ── Launch Paystack after user enters amount ──
async function launchPaystack(rawVal) {
    const user = getLiveUser();
    if (!user) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    const currency = getCurrency();
    const isNGN   = currency === 'NGN';
    const symbol  = isNGN ? '₦' : '$';

    // Amount in kobo (Paystack always expects NGN kobo)
    const amountInKobo = isNGN
        ? Math.round(rawVal * 100)
        : Math.round(rawVal * CONVERSION_RATE * 100);

    const transactionRef = 'DAVE-' + Date.now() + '-' + Math.random()
        .toString(36).substr(2, 6).toUpperCase();

    const handler = PaystackPop.setup({
        key:      PAYSTACK_CONFIG.publicKey,
        email:    user.email || (user.username + '@davessocial.com'),
        amount:   amountInKobo,
        currency: 'NGN',
        ref:      transactionRef,
        channels: ['card', 'bank_transfer', 'ussd', 'bank'],
        label:    user.name || user.username,

        metadata: {
            custom_fields: [
                { display_name: 'Username',  variable_name: 'username',  value: user.username || 'N/A' },
                { display_name: 'Full Name', variable_name: 'full_name', value: user.name      || 'N/A' }
            ]
        },

        callback: function(response) {
            const addedUSD = isNGN ? rawVal / CONVERSION_RATE : rawVal;

            user.balance       = (user.balance       || 0) + addedUSD;
            user.totalRecharge = (user.totalRecharge || 0) + addedUSD;
            user.transactions  = user.transactions   || [];

            user.transactions.unshift({
                id:          transactionRef,
                type:        'Recharge',
                amount:      addedUSD,
                description: `Deposited ${symbol}${rawVal.toLocaleString()} via Paystack`,
                ref:         response.reference,
                status:      'success',
                timestamp:   new Date().toISOString()
            });

            saveLiveUser(user);
            renderDashboard();
            showToast(`✅ ${symbol}${rawVal.toLocaleString()} added to your balance!`, 'success');
            console.info('[Paystack] Verified — Ref:', response.reference);
        },

        onClose: function() {
            showToast('Payment window closed. Your balance was not changed.', 'info');
        }
    });

    handler.openIframe();
}

// ── Add Funds button handler ──
async function handleAddFunds() {
    // Ensure Paystack SDK is loaded
    try {
        await loadPaystackSDK();
    } catch (e) {
        showToast('Payment system could not load. Check your internet connection.', 'error');
        return;
    }

    // Check session
    if (!getLiveUser()) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    openDepositModal();
}

// ── Wire up modal confirm/close ──
document.addEventListener('DOMContentLoaded', function() {
    const confirmBtn  = document.getElementById('depositConfirmBtn');
    const closeBtn    = document.getElementById('depositModalClose');
    const modalEl     = document.getElementById('depositModal');
    const amountInput = document.getElementById('depositAmountInput');
    const errEl       = document.getElementById('depositError');

    function showDepositError(msg) {
        if (!errEl) return;
        errEl.textContent    = msg;
        errEl.style.display  = 'block';
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
            const currency = getCurrency();
            const isNGN   = currency === 'NGN';
            const symbol  = isNGN ? '₦' : '$';
            const minAmt  = isNGN ? PAYSTACK_CONFIG.minAmountNGN : PAYSTACK_CONFIG.minAmountUSD;

            const rawVal = parseFloat((amountInput?.value || '').replace(/[^0-9.]/g, ''));

            if (isNaN(rawVal) || rawVal <= 0) {
                showDepositError('Please enter a valid amount.');
                return;
            }
            if (rawVal < minAmt) {
                showDepositError(`Minimum deposit is ${symbol}${minAmt}.`);
                return;
            }

            closeDepositModal();
            await launchPaystack(rawVal);
        });
    }

    // Allow pressing Enter in the input field
    if (amountInput) {
        amountInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') confirmBtn && confirmBtn.click();
        });
    }

    if (closeBtn)  closeBtn.addEventListener('click',  closeDepositModal);

    // Close modal by clicking the backdrop
    if (modalEl) {
        modalEl.addEventListener('click', function(e) {
            if (e.target === modalEl) closeDepositModal();
        });
    }
});



function handleReferralSimulation() {
    const friendName = prompt("Enter referred friend's full name to simulate a signup:");
    if (friendName === null) return;
    const trimmed = friendName.trim();
    if (!trimmed) {
        showToast("Friend name cannot be empty.", "error");
        return;
    }

    const user = getLiveUser();
    if (!user) return;

    const dummyUsername = 'friend_' + Math.floor(1000 + Math.random() * 9000);
    user.balance += 0.50;
    user.referralBalance += 0.50;
    user.referralCount += 1;
    user.referrals.push(dummyUsername);
    user.transactions.unshift({
        id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        type: 'Referral Reward',
        amount: 0.50,
        description: 'Referral signup: ' + trimmed + ' (@' + dummyUsername + ')',
        timestamp: new Date().toISOString()
    });

    saveLiveUser(user);
    renderDashboard();
    showToast(`Simulated signup successful! Earned ${formatCurrency(0.50)} referral reward!`, "success");
}

function initDashboard() {
    renderDashboard();

    // Hook Currency Switch
    const switchEl = document.getElementById('currencySwitch');
    if (switchEl) switchEl.addEventListener('click', toggleCurrency);

    // Hook Add Funds Buttons
    const addBtn = document.getElementById('addFundsBtn');
    if (addBtn) addBtn.addEventListener('click', handleAddFunds);

    const popAddBtn = document.getElementById('popupAddFundsBtn');
    if (popAddBtn) popAddBtn.addEventListener('click', handleAddFunds);

    // Hook Refer & Earn Simulation Card
    const refEarnBtn = document.getElementById('btnReferAndEarn');
    if (refEarnBtn) refEarnBtn.addEventListener('click', handleReferralSimulation);

    // Hook Copy Referral Code
    const copyBtn = document.getElementById('btnCopyReferral');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const user = getLiveUser();
            if (user) {
                const code = 'REF-' + user.username.toUpperCase();
                navigator.clipboard.writeText(code).then(() => {
                    showToast("Referral code copied to clipboard!", "success");
                }).catch(err => {
                    console.error("Clipboard copy failed", err);
                    showToast("Could not copy automatically. Code is: " + code, "info");
                });
            }
        });
    }
}
/* =========================
   REMOVE LOADER
========================= */
window.addEventListener("load", function () {
  const loader = document.querySelector(".loader-wrapper");
  if (!loader) return;
  loader.style.transition = "opacity 0.5s ease";
  loader.style.opacity = "0";
  setTimeout(function () {
    loader.style.display = "none";
  }, 500);
});