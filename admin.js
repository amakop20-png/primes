/* ══════════════════════════════════════════════════════════════════════
   ADMIN.JS — Nura SQ Production Administration Console Engine
   ══════════════════════════════════════════════════════════════════════ */

// ── Storage Keys ──
const KEY_CONFIG        = 'primes_platform_config';
const KEY_USERS         = 'primes_users';
const KEY_ORDERS        = 'primes_orders';
const KEY_ACTIVITY      = 'primes_activity';
const KEY_ADMIN_CREDS   = 'primes_admin_credentials';
const KEY_ADMIN_SESSION = 'primes_admin_session';

// ── In-Memory State ──
let allUsers        = [];
let allOrders       = [];
let allActivity     = [];
let allTransactions = [];
let pendingAction   = null;

/* ════════════════════════════════════
   FORMATTING & UTILITY HELPERS
════════════════════════════════════ */
function fmt(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString([], {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return String(ts);
  }
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString([], {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (_) {
    return String(ts);
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(ts) {
  return ts && ts.slice(0, 10) === todayISO();
}

function isThisWeek(ts) {
  if (!ts) return false;
  try {
    const d = new Date(ts);
    return (Date.now() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
  } catch (_) {
    return false;
  }
}

function adminToast(msg, type = 'info') {
  const el = document.getElementById('adminToast');
  if (!el) return;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  el.innerHTML = '<span style="font-weight:700;font-size:15px;">' + (icons[type] || 'ℹ') + '</span> ' + escapeHTML(msg);
  el.className = 'admin-toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3800);
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function copyToClipboard(text, label = 'Copied') {
  if (!text) return;
  navigator.clipboard.writeText(String(text)).then(() => {
    adminToast(label + ' to clipboard!', 'success');
  }).catch(() => {
    adminToast('Failed to copy', 'error');
  });
}

function statusBadge(status) {
  const s = String(status || '').toUpperCase();
  let cls = 'badge-pending';
  if (s === 'RECEIVED' || s === 'SUCCESS' || s === 'ACTIVE') cls = 'badge-received';
  else if (s === 'FINISHED' || s === 'COMPLETED') cls = 'badge-finished';
  else if (s === 'CANCELED' || s === 'CANCELLED') cls = 'badge-canceled';
  else if (s === 'BANNED' || s === 'FAILED') cls = 'badge-banned';
  return '<span class="status-badge ' + cls + '">' + escapeHTML(status || 'Pending') + '</span>';
}

/* ════════════════════════════════════
   ADMIN AUTHENTICATION & ACCESS GATE
   (Dedicated standalone admin access — distinct from customer dashboard)
════════════════════════════════════ */
function getAdminCreds() {
  try {
    const raw = localStorage.getItem(KEY_ADMIN_CREDS);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { username: 'admin', password: 'admin123' };
}

function setAdminCreds(creds) {
  localStorage.setItem(KEY_ADMIN_CREDS, JSON.stringify(creds));
}

function getAdminSession() {
  try {
    const raw = localStorage.getItem(KEY_ADMIN_SESSION);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function setAdminSession(sess) {
  if (!sess) localStorage.removeItem(KEY_ADMIN_SESSION);
  else localStorage.setItem(KEY_ADMIN_SESSION, JSON.stringify(sess));
}

function isUserAdminRole() {
  try {
    const userSession = typeof getSession === 'function' ? getSession() : JSON.parse(localStorage.getItem('primes_session') || 'null');
    return userSession && (userSession.role === 'admin' || userSession.role === 'superadmin');
  } catch (_) {
    return false;
  }
}

function checkAdminAuth() {
  const adminSess = getAdminSession();
  const hasAdminRole = isUserAdminRole();
  const gateOverlay = document.getElementById('adminGateOverlay');

  if (adminSess && adminSess.loggedIn) {
    if (gateOverlay) gateOverlay.classList.add('hidden');
    const nameEl = document.getElementById('sidebarAdminName');
    const roleEl = document.getElementById('sidebarAdminRole');
    if (nameEl) nameEl.textContent = adminSess.username || 'Admin';
    if (roleEl) roleEl.textContent = 'Super Admin';
    return true;
  }

  if (hasAdminRole) {
    const userSession = typeof getSession === 'function' ? getSession() : JSON.parse(localStorage.getItem('primes_session') || 'null');
    const adminUser = userSession.name || userSession.username || userSession.email || 'Admin';
    setAdminSession({ loggedIn: true, username: adminUser, at: new Date().toISOString() });
    if (gateOverlay) gateOverlay.classList.add('hidden');
    const nameEl = document.getElementById('sidebarAdminName');
    const roleEl = document.getElementById('sidebarAdminRole');
    if (nameEl) nameEl.textContent = adminUser;
    if (roleEl) roleEl.textContent = userSession.role === 'superadmin' ? 'Super Admin' : 'Admin';
    return true;
  }

  // Not authenticated: reveal dedicated admin gate overlay right on admin.html
  // NEVER redirect to dashboard.html or login.html!
  if (gateOverlay) {
    gateOverlay.classList.remove('hidden');
    const userIn = document.getElementById('adminGateUser');
    const passIn = document.getElementById('adminGatePass');
    const creds = getAdminCreds();
    if (userIn && !userIn.value) userIn.value = creds.username || 'admin';
    if (passIn) {
      passIn.value = '';
      setTimeout(() => passIn.focus(), 150);
    }
  }
  return false;
}

function handleAdminGateLogin(e) {
  if (e) e.preventDefault();
  const userIn = document.getElementById('adminGateUser');
  const passIn = document.getElementById('adminGatePass');
  const errEl  = document.getElementById('adminGateError');
  const errMsg = document.getElementById('adminGateErrorMsg');
  const btn    = document.getElementById('adminGateSubmitBtn');

  const username = userIn ? userIn.value.trim() : '';
  const password = passIn ? passIn.value : '';

  if (!username || !password) {
    if (errEl) errEl.style.display = 'flex';
    if (errMsg) errMsg.textContent = 'Please enter both username and password.';
    return;
  }

  const creds = getAdminCreds();
  if (username.toLowerCase() === creds.username.toLowerCase() && password === creds.password) {
    if (errEl) errEl.style.display = 'none';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner spinning"></i> Authenticating...';
    }

    setTimeout(async () => {
      setAdminSession({ loggedIn: true, username: creds.username, at: new Date().toISOString() });
      logActivity('config', `Administrator ${creds.username} signed in to Admin Console`);
      adminToast('Admin authenticated successfully', 'success');

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-sign-in"></i> Sign In to Admin Console';
      }

      checkAdminAuth();
      await refreshAll();
    }, 350);
  } else {
    if (errEl) errEl.style.display = 'flex';
    if (errMsg) errMsg.textContent = 'Invalid administrator credentials. Access denied.';
    if (passIn) {
      passIn.value = '';
      passIn.focus();
    }
  }
}

function toggleGatePassword() {
  const pass = document.getElementById('adminGatePass');
  const eye  = document.getElementById('adminGatePassEye');
  if (!pass) return;
  if (pass.type === 'password') {
    pass.type = 'text';
    if (eye) eye.className = 'ph ph-eye-slash';
  } else {
    pass.type = 'password';
    if (eye) eye.className = 'ph ph-eye';
  }
}

function adminLogout() {
  openConfirmModal(
    'Log Out of Admin Console',
    'Are you sure you want to end your administrative session?',
    () => {
      setAdminSession(null);
      const gateOverlay = document.getElementById('adminGateOverlay');
      if (gateOverlay) gateOverlay.classList.remove('hidden');
      const passIn = document.getElementById('adminGatePass');
      if (passIn) {
        passIn.value = '';
        passIn.focus();
      }
      adminToast('You have been logged out of the Admin Console.', 'info');
    }
  );
}

function updateAdminCredentials() {
  const userEl = document.getElementById('adminUsernameSetting');
  const passEl = document.getElementById('adminNewPasswordSetting');
  const username = userEl ? userEl.value.trim() : '';
  const newPass  = passEl ? passEl.value.trim() : '';

  const creds = getAdminCreds();

  if (username) {
    creds.username = username;
  }
  if (newPass) {
    if (newPass.length < 6) {
      adminToast('New password must be at least 6 characters.', 'error');
      return;
    }
    creds.password = newPass;
  }

  setAdminCreds(creds);
  logActivity('config', `Admin access credentials updated (Username: ${creds.username})`);
  adminToast('Admin credentials updated successfully.', 'success');

  if (passEl) passEl.value = '';
  const nameEl = document.getElementById('sidebarAdminName');
  if (nameEl) nameEl.textContent = creds.username;
}

/* ════════════════════════════════════
   SECTION NAVIGATION
════════════════════════════════════ */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('section-' + id);
  if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const titles = {
    overview:     'Dashboard Overview',
    users:        'User Management',
    orders:       'Order Auditing',
    transactions: 'Platform Transactions',
    activity:     'Platform Activity Log',
    settings:     'Platform Administration Settings'
  };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[id] || 'Admin Console';

  if (window.innerWidth <= 900) {
    document.getElementById('sidebar')?.classList.remove('open');
  }

  // Section specific triggers
  if (id === 'transactions' && !allTransactions.length) {
    loadBackendTransactions();
  }
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

/* ════════════════════════════════════
   LIVE PROVIDER (5SIM) STATUS
   Directly communicates with real backend GET /api/profile
════════════════════════════════════ */
async function checkProviderStatus() {
  const dot    = document.getElementById('providerDot');
  const status = document.getElementById('providerStatus');
  const balEl  = document.getElementById('providerBalance');

  try {
    const res = await fetch('https://nurasms-api.onrender.com/api/profile', {
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      const profile = data.profile || data;
      const bal = parseFloat(profile.balance ?? 0).toFixed(2);
      const rating = profile.rating ?? 96;

      if (dot) dot.className = 'chip-dot online';
      if (status) status.textContent = `5sim: Online (★ ${rating})`;
      if (balEl) balEl.textContent = `5sim Balance: ${bal} ₽`;
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    if (dot) dot.className = 'chip-dot offline';
    if (status) status.textContent = '5sim: Upstream Offline';
    if (balEl) balEl.textContent = '5sim: Unavailable';
  }
}

/* ════════════════════════════════════
   DATA LOAD & STORAGE SYNC
════════════════════════════════════ */
async function loadAllData() {
  try {
    allUsers    = JSON.parse(localStorage.getItem(KEY_USERS) || '[]');
    allOrders   = JSON.parse(localStorage.getItem(KEY_ORDERS) || '[]');
    allActivity = JSON.parse(localStorage.getItem(KEY_ACTIVITY) || '[]');
  } catch (err) {
    console.error('Error reading local admin data:', err);
    adminToast('Failed to load local records.', 'error');
  }
}

/* ════════════════════════════════════
   OVERVIEW CALCULATIONS & RENDERING
════════════════════════════════════ */
function renderOverview() {
  const dateVal = document.getElementById('datePicker')?.value || '';

  const usersFiltered = dateVal
    ? allUsers.filter(u => u.createdAt && u.createdAt.slice(0, 10) === dateVal)
    : allUsers;

  const ordersFiltered = dateVal
    ? allOrders.filter(o => o.createdAt && o.createdAt.slice(0, 10) === dateVal)
    : allOrders;

  const newThisWeek = allUsers.filter(u => isThisWeek(u.createdAt)).length;
  const signupsToday = allUsers.filter(u => isToday(u.createdAt)).length;

  const activeSet = new Set();
  allActivity.forEach(a => {
    if (a.type === 'login' && a.username && isThisWeek(a.timestamp)) {
      activeSet.add(a.username);
    }
  });

  const ordersToday = allOrders.filter(o => isToday(o.createdAt)).length;
  const totalRev    = ordersFiltered.reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);
  const todayRev    = allOrders.filter(o => isToday(o.createdAt)).reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);
  const totalUserWallets = allUsers.reduce((s, u) => s + (parseFloat(u.balance) || 0), 0);

  setText('totalUsers',        usersFiltered.length.toLocaleString());
  setText('activeUsers',       activeSet.size.toLocaleString());
  setText('totalOrders',       ordersFiltered.length.toLocaleString());
  setText('totalUserWallets',  '₦' + Math.round(totalUserWallets).toLocaleString());
  setText('signupsToday',      signupsToday.toLocaleString());
  setText('newUsersThisWeek',  '+' + newThisWeek + ' this week');
  setText('signupsWeek',       '+' + newThisWeek + ' this week');
  setText('ordersToday',       '+' + ordersToday + ' today');
  setText('totalRevenue',      '₦' + Math.round(totalRev).toLocaleString());
  setText('revenueToday',      '+₦' + Math.round(todayRev).toLocaleString() + ' today');

  setText('navUsersBadge',  allUsers.length);
  setText('navOrdersBadge', allOrders.length);

  renderRecentUsers(usersFiltered);
  renderRecentOrders(ordersFiltered);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function onOverviewDateChange() {
  renderOverview();
  adminToast('Statistics filtered by date.', 'info');
}

function resetDateFilter() {
  const dp = document.getElementById('datePicker');
  if (dp) dp.value = '';
  renderOverview();
}

function renderRecentUsers(list = allUsers) {
  const tbody = document.getElementById('recentUsersTbody');
  if (!tbody) return;
  const recent = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No users registered yet.</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(u => `
    <tr>
      <td>
        <strong style="color:var(--text);">${escapeHTML(u.name || u.username || 'User')}</strong><br>
        <span style="font-size:11px;color:var(--muted);">${escapeHTML(u.email || '—')}</span>
      </td>
      <td style="font-size:12px;color:var(--muted);">${fmtDate(u.createdAt)}</td>
      <td style="color:var(--green);font-weight:700;">₦${parseFloat(u.balance || 0).toLocaleString()}</td>
    </tr>
  `).join('');
}

function renderRecentOrders(list = allOrders) {
  const tbody = document.getElementById('recentOrdersTbody');
  if (!tbody) return;
  const recent = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No orders recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map(o => `
    <tr>
      <td><strong style="text-transform:capitalize;">${escapeHTML(o.service || o.product || '—')}</strong></td>
      <td style="font-size:12px;text-transform:capitalize;color:var(--muted);">${escapeHTML(o.country || '—')}</td>
      <td style="color:var(--amber);font-weight:700;">₦${parseFloat(o.amountNGN || 0).toLocaleString()}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>
  `).join('');
}

/* ════════════════════════════════════
   USER MANAGEMENT
════════════════════════════════════ */
function renderUsersTable(users = allUsers) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No matching users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
      <td>
        <div style="font-weight:600;color:var(--text);">${escapeHTML(u.name || u.username || 'User')}</div>
        <div style="font-size:12px;color:var(--muted);">${escapeHTML(u.email || '—')}</div>
      </td>
      <td style="font-size:12px;color:var(--muted);font-family:monospace;">${escapeHTML(u.phone || '—')}</td>
      <td style="color:var(--green);font-weight:700;">₦${parseFloat(u.balance || 0).toLocaleString()}</td>
      <td><span class="status-badge ${u.role === 'admin' ? 'badge-finished' : 'badge-received'}">${escapeHTML(u.role || 'user')}</span></td>
      <td style="font-size:12px;color:var(--muted);">${fmtDate(u.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="tbl-btn tbl-btn-view" onclick="viewUser('${escapeHTML(u.email)}')"><i class="ph ph-eye"></i> View</button>
          <button class="tbl-btn tbl-btn-fund" onclick="quickFundUser('${escapeHTML(u.email)}')"><i class="ph ph-plus"></i> Fund</button>
          <button class="tbl-btn tbl-btn-del" onclick="confirmDeleteUser('${escapeHTML(u.email)}')"><i class="ph ph-trash"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const q = (document.getElementById('userSearch')?.value || '').toLowerCase().trim();
  if (!q) {
    renderUsersTable(allUsers);
    return;
  }
  const filtered = allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.phone || '').toLowerCase().includes(q)
  );
  renderUsersTable(filtered);
}

function refreshUsersData() {
  loadAllData();
  renderUsersTable(allUsers);
  adminToast('User list refreshed.', 'info');
}

function viewUser(email) {
  const u = allUsers.find(x => x.email === email);
  if (!u) {
    adminToast('User details not found.', 'error');
    return;
  }

  const userOrders = allOrders.filter(o => (o.userEmail === email || o.userName === u.name));

  const body = document.getElementById('userModalBody');
  if (body) {
    body.innerHTML = `
      <div class="modal-field">
        <div class="modal-field-label">Full Name</div>
        <div class="modal-field-value">${escapeHTML(u.name || '—')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Email Address</div>
        <div class="modal-field-value">${escapeHTML(u.email || '—')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Phone Number</div>
        <div class="modal-field-value">${escapeHTML(u.phone || '—')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Account Balance</div>
        <div class="modal-field-value" style="color:var(--green);font-weight:700;">₦${parseFloat(u.balance || 0).toLocaleString()}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Account Role</div>
        <div class="modal-field-value">${escapeHTML(u.role || 'user')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Total Orders Placed</div>
        <div class="modal-field-value">${userOrders.length}</div>
      </div>
      <div class="modal-field full-width">
        <div class="modal-field-label">Registration Date</div>
        <div class="modal-field-value">${fmt(u.createdAt)}</div>
      </div>
    `;
  }
  showModal('userModal');
}

function quickFundUser(email) {
  showSection('settings', document.querySelector('[data-section=settings]'));
  const sel = document.getElementById('fundUserSelect');
  if (sel) sel.value = email;
  const amtInput = document.getElementById('fundAmount');
  if (amtInput) amtInput.focus();
}

function confirmDeleteUser(email) {
  openConfirmModal(
    'Delete User Account',
    `Are you sure you want to completely remove user ${email}? This will delete their local profile record.`,
    () => {
      try {
        allUsers = allUsers.filter(u => u.email !== email);
        localStorage.setItem(KEY_USERS, JSON.stringify(allUsers));
        logActivity('user_delete', `Deleted user account: ${email}`);
        adminToast('User account removed successfully.', 'success');
        refreshAll();
      } catch (err) {
        adminToast(err.message || 'Failed to delete user.', 'error');
      }
    }
  );
}

/* ════════════════════════════════════
   ORDER AUDITING & LIVE 5SIM CHECK
════════════════════════════════════ */
function renderOrdersTable(orders = allOrders) {
  const tbody = document.getElementById('ordersTbody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">No matching orders found.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
      <td>
        <span style="font-family:monospace;font-size:12px;color:var(--text);">${escapeHTML(String(o.orderId || o.id || '—'))}</span>
        <button class="copy-btn" onclick="copyToClipboard('${escapeHTML(String(o.orderId || o.id || ''))}', 'Order ID')" title="Copy ID"><i class="ph ph-copy"></i></button>
      </td>
      <td style="font-size:12px;color:var(--muted);">${escapeHTML(o.userName || o.userEmail || o.userId || 'User')}</td>
      <td><strong style="text-transform:capitalize;">${escapeHTML(o.service || o.product || '—')}</strong></td>
      <td style="font-size:12px;text-transform:capitalize;color:var(--muted);">${escapeHTML(o.country || '—')}</td>
      <td style="font-family:monospace;font-size:12px;color:var(--text);">${escapeHTML(o.phone || '—')}</td>
      <td style="color:var(--amber);font-weight:700;">₦${parseFloat(o.amountNGN || 0).toLocaleString()}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-size:11px;color:var(--muted);">${fmt(o.createdAt)}</td>
      <td>
        <button class="tbl-btn tbl-btn-view" onclick="checkLiveOrderStatus('${escapeHTML(String(o.orderId || o.id || ''))}')" title="Check live 5sim status"><i class="ph ph-arrow-clockwise"></i> Check</button>
      </td>
    </tr>
  `).join('');
}

function filterOrders() {
  const q      = (document.getElementById('orderSearch')?.value || '').toLowerCase().trim();
  const status = (document.getElementById('orderStatusFilter')?.value || '').toUpperCase().trim();

  const filtered = allOrders.filter(o => {
    const matchQ = !q ||
      (o.service || o.product || '').toLowerCase().includes(q) ||
      (o.country || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.userName || o.userEmail || '').toLowerCase().includes(q) ||
      String(o.orderId || o.id || '').includes(q);

    const matchStatus = !status || String(o.status || '').toUpperCase() === status;
    return matchQ && matchStatus;
  });

  renderOrdersTable(filtered);
}

function refreshOrdersData() {
  loadAllData();
  renderOrdersTable(allOrders);
  adminToast('Orders refreshed.', 'info');
}

async function checkLiveOrderStatus(orderId) {
  if (!orderId || orderId === '—') {
    adminToast('Invalid order reference.', 'error');
    return;
  }

  adminToast('Querying live provider order...', 'info');

  try {
    let orderData = null;
    if (typeof getOrder === 'function') {
      orderData = await getOrder(orderId);
    } else {
      const res = await fetch(`https://nurasms-api.onrender.com/api/order/${encodeURIComponent(orderId)}`);
      orderData = await res.json();
    }

    const o = orderData.order || orderData;
    const body = document.getElementById('orderModalBody');
    if (body) {
      body.innerHTML = `
        <div class="modal-field">
          <div class="modal-field-label">Order ID</div>
          <div class="modal-field-value" style="font-family:monospace;">${escapeHTML(String(o.id || orderId))}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Live Status</div>
          <div class="modal-field-value">${statusBadge(o.status)}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Phone Number</div>
          <div class="modal-field-value" style="font-family:monospace;">${escapeHTML(o.phone || '—')}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Received SMS Code</div>
          <div class="modal-field-value" style="color:var(--green);font-size:16px;font-weight:800;">${escapeHTML(o.sms?.[0]?.code || o.code || 'None yet')}</div>
        </div>
        <div class="modal-field full-width">
          <div class="modal-field-label">Full SMS Payload</div>
          <div class="modal-field-value" style="font-size:12px;color:var(--muted);">${escapeHTML(o.sms?.[0]?.text || 'Waiting for provider transmission...')}</div>
        </div>
      `;
    }
    showModal('orderModal');

    // Sync updated status to local array
    if (o.status) {
      const existing = allOrders.find(x => String(x.orderId || x.id) === String(orderId));
      if (existing) {
        existing.status = o.status;
        localStorage.setItem(KEY_ORDERS, JSON.stringify(allOrders));
        renderOrdersTable(allOrders);
      }
    }
  } catch (err) {
    adminToast(`Provider query error: ${err.message || 'Unable to fetch status'}`, 'error');
  }
}

/* ════════════════════════════════════
   BACKEND TRANSACTIONS AUDITING
   Directly communicates with real backend GET /api/get-transactions
════════════════════════════════════ */
async function loadBackendTransactions() {
  const tbody = document.getElementById('transactionsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Syncing transactions from backend...</td></tr>';

  try {
    let result = null;
    if (typeof getTransactions === 'function') {
      result = await getTransactions(1, 50, 'NGN');
    } else {
      const token = getAuthToken();
      const res = await fetch('https://nurasms-api.onrender.com/api/get-transactions?page=1&limit=50&currency=NGN', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      result = await res.json();
    }

    const txList = result.data || result.transactions || [];
    allTransactions = txList;
    setText('navTxBadge', txList.length);

    if (!tbody) return;

    if (!txList.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No platform transactions found on backend.</td></tr>';
      return;
    }

    tbody.innerHTML = txList.map((t, i) => `
      <tr>
        <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
        <td>
          <span style="font-family:monospace;font-size:12px;">${escapeHTML(t.reference || t.id || t._id || '—')}</span>
          <button class="copy-btn" onclick="copyToClipboard('${escapeHTML(t.reference || t.id || '')}', 'Reference')" title="Copy"><i class="ph ph-copy"></i></button>
        </td>
        <td><span class="status-badge badge-received">${escapeHTML(t.type || 'DEPOSIT')}</span></td>
        <td style="color:var(--green);font-weight:700;">₦${parseFloat(t.amount || 0).toLocaleString()}</td>
        <td>${statusBadge(t.status || 'SUCCESS')}</td>
        <td style="font-size:12px;color:var(--muted);">${fmt(t.createdAt || t.date)}</td>
      </tr>
    `).join('');

    adminToast('Backend transactions synchronized.', 'success');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-cell" style="color:var(--red);">Failed to sync transactions: ${escapeHTML(err.message)}</td></tr>`;
    adminToast('Could not load transactions from backend.', 'error');
  }
}

/* ════════════════════════════════════
   ACTIVITY LOG
════════════════════════════════════ */
function renderActivityLog() {
  const dateVal = document.getElementById('activityDatePicker')?.value || '';
  const typeVal = document.getElementById('activityTypeFilter')?.value || '';
  const container = document.getElementById('activityLog');
  if (!container) return;

  let items = allActivity;
  if (dateVal) {
    items = items.filter(a => a.timestamp && a.timestamp.slice(0, 10) === dateVal);
  }
  if (typeVal) {
    items = items.filter(a => a.type === typeVal);
  }

  const sorted = [...items].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-cell">No activity records match the selected filters.</div>';
    return;
  }

  const typeColors = {
    login:    'var(--green)',
    signup:   'var(--blue)',
    purchase: 'var(--amber)',
    fund:     'var(--teal)',
    config:   'var(--purple)',
    error:    'var(--red)',
    default:  'var(--muted)'
  };

  container.innerHTML = sorted.slice(0, 100).map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${typeColors[a.type] || typeColors.default}"></div>
      <div style="flex:1;">
        <div class="activity-text">${escapeHTML(a.message || a.type || 'Platform Event')}</div>
        ${a.username ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">by ${escapeHTML(a.username)}</div>` : ''}
      </div>
      <div class="activity-time">${fmt(a.timestamp)}</div>
    </div>
  `).join('');
}

function logActivity(type, message) {
  try {
    const session = typeof getSession === 'function' ? getSession() : {};
    const adminUser = session?.name || session?.username || 'Admin';
    allActivity.unshift({
      type,
      message,
      username: adminUser,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem(KEY_ACTIVITY, JSON.stringify(allActivity.slice(0, 150)));
  } catch (_) {}
}

function confirmClearActivity() {
  openConfirmModal(
    'Clear All Activity Records',
    'Are you sure you want to permanently clear the activity log audit trail?',
    () => {
      allActivity = [];
      localStorage.removeItem(KEY_ACTIVITY);
      renderActivityLog();
      adminToast('Activity audit trail cleared.', 'success');
    }
  );
}

/* ════════════════════════════════════
   PLATFORM SETTINGS & ACTIONS
════════════════════════════════════ */
function loadSettingsForm() {
  const config = JSON.parse(localStorage.getItem(KEY_CONFIG) || '{"rate":1500,"markup":1.5,"maintenance":false}');

  const rEl  = document.getElementById('adminRate');
  const mEl  = document.getElementById('adminMarkup');
  const mnEl = document.getElementById('maintenanceMode');
  const fu   = document.getElementById('fundUserSelect');

  if (rEl)  rEl.value  = config.rate || 1500;
  if (mEl)  mEl.value  = config.markup || 1.5;
  if (mnEl) mnEl.checked = !!config.maintenance;

  if (fu) {
    if (!allUsers.length) {
      fu.innerHTML = '<option value="">No users registered</option>';
    } else {
      fu.innerHTML = allUsers.map(u => `
        <option value="${escapeHTML(u.email)}">${escapeHTML(u.name || u.email)} (₦${parseFloat(u.balance || 0).toLocaleString()})</option>
      `).join('');
    }
  }

  const userIn = document.getElementById('adminUsernameSetting');
  if (userIn) userIn.value = getAdminCreds().username || 'admin';
}

function savePlatformConfig() {
  const rate        = parseFloat(document.getElementById('adminRate')?.value);
  const markup      = parseFloat(document.getElementById('adminMarkup')?.value);
  const maintenance = document.getElementById('maintenanceMode')?.checked;

  if (isNaN(rate) || rate <= 0) {
    adminToast('Please provide a valid exchange rate greater than 0.', 'error');
    return;
  }
  if (isNaN(markup) || markup < 1.0) {
    adminToast('Markup multiplier must be at least 1.0.', 'error');
    return;
  }

  const payload = { rate, markup, maintenance: !!maintenance };
  localStorage.setItem(KEY_CONFIG, JSON.stringify(payload));
  localStorage.setItem('adminRate', rate);
  localStorage.setItem('adminMarkup', markup);
  localStorage.setItem('maintenance', maintenance ? '1' : '0');

  logActivity('config', `Updated platform config: Rate=₦${rate}, Markup=${markup}x, Maintenance=${maintenance}`);
  adminToast('Platform parameters saved successfully!', 'success');
}

async function fundUser() {
  const email  = document.getElementById('fundUserSelect')?.value;
  const amount = parseFloat(document.getElementById('fundAmount')?.value);

  if (!email) {
    adminToast('Please select a valid user.', 'error');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    adminToast('Please enter a credit amount greater than 0.', 'error');
    return;
  }

  try {
    let target = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (target) {
      const previousBal = parseFloat(target.balance || 0);
      const newBal = previousBal + amount;
      target.balance = String(newBal);
      localStorage.setItem(KEY_USERS, JSON.stringify(allUsers));

      logActivity('fund', `Admin credited ₦${amount.toLocaleString()} to ${email} (New balance: ₦${newBal.toLocaleString()})`);
      adminToast(`Successfully funded ₦${amount.toLocaleString()} to ${email}`, 'success');

      document.getElementById('fundAmount').value = '';
      refreshAll();
    } else {
      adminToast('User not found in system records.', 'error');
    }
  } catch (err) {
    adminToast(err.message || 'Failed to fund user.', 'error');
  }
}

async function makeAnnouncement() {
  const msg = document.getElementById('announcementMessage')?.value.trim();
  if (!msg) {
    adminToast('Please enter an announcement message.', 'error');
    return;
  }

  const payload = JSON.stringify({ message: msg, id: Date.now() });
  localStorage.setItem('global_announcement', payload);

  logActivity('config', `Broadcast announcement: "${msg.slice(0, 40)}..."`);
  adminToast('Announcement broadcasted to all users!', 'success');
  document.getElementById('announcementMessage').value = '';
}

function confirmLogoutAllUsers() {
  openConfirmModal(
    'Force Logout All Platform Users',
    'This will invalidate active sessions across all devices. Users will be required to re-authenticate. Proceed?',
    () => {
      localStorage.removeItem('primes_session');
      logActivity('config', 'Admin forced session invalidation for all active users');
      adminToast('All active user sessions invalidated.', 'success');
    }
  );
}

/* ════════════════════════════════════
   MODAL CONTROLLER
════════════════════════════════════ */
function showModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('show');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('show');
  if (id === 'confirmModal') pendingAction = null;
}

function openConfirmModal(title, message, onConfirm) {
  const m = document.getElementById('confirmModal');
  const t = document.getElementById('confirmModalTitle');
  const p = document.getElementById('confirmModalMessage');
  const b = document.getElementById('confirmModalBtn');

  if (t) t.innerHTML = `<i class="ph ph-warning-circle"></i> ${escapeHTML(title)}`;
  if (p) p.textContent = message;

  pendingAction = onConfirm;

  if (b) {
    b.onclick = () => {
      if (typeof pendingAction === 'function') {
        pendingAction();
      }
      closeModal('confirmModal');
    };
  }

  showModal('confirmModal');
}

/* ════════════════════════════════════
   REFRESH ALL
════════════════════════════════════ */
async function refreshAll() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.classList.add('spinning');

  await loadAllData();
  renderOverview();
  renderUsersTable(allUsers);
  renderOrdersTable(allOrders);
  renderActivityLog();
  loadSettingsForm();
  checkProviderStatus();

  setTimeout(() => {
    if (btn) btn.classList.remove('spinning');
  }, 600);
}

/* ════════════════════════════════════
   INITIALIZATION & EVENT BINDINGS
════════════════════════════════════ */
document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
    pendingAction = null;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    pendingAction = null;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const isAuth = checkAdminAuth();
  if (!isAuth) return;

  await refreshAll();

  // Periodic provider health poll every 45 seconds
  setInterval(() => {
    const sess = getAdminSession();
    if (sess && sess.loggedIn) checkProviderStatus();
  }, 45000);
});
