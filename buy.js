/* ══════════════════════════════════════════════════════════════════════
   BUY PAGE - VIRTUAL NUMBERS & OTP FUNCTIONALITY
══════════════════════════════════════════════════════════════════════ */

let allNumbers = [];
let activeOrders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
let currentModal = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initBuyPage();
    renderWalletBalance();
    loadCountries();
    loadServices();
    renderNumbers();
    renderActiveNumbers();
    attachEventListeners();
});

function initBuyPage() {
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    if (!session || !session.name) {
        window.location.href = 'login.html';
        return;
    }

    if (localStorage.getItem('dashboardTheme') === 'dark') {
        document.body.classList.add('dark-theme');
    }

    const currency = localStorage.getItem('primes_currency') || 'USD';
    updateCurrencyDisplay(currency);
}

function renderWalletBalance() {
    const user = getLiveUser();
    if (!user) return;

    const currency = getCurrency();
    const balance = currency === 'USD' ? user.balance : (user.balance * CONVERSION_RATE);
    const symbol = currency === 'USD' ? '$' : '₦';
    
    const balEl = document.getElementById('buyWalletBalance');
    if (balEl) {
        balEl.textContent = `${symbol}${balance.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
    }

    const statusEl = document.getElementById('fivesimBalance');
    if (statusEl) {
        statusEl.innerHTML = '<span style="color: #16a34a; font-weight: 700;">✅ Online</span>';
    }
}

function loadCountries() {
    const select = document.getElementById('countryFilter');
    if (!select) return;

    // Fetch countries from 5sim API
    fetch('http://localhost:3000/api/numbers/countries')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.details) {
                const countryDetails = data.details;
                const options = Object.entries(countryDetails).map(([code, details]) => {
                    const name = details.name || code;
                    const flag = details.flag || '🌐';
                    return `<option value="${code}">${flag} ${name}</option>`;
                }).join('');
                
                select.innerHTML = '<option value="">🌍 Select a Country</option>' + options;
                select.addEventListener('change', () => renderNumbers());
            }
        })
        .catch(err => {
            console.error('Failed to load countries:', err);
            // Fallback if API fails
            select.innerHTML = '<option value="">🌍 Error loading countries</option>';
            select.addEventListener('change', () => renderNumbers());
        });
}

function loadServices() {
    const select = document.getElementById('serviceFilter');
    if (!select) return;

    select.innerHTML = '<option value="">📱 All Services</option>' +
        SERVICES.map(s => `<option value="${s}">${s}</option>`).join('');
    
    select.addEventListener('change', () => renderNumbers());
}

function renderNumbers() {
    const countryFilter = document.getElementById('countryFilter')?.value || '';
    const cardsGrid = document.getElementById('cardsGrid');
    if (!cardsGrid) return;

    // Show loading state
    cardsGrid.innerHTML = `
        <div class="state-box" style="grid-column: 1 / -1; text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
            <p>Loading numbers...</p>
        </div>
    `;

    if (!countryFilter) {
        // Prompt user to select a country
        cardsGrid.innerHTML = `
            <div class="state-box" style="grid-column: 1 / -1; text-align: center;">
                <div style="font-size: 2.5rem; margin-bottom: 1rem;">🌍</div>
                <h3 style="margin: 0 0 8px;">Select a Country</h3>
                <p style="color: var(--muted); font-size: 0.95rem;">Please select a country from the dropdown above to view available numbers.</p>
            </div>
        `;
        return;
    }

    // Fetch products from 5sim API for selected country
    fetch(`http://localhost:3000/api/numbers/products?country=${countryFilter}`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.products) {
                console.log('Products fetched from 5sim:', data.products);
                // Convert API response to card format
                const numbers = Object.entries(data.products).map(([service, details]) => {
                    const price = details.Price || details.price || details.rate || 0;
                    const count = details.Qty || details.count || 0;
                    return {
                        id: `${countryFilter}-${service}-any`,
                        country: countryFilter,
                        countryCode: '+1',
                        flag: '🌐',
                        operator: 'any',
                        service: service,
                        price: price,
                        type: details.Category || 'activation',
                        available: count > 0
                    };
                });
                allNumbers = numbers;
                displayNumbers(numbers);
            } else {
                showError('No products available');
            }
        })
        .catch(err => {
            console.error('Failed to fetch products:', err);
            showError('Failed to load numbers');
        });

    function displayNumbers(numbers) {
        const serviceFilter = document.getElementById('serviceFilter')?.value || '';
        const typeFilter = document.getElementById('typeFilter')?.value || 'activation';
        const searchInput = document.getElementById('searchInput')?.value.toLowerCase() || '';

        let filtered = numbers.filter(n => {
            if (serviceFilter && n.service !== serviceFilter) return false;
            if (typeFilter && n.type !== typeFilter) return false;
            if (searchInput && !n.country.toLowerCase().includes(searchInput) && 
                !n.operator.toLowerCase().includes(searchInput)) return false;
            return true;
        });

        const currency = getCurrency();

        if (filtered.length === 0) {
            cardsGrid.innerHTML = `
                <div class="state-box" style="grid-column: 1 / -1;">
                    <i class="fa-solid fa-phone-slash"></i>
                    <p>No numbers available</p>
                </div>
            `;
            return;
        }

        cardsGrid.innerHTML = filtered.map(num => {
            const price = currency === 'USD' ? num.price : (num.price * CONVERSION_RATE);
            const symbol = currency === 'USD' ? '$' : '₦';
            const isActive = activeOrders.some(o => o.numberId === num.id);
            
            return `
                <div class="card" style="position: relative;">
                    ${isActive ? '<div style="position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">ACTIVE</div>' : ''}
                    <div class="card-flag">${num.flag}</div>
                    <div class="card-title">${num.country}</div>
                    <div class="card-meta">
                        <span style="font-size: 12px; color: var(--muted);">${num.operator}</span>
                        <span class="card-service-badge">${num.service}</span>
                    </div>
                    <div class="card-price">${symbol}${price.toFixed(2)}</div>
                    <button class="btn btn-buy" onclick="purchaseNumber('${num.id}')" ${!num.available ? 'disabled' : ''}>
                        ${num.available ? '🛒 Buy Now' : '❌ Unavailable'}
                    </button>
                </div>
            `;
        }).join('');

        const countEl = document.getElementById('resultCount');
        if (countEl) countEl.textContent = `${filtered.length} number${filtered.length !== 1 ? 's' : ''} available`;
    }

    function showError(msg) {
        cardsGrid.innerHTML = `
            <div class="state-box" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-exclamation-circle"></i>
                <p>${msg}</p>
            </div>
        `;
    }
}

function renderActiveNumbers() {
    const section = document.getElementById('activeNumbersSection');
    const grid = document.getElementById('activeNumbersGrid');
    
    if (!section || !grid) return;

    if (activeOrders.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    
    grid.innerHTML = activeOrders.map(order => `
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; cursor: pointer;" onclick="openOrderModal(${order.id})">
            <div style="font-size: 24px; margin-bottom: 6px;">${order.flag}</div>
            <div style="font-size: 13px; font-weight: 700; color: var(--text);">${order.number}</div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">Click to view</div>
        </div>
    `).join('');
}

async function purchaseNumber(numberId) {
    const user = getLiveUser();
    if (!user) {
        showToast('Please log in first', 'error');
        return;
    }

    const num = allNumbers.find(n => n.id === numberId);
    if (!num) return;

    const currency = getCurrency();
    const priceUSD = num.price;
    const priceLocal = currency === 'USD' ? priceUSD : (priceUSD * CONVERSION_RATE);

    if (user.balance < priceUSD) {
        showToast('❌ Insufficient balance. Please add funds.', 'error');
        setTimeout(() => window.location.href = 'dashboard.html?open=wallet', 1500);
        return;
    }

    user.balance -= priceUSD;
    user.numbersPurchased = (user.numbersPurchased || 0) + 1;

    const virtualNumber = generateVirtualNumber(num.countryCode);

    const order = {
        id: Date.now(),
        numberId: numberId,
        number: virtualNumber,
        country: num.country,
        flag: num.flag,
        operator: num.operator,
        service: num.service,
        price: priceUSD,
        status: 'waiting',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        sms: [],
        otp: null
    };

    activeOrders.push(order);
    localStorage.setItem('activeOrders', JSON.stringify(activeOrders));

    user.transactions = user.transactions || [];
    user.transactions.unshift({
        id: order.id,
        type: 'Purchase',
        amount: -priceUSD,
        description: `Purchased ${num.service} number (${num.country})`,
        timestamp: new Date().toISOString()
    });

    saveLiveUser(user);
    renderWalletBalance();
    renderNumbers();
    renderActiveNumbers();

    const symbol = currency === 'USD' ? '$' : '₦';
    showToast(`✅ Number purchased! ${symbol}${priceLocal.toFixed(2)} deducted`, 'success');

    setTimeout(() => openOrderModal(order.id), 500);
}

function generateVirtualNumber(countryCode) {
    const areaCode = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const line = Math.floor(Math.random() * 9000) + 1000;
    return `${countryCode} ${areaCode}-${exchange}-${line}`;
}

function openOrderModal(orderId) {
    const order = activeOrders.find(o => o.id === orderId);
    if (!order) return;

    currentModal = order;

    const overlay = document.getElementById('smsModalOverlay');
    if (!overlay) return;

    document.getElementById('modalPhone').textContent = order.number;
    document.getElementById('modalOrderId').textContent = `#${order.id}`;
    document.getElementById('modalExpires').textContent = new Date(order.expiresAt).toLocaleTimeString();

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (statusDot && statusText) {
        statusDot.className = 'dot pulse';
        statusText.textContent = 'Waiting for SMS...';
    }

    const otpBox = document.getElementById('smsOtpBox');
    if (otpBox) otpBox.classList.remove('show');

    const inboxList = document.getElementById('smsInboxList');
    if (inboxList) inboxList.classList.remove('show');

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    simulateSmsReceiving(order);
}

function simulateSmsReceiving(order) {
    const delay = Math.random() * 5000 + 3000;
    
    setTimeout(() => {
        if (currentModal?.id !== order.id) return;

        const otp = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
        order.otp = otp;
        order.sms.push({
            sender: order.service,
            body: `Your ${order.service} verification code is: ${otp}`,
            time: new Date().toLocaleTimeString()
        });

        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const otpBox = document.getElementById('smsOtpBox');
        const otpCode = document.getElementById('otpCode');
        const otpFullText = document.getElementById('otpFullText');

        if (statusDot) statusDot.classList.remove('pulse');
        if (statusText) statusText.textContent = '✅ SMS Received!';
        if (otpBox) otpBox.classList.add('show');
        if (otpCode) otpCode.textContent = otp;
        if (otpFullText) otpFullText.textContent = `Your ${order.service} verification code`;

        showToast(`📨 SMS received on ${order.number}!`, 'success');
    }, delay);
}

function refreshInbox() {
    if (!currentModal) return;
    showToast('🔄 Refreshing inbox...', 'info');
    simulateSmsReceiving(currentModal);
}

function closeSmsModal() {
    const overlay = document.getElementById('smsModalOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
    currentModal = null;
}

function copyNumberToClipboard() {
    if (!currentModal) return;
    
    navigator.clipboard.writeText(currentModal.number).then(() => {
        showToast('📋 Number copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Could not copy number', 'error');
    });
}

function cancelOrder() {
    if (!currentModal) return;

    if (!confirm('Are you sure you want to cancel this order? Balance will be refunded.')) return;

    const user = getLiveUser();
    if (!user) return;

    user.balance += currentModal.price;
    user.numbersPurchased = Math.max(0, (user.numbersPurchased || 1) - 1);

    user.transactions = user.transactions || [];
    user.transactions.unshift({
        id: 'REFUND-' + currentModal.id,
        type: 'Refund',
        amount: currentModal.price,
        description: `Cancelled ${currentModal.service} number`,
        timestamp: new Date().toISOString()
    });

    activeOrders = activeOrders.filter(o => o.id !== currentModal.id);
    localStorage.setItem('activeOrders', JSON.stringify(activeOrders));
    saveLiveUser(user);

    closeSmsModal();
    renderWalletBalance();
    renderActiveNumbers();
    renderNumbers();

    showToast(`✅ Order cancelled. $${currentModal.price.toFixed(2)} refunded!`, 'success');
}

function reportBan() {
    if (!currentModal) return;

    if (!confirm('Report this number as banned? This will refund your balance.')) return;

    const user = getLiveUser();
    if (!user) return;

    user.balance += currentModal.price;
    user.transactions = user.transactions || [];
    user.transactions.unshift({
        id: 'BAN-REPORT-' + currentModal.id,
        type: 'Ban Report',
        amount: currentModal.price,
        description: `Reported ${currentModal.service} number as banned`,
        timestamp: new Date().toISOString()
    });

    activeOrders = activeOrders.filter(o => o.id !== currentModal.id);
    localStorage.setItem('activeOrders', JSON.stringify(activeOrders));
    saveLiveUser(user);

    closeSmsModal();
    renderWalletBalance();
    renderActiveNumbers();
    renderNumbers();

    showToast('⚠️ Ban reported. Balance refunded.', 'success');
}

function finishOrder() {
    if (!currentModal) return;

    if (!currentModal.otp) {
        showToast('⏳ Still waiting for SMS. Please wait...', 'info');
        return;
    }

    activeOrders = activeOrders.filter(o => o.id !== currentModal.id);
    localStorage.setItem('activeOrders', JSON.stringify(activeOrders));

    closeSmsModal();
    renderActiveNumbers();
    renderNumbers();

    showToast(`✅ Order completed! ${currentModal.otp} was your OTP.`, 'success');
}

function attachEventListeners() {
    const currencySwitch = document.getElementById('currencySwitch');
    if (currencySwitch) {
        currencySwitch.addEventListener('click', toggleBuyCurrency);
    }

    const modalCloseX = document.getElementById('modalCloseX');
    if (modalCloseX) {
        modalCloseX.addEventListener('click', closeSmsModal);
    }

    const overlay = document.getElementById('smsModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSmsModal();
        });
    }

    const copyBtn = document.getElementById('btnCopyNumber');
    const cancelBtn = document.getElementById('btnCancelOrder');
    const banBtn = document.getElementById('btnBanOrder');
    const finishBtn = document.getElementById('btnFinishOrder');

    if (copyBtn) copyBtn.addEventListener('click', copyNumberToClipboard);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelOrder);
    if (banBtn) banBtn.addEventListener('click', reportBan);
    if (finishBtn) finishBtn.addEventListener('click', finishOrder);

    const settingsBtn = document.getElementById('sidebarSettingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderNumbers());
    }

    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) {
        typeFilter.addEventListener('change', () => renderNumbers());
    }
}

function toggleBuyCurrency() {
    const currency = getCurrency();
    const newCurrency = currency === 'USD' ? 'NGN' : 'USD';
    localStorage.setItem('primes_currency', newCurrency);
    updateCurrencyDisplay(newCurrency);
    renderWalletBalance();
    renderNumbers();
    showToast(`💱 Currency switched to ${newCurrency}`, 'info');
}

function updateCurrencyDisplay(currency) {
    const symbolEl = document.getElementById('currencySymbol');
    const nameEl = document.getElementById('currencyName');
    if (symbolEl) symbolEl.textContent = currency === 'USD' ? '$' : '₦';
    if (nameEl) nameEl.textContent = currency;
}
