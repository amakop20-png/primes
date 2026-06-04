/* ══════════════════════════════════════
   ADMIN.JS — Dave's Social Admin Panel
   Fully functional admin dashboard
══════════════════════════════════════ */

// ── Storage Keys ──
const KEY_USERS    = 'primes_users';
const KEY_ACTIVITY = 'primes_activity';
const KEY_ORDERS   = 'primes_orders';
const KEY_ADMIN    = 'primes_admin_creds';
const KEY_CONFIG   = 'primes_platform_config';

// ── State ──
let allUsers    = [];
let allOrders   = [];
let allActivity = [];

/* ════════════════════════════════════
   HELPERS
════════════════════════════════════ */
function getData(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(ts) {
  return ts && ts.slice(0, 10) === today();
}

function isThisWeek(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  return (Date.now() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

function adminToast(msg, type = 'info') {
  const el = document.getElementById('adminToast');
  if (!el) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || '💬'}</span> ${msg}`;
  el.className = `admin-toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function statusBadge(status) {
  const cls = {
    RECEIVED: 'badge-received',
    FINISHED: 'badge-finished',
    CANCELED: 'badge-canceled',
    BANNED:   'badge-banned',
    PENDING:  'badge-pending',
  }[status?.toUpperCase()] || 'badge-pending';
  return `<span class="status-badge ${cls}">${status || 'Unknown'}</span>`;
}

/* ════════════════════════════════════
   SECTION SWITCHING
════════════════════════════════════ */
function showSection(id, btn) {
  // Sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(`section-${id}`);
  if (sec) sec.classList.add('active');

  // Nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Topbar title
  const titles = {
    overview: 'Overview',
    users:    'Users',
    orders:   'Orders',
    activity: 'Activity Log',
    settings: 'Settings',
  };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[id] || id;

  // Close sidebar on mobile
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ════════════════════════════════════
   LOAD ALL DATA
════════════════════════════════════ */
function loadAllData() {
  allUsers    = getData(KEY_USERS, []);
  allOrders   = getData(KEY_ORDERS, []);
  allActivity = getData(KEY_ACTIVITY, []);
}

/* ════════════════════════════════════
   OVERVIEW — STAT CARDS
════════════════════════════════════ */
function renderOverview() {
  const dateVal = document.getElementById('datePicker')?.value || '';

  // Users
  const usersInRange = dateVal
    ? allUsers.filter(u => u.createdAt?.slice(0, 10) === dateVal)
    : allUsers;

  const newThisWeek = allUsers.filter(u => isThisWeek(u.createdAt)).length;
  const signupsToday = allUsers.filter(u => isToday(u.createdAt)).length;
  const signupsWeek  = newThisWeek;

  // Active users (logged in last 7 days)
  const activeSet = new Set();
  allActivity.forEach(a => {
    if (a.type === 'login' && a.username && isThisWeek(a.timestamp)) {
      activeSet.add(a.username);
    }
  });

  // Orders
  const ordersInRange = dateVal
    ? allOrders.filter(o => o.createdAt?.slice(0, 10) === dateVal)
    : allOrders;

  const ordersToday = allOrders.filter(o => isToday(o.createdAt)).length;
  const totalRev    = allOrders.reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);
  const todayRev    = allOrders.filter(o => isToday(o.createdAt))
                               .reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);

  // Set values
  setText('totalUsers',      allUsers.length);
  setText('activeUsers',     activeSet.size);
  setText('totalOrders',     allOrders.length);
  setText('signupsToday',    signupsToday);
  setText('newUsersThisWeek', `+${newThisWeek} this week`);
  setText('signupsWeek',     `+${signupsWeek} this week`);
  setText('ordersToday',     `+${ordersToday} today`);
  setText('totalRevenue',    `₦${totalRev.toLocaleString()}`);
  setText('revenueToday',    `+₦${todayRev.toLocaleString()} today`);

  // Update nav badges
  setText('navUsersBadge',  allUsers.length);
  setText('navOrdersBadge', allOrders.length);

  // Recent users (last 5)
  renderRecentUsers();

  // Recent orders (last 5)
  renderRecentOrders();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ════════════════════════════════════
   RECENT USERS (Overview)
════════════════════════════════════ */
function renderRecentUsers() {
  const tbody = document.getElementById('recentUsersTbody');
  if (!tbody) return;
  const recent = [...allUsers].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-cell">No users registered yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(u => `
    <tr>
      <td><strong>${u.name || '—'}</strong><br><span style="font-size:11px;color:var(--muted)">${u.email || ''}</span></td>
      <td style="font-size:12px;color:var(--muted)">${fmtDate(u.createdAt)}</td>
      <td style="color:var(--green);font-weight:700">₦${parseFloat(u.balance || 0).toLocaleString()}</td>
    </tr>
  `).join('');
}

/* ════════════════════════════════════
   RECENT ORDERS (Overview)
════════════════════════════════════ */
function renderRecentOrders() {
  const tbody = document.getElementById('recentOrdersTbody');
  if (!tbody) return;
  const recent = [...allOrders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">No orders yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(o => `
    <tr>
      <td><strong>${o.service || o.product || '—'}</strong></td>
      <td style="font-size:12px;text-transform:capitalize">${o.country || '—'}</td>
      <td style="color:var(--amber);font-weight:700">₦${parseFloat(o.amountNGN || 0).toLocaleString()}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>
  `).join('');
}

/* ════════════════════════════════════
   USERS TABLE
════════════════════════════════════ */
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td style="color:var(--muted);font-size:12px">${i + 1}</td>
      <td>
        <div style="font-weight:600">${u.name || '—'}</div>
      </td>
      <td style="font-size:12px;color:var(--muted)">${u.email || '—'}</td>
      <td style="font-size:12px;color:var(--muted)">${u.phone || '—'}</td>
      <td style="color:var(--green);font-weight:700">₦${parseFloat(u.balance || 0).toLocaleString()}</td>
      <td style="font-size:12px;color:var(--muted)">${fmtDate(u.createdAt)}</td>
      <td>
        <button class="tbl-btn tbl-btn-view" onclick="viewUser('${u.email}')">View</button>
        <button class="tbl-btn tbl-btn-del"  onclick="deleteUser('${u.email}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const q = (document.getElementById('userSearch')?.value || '').toLowerCase();
  const filtered = allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.phone || '').toLowerCase().includes(q)
  );
  renderUsersTable(filtered);
}

function viewUser(email) {
  const u = allUsers.find(x => x.email === email);
  if (!u) return;
  const body = document.getElementById('userModalBody');
  if (body) {
    const fields = [
      { label: 'Name',    val: u.name || '—' },
      { label: 'Email',   val: u.email || '—' },
      { label: 'Phone',   val: u.phone || '—' },
      { label: 'Balance', val: `₦${parseFloat(u.balance || 0).toLocaleString()}` },
      { label: 'Joined',  val: fmt(u.createdAt) },
      { label: 'Ref Code', val: u.referralCode || '—' },
    ];
    body.innerHTML = fields.map(f => `
      <div class="modal-field">
        <div class="modal-field-label">${f.label}</div>
        <div class="modal-field-value">${f.val}</div>
      </div>
    `).join('');
  }
  document.getElementById('userModal').classList.add('show');
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
}

function deleteUser(email) {
  if (!confirm(`Are you sure you want to delete user: ${email}?`)) return;
  allUsers = allUsers.filter(u => u.email !== email);
  setData(KEY_USERS, allUsers);
  filterUsers();
  renderOverview();
  adminToast('User deleted.', 'success');
}

/* ════════════════════════════════════
   ORDERS TABLE
════════════════════════════════════ */
function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTbody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map((o, i) => `
    <tr>
      <td style="color:var(--muted);font-size:12px">${i + 1}</td>
      <td style="font-size:12px;font-family:monospace;color:var(--muted)">${o.orderId || '—'}</td>
      <td style="font-size:12px">${o.userName || o.userId || '—'}</td>
      <td style="font-weight:600;text-transform:capitalize">${o.service || o.product || '—'}</td>
      <td style="font-size:12px;text-transform:capitalize;color:var(--muted)">${o.country || '—'}</td>
      <td style="font-family:monospace;font-size:12px">${o.phone || '—'}</td>
      <td style="color:var(--amber);font-weight:700">₦${parseFloat(o.amountNGN || 0).toLocaleString()}</td>
      <td>${statusBadge(o.status)}</td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(o.createdAt)}</td>
    </tr>
  `).join('');
}

function filterOrders() {
  const q      = (document.getElementById('orderSearch')?.value || '').toLowerCase();
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const filtered = allOrders.filter(o => {
    const matchQ = (o.service || o.product || '').toLowerCase().includes(q) ||
                   (o.country || '').toLowerCase().includes(q) ||
                   (o.phone || '').toLowerCase().includes(q) ||
                   (o.userName || '').toLowerCase().includes(q) ||
                   (String(o.orderId || '')).includes(q);
    const matchStatus = !status || (o.status || '').toUpperCase() === status.toUpperCase();
    return matchQ && matchStatus;
  });
  renderOrdersTable(filtered);
}

/* ════════════════════════════════════
   ACTIVITY LOG
════════════════════════════════════ */
function renderActivityLog() {
  const dateVal = document.getElementById('activityDatePicker')?.value || '';
  const container = document.getElementById('activityLog');
  if (!container) return;

  const items = dateVal
    ? allActivity.filter(a => a.timestamp?.slice(0, 10) === dateVal)
    : allActivity;

  const sorted = [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (!sorted.length) {
    container.innerHTML = `<div class="empty-cell" style="padding:40px;text-align:center;">No activity recorded yet.</div>`;
    return;
  }

  const typeColors = {
    login:    'var(--green)',
    signup:   'var(--blue)',
    purchase: 'var(--amber)',
    fund:     'var(--teal)',
    error:    'var(--red)',
    default:  'var(--muted)',
  };

  container.innerHTML = sorted.slice(0, 100).map(a => {
    const color = typeColors[a.type] || typeColors.default;
    return `
      <div class="activity-item">
        <div class="activity-dot" style="background:${color}"></div>
        <div style="flex:1">
          <div class="activity-text">${a.message || a.type || 'Event'}</div>
          ${a.username ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">by ${a.username}</div>` : ''}
        </div>
        <div class="activity-time">${fmt(a.timestamp)}</div>
      </div>
    `;
  }).join('');
}

function clearActivity() {
  if (!confirm('Clear all activity logs? This cannot be undone.')) return;
  allActivity = [];
  setData(KEY_ACTIVITY, []);
  renderActivityLog();
  adminToast('Activity log cleared.', 'success');
}

/* ════════════════════════════════════
   SETTINGS
════════════════════════════════════ */
function loadSettingsForm() {
  const creds  = getData(KEY_ADMIN, { username: 'admin', password: 'admin123' });
  const config = getData(KEY_CONFIG, { rate: 1500, markup: 1.5, maintenance: false });

  const uEl = document.getElementById('adminUsername');
  const pEl = document.getElementById('adminPassword');
  const rEl = document.getElementById('adminRate');
  const mEl = document.getElementById('adminMarkup');
  const mnEl = document.getElementById('maintenanceMode');
  const fu   = document.getElementById('fundUserSelect');

  if (uEl) uEl.value = creds.username || '';
  if (pEl) pEl.value = '';  // never pre-fill password
  if (rEl) rEl.value = config.rate    || 1500;
  if (mEl) mEl.value = config.markup  || 1.5;
  if (mnEl) mnEl.checked = !!config.maintenance;

  // Populate user dropdown for Fund Wallet
  if (fu) {
    fu.innerHTML = allUsers.map(u =>
      `<option value="${u.email}">${u.name || u.email} — ₦${parseFloat(u.balance||0).toLocaleString()}</option>`
    ).join('');
    if (!allUsers.length) fu.innerHTML = '<option value="">No users yet</option>';
  }
}

function saveAdminCreds() {
  const username = document.getElementById('adminUsername')?.value.trim();
  const password = document.getElementById('adminPassword')?.value;
  if (!username) { adminToast('Username cannot be empty.', 'error'); return; }
  setData(KEY_ADMIN, { username, password: password || getData(KEY_ADMIN, {}).password });
  adminToast('Admin credentials saved!', 'success');
}

function savePlatformConfig() {
  const rate        = parseFloat(document.getElementById('adminRate')?.value);
  const markup      = parseFloat(document.getElementById('adminMarkup')?.value);
  const maintenance = document.getElementById('maintenanceMode')?.checked;
  if (isNaN(rate) || isNaN(markup)) { adminToast('Enter valid numbers.', 'error'); return; }
  setData(KEY_CONFIG, { rate, markup, maintenance });
  // Sync rate to existing buy.js config
  localStorage.setItem('adminRate',    rate);
  localStorage.setItem('adminMarkup',  markup);
  localStorage.setItem('maintenance',  maintenance ? '1' : '0');
  adminToast('Platform config saved!', 'success');
}

function fundUser() {
  const email  = document.getElementById('fundUserSelect')?.value;
  const amount = parseFloat(document.getElementById('fundAmount')?.value);
  if (!email) { adminToast('Please select a user.', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { adminToast('Enter a valid amount.', 'error'); return; }

  const idx = allUsers.findIndex(u => u.email === email);
  if (idx === -1) { adminToast('User not found.', 'error'); return; }

  allUsers[idx].balance = (parseFloat(allUsers[idx].balance || 0) + amount).toFixed(2);
  setData(KEY_USERS, allUsers);

  // Log activity
  logActivity('fund', `Admin credited ₦${amount.toLocaleString()} to ${allUsers[idx].name || email}`, email);

  adminToast(`₦${amount.toLocaleString()} added to ${allUsers[idx].name || email}`, 'success');
  loadSettingsForm();
  renderOverview();
}

function logActivity(type, message, username = '') {
  allActivity.unshift({ type, message, username, timestamp: new Date().toISOString() });
  setData(KEY_ACTIVITY, allActivity);
}

/* ════════════════════════════════════
   5SIM PROVIDER STATUS
════════════════════════════════════ */
async function checkProviderStatus() {
  const dot    = document.getElementById('providerDot');
  const status = document.getElementById('providerStatus');
  const balEl  = document.getElementById('providerBalance');
  const frozenEl = document.getElementById('providerFrozen');

  try {
    const res  = await fetch('/api/numbers/5simbalance');
    const data = await res.json();
    if (data.success) {
      const bal = parseFloat(data.balance || 0);
      if (dot)    { dot.className = 'chip-dot ' + (bal > 0 ? 'online' : 'offline'); }
      if (status) status.textContent = bal > 0 ? `5sim: $${bal.toFixed(2)} ✓` : '5sim: Empty!';
      if (balEl)  balEl.textContent = `$${bal.toFixed(2)}`;
      if (frozenEl) frozenEl.textContent = `Frozen: $${parseFloat(data.frozen || 0).toFixed(2)}`;
    } else {
      throw new Error('API error');
    }
  } catch {
    if (dot)    dot.className = 'chip-dot offline';
    if (status) status.textContent = '5sim: Offline';
    if (balEl)  balEl.textContent = 'N/A';
  }
}

/* ════════════════════════════════════
   REFRESH ALL
════════════════════════════════════ */
function refreshAll() {
  const btn  = document.querySelector('.refresh-btn');
  if (btn) btn.classList.add('spinning');

  loadAllData();
  renderOverview();
  renderUsersTable(allUsers);
  renderOrdersTable(allOrders);
  renderActivityLog();
  loadSettingsForm();
  checkProviderStatus();

  setTimeout(() => { if (btn) btn.classList.remove('spinning'); }, 700);
}

/* ════════════════════════════════════
   ADMIN AUTH GUARD
════════════════════════════════════ */
function adminAuthGuard() {
  const session = getData('primes_session', {});
  // Allow if admin flag set or if there's a special admin session
  const adminSession = getData('primes_admin_session', null);
  if (!adminSession) {
    // Show login prompt
    const pw = prompt('🔐 Enter admin password:');
    const creds = getData(KEY_ADMIN, { username: 'admin', password: 'admin123' });
    if (pw !== creds.password) {
      alert('❌ Incorrect password. Access denied.');
      window.location.href = 'dashboard.html';
      return false;
    }
    setData('primes_admin_session', { loggedIn: true, at: new Date().toISOString() });
  }

  // Set admin name in sidebar
  const creds = getData(KEY_ADMIN, { username: 'Admin' });
  const nameEl = document.getElementById('sidebarAdminName');
  if (nameEl) nameEl.textContent = creds.username || 'Admin';

  return true;
}

/* ════════════════════════════════════
   SEED DEMO DATA (if empty)
════════════════════════════════════ */
function seedDemoData() {
  if (allUsers.length > 0) return; // already has real data

  const demoUsers = [
    { name: 'Effort Litany', email: 'effortlitany@gmail.com', phone: '+234 801 234 5678', balance: '1500.00', createdAt: new Date(Date.now() - 2 * 24*60*60*1000).toISOString() },
    { name: 'Ada Okafor',    email: 'ada@example.com',        phone: '+234 802 345 6789', balance: '3200.00', createdAt: new Date(Date.now() - 5 * 24*60*60*1000).toISOString() },
    { name: 'Chidi Eze',     email: 'chidi@example.com',      phone: '+234 803 456 7890', balance: '750.00',  createdAt: new Date(Date.now() - 1 * 24*60*60*1000).toISOString() },
  ];

  const demoOrders = [
    { orderId: '11631001', service: 'WhatsApp', country: 'Nigeria', phone: '+2348012345678', amountNGN: 30,  status: 'RECEIVED', createdAt: new Date(Date.now() - 1*60*60*1000).toISOString(),  userName: 'Effort Litany' },
    { orderId: '11631002', service: 'Google',   country: 'Nigeria', phone: '+2348023456789', amountNGN: 15,  status: 'FINISHED', createdAt: new Date(Date.now() - 3*60*60*1000).toISOString(),  userName: 'Ada Okafor' },
    { orderId: '11631003', service: 'Telegram', country: 'Nigeria', phone: '+2348034567890', amountNGN: 45,  status: 'CANCELED', createdAt: new Date(Date.now() - 6*60*60*1000).toISOString(),  userName: 'Chidi Eze' },
    { orderId: '11631004', service: 'TikTok',   country: 'USA',     phone: '+15551234567',  amountNGN: 120, status: 'FINISHED', createdAt: new Date(Date.now() - 24*60*60*1000).toISOString(), userName: 'Effort Litany' },
  ];

  const demoActivity = [
    { type: 'signup',   message: 'New user registered: Chidi Eze',                       username: 'Chidi Eze',     timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString() },
    { type: 'purchase', message: 'WhatsApp number purchased: +2348012345678 (₦30)',       username: 'Effort Litany', timestamp: new Date(Date.now() - 1*60*60*1000).toISOString() },
    { type: 'login',    message: 'User logged in: Ada Okafor',                           username: 'Ada Okafor',    timestamp: new Date(Date.now() - 2*60*60*1000).toISOString() },
    { type: 'purchase', message: 'Google number purchased: +2348023456789 (₦15)',        username: 'Ada Okafor',    timestamp: new Date(Date.now() - 3*60*60*1000).toISOString() },
    { type: 'fund',     message: 'Wallet funded: ₦5,000 added to Effort Litany account', username: 'Effort Litany', timestamp: new Date(Date.now() - 5*60*60*1000).toISOString() },
    { type: 'login',    message: 'User logged in: Effort Litany',                        username: 'Effort Litany', timestamp: new Date(Date.now() - 6*60*60*1000).toISOString() },
  ];

  setData(KEY_USERS, demoUsers);
  setData(KEY_ORDERS, demoOrders);
  setData(KEY_ACTIVITY, demoActivity);

  allUsers    = demoUsers;
  allOrders   = demoOrders;
  allActivity = demoActivity;
}

/* ════════════════════════════════════
   CLOSE MODAL ON OUTSIDE CLICK
════════════════════════════════════ */
document.addEventListener('click', e => {
  const modal = document.getElementById('userModal');
  if (modal && e.target === modal) closeUserModal();
});

/* ════════════════════════════════════
   INIT
════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (!adminAuthGuard()) return;

  loadAllData();
  seedDemoData();   // seeds only if storage is empty

  renderOverview();
  renderUsersTable(allUsers);
  renderOrdersTable(allOrders);
  renderActivityLog();
  loadSettingsForm();
  checkProviderStatus();

  // Auto-refresh every 30s
  setInterval(() => {
    loadAllData();
    renderOverview();
    renderActivityLog();
    checkProviderStatus();
  }, 30_000);
});
