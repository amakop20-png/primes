/* ══════════════════════════════════════
   ADMIN.JS — Dave's Social Admin Panel
   Fully functional admin dashboard
══════════════════════════════════════ */

// ── Storage Keys ──
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
  el.innerHTML = <span> + (icons[type] || '💬') + </span>  + msg;
  el.className = 'admin-toast show ' + type;
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
  return <span class="status-badge  + cls + "> + (status || 'Unknown') + </span>;
}

/* ════════════════════════════════════
   SECTION SWITCHING
════════════════════════════════════ */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('section-' + id);
  if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const titles = { overview: 'Overview', users: 'Users', orders: 'Orders', activity: 'Activity Log', settings: 'Settings' };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[id] || id;

  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ════════════════════════════════════
   LOAD ALL DATA FROM API
════════════════════════════════════ */
async function loadAllData() {
  try {
    const [uRes, oRes, aRes] = await Promise.all([
      apiRequest('/api/admin/users', { method: 'GET' }).catch(() => []),
      apiRequest('/api/admin/orders', { method: 'GET' }).catch(() => []),
      apiRequest('/api/admin/activity', { method: 'GET' }).catch(() => [])
    ]);
    
    allUsers    = Array.isArray(uRes) ? uRes : (uRes.users || []);
    allOrders   = Array.isArray(oRes) ? oRes : (oRes.orders || []);
    allActivity = Array.isArray(aRes) ? aRes : (aRes.activity || []);
  } catch (err) {
    console.error('Error loading admin data:', err);
    adminToast('Failed to load data from server.', 'error');
  }
}

/* ════════════════════════════════════
   OVERVIEW — STAT CARDS
════════════════════════════════════ */
function renderOverview() {
  const dateVal = document.getElementById('datePicker')?.value || '';

  const newThisWeek = allUsers.filter(u => isThisWeek(u.createdAt)).length;
  const signupsToday = allUsers.filter(u => isToday(u.createdAt)).length;

  const activeSet = new Set();
  allActivity.forEach(a => {
    if (a.type === 'login' && a.username && isThisWeek(a.timestamp)) {
      activeSet.add(a.username);
    }
  });

  const ordersToday = allOrders.filter(o => isToday(o.createdAt)).length;
  const totalRev    = allOrders.reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);
  const todayRev    = allOrders.filter(o => isToday(o.createdAt)).reduce((s, o) => s + (parseFloat(o.amountNGN) || 0), 0);
  const totalUserWallets = allUsers.reduce((s, u) => s + (parseFloat(u.balance) || 0), 0);

  setText('totalUsers',        allUsers.length);
  setText('activeUsers',       activeSet.size);
  setText('totalOrders',       allOrders.length);
  setText('totalUserWallets',  '₦' + totalUserWallets.toLocaleString());
  setText('signupsToday',      signupsToday);
  setText('newUsersThisWeek',  '+' + newThisWeek + ' this week');
  setText('signupsWeek',       '+' + newThisWeek + ' this week');
  setText('ordersToday',       '+' + ordersToday + ' today');
  setText('totalRevenue',      '₦' + totalRev.toLocaleString());
  setText('revenueToday',      '+₦' + todayRev.toLocaleString() + ' today');

  setText('navUsersBadge',  allUsers.length);
  setText('navOrdersBadge', allOrders.length);

  renderRecentUsers();
  renderRecentOrders();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderRecentUsers() {
  const tbody = document.getElementById('recentUsersTbody');
  if (!tbody) return;
  const recent = [...allUsers].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No users registered yet.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(u => '<tr><td><strong>' + (u.name || '—') + '</strong><br><span style="font-size:11px;color:var(--muted)">' + (u.email || '') + '</span></td><td style="font-size:12px;color:var(--muted)">' + fmtDate(u.createdAt) + '</td><td style="color:var(--green);font-weight:700">₦' + parseFloat(u.balance || 0).toLocaleString() + '</td></tr>').join('');
}

function renderRecentOrders() {
  const tbody = document.getElementById('recentOrdersTbody');
  if (!tbody) return;
  const recent = [...allOrders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No orders yet.</td></tr>';
    return;
  }
  tbody.innerHTML = recent.map(o => '<tr><td><strong>' + (o.service || o.product || '—') + '</strong></td><td style="font-size:12px;text-transform:capitalize">' + (o.country || '—') + '</td><td style="color:var(--amber);font-weight:700">₦' + parseFloat(o.amountNGN || 0).toLocaleString() + '</td><td>' + statusBadge(o.status) + '</td></tr>').join('');
}

/* ════════════════════════════════════
   USERS TABLE
════════════════════════════════════ */
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, i) => '<tr><td style="color:var(--muted);font-size:12px">' + (i + 1) + '</td><td><div style="font-weight:600">' + (u.name || '—') + '</div></td><td style="font-size:12px;color:var(--muted)">' + (u.email || '—') + '</td><td style="font-size:12px;color:var(--muted)">' + (u.phone || '—') + '</td><td style="color:var(--green);font-weight:700">₦' + parseFloat(u.balance || 0).toLocaleString() + '</td><td style="font-size:12px;color:var(--muted)">' + fmtDate(u.createdAt) + '</td><td><button class="tbl-btn tbl-btn-view" onclick="viewUser(\'' + u.email + '\')">View</button> <button class="tbl-btn" style="background:var(--amber);color:#fff;" onclick="logoutUser(\'' + (u.id || u._id || u.email) + '\')">Logout</button> <button class="tbl-btn tbl-btn-del" onclick="deleteUser(\'' + (u.id || u._id || u.email) + '\')">Delete</button></td></tr>').join('');
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
      { label: 'Balance', val: '₦' + parseFloat(u.balance || 0).toLocaleString() },
      { label: 'Joined',  val: fmt(u.createdAt) },
      { label: 'Ref Code', val: u.referralCode || '—' },
    ];
    body.innerHTML = fields.map(f => '<div class="modal-field"><div class="modal-field-label">' + f.label + '</div><div class="modal-field-value">' + f.val + '</div></div>').join('');
  }
  document.getElementById('userModal').classList.add('show');
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to completely delete this user?')) return;
  try {
    await apiRequest('/api/admin/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    adminToast('User deleted successfully.', 'success');
    refreshAll();
  } catch(err) {
    adminToast(err.message || 'Failed to delete user.', 'error');
  }
}

async function logoutUser(userId) {
  if (!confirm('Are you sure you want to log out / revoke session for this user?')) return;
  try {
    adminToast('Revoking user session...', 'info');
    await apiRequest('/api/admin/users/' + encodeURIComponent(userId) + '/logout', { method: 'POST' });
    adminToast('User logged out successfully.', 'success');
    refreshAll();
  } catch(err) {
    adminToast(err.message || 'Failed to log out user.', 'error');
  }
}

/* ════════════════════════════════════
   ORDERS TABLE
════════════════════════════════════ */
function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTbody');
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No orders found.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o, i) => '<tr><td style="color:var(--muted);font-size:12px">' + (i + 1) + '</td><td style="font-size:12px;font-family:monospace;color:var(--muted)">' + (o.orderId || '—') + '</td><td style="font-size:12px">' + (o.userName || o.userId || '—') + '</td><td style="font-weight:600;text-transform:capitalize">' + (o.service || o.product || '—') + '</td><td style="font-size:12px;text-transform:capitalize;color:var(--muted)">' + (o.country || '—') + '</td><td style="font-family:monospace;font-size:12px">' + (o.phone || '—') + '</td><td style="color:var(--amber);font-weight:700">₦' + parseFloat(o.amountNGN || 0).toLocaleString() + '</td><td>' + statusBadge(o.status) + '</td><td style="font-size:11px;color:var(--muted)">' + fmtDate(o.createdAt) + '</td></tr>').join('');
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
    container.innerHTML = '<div class="empty-cell" style="padding:40px;text-align:center;">No activity recorded yet.</div>';
    return;
  }

  const typeColors = { login: 'var(--green)', signup: 'var(--blue)', purchase: 'var(--amber)', fund: 'var(--teal)', error: 'var(--red)', default: 'var(--muted)' };

  container.innerHTML = sorted.slice(0, 100).map(a => '<div class="activity-item"><div class="activity-dot" style="background:' + (typeColors[a.type] || typeColors.default) + '"></div><div style="flex:1"><div class="activity-text">' + (a.message || a.type || 'Event') + '</div>' + (a.username ? '<div style="font-size:11px;color:var(--muted);margin-top:2px;">by ' + a.username + '</div>' : '') + '</div><div class="activity-time">' + fmt(a.timestamp) + '</div></div>').join('');
}

function clearActivity() {
  if (!confirm('Clear all activity logs? This cannot be undone.')) return;
  apiRequest('/api/admin/activity', { method: 'DELETE' }).then(() => refreshAll()).catch(() => adminToast('Failed to clear activity', 'error'));
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
  if (pEl) pEl.value = '';
  if (rEl) rEl.value = config.rate    || 1500;
  if (mEl) mEl.value = config.markup  || 1.5;
  if (mnEl) mnEl.checked = !!config.maintenance;

  if (fu) {
    fu.innerHTML = allUsers.map(u => '<option value="' + u.email + '">' + (u.name || u.email) + ' — ₦' + parseFloat(u.balance||0).toLocaleString() + '</option>').join('');
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
  localStorage.setItem('adminRate',    rate);
  localStorage.setItem('adminMarkup',  markup);
  localStorage.setItem('maintenance',  maintenance ? '1' : '0');
  adminToast('Platform config saved!', 'success');
}

async function fundUser() {
  const email  = document.getElementById('fundUserSelect')?.value;
  const amount = parseFloat(document.getElementById('fundAmount')?.value);
  if (!email) { adminToast('Please select a user.', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { adminToast('Enter a valid amount.', 'error'); return; }

  try {
    await apiRequest('/api/admin/fund', { method: 'POST', body: JSON.stringify({ email, amount }) });
    adminToast('User funded successfully', 'success');
    refreshAll();
  } catch (err) {
    adminToast(err.message || 'Failed to fund user.', 'error');
  }
}

/* ════════════════════════════════════
   5SIM PROVIDER STATUS
════════════════════════════════════ */
async function checkProviderStatus() {
  const dot    = document.getElementById('providerDot');
  const status = document.getElementById('providerStatus');
  const balEl  = document.getElementById('providerBalance');
  
  try {
    const res = await apiRequest('/api/numbers/5simbalance');
    const bal = parseFloat(res.balance || 0);
    if (dot) dot.className = 'chip-dot ' + (bal > 0 ? 'online' : 'offline');
    if (status) status.textContent = bal > 0 ? '5sim: $' + bal.toFixed(2) + ' ✓' : '5sim: Empty!';
    if (balEl) balEl.textContent = '$' + bal.toFixed(2);
  } catch {
    if (dot) dot.className = 'chip-dot offline';
    if (status) status.textContent = '5sim: Offline';
    if (balEl) balEl.textContent = 'N/A';
  }
}

/* ════════════════════════════════════
   REFRESH ALL
════════════════════════════════════ */
async function refreshAll() {
  const btn  = document.querySelector('.refresh-btn');
  if (btn) btn.classList.add('spinning');

  await loadAllData();
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
  const adminSession = getData('primes_admin_session', null);
  if (!adminSession) {
    const pw = prompt('🔐 Enter admin password:');
    const creds = getData(KEY_ADMIN, { username: 'admin', password: 'admin123' });
    if (pw !== creds.password) {
      alert('❌ Incorrect password. Access denied.');
      window.location.href = 'dashboard.html';
      return false;
    }
    setData('primes_admin_session', { loggedIn: true, at: new Date().toISOString() });
  }

  const creds = getData(KEY_ADMIN, { username: 'Admin' });
  const nameEl = document.getElementById('sidebarAdminName');
  if (nameEl) nameEl.textContent = creds.username || 'Admin';

  return true;
}

/* ════════════════════════════════════
   INIT
════════════════════════════════════ */
document.addEventListener('click', e => {
  const modal = document.getElementById('userModal');
  if (modal && e.target === modal) closeUserModal();
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!adminAuthGuard()) return;

  await refreshAll();

  // Auto-refresh every 30s
  setInterval(() => {
    refreshAll();
  }, 30000);
});
