// ══════════════════════════════════════════════════════════════
//  DAVE'S SOCIAL — buy.js  (fixed)
// ══════════════════════════════════════════════════════════════

const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:3000/api/numbers'
  : '/api/numbers';

const CONVERSION_RATE_BUY = 1500;  // 1 USD = ₦1,500

// ── State ──
let allProducts  = {};
let currentOrder = null;
let pollInterval = null;
let currentType  = 'activation';
let countriesDetails = {};

// ══════════════════════════════════════════════════════════════
//  SIDEBAR TOGGLE
// ══════════════════════════════════════════════════════════════
const toggleBtnBuy = document.querySelector('.toggle-btn');
const sidebarBuy   = document.querySelector('aside');
const overlayBuy   = document.getElementById('overlay');
const closeBtnBuy  = document.querySelector('.close');

if (toggleBtnBuy && sidebarBuy) {
  toggleBtnBuy.addEventListener('click', () => {
    sidebarBuy.classList.add('open');
    if (overlayBuy) overlayBuy.classList.add('show');
  });
}
if (closeBtnBuy && sidebarBuy) {
  closeBtnBuy.addEventListener('click', () => {
    sidebarBuy.classList.remove('open');
    if (overlayBuy) overlayBuy.classList.remove('show');
  });
}
if (overlayBuy && sidebarBuy) {
  overlayBuy.addEventListener('click', () => {
    sidebarBuy.classList.remove('open');
    overlayBuy.classList.remove('show');
  });
}
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && sidebarBuy) {
    sidebarBuy.classList.remove('open');
    if (overlayBuy) overlayBuy.classList.remove('show');
  }
});

// ══════════════════════════════════════════════════════════════
//  CURRENCY HELPERS
// ══════════════════════════════════════════════════════════════
function getBuyCurrency() {
  return localStorage.getItem('primes_currency') || 'NGN';
}

// 5sim prices come back as plain USD decimals (e.g. 0.14 = $0.14)
function priceToUSD(p) { return parseFloat(p) || 0; }

function formatBuyPrice(priceUSD) {
  const p = parseFloat(priceUSD) || 0;
  const naira = p * CONVERSION_RATE_BUY;
  const usdStr = '$' + p.toFixed(2);
  const nairaStr = '₦' + naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const cur = getBuyCurrency();
  if (cur === 'USD') {
    return `${usdStr} (${nairaStr})`;
  } else {
    return `${nairaStr} (${usdStr})`;
  }
}

function formatBuyPriceFromUSD(usd) {
  return formatBuyPrice(usd);
}

// ══════════════════════════════════════════════════════════════
//  FLAG IMAGES  (flagcdn.com — works on Windows/Chrome)
// ══════════════════════════════════════════════════════════════
const COUNTRY_ISO = {
  usa:'us', england:'gb', nigeria:'ng', canada:'ca', germany:'de', france:'fr',
  india:'in', china:'cn', brazil:'br', russia:'ru', australia:'au', netherlands:'nl',
  sweden:'se', spain:'es', italy:'it', mexico:'mx', indonesia:'id', philippines:'ph',
  vietnam:'vn', thailand:'th', cambodia:'kh', southafrica:'za', ghana:'gh', kenya:'ke',
  ukraine:'ua', poland:'pl', turkey:'tr', pakistan:'pk', bangladesh:'bd', malaysia:'my',
  egypt:'eg', saudiarabia:'sa', uae:'ae', japan:'jp', southkorea:'kr', taiwan:'tw',
  hongkong:'hk', singapore:'sg', newzealand:'nz', ireland:'ie', portugal:'pt',
  greece:'gr', romania:'ro', hungary:'hu', czechia:'cz', austria:'at', belgium:'be',
  denmark:'dk', norway:'no', finland:'fi', colombia:'co', argentina:'ar', chile:'cl',
  peru:'pe', venezuela:'ve', kazakhstan:'kz', uzbekistan:'uz', morocco:'ma',
  ethiopia:'et', tanzania:'tz', uganda:'ug', cameroon:'cm', senegal:'sn', angola:'ao',
  laos:'la', myanmar:'mm', nepal:'np', srilanka:'lk', uk:'gb', unitedstates:'us',
  unitedkingdom:'gb', unitedstatesvirtualnumbers:'us',
};

function getFlagImg(country) {
  const iso = COUNTRY_ISO[country.toLowerCase().replace(/\s+/g, '')] || '';
  if (!iso) return `<span style="font-size:1.6rem;">🌍</span>`;
  return `<img src="https://flagcdn.com/w40/${iso}.png" width="40" height="26"
          style="border-radius:4px;object-fit:cover;box-shadow:0 1px 4px rgba(0,0,0,0.15);"
          onerror="this.outerHTML='🌍'" alt="${country} flag">`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

// ══════════════════════════════════════════════════════════════
//  LOAD COUNTRIES
// ══════════════════════════════════════════════════════════════
async function loadCountries() {
  try {
    const res    = await fetch(`${API_BASE}/countries`);
    const data   = await res.json();
    countriesDetails = data.details || {};
    const select = document.getElementById('countryFilter');

    select.innerHTML = '<option value="">🌍 Select Country</option>';
    (data.countries || []).sort().forEach(c => {
      const iso = COUNTRY_ISO[c.toLowerCase().replace(/\s+/g, '')] || '';
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = (iso ? '' : '') + capitalize(c);
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load countries:', err);
    showBuyToast('Could not load countries. Make sure the server is running.', 'error');
  }
}

function populateOperatorFilter() {
  const country = document.getElementById('countryFilter').value;
  const select = document.getElementById('operatorFilter');
  if (!select) return;

  if (!country || !countriesDetails[country]) {
    select.style.display = 'none';
    select.innerHTML = '<option value="any">⚡ Any Operator</option>';
    return;
  }

  const details = countriesDetails[country];
  const operators = Object.keys(details).filter(k => !['iso', 'prefix', 'text_en', 'text_ru'].includes(k));

  if (operators.length <= 1) {
    select.style.display = 'none';
    select.innerHTML = '<option value="any">⚡ Any Operator</option>';
    return;
  }

  select.innerHTML = '<option value="any">⚡ Any Operator</option>';
  operators.sort().forEach(op => {
    const opt = document.createElement('option');
    opt.value = op;
    opt.textContent = capitalize(op);
    select.appendChild(opt);
  });
  
  select.style.display = 'inline-block';
}

async function handleCountryChange() {
  populateOperatorFilter();
  await loadProducts();
}

// ══════════════════════════════════════════════════════════════
//  LOAD PRODUCTS
// ══════════════════════════════════════════════════════════════
async function loadProducts() {
  const country = document.getElementById('countryFilter').value;
  const type    = document.getElementById('typeFilter').value;
  currentType   = type;

  if (!country) { renderEmptyState('Select a country to see available numbers'); return; }

  showSkeletons();

  try {
    const operator = document.getElementById('operatorFilter').value || 'any';
    const res  = await fetch(`${API_BASE}/products?country=${encodeURIComponent(country)}&operator=${encodeURIComponent(operator)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load products');
    allProducts = data.products || {};
    populateServiceFilter(type);
    renderCards();
  } catch (err) {
    console.error('Load products error:', err);
    renderErrorState('Failed to load numbers. Please try again.');
  }
}

// ══════════════════════════════════════════════════════════════
//  POPULATE SERVICE FILTER
// ══════════════════════════════════════════════════════════════
function populateServiceFilter(type) {
  const select = document.getElementById('serviceFilter');
  select.innerHTML = '<option value="">📱 All Services</option>';

  Object.entries(allProducts)
    .filter(([, v]) => v.Category === type && v.Qty > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name]) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = capitalize(name);
      select.appendChild(opt);
    });
}

// ══════════════════════════════════════════════════════════════
//  RENDER CARDS
// ══════════════════════════════════════════════════════════════
function renderCards() {
  const type          = document.getElementById('typeFilter').value;
  const serviceFilter = document.getElementById('serviceFilter').value;
  const search        = document.getElementById('searchInput').value.toLowerCase().trim();
  const country       = document.getElementById('countryFilter').value;
  const grid          = document.getElementById('cardsGrid');
  const countEl       = document.getElementById('resultCount');

  let entries = Object.entries(allProducts).filter(([name, info]) => {
    if (info.Category !== type) return false;
    if (info.Qty <= 0)          return false;
    if (serviceFilter && name !== serviceFilter) return false;
    if (search && !name.toLowerCase().includes(search)) return false;
    return true;
  });

  // Sort: cheapest first, then by availability
  entries.sort((a, b) => a[1].Price - b[1].Price);

  countEl.textContent = entries.length > 0
    ? `${entries.length} service${entries.length !== 1 ? 's' : ''} available`
    : '';

  if (entries.length === 0) {
    renderEmptyState('No numbers found. Try a different country or service.');
    return;
  }

  const flagHtml = getFlagImg(country);

  grid.innerHTML = entries.map(([name, info]) => {
    const priceUSD = priceToUSD(info.Price);
    const price    = formatBuyPrice(priceUSD);
    const qty      = info.Qty;
    const label    = capitalize(name);
    const catIcon  = info.Category === 'hosting' ? '🕐' : '⚡';
    const catLabel = info.Category === 'hosting' ? 'Hosting' : 'Activation';

    // Service icon map
    const icons = {
      facebook:'fab fa-facebook', instagram:'fab fa-instagram', whatsapp:'fab fa-whatsapp',
      telegram:'fab fa-telegram', twitter:'fab fa-twitter', tinder:'fas fa-fire',
      google:'fab fa-google', amazon:'fab fa-amazon', microsoft:'fab fa-microsoft',
      uber:'fab fa-uber', snapchat:'fab fa-snapchat', tiktok:'fab fa-tiktok',
      linkedin:'fab fa-linkedin', discord:'fab fa-discord', spotify:'fab fa-spotify',
      apple:'fab fa-apple', paypal:'fab fa-paypal', airbnb:'fab fa-airbnb',
    };
    const iconClass = icons[name.toLowerCase()] || 'fas fa-mobile-alt';

    return `
      <div class="card service-card" style="display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            ${flagHtml}
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);">${capitalize(country)}</div>
              <span class="card-service-badge" style="margin-bottom:0;">${catIcon} ${catLabel}</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:16px;flex-shrink:0;">
              <i class="${iconClass}"></i>
            </div>
            <h3 style="font-size:1rem;font-weight:800;color:var(--text);margin:0;">${label}</h3>
          </div>
          <div class="card-price" style="margin:10px 0 4px;">${price}</div>
          <div class="card-meta">
            <span class="qty"><i class="fa-solid fa-sim-card" style="font-size:10px;"></i> ${qty.toLocaleString()} available</span>
            <span style="color:#16a34a;font-weight:700;font-size:11px;display:flex;align-items:center;gap:3px;"><i class="fas fa-bolt" style="font-size:9px;"></i> INSTANT</span>
          </div>
        </div>
        <button
          class="btn-buy-number"
          data-name="${name}"
          data-country="${country}"
          data-price="${info.Price}"
          data-type="${info.Category}"
          style="margin-top:14px;width:100%;padding:12px;background:linear-gradient(135deg,var(--primary),var(--accent));color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;font-size:13px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;"
          onmouseover="this.style.opacity='0.88';this.style.transform='translateY(-1px)'"
          onmouseout="this.style.opacity='1';this.style.transform='translateY(0)'"
        >
          <i class="fas fa-shopping-cart" style="font-size:12px;"></i>
          Buy for ${price}
        </button>
      </div>
    `;
  }).join('');

  // Attach buy handlers
  document.querySelectorAll('.btn-buy-number').forEach(btn => {
    btn.addEventListener('click', handleBuyClick);
  });
}

// ══════════════════════════════════════════════════════════════
//  BUY CLICK HANDLER
// ══════════════════════════════════════════════════════════════
async function handleBuyClick(e) {
  const btn     = e.currentTarget;
  const name    = btn.getAttribute('data-name');
  const country = btn.getAttribute('data-country');
  const price   = parseFloat(btn.getAttribute('data-price'));
  const type    = btn.getAttribute('data-type');

  // ── Auth check ──
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  if (!session?.username) { window.location.href = 'login.html'; return; }

  const users     = JSON.parse(localStorage.getItem('primes_users') || '[]');
  const userIndex = users.findIndex(u => u.username.toLowerCase() === session.username.toLowerCase());
  if (userIndex === -1) { showBuyToast('Session error. Please log in again.', 'error'); return; }

  const user     = users[userIndex];
  const priceUSD = priceToUSD(price);
  const walletBal = parseFloat(user.balance || 0);

  // ── Balance check ──
  if (walletBal < priceUSD) {
    showBuyToast(
      `Insufficient balance. You need ${formatBuyPrice(priceUSD)} but have ${formatBuyPrice(walletBal)}. Add funds from your dashboard.`,
      'error'
    );
    return;
  }

  // ── Confirm ──
  if (!confirm(`Buy a ${capitalize(name)} number (${capitalize(country)}) for ${formatBuyPrice(priceUSD)}?\n\nThis will be deducted from your wallet.`)) return;

  // ── Disable button ──
  const originalHTML = btn.innerHTML;
  btn.disabled    = true;
  btn.innerHTML   = '<i class="fas fa-spinner fa-spin"></i> Purchasing...';

  try {
    const operator = document.getElementById('operatorFilter').value || 'any';
    const res = await fetch(`${API_BASE}/buy`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ country, product: name, type, operator }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Purchase failed');

    // ── Deduct wallet balance ──
    user.balance          = walletBal - priceUSD;
    user.numbersPurchased = (user.numbersPurchased || 0) + 1;
    user.transactions     = user.transactions || [];
    user.transactions.unshift({
      id:          'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      type:        'Purchase',
      amount:      -priceUSD,
      description: `Bought ${capitalize(name)} number — ${capitalize(country)}`,
      timestamp:   new Date().toISOString()
    });
    users[userIndex] = user;
    localStorage.setItem('primes_users', JSON.stringify(users));

    // ── Update wallet display ──
    loadWalletBalance();

    // ── Track order for admin panel ──
    const allOrders = JSON.parse(localStorage.getItem('primes_orders') || '[]');
    allOrders.unshift({
      orderId:   data.order.id,
      phone:     data.order.phone,
      service:   capitalize(name),
      product:   name,
      country:   country,
      type:      type,
      amountNGN: Math.round(priceUSD * (parseFloat(localStorage.getItem('adminRate')) || 1500) * (parseFloat(localStorage.getItem('adminMarkup')) || 1.5)),
      amountUSD: priceUSD,
      status:    data.order.status || 'RECEIVED',
      userId:    session.username,
      userName:  user.name || session.username,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem('primes_orders', JSON.stringify(allOrders));

    // ── Log activity ──
    const allActivity = JSON.parse(localStorage.getItem('primes_activity') || '[]');
    allActivity.unshift({
      type:      'purchase',
      message:   `${capitalize(name)} number purchased: ${data.order.phone} (${capitalize(country)})`,
      username:  user.name || session.username,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem('primes_activity', JSON.stringify(allActivity));

    // ── Show SMS modal ──
    currentOrder = { ...data.order, _priceUSD: priceUSD };
    saveActiveOrder(data.order, type, priceUSD);
    openSmsModal(data.order, type);
    showBuyToast(`✅ Number purchased! ${data.order.phone}`, 'success');


  } catch (err) {
    console.error('Buy error:', err);
    showBuyToast(`❌ ${err.message}`, 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = originalHTML;
  }
}

// ══════════════════════════════════════════════════════════════
//  SMS MODAL
// ══════════════════════════════════════════════════════════════
function openSmsModal(order, type) {
  document.getElementById('modalPhone').textContent   = order.phone;
  document.getElementById('modalOrderId').textContent = '#' + order.id;
  document.getElementById('modalExpires').textContent =
    order.expires ? new Date(order.expires).toLocaleTimeString() : '—';

  setModalStatus('pending');
  document.getElementById('smsOtpBox').classList.remove('show');
  document.getElementById('smsInboxList').classList.remove('show');
  document.getElementById('btnRefreshInbox').style.display = 'none';
  document.getElementById('smsModalOverlay').classList.add('show');

  if (type === 'hosting') {
    document.getElementById('btnRefreshInbox').style.display = 'block';
    document.getElementById('smsInboxList').classList.add('show');
    setModalStatus('hosting');
    refreshInbox();
  } else {
    startPolling(order.id);
  }
}

function closeSmsModal() {
  document.getElementById('smsModalOverlay').classList.remove('show');
  clearInterval(pollInterval);
}

function setModalStatus(status) {
  const dot       = document.getElementById('statusDot');
  const text      = document.getElementById('statusText');
  const statusRow = document.getElementById('smsStatusRow');

  dot.className = 'dot';
  statusRow.style.color = '';

  switch (status) {
    case 'pending':
      dot.classList.add('pulse');
      text.textContent = '⏳ Waiting for OTP SMS...';
      statusRow.style.background = 'var(--border-light)';
      break;
    case 'received':
      dot.classList.add('received');
      text.textContent = '✅ OTP Received!';
      statusRow.style.background = '#dcfce7';
      statusRow.style.color      = '#15803d';
      break;
    case 'canceled':
      text.textContent = '❌ Order Cancelled';
      statusRow.style.background = '#fee2e2';
      statusRow.style.color      = '#dc2626';
      break;
    case 'hosting':
      dot.classList.add('received');
      text.textContent = '🕐 Long-term number active';
      statusRow.style.background = '#ede9fe';
      statusRow.style.color      = 'var(--primary)';
      break;
    case 'timeout':
      text.textContent = '⏰ Timed out — no OTP received';
      statusRow.style.background = '#fef3c7';
      statusRow.style.color      = '#92400e';
      break;
  }
}

// ── Poll for SMS every 3s ──
function startPolling(orderId) {
  clearInterval(pollInterval);
  let attempts = 0;
  const maxAttempts = 300; // 15 min

  pollInterval = setInterval(async () => {
    attempts++;
    try {
      const res   = await fetch(`${API_BASE}/check/${orderId}`);
      const json  = await res.json();
      const order = json.data || json;
      if (!order) return;

      const status = (order.status || '').toUpperCase();

      if (status === 'RECEIVED' || (Array.isArray(order.sms) && order.sms.length > 0)) {
        const sms = Array.isArray(order.sms) && order.sms.length > 0 ? order.sms[0] : null;
        setModalStatus('received');
        if (sms) showOtp(sms);
        clearInterval(pollInterval);
        showBuyToast('✅ OTP received!', 'success');
        return;
      }

      if (['TIMEOUT', 'CANCELED', 'BANNED'].includes(status)) {
        setModalStatus('canceled');
        clearInterval(pollInterval);
        return;
      }

      if (status === 'FINISHED') {
        setModalStatus('received');
        clearInterval(pollInterval);
        return;
      }

      if (attempts >= maxAttempts) {
        setModalStatus('timeout');
        clearInterval(pollInterval);
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, 3000);
}

function showOtp(sms) {
  const box    = document.getElementById('smsOtpBox');
  const codeEl = document.getElementById('otpCode');
  const textEl = document.getElementById('otpFullText');

  let code = sms.code || '';
  if (!code && sms.text) {
    const m = sms.text.match(/\b(\d{4,8})\b/);
    if (m) code = m[1];
  }

  codeEl.textContent = code || '—';
  textEl.textContent = sms.text || '';
  box.classList.add('show');
}

// ── Hosting inbox ──
async function refreshInbox() {
  if (!currentOrder) return;
  const listEl = document.getElementById('smsInboxList');

  try {
    const res  = await fetch(`${API_BASE}/inbox/${currentOrder.id}`);
    const data = await res.json();

    if (!data.sms || data.sms.length === 0) {
      listEl.innerHTML = '<div class="sms-inbox-item"><div class="body" style="color:var(--muted);">No messages yet. Check back soon.</div></div>';
      return;
    }

    listEl.innerHTML = data.sms.map(sms => `
      <div class="sms-inbox-item">
        <div class="sender">${sms.sender || 'Unknown'}</div>
        <div class="body">${sms.text}</div>
        <div class="time">${new Date(sms.date).toLocaleString()}</div>
      </div>
    `).join('');

  } catch {
    listEl.innerHTML = '<div class="sms-inbox-item"><div class="body" style="color:#ef4444;">Failed to load inbox.</div></div>';
  }
}

// ══════════════════════════════════════════════════════════════
//  MODAL BUTTON HANDLERS
// ══════════════════════════════════════════════════════════════
document.getElementById('modalCloseX').addEventListener('click', closeSmsModal);

document.getElementById('btnCopyNumber').addEventListener('click', () => {
  const phone = document.getElementById('modalPhone').textContent;
  if (phone && phone !== '—') {
    navigator.clipboard.writeText(phone)
      .then(() => showBuyToast('📋 Number copied!', 'success'))
      .catch(() => showBuyToast('Number: ' + phone, 'info'));
  }
});

document.getElementById('btnCancelOrder').addEventListener('click', async () => {
  if (!currentOrder) return;
  if (!confirm('Cancel this order? Your balance will be refunded.')) return;

  try {
    await fetch(`${API_BASE}/cancel/${currentOrder.id}`, { method: 'POST' });
    setModalStatus('canceled');
    clearInterval(pollInterval);
    showBuyToast('Order cancelled. Balance refunded.', 'info');

    // Refund wallet
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const idx     = users.findIndex(u => u.username.toLowerCase() === session.username?.toLowerCase());
    if (idx !== -1) {
      const refund = currentOrder._priceUSD || 0;
      users[idx].balance = (users[idx].balance || 0) + refund;
      users[idx].transactions = users[idx].transactions || [];
      users[idx].transactions.unshift({
        id:          'REF-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        type:        'Refund',
        amount:      refund,
        description: `Refund: Order #${currentOrder.id} cancelled`,
        timestamp:   new Date().toISOString()
      });
      localStorage.setItem('primes_users', JSON.stringify(users));
      loadWalletBalance();
    }
    removeActiveOrder(currentOrder.id);
  } catch (err) {
    showBuyToast('Cancel failed: ' + err.message, 'error');
  }
});

document.getElementById('btnBanOrder').addEventListener('click', async () => {
  if (!currentOrder) return;
  if (!confirm('Report this number as banned? You will be refunded.')) return;

  try {
    await fetch(`${API_BASE}/ban/${currentOrder.id}`, { method: 'POST' });
    setModalStatus('canceled');
    clearInterval(pollInterval);
    showBuyToast('Number reported as banned. Balance refunded.', 'info');

    // Refund wallet
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const idx     = users.findIndex(u => u.username.toLowerCase() === session.username?.toLowerCase());
    if (idx !== -1) {
      const refund = currentOrder._priceUSD || 0;
      users[idx].balance = (users[idx].balance || 0) + refund;
      users[idx].transactions = users[idx].transactions || [];
      users[idx].transactions.unshift({
        id:          'BAN-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        type:        'Refund',
        amount:      refund,
        description: `Banned Refund: Order #${currentOrder.id} reported banned`,
        timestamp:   new Date().toISOString()
      });
      localStorage.setItem('primes_users', JSON.stringify(users));
      loadWalletBalance();
    }
    removeActiveOrder(currentOrder.id);
    closeSmsModal();
  } catch (err) {
    showBuyToast('Reporting ban failed: ' + err.message, 'error');
  }
});

document.getElementById('btnFinishOrder').addEventListener('click', async () => {
  if (!currentOrder) return;
  try {
    await fetch(`${API_BASE}/finish/${currentOrder.id}`, { method: 'POST' });
  } catch { /* ignore */ }
  closeSmsModal();
  removeActiveOrder(currentOrder.id);
  showBuyToast('✅ Order completed!', 'success');
});

document.getElementById('smsModalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('smsModalOverlay')) closeSmsModal();
});

// ══════════════════════════════════════════════════════════════
//  ACTIVE VIRTUAL NUMBERS PERSISTENCE & MANAGEMENT
// ══════════════════════════════════════════════════════════════
function saveActiveOrder(order, type, priceUSD) {
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
  const idx     = users.findIndex(u => u.username?.toLowerCase() === session.username?.toLowerCase());
  if (idx === -1) return;

  const user = users[idx];
  user.activeOrders = user.activeOrders || [];
  
  user.activeOrders.push({
    id: order.id,
    phone: order.phone,
    product: order.product || currentOrder?.product || 'number',
    country: order.country || currentOrder?.country || 'nigeria',
    type: type,
    priceUSD: priceUSD,
    expires: order.expires || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    status: order.status || 'PENDING',
    sms: order.sms || [],
    timestamp: new Date().toISOString()
  });
  
  users[idx] = user;
  localStorage.setItem('primes_users', JSON.stringify(users));
  renderActiveOrders();
}

function removeActiveOrder(orderId) {
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
  const idx     = users.findIndex(u => u.username?.toLowerCase() === session.username?.toLowerCase());
  if (idx === -1) return;

  const user = users[idx];
  user.activeOrders = (user.activeOrders || []).filter(o => String(o.id) !== String(orderId));
  
  users[idx] = user;
  localStorage.setItem('primes_users', JSON.stringify(users));
  renderActiveOrders();
}

function updateActiveOrder(orderId, updates) {
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
  const idx     = users.findIndex(u => u.username?.toLowerCase() === session.username?.toLowerCase());
  if (idx === -1) return;

  const user = users[idx];
  user.activeOrders = (user.activeOrders || []).map(o => {
    if (String(o.id) === String(orderId)) {
      return { ...o, ...updates };
    }
    return o;
  });

  users[idx] = user;
  localStorage.setItem('primes_users', JSON.stringify(users));
  renderActiveOrders();
}

const activeTimers = {};
function startActiveTimer(orderId, expiresTime) {
  if (activeTimers[orderId]) {
    clearInterval(activeTimers[orderId]);
  }

  const timerEl = document.getElementById(`timer-${orderId}`);
  if (!timerEl) return;

  const target = new Date(expiresTime).getTime();

  activeTimers[orderId] = setInterval(() => {
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      clearInterval(activeTimers[orderId]);
      delete activeTimers[orderId];
      if (timerEl) timerEl.textContent = 'Expired';
      removeActiveOrder(orderId);
      return;
    }

    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    if (timerEl) {
      timerEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

function renderActiveOrders() {
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
  const user    = users.find(u => u.username?.toLowerCase() === session.username?.toLowerCase());
  
  const section = document.getElementById('activeNumbersSection');
  const grid    = document.getElementById('activeNumbersGrid');
  if (!section || !grid) return;

  const activeOrders = user?.activeOrders || [];
  if (activeOrders.length === 0) {
    section.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  section.style.display = 'block';

  grid.innerHTML = activeOrders.map(order => {
    const isHosting = order.type === 'hosting';
    const label = capitalize(order.product);
    const flag = getFlagImg(order.country);

    let statusText = '⏳ Waiting for OTP...';
    let statusBg = 'var(--border-light)';
    let statusColor = 'var(--text-muted)';
    
    let otpCode = '';
    let otpFullText = '';
    
    const smsList = Array.isArray(order.sms) ? order.sms : [];
    if (smsList.length > 0) {
      statusText = '✅ OTP Received!';
      statusBg = '#dcfce7';
      statusColor = '#15803d';
      
      const sms = smsList[0];
      otpCode = sms.code || '';
      if (!otpCode && sms.text) {
        const m = sms.text.match(/\b(\d{4,8})\b/);
        if (m) otpCode = m[1];
      }
      otpFullText = sms.text || '';
    } else if (order.status === 'FINISHED') {
      statusText = '✅ Completed';
      statusBg = '#e0f2fe';
      statusColor = '#0369a1';
    } else if (order.status === 'TIMEOUT' || order.status === 'CANCELED') {
      statusText = '❌ Cancelled';
      statusBg = '#fee2e2';
      statusColor = '#dc2626';
    }

    const timerId = `timer-${order.id}`;

    return `
      <div class="card active-order-card" style="border:1px solid var(--primary); padding:16px; display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden; background:var(--card-bg);">
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              ${flag}
              <div>
                <h4 style="margin:0; font-size:14px; font-weight:800; color:var(--text);">${label}</h4>
                <div style="font-size:10px; color:var(--muted);">${capitalize(order.country)} • ${isHosting ? 'Hosting' : 'Activation'}</div>
              </div>
            </div>
            <div style="margin-left:auto; font-size:11px; font-weight:700; color:#ef4444;" id="${timerId}">
              --:--
            </div>
          </div>

          <div style="background:var(--border-light); border-radius:10px; padding:10px; margin-bottom:12px; display:flex; flex-direction:column; gap:4px; text-align:center; cursor:pointer;" onclick="copyActiveNumber('${order.phone}')">
            <div style="font-size:15px; font-weight:800; letter-spacing:0.5px; color:var(--text);" id="num-${order.id}">${order.phone}</div>
            <div style="font-size:10px; color:var(--muted);">Click to copy number</div>
          </div>

          <div style="border-radius:10px; padding:8px 12px; font-size:12px; font-weight:700; text-align:center; background:${statusBg}; color:${statusColor}; margin-bottom:12px;">
            ${statusText}
          </div>

          ${otpCode ? `
            <div style="background:#f0fdf4; border:1px dashed #86efac; border-radius:10px; padding:10px; text-align:center; margin-bottom:12px;">
              <div style="font-size:10px; font-weight:800; color:#15803d; text-transform:uppercase; margin-bottom:2px;">Your OTP Code</div>
              <div style="font-size:22px; font-weight:900; color:#16a34a; letter-spacing:1px; cursor:pointer;" onclick="navigator.clipboard.writeText('${otpCode}'); showBuyToast('📋 OTP copied!', 'success');">${otpCode}</div>
              <div style="font-size:11px; color:#15803d; margin-top:4px; font-weight:500;">${otpFullText}</div>
            </div>
          ` : ''}

        </div>

        <div style="display:flex; gap:8px; margin-top:8px;">
          <button onclick="copyActiveNumber('${order.phone}')" style="flex:1; padding:8px; background:var(--border-light); border:1px solid var(--border); border-radius:8px; font-family:'Nunito',sans-serif; font-weight:700; font-size:11px; color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
            <i class="fa-solid fa-copy"></i> Copy
          </button>
          ${(!otpCode && !isHosting) ? `
            <button onclick="cancelActiveOrder('${order.id}', ${order.priceUSD})" style="flex:1; padding:8px; background:#fef2f2; border:1px solid #fca5a5; border-radius:8px; font-family:'Nunito',sans-serif; font-weight:700; font-size:11px; color:#b91c1c; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
              <i class="fa-solid fa-xmark"></i> Cancel
            </button>
            <button onclick="banActiveOrder('${order.id}', ${order.priceUSD})" style="flex:1; padding:8px; background:#fff5f5; border:1px solid #feb2b2; border-radius:8px; font-family:'Nunito',sans-serif; font-weight:700; font-size:11px; color:#c53030; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
              <i class="fa-solid fa-triangle-exclamation"></i> Ban
            </button>
          ` : ''}
          <button onclick="finishActiveOrder('${order.id}', '${order.type}')" style="flex:1; padding:8px; background:#f0fdf4; border:1px solid #86efac; border-radius:8px; font-family:'Nunito',sans-serif; font-weight:700; font-size:11px; color:#15803d; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
            <i class="fa-solid fa-check"></i> Done
          </button>
        </div>
      </div>
    `;
  }).join('');

  activeOrders.forEach(order => {
    startActiveTimer(order.id, order.expires);
  });
}

let activeOrdersPollInterval = null;
function startActiveOrdersPolling() {
  if (activeOrdersPollInterval) clearInterval(activeOrdersPollInterval);
  
  activeOrdersPollInterval = setInterval(async () => {
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const user    = users.find(u => u.username?.toLowerCase() === session.username?.toLowerCase());
    
    const activeOrders = user?.activeOrders || [];
    if (activeOrders.length === 0) return;

    for (let order of activeOrders) {
      if (order.status === 'FINISHED' || order.status === 'CANCELED' || order.status === 'TIMEOUT') continue;
      
      try {
        const res = await fetch(`${API_BASE}/check/${order.id}`);
        const json = await res.json();
        const apiOrder = json.data || json;
        if (!apiOrder) continue;

        const status = (apiOrder.status || '').toUpperCase();
        const smsList = Array.isArray(apiOrder.sms) ? apiOrder.sms : [];

        if (smsList.length > 0) {
          updateActiveOrder(order.id, { sms: smsList, status: 'RECEIVED' });
          showBuyToast(`✅ New OTP received for +${order.phone}!`, 'success');
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
          } catch(e) {}
        } else if (['TIMEOUT', 'CANCELED', 'BANNED'].includes(status)) {
          removeActiveOrder(order.id);
        }
      } catch (err) {
        console.error('Active order poll error:', err);
      }
    }
  }, 5000);
}

window.copyActiveNumber = function(phone) {
  navigator.clipboard.writeText(phone)
    .then(() => showBuyToast('📋 Number copied!', 'success'))
    .catch(() => showBuyToast('Number: ' + phone, 'info'));
};

window.cancelActiveOrder = async function(orderId, priceUSD) {
  if (!confirm('Cancel this order? Your balance will be refunded.')) return;
  try {
    await fetch(`${API_BASE}/cancel/${orderId}`, { method: 'POST' });
    
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const idx     = users.findIndex(u => u.username?.toLowerCase() === session.username?.toLowerCase());
    if (idx !== -1) {
      users[idx].balance = (users[idx].balance || 0) + priceUSD;
      users[idx].transactions = users[idx].transactions || [];
      users[idx].transactions.unshift({
        id:          'REF-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        type:        'Refund',
        amount:      priceUSD,
        description: `Refund: Order #${orderId} cancelled`,
        timestamp:   new Date().toISOString()
      });
      localStorage.setItem('primes_users', JSON.stringify(users));
      loadWalletBalance();
    }
    
    removeActiveOrder(orderId);
    showBuyToast('Order cancelled. Balance refunded.', 'info');
  } catch (err) {
    showBuyToast('Cancel failed: ' + err.message, 'error');
  }
};

window.banActiveOrder = async function(orderId, priceUSD) {
  if (!confirm('Report this number as banned? You will be refunded.')) return;
  try {
    await fetch(`${API_BASE}/ban/${orderId}`, { method: 'POST' });
    
    const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
    const users   = JSON.parse(localStorage.getItem('primes_users') || '[]');
    const idx     = users.findIndex(u => u.username?.toLowerCase() === session.username?.toLowerCase());
    if (idx !== -1) {
      users[idx].balance = (users[idx].balance || 0) + priceUSD;
      users[idx].transactions = users[idx].transactions || [];
      users[idx].transactions.unshift({
        id:          'BAN-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        type:        'Refund',
        amount:      priceUSD,
        description: `Banned Refund: Order #${orderId} reported banned`,
        timestamp:   new Date().toISOString()
      });
      localStorage.setItem('primes_users', JSON.stringify(users));
      loadWalletBalance();
    }
    
    removeActiveOrder(orderId);
    showBuyToast('Number reported as banned. Balance refunded.', 'info');
  } catch (err) {
    showBuyToast('Reporting ban failed: ' + err.message, 'error');
  }
};

window.finishActiveOrder = async function(orderId, type) {
  try {
    await fetch(`${API_BASE}/finish/${orderId}`, { method: 'POST' });
  } catch { /* ignore */ }
  removeActiveOrder(orderId);
  showBuyToast('✅ Order completed!', 'success');
};

// ══════════════════════════════════════════════════════════════
//  UI STATE HELPERS
// ══════════════════════════════════════════════════════════════
function showSkeletons() {
  document.getElementById('cardsGrid').innerHTML =
    Array(6).fill('<div class="skeleton-card"></div>').join('');
  document.getElementById('resultCount').textContent = '';
}

function renderEmptyState(msg) {
  document.getElementById('cardsGrid').innerHTML = `
    <div class="state-box">
      <i class="fa-solid fa-sim-card"></i>
      <p>${msg}</p>
    </div>`;
  document.getElementById('resultCount').textContent = '';
}

function renderErrorState(msg) {
  document.getElementById('cardsGrid').innerHTML = `
    <div class="state-box">
      <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i>
      <p style="color:#ef4444;">${msg}</p>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
function showBuyToast(message, type = 'success') {
  if (typeof showToast === 'function') { showToast(message, type); return; }
  // Fallback: simple toast
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:12px 18px;border-radius:10px;
    font-family:'Nunito',sans-serif;font-weight:700;font-size:13px;color:#fff;max-width:340px;
    background:${type==='error'?'#dc2626':type==='info'?'#0369a1':'#16a34a'};
    box-shadow:0 4px 20px rgba(0,0,0,0.2);`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 3500);
}

// ══════════════════════════════════════════════════════════════
//  CURRENCY SYNC
// ══════════════════════════════════════════════════════════════
function syncCurrencyHeader() {
  const cur  = getBuyCurrency();
  const symEl = document.getElementById('currencySymbol');
  const namEl = document.getElementById('currencyName');
  if (symEl) symEl.textContent = cur === 'USD' ? '$' : '₦';
  if (namEl) namEl.textContent = cur;
}

// ══════════════════════════════════════════════════════════════
//  BALANCE DISPLAY
// ══════════════════════════════════════════════════════════════
function loadWalletBalance() {
  const el = document.getElementById('buyWalletBalance');
  if (!el) return;
  const session = JSON.parse(localStorage.getItem('primes_session') || '{}');
  const users   = JSON.parse(localStorage.getItem('primes_users')   || '[]');
  const user    = users.find(u => u.username?.toLowerCase() === session.username?.toLowerCase());
  el.textContent = user ? formatBuyPrice(user.balance || 0) : formatBuyPrice(0);
}

async function load5simBalance() {
  const el  = document.getElementById('fivesimBalance');
  const box = document.getElementById('fivesimBalanceBox');
  if (!el) return;
  try {
    const res  = await fetch(`${API_BASE}/5simbalance`);
    const data = await res.json();
    if (!data.success) throw new Error('failed');
    const bal = parseFloat(data.balance || 0);
    if (bal <= 0) {
      el.textContent = 'Provider balance empty — purchases unavailable';
      if (box) { box.style.background='#fef2f2'; box.style.borderColor='#fca5a5'; box.style.color='#b91c1c'; }
    } else {
      el.textContent = 'Ready';
      if (box) { box.style.background='#f0fdf4'; box.style.borderColor='#86efac'; box.style.color='#15803d'; }
    }
  } catch {
    if (el) el.textContent = 'Status unknown';
  }
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  syncCurrencyHeader();
  loadWalletBalance();
  load5simBalance();
  renderActiveOrders();
  startActiveOrdersPolling();

  const switchEl = document.getElementById('currencySwitch');
  if (switchEl) {
    switchEl.addEventListener('click', () => {
      setTimeout(() => { syncCurrencyHeader(); loadWalletBalance(); renderCards(); renderActiveOrders(); }, 80);
    });
  }

  document.getElementById('countryFilter').addEventListener('change', handleCountryChange);
  document.getElementById('operatorFilter').addEventListener('change', loadProducts);
  document.getElementById('typeFilter').addEventListener('change', () => {
    populateServiceFilter(document.getElementById('typeFilter').value);
    renderCards();
  });
  document.getElementById('serviceFilter').addEventListener('change', renderCards);

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderCards, 300);
  });

  await loadCountries();
  
  const countrySelect = document.getElementById('countryFilter');
  if (countrySelect && countrySelect.options.length > 1) {
    const hasNigeria = Array.from(countrySelect.options).some(opt => opt.value.toLowerCase() === 'nigeria');
    if (hasNigeria) {
      countrySelect.value = 'nigeria';
    } else {
      countrySelect.value = countrySelect.options[1].value;
    }
    await handleCountryChange();
  } else {
    renderEmptyState('Select a country above to see available numbers');
  }
});