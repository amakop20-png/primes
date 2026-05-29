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
    if (user) {
        let changed = false;
        if (user.balance === undefined) { user.balance = 0.00; changed = true; }
        if (user.referralBalance === undefined) { user.referralBalance = 0.00; changed = true; }
        if (user.referralCount === undefined) { user.referralCount = 0; changed = true; }
        if (user.referrals === undefined) { user.referrals = []; changed = true; }
        if (user.transactions === undefined) { user.transactions = []; changed = true; }
        if (user.numbersPurchased === undefined) { user.numbersPurchased = 0; changed = true; }
        if (user.totalRecharge === undefined) { user.totalRecharge = 0.00; changed = true; }
        
        if (changed) {
            const index = users.findIndex(u => u.username.toLowerCase() === user.username.toLowerCase());
            users[index] = user;
            localStorage.setItem('primes_users', JSON.stringify(users));
        }
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
    const currency = getCurrency();
    if (currency === 'USD') {
        return '$' + val.toFixed(2);
    } else {
        return '₦' + (val * CONVERSION_RATE).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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
function handleAddFunds() {
    showToast("Redirecting to payment page... 💳", "info");
    setTimeout(() => {
        window.location.href = "https://paystack.shop/pay/x0rmg9yt1d";
    }, 1200); // short delay so user sees the toast
}

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
window.addEventListener("load", () => {

    const loader = document.getElementById("loader");

    setTimeout(() => {
        loader.classList.add("hide");
    }, 2500);

});
window.addEventListener("load", () => {

    const loader = document.getElementById("loader");

    setTimeout(() => {
        loader.classList.add("hide");
    }, 3000);

});
window.addEventListener("load", function () {
  const loader = document.querySelector(".loader-wrapper");
  loader.style.transition = "opacity 0.6s ease";
  loader.style.opacity = "0";

  setTimeout(function () {
    loader.style.display = "none";
  }, 300);
});