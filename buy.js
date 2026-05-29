// ======================================
// SIDEBAR TOGGLE
// ======================================

const toggleBtn = document.querySelector(".toggle-btn");
const sidebar = document.querySelector("aside");
const overlay = document.querySelector(".overlay");
const closeBtn = document.querySelector(".close");

if (toggleBtn && sidebar) {
  // OPEN SIDEBAR
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
  });
}

if (closeBtn && sidebar) {
  // CLOSE SIDEBAR BUTTON
  closeBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  });
}

if (overlay && sidebar) {
  // CLOSE WHEN CLICKING OVERLAY
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });
}

// CLOSE ON WINDOW RESIZE
window.addEventListener("resize", () => {
  if (window.innerWidth > 768 && sidebar) {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
  }
});

// ======================================
// NUMBER PURCHASING OPERATIONS
// ======================================
const CONVERSION_RATE = 1500;

function getCurrency() {
  return localStorage.getItem('primes_currency') || 'USD';
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

function updateCardPrices() {
  document.querySelectorAll('.btn-buy-number').forEach(btn => {
    const price = parseFloat(btn.getAttribute('data-price'));
    btn.textContent = `Buy Number (${formatCurrency(price)})`;
  });
}

// Hook currency switch click to sync prices
document.addEventListener('DOMContentLoaded', () => {
  updateCardPrices();

  // Sync currency symbol in header if elements exist
  const currency = getCurrency();
  const symbolEl = document.getElementById('currencySymbol');
  const nameEl = document.getElementById('currencyName');
  if (symbolEl) symbolEl.textContent = currency === 'USD' ? '$' : '₦';
  if (nameEl) nameEl.textContent = currency;

  const switchEl = document.getElementById('currencySwitch');
  if (switchEl) {
    switchEl.addEventListener('click', () => {
      // Toggle currency in localStorage (since script.js will also process this click, we wait slightly)
      setTimeout(() => {
        updateCardPrices();
        const updatedCurrency = getCurrency();
        if (symbolEl) symbolEl.textContent = updatedCurrency === 'USD' ? '$' : '₦';
        if (nameEl) nameEl.textContent = updatedCurrency;
      }, 80);
    });
  }
});

// Hook dynamic purchase checkout
document.querySelectorAll('.btn-buy-number').forEach(btn => {
  btn.addEventListener('click', () => {
    const price = parseFloat(btn.getAttribute('data-price'));
    const name = btn.getAttribute('data-name');

    const confirmMsg = `Are you sure you want to purchase a ${name} for ${formatCurrency(price)}?`;
    if (!confirm(confirmMsg)) return;

    // Load active session
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    if (!session || !session.username) {
      window.location.href = 'login.html';
      return;
    }

    const users = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const userIndex = users.findIndex(u => u.username.toLowerCase() === session.username.toLowerCase());
    if (userIndex === -1) {
      alert("Error: Active user profile not found. Please log in again.");
      return;
    }

    const user = users[userIndex];

    // Ensure balance attributes are present
    if (user.balance === undefined) user.balance = 0.00;
    if (user.numbersPurchased === undefined) user.numbersPurchased = 0;
    if (user.transactions === undefined) user.transactions = [];

    if (user.balance < price) {
      alert(`Insufficient balance. This number costs ${formatCurrency(price)} but your balance is ${formatCurrency(user.balance)}. Please go to the dashboard to Add Funds.`);
      return;
    }

    // Process checkout
    user.balance -= price;
    user.numbersPurchased += 1;
    user.transactions.unshift({
      id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      type: 'Purchase',
      amount: -price,
      description: `Purchased virtual number: ${name}`,
      timestamp: new Date().toISOString()
    });

    // Save database back
    users[userIndex] = user;
    localStorage.setItem('primes_users', JSON.stringify(users));

    alert(`Success! You have purchased a ${name}. Your new virtual number is active.`);
  });
});