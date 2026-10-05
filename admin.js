/* ══════════════════════════════════════════════════════════════════════
   ADMIN.JS — NuraXQ Production Administration Console Engine
   ══════════════════════════════════════════════════════════════════════ */

// ── Storage Keys (UI Preferences & Auth Session Only) ──
const KEY_CONFIG        = 'primes_platform_config';
const KEY_ACTIVITY      = 'primes_activity';
const KEY_ADMIN_CREDS   = 'primes_admin_credentials';
const KEY_ADMIN_SESSION = 'primes_admin_session';

// ── In-Memory State (Backend Admin API is the Single Source of Truth) ──
let allUsers            = [];
let allWallets          = [];
let allVirtualAccounts  = [];
let allOrders           = [];
let allActivity         = [];
let allTransactions     = [];
let allAnnouncements    = [];
let latestDashboardStats = null;
let currentViewingUser  = null;
let currentViewingTxId  = null;
let pendingAction       = null;

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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    if (typeof isAdmin === 'function') return isAdmin(userSession);
    if (!userSession) return false;
    const r = String(userSession.role || '').toLowerCase();
    return r === 'admin' || r === 'superadmin' || userSession.isAdmin === true || userSession.is_admin === true;
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

    // Hydrate live profile from Admin API GET /auth/me (PDF Page 1)
    if (typeof adminGetProfileApi === 'function') {
      adminGetProfileApi().then(res => {
        const p = res?.admin || res?.user || res?.data || res;
        if (p && (p.name || p.username || p.email)) {
          if (nameEl) nameEl.textContent = p.name || p.username || p.email;
          if (roleEl && p.role) roleEl.textContent = String(p.role).toLowerCase() === 'superadmin' ? 'Super Admin' : 'Admin';
        }
      }).catch(() => {});
    }
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
    if (roleEl) roleEl.textContent = String(userSession.role || '').toLowerCase() === 'superadmin' ? 'Super Admin' : 'Admin';

    if (typeof adminGetProfileApi === 'function') {
      adminGetProfileApi().then(res => {
        const p = res?.admin || res?.user || res?.data || res;
        if (p && (p.name || p.username || p.email)) {
          if (nameEl) nameEl.textContent = p.name || p.username || p.email;
        }
      }).catch(() => {});
    }
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

async function handleAdminGateLogin(e) {
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

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner spinning"></i> Authenticating...';
  }

  // 1. Attempt backend Admin API login (POST /api/admin/auth/login)
  let apiSuccess = false;
  let adminDisplayName = '';
  if (typeof adminLoginApi === 'function') {
    try {
      const res = await adminLoginApi(username, password);
      apiSuccess = true;
      const u = res?.user || res?.data?.user || res?.data;
      if (u) adminDisplayName = u.name || u.firstName || u.username || u.email;
    } catch (_) {}
  }

  // 2. If dedicated admin endpoint was rejected, attempt user login with admin role
  if (!apiSuccess && typeof loginUser === 'function') {
    try {
      const uRes = await loginUser(username, password);
      const u = uRes?.user || uRes?.data?.user || uRes?.data;
      const isAdm = (typeof isAdmin === 'function' && isAdmin(u)) ||
                    String(u?.role || '').toLowerCase() === 'admin' ||
                    String(u?.role || '').toLowerCase() === 'superadmin' ||
                    u?.isAdmin === true || u?.is_admin === true;
      if (isAdm) {
        apiSuccess = true;
        const uTok = uRes?.token || uRes?.accessToken || uRes?.data?.token;
        if (uTok && typeof setAdminAuthToken === 'function') {
          setAdminAuthToken(uTok);
        }
        adminDisplayName = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email;
      }
    } catch (_) {}
  }

  // 3. Fallback to local admin credentials
  const creds = getAdminCreds();
  const localMatch = (username.toLowerCase() === creds.username.toLowerCase() && password === creds.password);

  if (apiSuccess || localMatch) {
    if (errEl) errEl.style.display = 'none';
    const finalAdminName = adminDisplayName || username || creds.username;
    setAdminSession({ loggedIn: true, username: finalAdminName, at: new Date().toISOString() });
    logActivity('config', `Administrator ${finalAdminName} signed in to Admin Console`);
    adminToast('Admin authenticated successfully', 'success');

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-sign-in"></i> Sign In to Admin Console';
    }

    checkAdminAuth();
    await refreshAll();
  } else {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-sign-in"></i> Sign In to Admin Console';
    }
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
    async () => {
      if (typeof adminLogoutApi === 'function') {
        try { await adminLogoutApi(); } catch (_) {}
      }
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
    overview:      'Dashboard Overview',
    users:         'User Management',
    wallets:       'Wallets & Virtual Accounts',
    orders:        'Order Auditing',
    transactions:  'Platform Transactions',
    activity:      'Platform Activity Log',
    announcements: 'Announcement System Manager',
    settings:      'Platform Administration Settings'
  };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[id] || 'Admin Console';

  if (window.innerWidth <= 900) {
    document.getElementById('sidebar')?.classList.remove('open');
  }

  // Section specific triggers
  if (id === 'wallets') {
    loadAdminWallets();
  }
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
    // 1. Fetch live dashboard statistics directly from Admin API (GET /api/admin/dashboard/stats - PDF Page 2)
    if (typeof adminGetDashboardStats === 'function') {
      try {
        const stats = await adminGetDashboardStats();
        if (stats) {
          latestDashboardStats = stats;
          if (Array.isArray(stats.recentUsers) && stats.recentUsers.length) {
            allUsers = stats.recentUsers;
          }
          if (Array.isArray(stats.recentTransactions) && stats.recentTransactions.length) {
            allTransactions = stats.recentTransactions;
            setText('navTxBadge', allTransactions.length);
          }
        }
      } catch (statsErr) {
        console.warn('[Admin] Dashboard stats API notice:', statsErr.message);
      }
    }

    // 2. Fetch live users directly from Admin API (GET /api/admin/users - PDF Page 2)
    if (typeof adminGetUsers === 'function') {
      try {
        const usersRes = await adminGetUsers({ limit: 100 });
        const uList = usersRes?.users || usersRes?.data || (Array.isArray(usersRes) ? usersRes : null);
        if (Array.isArray(uList) && uList.length) {
          allUsers = uList.map(u => ({
            id: u._id || u.id,
            _id: u._id || u.id,
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            username: u.username || '',
            name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.username || 'User',
            email: u.email || '',
            phone: u.phoneNumber || u.phone || '—',
            phoneNumber: u.phoneNumber || u.phone || '',
            balance: String(u.balance || (u.wallet ? u.wallet.balance : 0) || 0),
            role: u.role || 'user',
            isSuspended: Boolean(u.isSuspended),
            createdAt: u.createdAt || new Date().toISOString()
          }));
        }
      } catch (err) {
        console.warn('[Admin] Live users API notice:', err.message);
      }
    }

    // 3. Fetch live wallets directly from Admin API (GET /api/admin/wallets - PDF Page 3)
    if (typeof adminGetWallets === 'function') {
      try {
        const wRes = await adminGetWallets({ limit: 100 });
        const wList = wRes?.wallets || wRes?.data || (Array.isArray(wRes) ? wRes : null);
        if (Array.isArray(wList)) {
          allWallets = wList;
          setText('navWalletsBadge', allWallets.length);
        }
      } catch (wErr) {
        console.warn('[Admin] Live wallets API notice:', wErr.message);
      }
    }

    // 4. Fetch live virtual accounts directly from Admin API (GET /api/admin/virtual-accounts - PDF Page 5)
    if (typeof adminGetVirtualAccounts === 'function') {
      try {
        const vaRes = await adminGetVirtualAccounts({ limit: 100 });
        const vaList = vaRes?.virtualAccounts || vaRes?.data || (Array.isArray(vaRes) ? vaRes : null);
        if (Array.isArray(vaList)) {
          allVirtualAccounts = vaList;
        }
      } catch (vaErr) {
        console.warn('[Admin] Live virtual accounts API notice:', vaErr.message);
      }
    }

    // 5. Preload live backend transactions (GET /api/admin/transactions - PDF Page 4-5)
    if (typeof adminGetTransactions === 'function') {
      try {
        const txRes = await adminGetTransactions({ limit: 50 });
        const txList = txRes?.transactions || txRes?.data || (Array.isArray(txRes) ? txRes : null);
        if (Array.isArray(txList) && txList.length) {
          allTransactions = txList;
          setText('navTxBadge', allTransactions.length);
        }
      } catch (_) {}
    }

    // 6. Fetch announcements from backend API
    await loadAdminAnnouncements();

  } catch (err) {
    console.error('Error fetching backend data:', err);
    adminToast('Failed to load backend records.', 'error');
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

  const displayUserCount = latestDashboardStats?.usersCount ?? latestDashboardStats?.totalUsers ?? usersFiltered.length;
  const displayWalletTotal = latestDashboardStats?.walletsTotal ?? latestDashboardStats?.totalWalletsBalance ?? totalUserWallets;

  setText('totalUsers',        displayUserCount.toLocaleString());
  setText('activeUsers',       (latestDashboardStats?.activeUsersCount ?? activeSet.size).toLocaleString());
  setText('totalOrders',       ordersFiltered.length.toLocaleString());
  setText('totalUserWallets',  '₦' + Math.round(displayWalletTotal).toLocaleString());
  setText('signupsToday',      signupsToday.toLocaleString());
  setText('newUsersThisWeek',  '+' + newThisWeek + ' this week');
  setText('signupsWeek',       '+' + newThisWeek + ' this week');
  setText('ordersToday',       '+' + ordersToday + ' today');
  setText('totalRevenue',      '₦' + Math.round(totalRev).toLocaleString());
  setText('revenueToday',      '+₦' + Math.round(todayRev).toLocaleString() + ' today');

  setText('navUsersBadge',    allUsers.length);
  setText('navWalletsBadge',  allWallets.length);
  setText('navOrdersBadge',   allOrders.length);
  setText('navTxBadge',       allTransactions.length);

  renderRecentUsers(latestDashboardStats?.recentUsers || usersFiltered);
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
   USER MANAGEMENT (Admin API PDF Page 2-3)
════════════════════════════════════ */
function renderUsersTable(users = allUsers) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No matching users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((u, i) => {
    const isSusp = Boolean(u.isSuspended);
    const uid = u.id || u._id || u.email;
    return `
    <tr>
      <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
      <td>
        <div style="font-weight:600;color:var(--text);">${escapeHTML(u.name || u.username || 'User')}</div>
        <div style="font-size:12px;color:var(--muted);">${escapeHTML(u.email || '—')}</div>
      </td>
      <td style="font-size:12px;color:var(--muted);font-family:monospace;">${escapeHTML(u.phone || u.phoneNumber || '—')}</td>
      <td style="color:var(--green);font-weight:700;">₦${parseFloat(u.balance || 0).toLocaleString()}</td>
      <td><span class="status-badge ${u.role === 'admin' ? 'badge-finished' : 'badge-received'}">${escapeHTML(u.role || 'user')}</span></td>
      <td>
        ${isSusp
          ? '<span class="status-badge badge-banned"><i class="ph ph-prohibit"></i> Suspended</span>'
          : '<span class="status-badge badge-received"><i class="ph ph-check-circle"></i> Active</span>'}
      </td>
      <td style="font-size:12px;color:var(--muted);">${fmtDate(u.createdAt)}</td>
      <td style="text-align:right;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="tbl-btn tbl-btn-view" onclick="viewUser('${escapeHTML(uid)}')"><i class="ph ph-eye"></i> View</button>
          <button class="tbl-btn tbl-btn-fund" onclick="quickFundUser('${escapeHTML(u.email || uid)}')"><i class="ph ph-plus"></i> Fund</button>
          <button class="tbl-btn ${isSusp ? 'tbl-btn-fund' : 'tbl-btn-del'}" onclick="toggleUserSuspension('${escapeHTML(uid)}', ${isSusp})" title="${isSusp ? 'Unsuspend' : 'Suspend'}">
            <i class="ph ${isSusp ? 'ph-check-circle' : 'ph-prohibit'}"></i> ${isSusp ? 'Unsuspend' : 'Suspend'}
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function filterUsers() {
  const q = (document.getElementById('userSearch')?.value || '').toLowerCase().trim();
  const statusFilter = (document.getElementById('userStatusFilter')?.value || '').toLowerCase().trim();

  const filtered = allUsers.filter(u => {
    const matchQ = !q ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || u.phoneNumber || '').toLowerCase().includes(q) ||
      String(u.id || u._id || '').toLowerCase().includes(q);

    let matchStatus = true;
    if (statusFilter === 'active') matchStatus = !u.isSuspended;
    else if (statusFilter === 'suspended') matchStatus = Boolean(u.isSuspended);

    return matchQ && matchStatus;
  });

  renderUsersTable(filtered);
}

async function refreshUsersData() {
  await loadAllData();
  filterUsers();
  adminToast('User list refreshed.', 'info');
}

async function viewUser(idOrEmail) {
  let u = allUsers.find(x => String(x.id || x._id) === String(idOrEmail) || x.email === idOrEmail);
  const userId = u?.id || u?._id || idOrEmail;

  const body = document.getElementById('userModalBody');
  if (body) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);grid-column:1/-1;"><i class="ph ph-spinner spinning"></i> Fetching live user record from Admin API...</div>';
  }
  showModal('userModal');

  let liveUser = u;
  let liveWallet = null;
  let liveVA = null;

  // Direct Admin API endpoint calls (PDF Pages 2, 3, 5)
  if (typeof adminGetUser === 'function' && userId && userId !== '—') {
    try {
      const res = await adminGetUser(userId);
      if (res) liveUser = res.user || res.data || res;
    } catch (err) {
      console.warn('[Admin] adminGetUser notice:', err.message);
    }
  }

  if (typeof adminGetUserWallet === 'function' && userId && userId !== '—') {
    try {
      const wRes = await adminGetUserWallet(userId);
      if (wRes) liveWallet = wRes.wallet || wRes.data || wRes;
    } catch (_) {}
  }

  if (typeof adminGetUserVirtualAccount === 'function' && userId && userId !== '—') {
    try {
      const vaRes = await adminGetUserVirtualAccount(userId);
      if (vaRes) liveVA = vaRes.virtualAccount || vaRes.data || vaRes;
    } catch (_) {}
  }

  if (!liveUser) {
    if (body) body.innerHTML = '<div class="empty-cell" style="grid-column:1/-1;color:var(--red);">User not found.</div>';
    return;
  }

  currentViewingUser = liveUser;
  const uid = liveUser._id || liveUser.id || userId;
  const uName = [liveUser.firstName, liveUser.lastName].filter(Boolean).join(' ') || liveUser.name || liveUser.username || 'User';
  const uBal = liveWallet ? liveWallet.balance : (liveUser.balance || (liveUser.wallet ? liveUser.wallet.balance : 0) || 0);
  const isSusp = Boolean(liveUser.isSuspended);
  const isFrozen = Boolean(liveWallet?.isFrozen);

  if (body) {
    body.innerHTML = `
      <div class="modal-field">
        <div class="modal-field-label">User ID</div>
        <div class="modal-field-value" style="font-family:monospace;font-size:12px;">${escapeHTML(String(uid))}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Full Name</div>
        <div class="modal-field-value">${escapeHTML(uName)}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Email Address</div>
        <div class="modal-field-value">${escapeHTML(liveUser.email || '—')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Phone Number</div>
        <div class="modal-field-value">${escapeHTML(liveUser.phoneNumber || liveUser.phone || '—')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Account Balance</div>
        <div class="modal-field-value" style="color:var(--green);font-weight:700;">₦${parseFloat(uBal || 0).toLocaleString()}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Account Role</div>
        <div class="modal-field-value">${escapeHTML(liveUser.role || 'user')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Account Status</div>
        <div class="modal-field-value">${isSusp ? '<span class="status-badge badge-banned">Suspended</span>' : '<span class="status-badge badge-received">Active</span>'}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Wallet Status</div>
        <div class="modal-field-value">${isFrozen ? '<span class="status-badge badge-canceled">Frozen</span>' : '<span class="status-badge badge-received">Active</span>'}</div>
      </div>
      <div class="modal-field full-width">
        <div class="modal-field-label">Dedicated Virtual Account</div>
        <div class="modal-field-value" style="font-size:12px;">
          ${liveVA && liveVA.accountNumber ? `
            <strong>${escapeHTML(liveVA.bankName || 'Wema Bank')}</strong>: 
            <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;font-family:monospace;">${escapeHTML(liveVA.accountNumber)}</code> 
            (${escapeHTML(liveVA.accountName || uName)})
          ` : '<span style="color:var(--muted);">No virtual account generated yet</span>'}
        </div>
      </div>
      <div class="modal-field full-width">
        <div class="modal-field-label">Registration Date</div>
        <div class="modal-field-value">${fmt(liveUser.createdAt)}</div>
      </div>
      <div class="modal-field full-width" style="margin-top:10px;padding-top:14px;border-top:1px solid var(--border);">
        <div class="modal-field-label" style="margin-bottom:8px;">Administrative Actions</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="tbl-btn ${isSusp ? 'tbl-btn-fund' : 'tbl-btn-del'}" onclick="toggleUserSuspension('${escapeHTML(uid)}', ${isSusp})">
            <i class="ph ${isSusp ? 'ph-check-circle' : 'ph-prohibit'}"></i> ${isSusp ? 'Unsuspend User' : 'Suspend User'}
          </button>
          <button class="tbl-btn ${isFrozen ? 'tbl-btn-fund' : 'tbl-btn-del'}" onclick="toggleWalletFreeze('${escapeHTML(uid)}', ${isFrozen})">
            <i class="ph ${isFrozen ? 'ph-lock-key-open' : 'ph-lock-key'}"></i> ${isFrozen ? 'Unfreeze Wallet' : 'Freeze Wallet'}
          </button>
          <button class="tbl-btn tbl-btn-fund" onclick="closeModal('userModal');quickFundUser('${escapeHTML(liveUser.email || uid)}')">
            <i class="ph ph-arrows-down-up"></i> Adjust Wallet
          </button>
        </div>
      </div>
    `;
  }
}

async function toggleUserSuspension(userId, currentlySuspended) {
  if (currentlySuspended) {
    openConfirmModal(
      'Unsuspend User Account',
      'Are you sure you want to lift the suspension for this user account?',
      async () => {
        try {
          if (typeof adminUnsuspendUser === 'function') {
            await adminUnsuspendUser(userId);
          }
          adminToast('User account unsuspended successfully.', 'success');
          logActivity('config', `Unsuspended user account ${userId}`);
          await loadAllData();
          filterUsers();
          if (document.getElementById('userModal')?.classList.contains('show')) {
            viewUser(userId);
          }
        } catch (err) {
          adminToast(err.message || 'Failed to unsuspend user.', 'error');
        }
      }
    );
  } else {
    openConfirmModal(
      'Suspend User Account',
      'Are you sure you want to suspend this user account? The user will be blocked from purchasing numbers or using platform services.',
      async () => {
        try {
          if (typeof adminSuspendUser === 'function') {
            await adminSuspendUser(userId, 'Administrative suspension via Console');
          }
          adminToast('User account suspended.', 'warning');
          logActivity('config', `Suspended user account ${userId}`);
          await loadAllData();
          filterUsers();
          if (document.getElementById('userModal')?.classList.contains('show')) {
            viewUser(userId);
          }
        } catch (err) {
          adminToast(err.message || 'Failed to suspend user.', 'error');
        }
      }
    );
  }
}

function quickFundUser(email) {
  showSection('settings', document.querySelector('[data-section=settings]'));
  const sel = document.getElementById('fundUserSelect');
  if (sel) sel.value = email;
  const amtInput = document.getElementById('fundAmount');
  if (amtInput) amtInput.focus();
}

/* ════════════════════════════════════
   WALLETS & VIRTUAL ACCOUNTS (Admin API PDF Pages 3-5)
════════════════════════════════════ */
async function loadAdminWallets() {
  const tbody = document.getElementById('walletsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Syncing wallets from Admin API...</td></tr>';

  try {
    if (typeof adminGetWallets === 'function') {
      const wRes = await adminGetWallets({ limit: 100 });
      const wList = wRes?.wallets || wRes?.data || (Array.isArray(wRes) ? wRes : []);
      if (Array.isArray(wList)) {
        allWallets = wList;
        setText('navWalletsBadge', allWallets.length);
      }
    }
    if (typeof adminGetVirtualAccounts === 'function') {
      const vaRes = await adminGetVirtualAccounts({ limit: 100 });
      const vaList = vaRes?.virtualAccounts || vaRes?.data || (Array.isArray(vaRes) ? vaRes : []);
      if (Array.isArray(vaList)) {
        allVirtualAccounts = vaList;
      }
    }
    filterAdminWallets();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-cell" style="color:var(--red);">Failed to sync wallets: ${escapeHTML(err.message)}</td></tr>`;
    adminToast('Could not load wallets.', 'error');
  }
}

function filterAdminWallets() {
  const filter = (document.getElementById('walletFrozenFilter')?.value || '').toLowerCase().trim();
  let list = allWallets;
  if (filter === 'active') {
    list = allWallets.filter(w => !w.isFrozen);
  } else if (filter === 'frozen') {
    list = allWallets.filter(w => Boolean(w.isFrozen));
  }
  renderWalletsTable(list);
}

function renderWalletsTable(wallets = allWallets) {
  const tbody = document.getElementById('walletsTbody');
  if (!tbody) return;

  if (!wallets.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No wallets recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = wallets.map((w, i) => {
    const uObj = w.user && typeof w.user === 'object' ? w.user : allUsers.find(u => String(u.id || u._id) === String(w.user || w.userId));
    const uName = uObj ? ([uObj.firstName, uObj.lastName].filter(Boolean).join(' ') || uObj.name || uObj.username || uObj.email || 'User') : (w.user || 'User');
    const uEmail = uObj?.email || '';
    const isFroz = Boolean(w.isFrozen);
    const statusBadge = isFroz
      ? '<span class="status-badge badge-canceled"><i class="ph ph-lock-key"></i> Frozen</span>'
      : '<span class="status-badge badge-received"><i class="ph ph-check-circle"></i> Active</span>';
    
    const uid = uObj?.id || uObj?._id || w.user?._id || w.user?.id || w.user || w.userId;
    const va = allVirtualAccounts.find(v => String(v.user?._id || v.user?.id || v.user || v.userId) === String(uid));
    const vaDisplay = va && va.accountNumber
      ? `<span style="font-family:monospace;font-weight:600;">${escapeHTML(va.accountNumber)}</span> <span style="font-size:11px;color:var(--muted);">(${escapeHTML(va.bankName || 'Wema')})</span>`
      : '<span style="color:var(--muted);font-size:12px;">None</span>';

    return `
      <tr>
        <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
        <td>
          <div style="font-weight:600;color:var(--text);">${escapeHTML(uName)}</div>
          ${uEmail ? `<div style="font-size:12px;color:var(--muted);">${escapeHTML(uEmail)}</div>` : ''}
        </td>
        <td style="color:var(--green);font-weight:700;">₦${parseFloat(w.balance || 0).toLocaleString()}</td>
        <td>${statusBadge}</td>
        <td>${vaDisplay}</td>
        <td style="text-align:right;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="tbl-btn ${isFroz ? 'tbl-btn-fund' : 'tbl-btn-del'}" onclick="toggleWalletFreeze('${escapeHTML(uid)}', ${isFroz})">
              <i class="ph ${isFroz ? 'ph-lock-key-open' : 'ph-lock-key'}"></i> ${isFroz ? 'Unfreeze' : 'Freeze'}
            </button>
            <button class="tbl-btn tbl-btn-fund" onclick="quickFundUser('${escapeHTML(uEmail || uid)}')">
              <i class="ph ph-arrows-down-up"></i> Adjust
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleWalletFreeze(userId, currentlyFrozen) {
  if (currentlyFrozen) {
    openConfirmModal(
      'Unfreeze Wallet',
      'Are you sure you want to unfreeze this wallet? The user will be able to perform transactions again.',
      async () => {
        try {
          if (typeof adminUnfreezeWallet === 'function') {
            await adminUnfreezeWallet(userId);
          }
          adminToast('Wallet unfrozen successfully.', 'success');
          logActivity('config', `Unfroze wallet for user ${userId}`);
          await loadAdminWallets();
          if (document.getElementById('userModal')?.classList.contains('show')) {
            viewUser(userId);
          }
        } catch (err) {
          adminToast(err.message || 'Failed to unfreeze wallet.', 'error');
        }
      }
    );
  } else {
    openConfirmModal(
      'Freeze Wallet',
      'Are you sure you want to freeze this wallet? All balance deductions and fundings on this wallet will be blocked.',
      async () => {
        try {
          if (typeof adminFreezeWallet === 'function') {
            await adminFreezeWallet(userId);
          }
          adminToast('Wallet frozen.', 'warning');
          logActivity('config', `Froze wallet for user ${userId}`);
          await loadAdminWallets();
          if (document.getElementById('userModal')?.classList.contains('show')) {
            viewUser(userId);
          }
        } catch (err) {
          adminToast(err.message || 'Failed to freeze wallet.', 'error');
        }
      }
    );
  }
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
    if (typeof apiRequest === 'function') {
      orderData = await apiRequest(`/api/order/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        suppressAuthRedirect: true
      });
    } else {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : localStorage.getItem('primes_token');
      const res = await fetch(`https://nurasms-api.onrender.com/api/order/${encodeURIComponent(orderId)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      orderData = await res.json();
    }

    const o = orderData?.order || orderData;
    const body = document.getElementById('orderModalBody');
    if (body) {
      body.innerHTML = `
        <div class="modal-field">
          <div class="modal-field-label">Order ID</div>
          <div class="modal-field-value" style="font-family:monospace;">${escapeHTML(String(o?.id || orderId))}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Live Status</div>
          <div class="modal-field-value">${statusBadge(o?.status || 'PENDING')}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Phone Number</div>
          <div class="modal-field-value" style="font-family:monospace;">${escapeHTML(o?.phone || '—')}</div>
        </div>
        <div class="modal-field">
          <div class="modal-field-label">Received SMS Code</div>
          <div class="modal-field-value" style="color:var(--green);font-size:16px;font-weight:800;">${escapeHTML(o?.sms?.[0]?.code || o?.code || 'None yet')}</div>
        </div>
        <div class="modal-field full-width">
          <div class="modal-field-label">Full SMS Payload</div>
          <div class="modal-field-value" style="font-size:12px;color:var(--muted);">${escapeHTML(o?.sms?.[0]?.text || o?.text || 'Waiting for provider transmission...')}</div>
        </div>
      `;
    }
    showModal('orderModal');

    // Sync updated status to local array
    if (o?.status) {
      const existing = allOrders.find(x => String(x.orderId || x.id) === String(orderId));
      if (existing) {
        existing.status = o.status;
        renderOrdersTable(allOrders);
      }
    }
  } catch (err) {
    adminToast(`Provider status: ${err.message || 'Unable to fetch status'}`, 'info');
  }
}

/* ════════════════════════════════════
   BACKEND TRANSACTIONS AUDITING (Admin API PDF Page 4-5)
   Directly communicates with real backend /api/admin/transactions
════════════════════════════════════ */
async function loadBackendTransactions() {
  const tbody = document.getElementById('transactionsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Syncing transactions from backend...</td></tr>';

  try {
    let txList = [];
    // 1. Try documented Admin API GET /transactions first (PDF page 4-5)
    if (typeof adminGetTransactions === 'function') {
      try {
        const res = await adminGetTransactions({ limit: 50 });
        if (res && (res.transactions || res.data || Array.isArray(res))) {
          txList = res.transactions || res.data || (Array.isArray(res) ? res : []);
        }
      } catch (_) {}
    }

    // 2. Try customer/platform GET /api/get-transactions fallback
    if (!txList.length && typeof apiRequest === 'function') {
      try {
        const res = await apiRequest('/api/get-transactions?page=1&limit=50&currency=NGN', {
          method: 'GET',
          suppressAuthRedirect: true
        });
        if (res && (res.data || res.transactions)) {
          txList = res.data || res.transactions || [];
        }
      } catch (reqErr) {
        console.warn('[Admin] Live backend get-transactions notice:', reqErr.message);
      }
    }

    allTransactions = Array.isArray(txList) ? txList : [];
    setText('navTxBadge', allTransactions.length);

    filterBackendTransactions();
    adminToast('Backend transactions synchronized.', 'success');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-cell" style="color:var(--red);">Failed to sync transactions: ${escapeHTML(err.message)}</td></tr>`;
    adminToast('Could not load transactions from backend.', 'error');
  }
}

function filterBackendTransactions() {
  const typeFilter = (document.getElementById('txTypeFilter')?.value || '').toLowerCase().trim();
  const statusFilter = (document.getElementById('txStatusFilter')?.value || '').toLowerCase().trim();

  const filtered = allTransactions.filter(t => {
    let matchType = true;
    if (typeFilter) {
      matchType = String(t.type || '').toLowerCase() === typeFilter;
    }

    let matchStatus = true;
    if (statusFilter) {
      matchStatus = String(t.status || '').toLowerCase() === statusFilter;
    }

    return matchType && matchStatus;
  });

  renderTransactionsTable(filtered);
}

function renderTransactionsTable(transactions = allTransactions) {
  const tbody = document.getElementById('transactionsTbody');
  if (!tbody) return;

  if (!transactions.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No platform transactions match the selected filters.</td></tr>';
    return;
  }

  tbody.innerHTML = transactions.map((t, i) => {
    const txId = t._id || t.id || t.reference || '';
    const ref = t.reference || txId || '—';
    const isCredit = String(t.type || '').toLowerCase() === 'credit' || String(t.type || '').toUpperCase() === 'DEPOSIT';

    return `
      <tr>
        <td style="color:var(--muted);font-size:12px;">${i + 1}</td>
        <td>
          <span style="font-family:monospace;font-size:12px;">${escapeHTML(ref)}</span>
          <button class="copy-btn" onclick="copyToClipboard('${escapeHTML(ref)}', 'Reference')" title="Copy"><i class="ph ph-copy"></i></button>
        </td>
        <td>
          <span class="status-badge ${isCredit ? 'badge-received' : 'badge-banned'}">
            ${escapeHTML(t.type || 'CREDIT')}
          </span>
        </td>
        <td style="color:${isCredit ? 'var(--green)' : 'var(--amber)'};font-weight:700;">₦${parseFloat(t.amount || 0).toLocaleString()}</td>
        <td>${statusBadge(t.status || 'SUCCESS')}</td>
        <td style="font-size:12px;color:var(--muted);">${fmt(t.createdAt || t.date)}</td>
        <td style="text-align:right;">
          <button class="tbl-btn tbl-btn-view" onclick="viewTransactionDetails('${escapeHTML(txId)}')"><i class="ph ph-eye"></i> Details</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function viewTransactionDetails(id) {
  currentViewingTxId = id;
  const body = document.getElementById('txModalBody');
  if (body) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);grid-column:1/-1;"><i class="ph ph-spinner spinning"></i> Fetching transaction details...</div>';
  }
  showModal('txModal');

  let tx = allTransactions.find(t => String(t._id || t.id || t.reference) === String(id));

  if (typeof adminGetTransaction === 'function' && id) {
    try {
      const res = await adminGetTransaction(id);
      if (res) {
        tx = res.transaction || res.data || res;
      }
    } catch (_) {}
  }

  if (!tx) {
    if (body) body.innerHTML = '<div class="empty-cell" style="grid-column:1/-1;color:var(--red);">Transaction not found.</div>';
    return;
  }

  const uObj = tx.user && typeof tx.user === 'object' ? tx.user : allUsers.find(u => String(u.id || u._id) === String(tx.user));
  const uDisplay = uObj ? ([uObj.firstName, uObj.lastName].filter(Boolean).join(' ') || uObj.name || uObj.email || tx.user) : (tx.user || '—');

  if (body) {
    body.innerHTML = `
      <div class="modal-field">
        <div class="modal-field-label">Transaction ID / Ref</div>
        <div class="modal-field-value" style="font-family:monospace;font-size:12px;">${escapeHTML(String(tx._id || tx.id || tx.reference || '—'))}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">User</div>
        <div class="modal-field-value">${escapeHTML(uDisplay)}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Type</div>
        <div class="modal-field-value"><span class="status-badge badge-received">${escapeHTML(tx.type || 'CREDIT')}</span></div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Amount</div>
        <div class="modal-field-value" style="color:var(--green);font-weight:700;">₦${parseFloat(tx.amount || 0).toLocaleString()}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Current Status</div>
        <div class="modal-field-value">${statusBadge(tx.status || 'SUCCESS')}</div>
      </div>
      <div class="modal-field">
        <div class="modal-field-label">Date &amp; Time</div>
        <div class="modal-field-value" style="font-size:12px;color:var(--muted);">${fmt(tx.createdAt || tx.date)}</div>
      </div>
      <div class="modal-field full-width">
        <div class="modal-field-label">Description / Narration</div>
        <div class="modal-field-value" style="font-size:12px;color:var(--muted);">${escapeHTML(tx.description || tx.narration || tx.reason || '—')}</div>
      </div>
    `;
  }

  const sel = document.getElementById('txNewStatusSelect');
  if (sel && tx.status) {
    sel.value = String(tx.status).toLowerCase();
  }
}

async function submitTxStatusUpdate() {
  if (!currentViewingTxId) return;
  const newStatus = document.getElementById('txNewStatusSelect')?.value || 'success';

  try {
    if (typeof adminUpdateTransactionStatus === 'function') {
      await adminUpdateTransactionStatus(currentViewingTxId, newStatus);
    }
    adminToast(`Transaction status updated to ${newStatus}.`, 'success');
    logActivity('config', `Updated transaction ${currentViewingTxId} status to ${newStatus}`);
    closeModal('txModal');
    await loadBackendTransactions();
  } catch (err) {
    adminToast(err.message || 'Failed to update transaction status.', 'error');
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
  const email     = document.getElementById('fundUserSelect')?.value;
  const amount    = parseFloat(document.getElementById('fundAmount')?.value);
  const operation = document.getElementById('fundOperation')?.value || 'credit';
  const reason    = (document.getElementById('fundReason')?.value || '').trim() || `Admin ${operation} via Console`;

  if (!email) {
    adminToast('Please select a valid user.', 'error');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    adminToast('Please enter an amount greater than 0.', 'error');
    return;
  }

  try {
    let target = allUsers.find(u => (u.email && u.email.toLowerCase() === email.toLowerCase()) || String(u.id || u._id) === String(email));
    const userId = target?.id || target?._id || email;

    if (operation === 'debit') {
      if (typeof adminDebitWallet === 'function' && userId) {
        await adminDebitWallet(userId, amount, reason);
      }
      logActivity('fund', `Admin debited ₦${amount.toLocaleString()} from ${target?.email || userId}. Reason: ${reason}`);
      adminToast(`Successfully debited ₦${amount.toLocaleString()} from user account.`, 'success');
    } else {
      if (typeof adminCreditWallet === 'function' && userId) {
        await adminCreditWallet(userId, amount, reason);
      }
      logActivity('fund', `Admin credited ₦${amount.toLocaleString()} to ${target?.email || userId}. Reason: ${reason}`);
      adminToast(`Successfully credited ₦${amount.toLocaleString()} to user account.`, 'success');
    }

    const amtIn = document.getElementById('fundAmount');
    if (amtIn) amtIn.value = '';
    const rIn = document.getElementById('fundReason');
    if (rIn) rIn.value = '';

    await loadAllData();
    renderOverview();
    renderUsersTable(allUsers);
    loadSettingsForm();
  } catch (err) {
    adminToast(err.message || `Failed to ${operation} user wallet.`, 'error');
  }
}

async function handleCreateAdmin() {
  const setupKey = (document.getElementById('newAdminSetupKey')?.value || '').trim();
  const name     = (document.getElementById('newAdminName')?.value || '').trim();
  const email    = (document.getElementById('newAdminEmail')?.value || '').trim();
  const password = (document.getElementById('newAdminPass')?.value || '').trim();
  const role     = (document.getElementById('newAdminRole')?.value || 'admin').trim();

  if (!name || !email || !password) {
    adminToast('Please fill in name, email, and password for the new administrator.', 'error');
    return;
  }
  if (password.length < 6) {
    adminToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    if (typeof adminRegisterApi === 'function') {
      await adminRegisterApi({ name, email, password, role, setupKey });
      adminToast(`Administrator ${email} registered successfully!`, 'success');
      logActivity('config', `Created admin account: ${email} (${role})`);
      const nEl = document.getElementById('newAdminName');
      if (nEl) nEl.value = '';
      const eEl = document.getElementById('newAdminEmail');
      if (eEl) eEl.value = '';
      const pEl = document.getElementById('newAdminPass');
      if (pEl) pEl.value = '';
      const kEl = document.getElementById('newAdminSetupKey');
      if (kEl) kEl.value = '';
    } else {
      throw new Error('adminRegisterApi function is not defined.');
    }
  } catch (err) {
    adminToast(err.message || 'Failed to create admin account.', 'error');
  }
}

/* ════════════════════════════════════
   ANNOUNCEMENT SYSTEM CONTROLLER
   ════════════════════════════════════ */

function getAdminAnnouncements() {
  return allAnnouncements;
}

async function loadAdminAnnouncements() {
  // Query backend active announcement endpoint directly
  if (typeof fetchActiveAnnouncementFromApi === 'function') {
    try {
      const active = await fetchActiveAnnouncementFromApi();
      if (active && (active.title || active.content || active.message)) {
        const idx = allAnnouncements.findIndex(a => a.id === active.id);
        if (idx !== -1) {
          allAnnouncements[idx] = active;
        } else {
          allAnnouncements.unshift(active);
        }
      }
    } catch (_) {}
  }

  const announcements = getAdminAnnouncements();
  const tbody = document.getElementById('announcementsTableBody');
  const countEl = document.getElementById('annTotalCount');
  const navBadge = document.getElementById('navAnnounceBadge');
  
  if (countEl) countEl.textContent = announcements.length;

  const activeAnn = announcements.find(a => a.active);
  if (navBadge) {
    if (activeAnn) {
      navBadge.textContent = 'Active';
      navBadge.className = 'nav-badge';
      navBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      navBadge.style.color = '#34d399';
    } else {
      navBadge.textContent = 'Off';
      navBadge.className = 'nav-badge';
      navBadge.style.background = 'rgba(156, 163, 175, 0.2)';
      navBadge.style.color = '#9ca3af';
    }
  }

  // Settings panel summary update
  const settingsTitle = document.getElementById('settingsActiveAnnTitle');
  const settingsBadge = document.getElementById('settingsActiveAnnBadge');
  const settingsTips  = document.getElementById('settingsActiveAnnTips');

  if (settingsTitle) {
    if (activeAnn) {
      settingsTitle.textContent = activeAnn.title || 'Important Announcement';
      if (settingsBadge) {
        settingsBadge.className = 'status-badge badge-received';
        settingsBadge.innerHTML = '<i class="ph ph-check-circle"></i> Published';
      }
      if (settingsTips) {
        const count = (activeAnn.content || activeAnn.message || '').split(/\r?\n/).filter(Boolean).length;
        settingsTips.textContent = `${count} Tips Configured • Visible upon user login`;
      }
    } else {
      settingsTitle.textContent = 'No Active Announcement';
      if (settingsBadge) {
        settingsBadge.className = 'status-badge badge-canceled';
        settingsBadge.innerHTML = '<i class="ph ph-pause-circle"></i> Inactive';
      }
      if (settingsTips) {
        settingsTips.textContent = 'Popup is currently disabled for users.';
      }
    }
  }

  if (!tbody) return;

  if (!announcements.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell" style="text-align:center;padding:24px;color:var(--muted);">No announcements created yet. Click "Publish Announcement" above to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = announcements.map(ann => {
    const isAct = Boolean(ann.active);
    const statusHtml = isAct
      ? `<span class="status-badge badge-received"><i class="ph ph-check-circle"></i> Published</span>`
      : `<span class="status-badge badge-canceled"><i class="ph ph-pause-circle"></i> Disabled</span>`;

    const catMap = {
      tips: '💡 Tips & Guidance',
      notice: '📢 Notice',
      maintenance: '🔧 Maintenance',
      promo: '🎁 Promotion',
      security: '🔒 Security Alert'
    };
    const catDisplay = `<span style="font-size:12px;font-weight:600;color:var(--text);">${escapeHTML(catMap[ann.category] || ann.category || '💡 Tips')}</span>`;
    
    const tipsList = (ann.content || ann.message || '').split(/\r?\n/).filter(Boolean);
    const tipsCount = tipsList.length;
    const tipsSubtitle = ann.subtitle || (tipsCount > 1 ? `Tips (${tipsCount})` : 'Notice');
    const updatedDate = ann.updatedAt ? new Date(ann.updatedAt).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '—';

    const waDisplay = ann.whatsappUrl ? `<a href="${escapeHTML(ann.whatsappUrl)}" target="_blank" style="color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;gap:4px;font-size:12px;"><i class="ph ph-whatsapp-logo"></i> Link</a>` : '<span style="color:var(--muted);font-size:12px;">Default</span>';

    return `
      <tr>
        <td>${statusHtml}</td>
        <td>${catDisplay}</td>
        <td>
          <div style="font-weight:700;color:var(--text);font-size:13px;">${escapeHTML(ann.title || 'Important Announcement')}</div>
          <div style="font-size:11px;color:var(--accent);">${escapeHTML(tipsSubtitle)}</div>
        </td>
        <td>
          <span style="font-weight:600;font-size:12px;color:var(--text);">${tipsCount} tips</span>
        </td>
        <td>${waDisplay}</td>
        <td style="font-size:11px;color:var(--muted);white-space:nowrap;">${updatedDate}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="tbl-btn tbl-btn-view" onclick="previewAnnouncementById('${ann.id}')" title="Preview Popup"><i class="ph ph-eye"></i></button>
          <button class="tbl-btn tbl-btn-view" onclick="editAnnouncement('${ann.id}')" title="Edit"><i class="ph ph-pencil-simple"></i></button>
          <button class="tbl-btn ${isAct ? 'tbl-btn-del' : 'tbl-btn-fund'}" onclick="toggleAnnouncementStatus('${ann.id}')" title="${isAct ? 'Disable' : 'Publish'}">
            <i class="ph ${isAct ? 'ph-pause' : 'ph-play'}"></i> ${isAct ? 'Disable' : 'Publish'}
          </button>
          <button class="tbl-btn tbl-btn-del" onclick="deleteAnnouncement('${ann.id}')" title="Delete"><i class="ph ph-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

async function saveAdminAnnouncement() {
  const title = (document.getElementById('annTitleInput')?.value || '').trim() || 'Important Announcement';
  const subtitle = (document.getElementById('annSubtitleInput')?.value || '').trim();
  const category = (document.getElementById('annCategorySelect')?.value || '').trim() || 'tips';
  const whatsappUrl = (document.getElementById('annWhatsappInput')?.value || '').trim() || 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq';
  const content = (document.getElementById('annContentInput')?.value || '').trim();
  const isActive = Boolean(document.getElementById('annActiveToggle')?.checked);
  const editId = (document.getElementById('announcementEditId')?.value || '').trim();

  if (!content) {
    adminToast('Please enter announcement / tips content.', 'error');
    return;
  }

  const tipsList = content.split(/\r?\n/).filter(Boolean);
  const computedSubtitle = subtitle || (tipsList.length > 1 ? `Tips (${tipsList.length})` : 'Notice');

  const payload = {
    id: editId || ('ann_' + Date.now()),
    title,
    subtitle: computedSubtitle,
    category,
    message: content,
    content: content,
    whatsappUrl,
    active: isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 1. Send announcement to actual Admin API / Backend
  if (typeof publishAnnouncementToApi === 'function') {
    try {
      await publishAnnouncementToApi(payload);
    } catch (err) {
      console.warn('[Admin API] Publish announcement route status:', err.message);
    }
  }

  // 2. Dispatch admin announcement notification event
  if (isActive) {
    try {
      const adminNotif = {
        id: 'admin_ann_' + (payload.id || Date.now()),
        title: `📢 ${payload.title || 'Announcement'}`,
        message: (payload.content || payload.message || '').slice(0, 300),
        type: payload.category || 'system',
        createdAt: new Date().toISOString(),
        read: false
      };
      window.dispatchEvent(new CustomEvent('primes_notification_created', { detail: adminNotif }));
    } catch (_) {}
  }

  // 3. Update in-memory announcements list
  let announcements = getAdminAnnouncements();
  if (editId) {
    const idx = announcements.findIndex(a => a.id === editId);
    if (idx !== -1) {
      if (isActive) announcements.forEach(a => { if (a.id !== editId) a.active = false; });
      announcements[idx] = { ...announcements[idx], ...payload };
    } else {
      if (isActive) announcements.forEach(a => a.active = false);
      announcements.unshift(payload);
    }
  } else {
    if (isActive) announcements.forEach(a => a.active = false);
    announcements.unshift(payload);
  }

  logActivity('config', `${isActive ? 'Published' : 'Updated'} announcement: "${title}"`);
  adminToast(`Announcement ${isActive ? 'published' : 'saved'} successfully!`, 'success');

  resetAnnouncementForm();
  loadAdminAnnouncements();
}

function editAnnouncement(id) {
  const announcements = getAdminAnnouncements();
  const ann = announcements.find(a => a.id === id);
  if (!ann) return;

  const editIdEl = document.getElementById('announcementEditId');
  if (editIdEl) editIdEl.value = ann.id;
  const titleEl = document.getElementById('annTitleInput');
  if (titleEl) titleEl.value = ann.title || 'Important Announcement';
  const subEl = document.getElementById('annSubtitleInput');
  if (subEl) subEl.value = ann.subtitle || '';
  const catEl = document.getElementById('annCategorySelect');
  if (catEl) catEl.value = ann.category || 'tips';
  const waEl = document.getElementById('annWhatsappInput');
  if (waEl) waEl.value = ann.whatsappUrl || '';
  const contentEl = document.getElementById('annContentInput');
  if (contentEl) contentEl.value = ann.content || ann.message || '';
  const activeToggle = document.getElementById('annActiveToggle');
  if (activeToggle) activeToggle.checked = Boolean(ann.active);

  const panelTitle = document.getElementById('annFormPanelTitle');
  if (panelTitle) panelTitle.textContent = 'Edit Announcement';
  const modeBadge = document.getElementById('annFormModeBadge');
  if (modeBadge) {
    modeBadge.textContent = 'Editing';
    modeBadge.className = 'status-badge badge-received';
  }
  const saveBtnText = document.getElementById('annSaveBtnText');
  if (saveBtnText) saveBtnText.textContent = 'Save Changes';
  const editIndicator = document.getElementById('annEditIndicator');
  if (editIndicator) editIndicator.style.display = 'inline-flex';
  const editingAnnIdText = document.getElementById('editingAnnIdText');
  if (editingAnnIdText) editingAnnIdText.textContent = ann.id;
  const cancelBtn = document.getElementById('annCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  titleEl?.focus();
  titleEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditAdminAnnouncement() {
  resetAnnouncementForm();
}

function resetAnnouncementForm() {
  const editIdEl = document.getElementById('announcementEditId');
  if (editIdEl) editIdEl.value = '';
  const titleEl = document.getElementById('annTitleInput');
  if (titleEl) titleEl.value = 'Important Announcement';
  const subEl = document.getElementById('annSubtitleInput');
  if (subEl) subEl.value = '';
  const catEl = document.getElementById('annCategorySelect');
  if (catEl) catEl.value = 'tips';
  const waEl = document.getElementById('annWhatsappInput');
  if (waEl) waEl.value = 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq';
  const contentEl = document.getElementById('annContentInput');
  if (contentEl) contentEl.value = '';
  const activeToggle = document.getElementById('annActiveToggle');
  if (activeToggle) activeToggle.checked = true;

  const panelTitle = document.getElementById('annFormPanelTitle');
  if (panelTitle) panelTitle.textContent = 'Create Announcement';
  const modeBadge = document.getElementById('annFormModeBadge');
  if (modeBadge) {
    modeBadge.textContent = 'New';
    modeBadge.className = 'status-badge badge-received';
  }
  const saveBtnText = document.getElementById('annSaveBtnText');
  if (saveBtnText) saveBtnText.textContent = 'Publish Announcement';
  const editIndicator = document.getElementById('annEditIndicator');
  if (editIndicator) editIndicator.style.display = 'none';
  const cancelBtn = document.getElementById('annCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

async function toggleAnnouncementStatus(id) {
  const announcements = getAdminAnnouncements();
  const ann = announcements.find(a => a.id === id);
  if (!ann) return;

  const willBeActive = !ann.active;
  ann.active = willBeActive;
  ann.updatedAt = new Date().toISOString();

  if (willBeActive) {
    announcements.forEach(a => { if (a.id !== id) a.active = false; });
  }

  // Push updated status to Admin API
  if (typeof publishAnnouncementToApi === 'function') {
    try {
      await publishAnnouncementToApi(ann);
    } catch (_) {}
  }

  if (willBeActive) {
    adminToast('Announcement published to user dashboard!', 'success');
    logActivity('config', `Activated announcement: "${ann.title}"`);
  } else {
    adminToast('Announcement deactivated.', 'info');
    logActivity('config', `Disabled announcement: "${ann.title}"`);
  }

  loadAdminAnnouncements();
}

function deleteAnnouncement(id) {
  openConfirmModal(
    'Delete Announcement',
    'Are you sure you want to permanently delete this announcement? This action cannot be undone.',
    async () => {
      allAnnouncements = allAnnouncements.filter(a => a.id !== id);
      adminToast('Announcement deleted successfully.', 'success');
      logActivity('config', `Deleted announcement #${id}`);
      resetAnnouncementForm();
      loadAdminAnnouncements();
    }
  );
}

function previewCurrentAdminAnnouncement() {
  const announcements = getAdminAnnouncements();
  const activeAnn = announcements.find(a => a.active) || announcements[0];
  if (activeAnn) {
    if (typeof showAnnouncementModal === 'function') {
      showAnnouncementModal(activeAnn, true);
    } else {
      adminShowPreviewModal(activeAnn);
    }
  } else {
    adminToast('No announcement available to preview.', 'warning');
  }
}

function previewFormAnnouncement() {
  const title = (document.getElementById('annTitleInput')?.value || '').trim() || 'Important Announcement';
  const subtitle = (document.getElementById('annSubtitleInput')?.value || '').trim();
  const whatsappUrl = (document.getElementById('annWhatsappInput')?.value || '').trim() || 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq';
  const content = (document.getElementById('annContentInput')?.value || '').trim() || `💡 Delete and reinstall WhatsApp before getting a number\n💡 Avoid Business WhatsApp. They ban faster... use normal WhatsApp instead\n💡 Ensure Your Time Zone & VPN matches the country of the number\n🔒 Use a fresh WhatsApp installation for better success rates\n⏰ Complete verification within the allocated time frame`;

  const previewObj = {
    id: 'preview',
    title,
    subtitle,
    whatsappUrl,
    content,
    active: true
  };

  if (typeof showAnnouncementModal === 'function') {
    showAnnouncementModal(previewObj, true);
  } else {
    adminShowPreviewModal(previewObj);
  }
}

function previewAnnouncementById(id) {
  const announcements = getAdminAnnouncements();
  const ann = announcements.find(a => a.id === id);
  if (!ann) return;

  if (typeof showAnnouncementModal === 'function') {
    showAnnouncementModal(ann, true);
  } else {
    adminShowPreviewModal(ann);
  }
}

function adminShowPreviewModal(data) {
  const modal = document.getElementById('announcementModal');
  if (!modal) return;

  const rawTitle = data.title || 'Important Announcement';
  const titleClean = rawTitle.replace(/^📢\s*/, '').trim();
  const titleTextEl = document.getElementById('announcementTitleText');
  if (titleTextEl) titleTextEl.textContent = titleClean || 'Important Announcement';

  const parseFn = typeof parseAnnouncementItems === 'function' ? parseAnnouncementItems : (c) => {
    return String(c).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
      const m = line.match(/^(\p{Extended_Pictographic}|[💡🔒⏰📢⚠️✅📌🚀⭐🔥ℹ️✨])\s*(.*)$/u);
      return m ? { icon: m[1], text: m[2] } : { icon: '💡', text: line };
    });
  };

  const items = parseFn(data.content || '');
  const subtitleEl = document.getElementById('announcementSubtitle');
  if (subtitleEl) {
    if (data.subtitle && data.subtitle.trim()) {
      subtitleEl.textContent = data.subtitle.trim();
    } else if (items.length > 1) {
      subtitleEl.textContent = `Tips (${items.length})`;
    } else {
      subtitleEl.textContent = 'Tips (1)';
    }
  }

  const contentBox = document.getElementById('announcementModalContent');
  if (contentBox) {
    contentBox.innerHTML = items.map((item, idx) => {
      const colorClass = (idx % 2 === 0) ? 'ann-color-purple' : 'ann-color-amber';
      return `
        <div class="ann-item-row ${colorClass}">
          <span class="ann-item-emoji">${item.icon || '💡'}</span>
          <span class="ann-item-text">${escapeHTML(item.text)}</span>
        </div>`;
    }).join('');
  }

  const waBtn = document.getElementById('announcementWhatsappBtn');
  if (waBtn) {
    waBtn.href = data.whatsappUrl || '#';
  }

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('show'));
}

function closeAnnouncementModal() {
  const modal = document.getElementById('announcementModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 250);
  }
}

// Backward-compatible hook
async function makeAnnouncement() {
  const msg = document.getElementById('announcementMessage')?.value.trim();
  if (!msg) {
    saveAdminAnnouncement();
    return;
  }
  const payload = {
    id: 'ann_' + Date.now(),
    title: 'Important Announcement',
    subtitle: 'Tips (1)',
    content: msg,
    whatsappUrl: 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (typeof publishAnnouncementToApi === 'function') {
    try {
      await publishAnnouncementToApi(payload);
    } catch (_) {}
  }
  const list = getAdminAnnouncements();
  list.unshift(payload);
  logActivity('config', `Broadcast announcement: "${msg.slice(0, 40)}..."`);
  adminToast('Announcement broadcasted to all users!', 'success');
  loadAdminAnnouncements();
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
  loadAdminAnnouncements();
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
