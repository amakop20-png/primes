// routes/admin.js - Complete NuraSMS Admin API router
const express = require('express');
const router = express.Router();
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  try {
    bcrypt = require('bcrypt');
  } catch (_e) {
    const crypto = require('crypto');
    bcrypt = {
      hash: async (pwd) => '$pbkdf2$' + crypto.scryptSync(pwd, 'nuraxq_salt', 32).toString('hex'),
      compare: async (pwd, hash) => hash === ('$pbkdf2$' + crypto.scryptSync(pwd, 'nuraxq_salt', 32).toString('hex'))
    };
  }
}
const jwt = require('jsonwebtoken');
const { adminAuth, JWT_SECRET } = require('../middleware/adminAuth');
const db = require('../db');
let fivesim = null;
try {
  fivesim = require('../fivesim');
} catch (_) {}

const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || process.env.x_admin_setup_key || 'primes_admin_setup_key_2026';

/* ======================================================================
   ADMIN AUTHENTICATION ENDPOINTS (Base: /api/admin/auth)
====================================================================== */

// POST /api/admin/auth/login
router.post('/auth/login', async (req, res) => {
  const { email, username, identifier, password } = req.body;
  const loginId = email || username || identifier;

  if (!loginId || !password) {
    return res.status(400).json({
      success: false,
      error: 'Administrator email/username and password are required.'
    });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    const user = await db.findUserByEmailOrUsername(loginId);

    if (!user) {
      await db.recordLoginLog({ email: loginId, ipAddress: clientIp, userAgent, status: 'failed_not_found' });
      return res.status(401).json({
        success: false,
        error: 'Invalid administrator credentials.'
      });
    }

    const passwordHash = user.password || user.password_hash;
    const isMatch = await bcrypt.compare(password, passwordHash);

    if (!isMatch) {
      await db.recordLoginLog({ userId: user.id || user._id, email: user.email, ipAddress: clientIp, userAgent, status: 'failed_wrong_password' });
      return res.status(401).json({
        success: false,
        error: 'Invalid administrator credentials.'
      });
    }

    // Role verification: check if user is an administrator
    const role = String(user.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin' || user.is_admin === true || user.isAdmin === true;

    if (!isAdmin) {
      await db.recordLoginLog({ userId: user.id || user._id, email: user.email, ipAddress: clientIp, userAgent, status: 'forbidden_not_admin' });
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have administrator privileges.'
      });
    }

    // Generate Admin JWT Token
    const adminId = String(user.id || user._id);
    const token = jwt.sign(
      {
        id: adminId,
        email: user.email,
        username: user.username,
        role: user.role || 'admin',
        isAdmin: true
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await db.recordLoginLog({ userId: adminId, email: user.email, ipAddress: clientIp, userAgent, status: 'success' });

    const safeAdmin = {
      id: adminId,
      email: user.email,
      username: user.username,
      name: [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ') || user.username || 'Admin',
      role: user.role || 'admin'
    };

    return res.status(200).json({
      success: true,
      message: 'Administrator authentication successful.',
      token,
      accessToken: token,
      admin: safeAdmin,
      user: safeAdmin
    });

  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({
      success: false,
      error: 'An unexpected internal error occurred during administrator authentication.'
    });
  }
});

// GET /api/admin/auth/me
router.get('/auth/me', adminAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.admin.id);
    const displayName = user ? ([user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ') || user.username) : req.admin.username || 'Administrator';
    
    return res.status(200).json({
      success: true,
      data: {
        id: req.admin.id,
        email: req.admin.email,
        username: req.admin.username || displayName,
        name: displayName,
        role: req.admin.role || 'admin',
        ...(user || {})
      }
    });
  } catch (err) {
    console.error('Admin /auth/me error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/admin/auth/logout
router.post('/auth/logout', adminAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Administrator session invalidated successfully.'
  });
});

// POST /api/admin/auth/register (Admin creation via setup key)
router.post('/auth/register', async (req, res) => {
  const setupKey = req.headers['x-admin-setup-key'] || req.body.setupKey;
  if (!setupKey || setupKey !== ADMIN_SETUP_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing administrator setup key.'
    });
  }

  const { email, password, username, name, firstName, lastName, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required to initialize administrator.'
    });
  }

  const adminRole = (role && (String(role).toLowerCase() === 'superadmin' || String(role).toLowerCase() === 'super_admin')) ? 'superadmin' : 'admin';
  const fName = firstName || (name ? name.split(' ')[0] : 'Admin');
  const lName = lastName || (name && name.split(' ').slice(1).join(' ')) || 'User';

  try {
    const existing = await db.findUserByEmailOrUsername(email);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pool = db.getPool();
    if (pool) {
      const result = await pool.query(`
        INSERT INTO users (email, username, first_name, last_name, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, username, role, created_at
      `, [email.toLowerCase(), username || email.split('@')[0], fName, lName, passwordHash, adminRole]);

      return res.status(201).json({
        success: true,
        message: 'Administrator account created successfully.',
        admin: result.rows[0]
      });
    }

    const inMemoryId = db.inMemory.users.length + 1;
    const memAdmin = {
      id: inMemoryId,
      _id: String(inMemoryId),
      email: email.toLowerCase(),
      username: username || email.split('@')[0],
      first_name: fName,
      firstName: fName,
      last_name: lName,
      lastName: lName,
      password_hash: passwordHash,
      role: adminRole,
      balance: 0,
      is_suspended: false,
      isSuspended: false,
      created_at: new Date().toISOString()
    };
    db.inMemory.users.push(memAdmin);

    return res.status(201).json({
      success: true,
      message: 'Administrator account created successfully.',
      admin: {
        id: memAdmin.id,
        email: memAdmin.email,
        username: memAdmin.username,
        role: memAdmin.role,
        created_at: memAdmin.created_at
      }
    });
  } catch (err) {
    console.error('Admin registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

/* ======================================================================
   DASHBOARD STATS (Base: /api/admin/dashboard/stats)
====================================================================== */

// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    const orderStats = await db.getOrderStats();

    let stats = {
      users: { total: 0, newToday: 0, suspended: 0 },
      wallets: { totalBalance: 0, totalWallets: 0, frozen: 0 },
      transactions: { total: 0, success: 0, totalAmount: 0 },
      virtualAccounts: { total: 0, active: 0 },
      orders: orderStats || { total: 0, active: 0, completed: 0, cancelled: 0, banned: 0, failed: 0, today: 0, totalRevenue: 0, todayRevenue: 0 },
      totalOrders: orderStats?.total || 0,
      activeOrders: orderStats?.active || 0,
      recentUsers: [],
      recentTransactions: []
    };

    if (pool) {
      const [{ count: userCount }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM users`)).rows;
      const [{ count: newToday }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`)).rows;
      const [{ count: suspendedCount }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_suspended = TRUE`)).rows;
      const [{ sum: totalBal, count: totalWallets }] = (await pool.query(`SELECT COALESCE(SUM(balance), 0)::numeric AS sum, COUNT(*)::int AS count FROM users`)).rows;
      const [{ count: txCount, sum: txTotalAmount }] = (await pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS sum FROM transactions`)).rows;
      const [{ count: txSuccess }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM transactions WHERE LOWER(status) = 'success'`)).rows;

      let vaCount = 0;
      try {
        const vaRes = await pool.query(`SELECT COUNT(*)::int AS count FROM virtual_accounts`);
        vaCount = vaRes.rows[0]?.count || 0;
      } catch (_) {}

      const recentUsers = (await pool.query(`SELECT id, email, username, first_name, last_name, role, balance, is_suspended, created_at FROM users ORDER BY created_at DESC LIMIT 5`)).rows;
      const recentTx = (await pool.query(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5`)).rows;

      stats.users.total = userCount || 0;
      stats.users.newToday = newToday || 0;
      stats.users.suspended = suspendedCount || 0;
      stats.wallets.totalBalance = parseFloat(totalBal || 0);
      stats.wallets.totalWallets = totalWallets || userCount || 0;
      stats.wallets.frozen = suspendedCount || 0;
      stats.transactions.total = txCount || 0;
      stats.transactions.success = txSuccess || 0;
      stats.transactions.totalAmount = parseFloat(txTotalAmount || 0);
      stats.virtualAccounts.total = vaCount || 0;
      stats.virtualAccounts.active = vaCount || 0;
      stats.recentUsers = recentUsers;
      stats.recentTransactions = recentTx;
    } else {
      stats.users.total = db.inMemory.users.length;
      stats.users.newToday = db.inMemory.users.filter(u => String(u.created_at || u.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
      stats.users.suspended = db.inMemory.users.filter(u => u.is_suspended || u.isSuspended).length;
      stats.wallets.totalBalance = db.inMemory.users.reduce((s, u) => s + (parseFloat(u.balance) || 0), 0);
      stats.wallets.totalWallets = db.inMemory.users.length;
      stats.wallets.frozen = stats.users.suspended;
      stats.transactions.total = db.inMemory.transactions.length;
      stats.transactions.success = db.inMemory.transactions.filter(t => String(t.status).toLowerCase() === 'success').length;
      stats.transactions.totalAmount = db.inMemory.transactions.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      stats.virtualAccounts.total = db.inMemory.virtualAccounts ? db.inMemory.virtualAccounts.length : 0;
      stats.virtualAccounts.active = stats.virtualAccounts.total;
      stats.recentUsers = db.inMemory.users.slice(0, 5);
      stats.recentTransactions = db.inMemory.transactions.slice(0, 5);
    }

    return res.status(200).json({
      success: true,
      data: stats,
      ...stats
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ success: false, error: 'Error calculating dashboard statistics' });
  }
});

/* ======================================================================
   USERS MANAGEMENT (Base: /api/admin/users)
====================================================================== */

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || 1, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit || 20, 10) || 20);
  const search = req.query.search ? String(req.query.search).trim() : null;
  const isSuspended = (req.query.isSuspended !== undefined && req.query.isSuspended !== '')
    ? (String(req.query.isSuspended).toLowerCase() === 'true' || req.query.isSuspended === true)
    : null;

  try {
    const pool = db.getPool();
    if (pool) {
      let query = `SELECT id, id AS "_id", email, username, first_name, first_name AS "firstName", last_name, last_name AS "lastName", phone, phone AS "phoneNumber", balance, role, is_suspended, is_suspended AS "isSuspended", created_at, created_at AS "createdAt" FROM users WHERE 1=1`;
      const params = [];

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (LOWER(email) LIKE $${params.length} OR LOWER(username) LIKE $${params.length} OR LOWER(COALESCE(first_name, '')) LIKE $${params.length} OR LOWER(COALESCE(last_name, '')) LIKE $${params.length} OR LOWER(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) LIKE $${params.length} OR COALESCE(phone, '') LIKE $${params.length})`;
      }

      if (isSuspended !== null) {
        params.push(isSuspended);
        query += ` AND is_suspended = $${params.length}`;
      }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) AS filtered`, params);
      const total = countRes.rows[0]?.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, (page - 1) * limit);

      const rows = (await pool.query(query, params)).rows;

      return res.status(200).json({
        success: true,
        data: rows,
        users: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    }

    // In-memory fallback with identical filtering, sorting, and independent count calculation
    let list = (db.inMemory.users || []).map(u => {
      const fName = u.first_name || u.firstName || '';
      const lName = u.last_name || u.lastName || '';
      const ph = u.phone || u.phoneNumber || null;
      const susp = Boolean(u.is_suspended || u.isSuspended);
      const cAt = u.created_at || u.createdAt || new Date().toISOString();
      return {
        id: u.id || u._id,
        _id: String(u._id || u.id),
        email: u.email || '',
        username: u.username || '',
        first_name: fName,
        firstName: fName,
        last_name: lName,
        lastName: lName,
        phone: ph,
        phoneNumber: ph,
        balance: parseFloat(u.balance || 0),
        role: u.role || 'user',
        is_suspended: susp,
        isSuspended: susp,
        created_at: cAt,
        createdAt: cAt
      };
    });

    if (search) {
      const sLow = search.toLowerCase();
      list = list.filter(u => {
        const fullName = `${u.firstName} ${u.lastName}`.trim().toLowerCase();
        return (
          String(u.email || '').toLowerCase().includes(sLow) ||
          String(u.username || '').toLowerCase().includes(sLow) ||
          String(u.firstName || '').toLowerCase().includes(sLow) ||
          String(u.lastName || '').toLowerCase().includes(sLow) ||
          fullName.includes(sLow) ||
          String(u.phone || '').toLowerCase().includes(sLow)
        );
      });
    }

    if (isSuspended !== null) {
      list = list.filter(u => Boolean(u.isSuspended) === isSuspended);
    }

    list.sort((a, b) => {
      const timeDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      return Number(b.id || 0) - Number(a.id || 0);
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paged = list.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      data: paged,
      users: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve users' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let virtualAccount = null;
    const pool = db.getPool();
    if (pool) {
      try {
        const vaRes = await pool.query(
          `SELECT account_number AS "accountNumber", bank_name AS "bankName", account_name AS "accountName", created_at AS "createdAt" FROM virtual_accounts WHERE user_id = $1 LIMIT 1`,
          [user.id || req.params.id]
        );
        if (vaRes.rows.length) virtualAccount = vaRes.rows[0];
      } catch (_) {}
    } else {
      virtualAccount = await db.getUserVirtualAccount(user.id || req.params.id);
    }

    const userData = {
      ...user,
      firstName: user.firstName || user.first_name || '',
      lastName: user.lastName || user.last_name || '',
      phoneNumber: user.phoneNumber || user.phone || '',
      isSuspended: Boolean(user.is_suspended || user.isSuspended),
      createdAt: user.createdAt || user.created_at,
      wallet: {
        balance: parseFloat(user.balance || 0),
        isFrozen: Boolean(user.is_suspended || user.isSuspended)
      },
      virtualAccount
    };

    return res.status(200).json({ success: true, data: userData, user: userData });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve user details' });
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', adminAuth, async (req, res) => {
  const { firstName, lastName, email, phoneNumber, username } = req.body;
  try {
    const pool = db.getPool();
    if (pool) {
      const updates = [];
      const values = [];
      if (firstName !== undefined) { values.push(firstName); updates.push(`first_name = $${values.length}`); }
      if (lastName !== undefined) { values.push(lastName); updates.push(`last_name = $${values.length}`); }
      if (email !== undefined) { values.push(email.toLowerCase()); updates.push(`email = $${values.length}`); }
      if (phoneNumber !== undefined) { values.push(phoneNumber); updates.push(`phone = $${values.length}`); }
      if (username !== undefined) { values.push(username); updates.push(`username = $${values.length}`); }

      if (updates.length > 0) {
        values.push(req.params.id);
        const q = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, email, username, first_name, last_name, phone, role, balance, is_suspended`;
        const updated = (await pool.query(q, values)).rows[0];
        return res.status(200).json({ success: true, message: 'User updated successfully', data: updated });
      }
    } else {
      const memUser = (db.inMemory.users || []).find(u => String(u.id || u._id) === String(req.params.id));
      if (!memUser) return res.status(404).json({ success: false, error: 'User not found' });
      if (firstName !== undefined) { memUser.first_name = firstName; memUser.firstName = firstName; }
      if (lastName !== undefined) { memUser.last_name = lastName; memUser.lastName = lastName; }
      if (email !== undefined) { memUser.email = email.toLowerCase(); }
      if (phoneNumber !== undefined) { memUser.phone = phoneNumber; memUser.phoneNumber = phoneNumber; }
      if (username !== undefined) { memUser.username = username; }
      return res.status(200).json({ success: true, message: 'User updated successfully', data: memUser });
    }
    return res.status(200).json({ success: true, message: 'No fields provided for update' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// POST /api/admin/users/:id/suspend
router.post('/users/:id/suspend', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(`UPDATE users SET is_suspended = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    } else {
      const memUser = (db.inMemory.users || []).find(u => String(u.id || u._id) === String(req.params.id));
      if (!memUser) return res.status(404).json({ success: false, error: 'User not found' });
      memUser.is_suspended = true;
      memUser.isSuspended = true;
    }
    return res.status(200).json({ success: true, message: 'User suspended successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to suspend user' });
  }
});

// POST /api/admin/users/:id/unsuspend
router.post('/users/:id/unsuspend', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(`UPDATE users SET is_suspended = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    } else {
      const memUser = (db.inMemory.users || []).find(u => String(u.id || u._id) === String(req.params.id));
      if (!memUser) return res.status(404).json({ success: false, error: 'User not found' });
      memUser.is_suspended = false;
      memUser.isSuspended = false;
    }
    return res.status(200).json({ success: true, message: 'User suspension removed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to unsuspend user' });
  }
});

/* ======================================================================
   WALLETS MANAGEMENT (Base: /api/admin/wallets)
====================================================================== */

// GET /api/admin/wallets
router.get('/wallets', adminAuth, async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const isFrozen = req.query.isFrozen !== undefined && req.query.isFrozen !== ''
    ? (req.query.isFrozen === 'true' || req.query.isFrozen === true)
    : null;

  try {
    const pool = db.getPool();
    if (pool) {
      let query = `SELECT id AS user_id, id AS "userId", email, username, balance, is_suspended AS is_frozen, is_suspended AS "isFrozen" FROM users WHERE 1=1`;
      const params = [];

      if (isFrozen !== null) {
        params.push(isFrozen);
        query += ` AND is_suspended = $${params.length}`;
      }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) AS filtered`, params);
      const total = countRes.rows[0]?.total || 0;

      query += ` ORDER BY balance DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, (page - 1) * limit);

      const rows = (await pool.query(query, params)).rows;
      return res.status(200).json({
        success: true,
        data: rows,
        wallets: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
    let list = (db.inMemory.users || []).map(u => ({
      user_id: u.id || u._id,
      userId: u.id || u._id,
      email: u.email,
      username: u.username,
      balance: parseFloat(u.balance || 0),
      is_frozen: Boolean(u.is_suspended || u.isSuspended),
      isFrozen: Boolean(u.is_suspended || u.isSuspended)
    }));
    if (isFrozen !== null) {
      list = list.filter(w => w.isFrozen === isFrozen);
    }
    list.sort((a, b) => b.balance - a.balance);
    const total = list.length;
    const paged = list.slice((page - 1) * limit, page * limit);
    return res.status(200).json({ success: true, data: paged, wallets: paged, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve wallets' });
  }
});

// POST /api/admin/wallets/:userId/credit
router.post('/wallets/:userId/credit', adminAuth, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const reason = req.body.reason || 'Admin manual wallet credit';

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than zero' });
  }

  try {
    const user = await db.findUserById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User wallet not found' });

    const ref = 'ADM-CR-' + Date.now().toString(36).toUpperCase();
    const result = await db.creditUserWallet(req.params.userId, amount, ref, reason, 'credit');

    return res.status(200).json({
      success: true,
      message: `Successfully credited ₦${amount.toLocaleString()}`,
      data: { id: req.params.userId, balance: result.balance }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to credit wallet' });
  }
});

// POST /api/admin/wallets/:userId/debit
router.post('/wallets/:userId/debit', adminAuth, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const reason = req.body.reason || 'Admin manual wallet debit';

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than zero' });
  }

  try {
    const user = await db.findUserById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User wallet not found' });

    const ref = 'ADM-DR-' + Date.now().toString(36).toUpperCase();
    const result = await db.debitUserWallet(req.params.userId, amount, ref, reason, 'debit');

    return res.status(200).json({
      success: true,
      message: `Successfully debited ₦${amount.toLocaleString()}`,
      data: { id: req.params.userId, balance: result.balance }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to debit wallet' });
  }
});

// GET /api/admin/wallets/:userId
router.get('/wallets/:userId', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      const rows = (await pool.query(
        `SELECT id AS user_id, email, username, balance, is_suspended AS is_frozen FROM users WHERE id = $1 LIMIT 1`,
        [req.params.userId]
      )).rows;
      if (rows.length) {
        return res.status(200).json({ success: true, data: rows[0], wallet: rows[0] });
      }
    }
    const user = await db.findUserById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, error: 'Wallet not found' });
    const wallet = { user_id: user.id || user._id, email: user.email, username: user.username, balance: user.balance || 0, is_frozen: Boolean(user.is_suspended || user.isSuspended) };
    return res.status(200).json({ success: true, data: wallet, wallet });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve wallet' });
  }
});

// POST /api/admin/wallets/:userId/freeze
router.post('/wallets/:userId/freeze', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(`UPDATE users SET is_suspended = TRUE, updated_at = NOW() WHERE id = $1`, [req.params.userId]);
    }
    return res.status(200).json({ success: true, message: 'Wallet frozen successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to freeze wallet' });
  }
});

// POST /api/admin/wallets/:userId/unfreeze
router.post('/wallets/:userId/unfreeze', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(`UPDATE users SET is_suspended = FALSE, updated_at = NOW() WHERE id = $1`, [req.params.userId]);
    }
    return res.status(200).json({ success: true, message: 'Wallet unfrozen successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to unfreeze wallet' });
  }
});

/* ======================================================================
   TRANSACTIONS (Base: /api/admin/transactions)
====================================================================== */

// GET /api/admin/transactions
router.get('/transactions', adminAuth, async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const type = req.query.type;
  const status = req.query.status;
  const user = req.query.user;
  const from = req.query.from;
  const to = req.query.to;

  try {
    const pool = db.getPool();
    if (pool) {
      let query = `SELECT * FROM transactions WHERE 1=1`;
      const params = [];
      if (type) { params.push(type.toLowerCase()); query += ` AND LOWER(type) = $${params.length}`; }
      if (status) { params.push(status.toLowerCase()); query += ` AND LOWER(status) = $${params.length}`; }
      if (user) {
        params.push(user);
        query += ` AND (user_id::text = $${params.length} OR LOWER(user_email) = LOWER($${params.length}))`;
      }
      if (from) { params.push(new Date(from).toISOString()); query += ` AND created_at >= $${params.length}`; }
      if (to) { params.push(new Date(to).toISOString()); query += ` AND created_at <= $${params.length}`; }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) AS filtered`, params);
      const total = countRes.rows[0]?.total || 0;

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, (page - 1) * limit);

      const rows = (await pool.query(query, params)).rows;
      return res.status(200).json({
        success: true,
        data: rows,
        transactions: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
    return res.status(200).json({ success: true, data: [], transactions: [], pagination: { page, limit, total: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve transactions' });
  }
});

// GET /api/admin/transactions/:id
router.get('/transactions/:id', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      const rows = (await pool.query(`SELECT * FROM transactions WHERE id = $1 OR reference = $1 LIMIT 1`, [req.params.id])).rows;
      if (rows.length) {
        return res.status(200).json({ success: true, data: rows[0], transaction: rows[0] });
      }
    }
    return res.status(404).json({ success: false, error: 'Transaction not found' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve transaction' });
  }
});

// PATCH /api/admin/transactions/:id/status
router.patch('/transactions/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }
  try {
    const pool = db.getPool();
    if (pool) {
      const result = await pool.query(
        `UPDATE transactions SET status = $1 WHERE id = $2 OR reference = $2 RETURNING *`,
        [status.toLowerCase(), req.params.id]
      );
      if (result.rows.length) {
        return res.status(200).json({ success: true, message: 'Transaction status updated', data: result.rows[0], transaction: result.rows[0] });
      }
    }
    return res.status(404).json({ success: false, error: 'Transaction not found' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to update transaction status' });
  }
});

/* ======================================================================
   5SIM ORDER MANAGEMENT (PDF Pages 6-7)
   GET /api/admin/fivesim/orders
   GET /api/admin/fivesim/orders/:orderId
====================================================================== */

// Helper to reconstruct single order shape and enrich live
async function reconstructAndEnrichOrder(row, fivesimClient) {
  let orderId = row.order_id;
  if (!orderId) {
    const match = String(row.reference || '').match(/(?:5SIM-ACT-|BUY-)([A-Za-z0-9_-]+)/i) || String(row.reference || '').match(/\d{6,}/);
    orderId = match ? (match[1] || match[0]) : (row.reference ? row.reference.replace(/^(5SIM-ACT-|BUY-)/, '') : String(row.tx_id || row.id));
  }

  let service = row.service || 'whatsapp';
  let country = row.country || 'canada';
  if (row.reason) {
    const svcMatch = row.reason.match(/for\s+([A-Za-z0-9_]+)/i);
    if (!row.service && svcMatch) service = svcMatch[1].toLowerCase();
    const cntMatch = row.reason.match(/\(([^)]+)\)/);
    if (!row.country && cntMatch) country = cntMatch[1].toLowerCase();
  }

  const hasCustomer = Boolean(row.username || row.u_email || row.user_email || row.first_name || row.last_name);
  const customer = hasCustomer ? {
    id: String(row.user_id || ''),
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'Customer',
    username: row.username || ((row.u_email || row.user_email) ? String(row.u_email || row.user_email).split('@')[0] : 'user'),
    email: row.u_email || row.user_email || ''
  } : null;

  const purchasedAt = row.tx_created_at ? new Date(row.tx_created_at).toISOString() : (row.order_created_at ? new Date(row.order_created_at).toISOString() : (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()));
  const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : new Date(new Date(purchasedAt).getTime() + 20 * 60 * 1000).toISOString();

  let fallbackStatus = 'PENDING';
  if (row.order_status) {
    fallbackStatus = String(row.order_status).toUpperCase();
  } else if (String(row.tx_status || row.status).toLowerCase() === 'success' || String(row.tx_status || row.status).toLowerCase() === 'completed') {
    fallbackStatus = 'FINISHED';
  } else if (row.tx_status || row.status) {
    fallbackStatus = String(row.tx_status || row.status).toUpperCase();
  }

  let fallbackSms = [];
  let fallbackOtp = row.sms_code || null;
  if (row.provider_data) {
    try {
      const pData = typeof row.provider_data === 'string' ? JSON.parse(row.provider_data) : row.provider_data;
      if (pData && Array.isArray(pData.sms) && pData.sms.length > 0) {
        fallbackSms = pData.sms.map(s => ({
          sender: s.sender || '5sim',
          text: s.text || s.message || '',
          message: s.message || s.text || '',
          code: s.code || '',
          date: s.date || s.created_at || purchasedAt
        }));
        if (!fallbackOtp && fallbackSms[0].code) {
          fallbackOtp = String(fallbackSms[0].code);
        }
      }
      if (pData && pData.expires && !row.expires_at) {
        row.expires_at = pData.expires;
      }
    } catch (_) {}
  }
  if (fallbackOtp && fallbackSms.length === 0) {
    fallbackSms = [{
      sender: '5sim',
      text: `Your verification code is ${fallbackOtp}`,
      message: `Your verification code is ${fallbackOtp}`,
      code: String(fallbackOtp),
      date: purchasedAt
    }];
  }

  const orderItem = {
    orderId: String(orderId),
    transactionId: String(row.tx_id || row.id || ''),
    reference: row.reference || `5SIM-ACT-${orderId}`,
    customer,
    service,
    country,
    operator: row.operator || 'virtual8',
    phone: row.phone || '—',
    amount: Math.abs(parseFloat(row.amount || 0)),
    purchasedAt,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : expiresAt,
    status: fallbackStatus,
    otp: fallbackOtp ? String(fallbackOtp) : null,
    sms: fallbackSms
  };

  // Live 5sim enrichment
  if (fivesimClient && typeof fivesimClient.checkOrder === 'function' && orderId && !isNaN(Number(orderId))) {
    try {
      const live = await Promise.race([
        fivesimClient.checkOrder(orderId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('5sim timeout')), 1800))
      ]);
      if (live && typeof live === 'object') {
        if (live.status) orderItem.status = String(live.status).toUpperCase();
        if (live.phone) orderItem.phone = live.phone;
        if (live.operator) orderItem.operator = live.operator;
        if (live.product) orderItem.service = live.product;
        if (live.country) orderItem.country = live.country;
        if (live.expires) orderItem.expiresAt = live.expires;
        if (Array.isArray(live.sms) && live.sms.length > 0) {
          orderItem.sms = live.sms.map(s => ({
            sender: s.sender || '5sim',
            text: s.text || s.message || '',
            message: s.message || s.text || '',
            code: s.code || '',
            date: s.date || s.created_at || new Date().toISOString()
          }));
          orderItem.otp = live.sms[0].code ? String(live.sms[0].code) : null;
        } else if (live.sms_code || live.code) {
          const code = String(live.sms_code || live.code);
          orderItem.otp = code;
          orderItem.sms = [{ sender: '5sim', text: `Verification code: ${code}`, message: `Verification code: ${code}`, code: code, date: new Date().toISOString() }];
        }
        try {
          if (live.status) {
            await db.updateOrderStatus(orderId, orderItem.status, orderItem.otp, live);
          }
        } catch (_) {}
      }
    } catch (_) {
      // Documented fallback behaviour:
      // If the live 5SIM request fails for an individual order:
      // - Use the last recorded purchase-time status.
      // - Return otp as null.
      orderItem.status = fallbackStatus;
      orderItem.otp = null;
    }
  }

  return orderItem;
}

// GET /api/admin/fivesim/orders (PDF Page 6)
router.get('/fivesim/orders', adminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || 1, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit || 20, 10) || 20);
  const filterUser = req.query.user ? String(req.query.user).trim() : null;
  const filterCountry = req.query.country ? String(req.query.country).toLowerCase().trim() : null;
  const filterProduct = req.query.product ? String(req.query.product).toLowerCase().trim() : null;
  const filterStatus = req.query.status ? String(req.query.status).toLowerCase().trim() : null;
  const filterOperator = req.query.operator ? String(req.query.operator).toLowerCase().trim() : null;
  const search = req.query.search ? String(req.query.search).toLowerCase().trim() : null;

  try {
    const pool = db.getPool();
    let reconstructedList = [];
    let totalCount = 0;

    if (pool) {
      let whereClauses = [
        `(t.type IN ('debit', 'purchase') OR t.reference LIKE 'BUY-%' OR t.reference LIKE '5SIM-%' OR LOWER(t.reason) LIKE '%virtual number%' OR LOWER(t.reason) LIKE '%activation%')`
      ];
      let params = [];

      if (filterUser) {
        params.push(filterUser);
        whereClauses.push(`(t.user_id::text = $${params.length} OR LOWER(t.user_email) = LOWER($${params.length}))`);
      }

      if (filterCountry) {
        params.push(`%${filterCountry}%`);
        whereClauses.push(`(LOWER(COALESCE(o.country, t.reason, '')) LIKE $${params.length})`);
      }

      if (filterProduct) {
        params.push(`%${filterProduct}%`);
        whereClauses.push(`(LOWER(COALESCE(o.service, t.reason, '')) LIKE $${params.length})`);
      }

      if (filterOperator) {
        params.push(`%${filterOperator}%`);
        whereClauses.push(`(LOWER(COALESCE(o.operator, '')) LIKE $${params.length})`);
      }

      if (filterStatus && filterStatus !== 'all') {
        if (filterStatus === 'successful' || filterStatus === 'completed' || filterStatus === 'finished') {
          whereClauses.push(`(UPPER(COALESCE(o.status, t.status, '')) IN ('FINISHED', 'COMPLETED', 'SUCCESS', '6', '10'))`);
        } else if (filterStatus === 'banned') {
          whereClauses.push(`(UPPER(COALESCE(o.status, '')) IN ('BANNED', '8'))`);
        } else if (filterStatus === 'cancelled' || filterStatus === 'canceled' || filterStatus === 'expired') {
          whereClauses.push(`(UPPER(COALESCE(o.status, t.status, '')) IN ('CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2'))`);
        } else if (filterStatus === 'pending' || filterStatus === 'received' || filterStatus === 'active') {
          whereClauses.push(`(UPPER(COALESCE(o.status, t.status, '')) IN ('RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3'))`);
        } else {
          params.push(filterStatus.toUpperCase());
          whereClauses.push(`(UPPER(COALESCE(o.status, t.status, '')) = $${params.length})`);
        }
      }

      if (search) {
        params.push(`%${search}%`);
        whereClauses.push(`(
          LOWER(COALESCE(u.username, '')) LIKE $${params.length} OR
          LOWER(COALESCE(u.email, t.user_email, '')) LIKE $${params.length} OR
          LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE $${params.length} OR
          LOWER(COALESCE(o.order_id, '')) LIKE $${params.length} OR
          LOWER(COALESCE(t.reference, '')) LIKE $${params.length} OR
          LOWER(COALESCE(o.phone, '')) LIKE $${params.length} OR
          LOWER(COALESCE(o.service, t.reason, '')) LIKE $${params.length} OR
          LOWER(COALESCE(o.country, t.reason, '')) LIKE $${params.length}
        )`);
      }

      const countSql = `
        SELECT COUNT(DISTINCT t.id)::int AS total
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN orders o ON (o.order_id = SUBSTRING(t.reference FROM 5) OR o.order_id = t.reference OR o.order_id = SUBSTRING(t.reference FROM 10))
        WHERE ${whereClauses.join(' AND ')}
      `;
      const countRes = await pool.query(countSql, params);
      totalCount = countRes.rows[0]?.total || 0;

      const offset = (page - 1) * limit;
      const dataSql = `
        SELECT 
          t.id AS tx_id,
          t.reference,
          t.user_id,
          t.user_email,
          t.amount,
          t.status AS tx_status,
          t.reason,
          t.created_at AS tx_created_at,
          u.username,
          u.first_name,
          u.last_name,
          u.email AS u_email,
          o.order_id,
          o.phone,
          o.country,
          o.service,
          o.operator,
          o.status AS order_status,
          o.sms_code,
          o.provider_data,
          o.created_at AS order_created_at
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN orders o ON (o.order_id = SUBSTRING(t.reference FROM 5) OR o.order_id = t.reference OR o.order_id = SUBSTRING(t.reference FROM 10))
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY t.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const rows = (await pool.query(dataSql, [...params, limit, offset])).rows;
      reconstructedList = await Promise.all(rows.map(r => reconstructAndEnrichOrder(r, fivesim)));
    } else {
      let txs = (db.inMemory.transactions || []).filter(t => 
        t.type === 'debit' || t.type === 'purchase' || String(t.reference).startsWith('BUY-') || String(t.reference).startsWith('5SIM-')
      );

      // Join with in-memory orders & users
      let combinedRows = txs.map(t => {
        const refStr = String(t.reference || '');
        const extractedOrderId = refStr.replace(/^(5SIM-ACT-|BUY-)/, '');
        const memOrder = (db.inMemory.orders || []).find(o =>
          String(o.order_id) === extractedOrderId ||
          String(o.order_id) === refStr ||
          (extractedOrderId && refStr.includes(String(o.order_id)))
        );
        const u = (db.inMemory.users || []).find(x => String(x.id || x._id) === String(t.user_id || memOrder?.user_id));
        return {
          tx_id: t.id,
          reference: t.reference,
          user_id: t.user_id || memOrder?.user_id,
          user_email: t.user_email || memOrder?.user_email,
          amount: t.amount ?? memOrder?.amount,
          tx_status: t.status,
          reason: t.reason,
          tx_created_at: t.created_at,
          username: u?.username,
          first_name: u?.first_name || u?.firstName,
          last_name: u?.last_name || u?.lastName,
          u_email: u?.email,
          order_id: memOrder?.order_id || extractedOrderId,
          phone: memOrder?.phone,
          country: memOrder?.country,
          service: memOrder?.service,
          operator: memOrder?.operator,
          order_status: memOrder?.status,
          sms_code: memOrder?.sms_code,
          provider_data: memOrder?.provider_data,
          order_created_at: memOrder?.created_at
        };
      });

      // Also include any inMemory.orders that didn't have a matching transaction entry
      for (const o of (db.inMemory.orders || [])) {
        const alreadyIncluded = combinedRows.some(r => String(r.order_id) === String(o.order_id));
        if (!alreadyIncluded) {
          const u = (db.inMemory.users || []).find(x => String(x.id || x._id) === String(o.user_id));
          combinedRows.push({
            tx_id: `tx_${o.id || o.order_id}`,
            reference: `BUY-${o.order_id}`,
            user_id: o.user_id,
            user_email: o.user_email,
            amount: o.amount,
            tx_status: o.status,
            reason: `Virtual number for ${o.service || 'whatsapp'} (${o.country || 'canada'})`,
            tx_created_at: o.created_at,
            username: u?.username,
            first_name: u?.first_name || u?.firstName,
            last_name: u?.last_name || u?.lastName,
            u_email: u?.email,
            order_id: o.order_id,
            phone: o.phone,
            country: o.country,
            service: o.service,
            operator: o.operator,
            order_status: o.status,
            sms_code: o.sms_code,
            provider_data: o.provider_data,
            order_created_at: o.created_at
          });
        }
      }

      combinedRows.sort((a, b) => new Date(b.tx_created_at || b.order_created_at || 0) - new Date(a.tx_created_at || a.order_created_at || 0));

      let allReconstructed = await Promise.all(combinedRows.map(r => reconstructAndEnrichOrder(r, fivesim)));

      if (filterUser) {
        allReconstructed = allReconstructed.filter(item =>
          (item.customer && (String(item.customer.id) === filterUser || String(item.customer.email).toLowerCase() === filterUser.toLowerCase()))
        );
      }
      if (filterCountry) {
        allReconstructed = allReconstructed.filter(item => String(item.country || '').toLowerCase().includes(filterCountry));
      }
      if (filterProduct) {
        allReconstructed = allReconstructed.filter(item => String(item.service || '').toLowerCase().includes(filterProduct));
      }
      if (filterOperator) {
        allReconstructed = allReconstructed.filter(item => String(item.operator || '').toLowerCase().includes(filterOperator));
      }
      if (filterStatus && filterStatus !== 'all') {
        allReconstructed = allReconstructed.filter(item => {
          const st = String(item.status || '').toUpperCase();
          if (filterStatus === 'successful' || filterStatus === 'completed' || filterStatus === 'finished') {
            return ['FINISHED', 'COMPLETED', 'SUCCESS', '6', '10'].includes(st);
          }
          if (filterStatus === 'banned') {
            return ['BANNED', '8'].includes(st);
          }
          if (filterStatus === 'cancelled' || filterStatus === 'canceled' || filterStatus === 'expired') {
            return ['CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2'].includes(st);
          }
          if (filterStatus === 'pending' || filterStatus === 'received' || filterStatus === 'active') {
            return ['RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3'].includes(st);
          }
          return st.toLowerCase() === filterStatus;
        });
      }
      if (search) {
        allReconstructed = allReconstructed.filter(item => {
          const n = (item.customer?.name || '').toLowerCase();
          const u = (item.customer?.username || '').toLowerCase();
          const e = (item.customer?.email || '').toLowerCase();
          const oid = String(item.orderId || '').toLowerCase();
          const ref = String(item.reference || '').toLowerCase();
          const ph = String(item.phone || '').toLowerCase();
          const svc = String(item.service || '').toLowerCase();
          const cnt = String(item.country || '').toLowerCase();
          return n.includes(search) || u.includes(search) || e.includes(search) || oid.includes(search) || ref.includes(search) || ph.includes(search) || svc.includes(search) || cnt.includes(search);
        });
      }

      totalCount = allReconstructed.length;
      reconstructedList = allReconstructed.slice((page - 1) * limit, page * limit);
    }

    const totalPages = Math.ceil(totalCount / limit) || 1;
    return res.status(200).json({
      data: reconstructedList,
      orders: reconstructedList,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (err) {
    console.error('Admin fivesim orders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve 5sim orders' });
  }
});

// GET /api/admin/fivesim/orders/:orderId (PDF Page 7)
router.get('/fivesim/orders/:orderId', adminAuth, async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  if (!orderId || orderId === 'undefined' || orderId === 'null' || orderId === '—') {
    return res.status(400).json({ success: false, error: 'Valid 5sim order ID is required.' });
  }

  try {
    const pool = db.getPool();
    let row = null;

    if (pool) {
      const q = `
        SELECT 
          t.id AS tx_id,
          t.reference,
          t.user_id,
          t.user_email,
          t.amount,
          t.status AS tx_status,
          t.reason,
          t.created_at AS tx_created_at,
          u.username,
          u.first_name,
          u.last_name,
          u.email AS u_email,
          o.order_id,
          o.phone,
          o.country,
          o.service,
          o.operator,
          o.status AS order_status,
          o.sms_code,
          o.provider_data,
          o.created_at AS order_created_at
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN orders o ON (o.order_id = SUBSTRING(t.reference FROM 5) OR o.order_id = t.reference OR o.order_id = SUBSTRING(t.reference FROM 10))
        WHERE (o.order_id = $1 OR t.reference = $2 OR t.reference = $3 OR t.reference = $1 OR t.reference LIKE $4)
        LIMIT 1
      `;
      const resQuery = await pool.query(q, [orderId, `BUY-${orderId}`, `5SIM-ACT-${orderId}`, `%${orderId}%`]);
      if (resQuery.rows.length) {
        row = resQuery.rows[0];
      } else {
        // Also check orders table directly if not in transactions
        const qOrd = `
          SELECT
            o.id AS tx_id,
            CONCAT('5SIM-ACT-', o.order_id) AS reference,
            o.user_id,
            o.user_email,
            o.amount,
            o.status AS tx_status,
            o.created_at AS tx_created_at,
            u.username,
            u.first_name,
            u.last_name,
            u.email AS u_email,
            o.order_id,
            o.phone,
            o.country,
            o.service,
            o.operator,
            o.status AS order_status,
            o.sms_code,
            o.provider_data,
            o.created_at AS order_created_at
          FROM orders o
          LEFT JOIN users u ON o.user_id = u.id
          WHERE o.order_id = $1
          LIMIT 1
        `;
        const resOrd = await pool.query(qOrd, [orderId]);
        if (resOrd.rows.length) {
          row = resOrd.rows[0];
        }
      }
    }

    if (!row) {
      const memOrder = (db.inMemory.orders || []).find(o => String(o.order_id) === orderId);
      const memTx = (db.inMemory.transactions || []).find(t => {
        const ref = String(t.reference || '');
        const metaOrderId = t.metadata?.orderId ? String(t.metadata.orderId) : '';
        return metaOrderId === orderId || ref === orderId || ref === `BUY-${orderId}` || ref === `5SIM-ACT-${orderId}` || ref.includes(orderId);
      });
      if (memOrder || memTx) {
        const u = (db.inMemory.users || []).find(x => String(x.id || x._id) === String(memOrder?.user_id || memTx?.user_id));
        row = {
          order_id: memOrder?.order_id || orderId,
          tx_id: memTx?.id || (memOrder ? `tx_${memOrder.id || orderId}` : ''),
          reference: memTx?.reference || `5SIM-ACT-${orderId}`,
          user_id: memOrder?.user_id || memTx?.user_id,
          user_email: memOrder?.user_email || memTx?.user_email,
          phone: memOrder?.phone,
          country: memOrder?.country,
          service: memOrder?.service,
          operator: memOrder?.operator,
          amount: memOrder?.amount ?? memTx?.amount,
          order_status: memOrder?.status,
          tx_status: memTx?.status,
          reason: memTx?.reason,
          sms_code: memOrder?.sms_code,
          provider_data: memOrder?.provider_data,
          created_at: memOrder?.created_at || memTx?.created_at,
          username: u?.username,
          first_name: u?.first_name || u?.firstName,
          last_name: u?.last_name || u?.lastName,
          u_email: u?.email
        };
      }
    }

    if (!row) {
      // Check if live 5sim has this order before returning 404
      if (fivesim && typeof fivesim.checkOrder === 'function' && !isNaN(Number(orderId))) {
        try {
          const live = await Promise.race([
            fivesim.checkOrder(orderId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('5sim timeout')), 1800))
          ]);
          if (live && live.id) {
            row = {
              order_id: String(live.id),
              reference: `5SIM-ACT-${live.id}`,
              phone: live.phone,
              country: live.country,
              service: live.product,
              operator: live.operator,
              amount: live.price || 0,
              order_status: live.status,
              created_at: live.created_at || new Date().toISOString(),
              expires_at: live.expires,
              provider_data: live
            };
          }
        } catch (_) {}
      }
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        error: `5SIM order #${orderId} was not found.`
      });
    }

    const orderObj = await reconstructAndEnrichOrder(row, fivesim);

    return res.status(200).json({
      success: true,
      order: orderObj,
      data: orderObj
    });

  } catch (err) {
    console.error('Admin fivesim order detail error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve 5sim order details' });
  }
});

// Backward-compatible alias for existing frontend callers
router.get('/orders', adminAuth, async (req, res) => {
  req.url = '/fivesim/orders?' + new URLSearchParams(req.query).toString();
  return router.handle(req, res);
});

router.get('/orders/stats', adminAuth, async (req, res) => {
  try {
    const stats = await db.getOrderStats();
    return res.status(200).json({
      success: true,
      stats,
      data: stats
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to calculate order statistics' });
  }
});

router.get('/orders/:id', adminAuth, async (req, res) => {
  req.url = `/fivesim/orders/${encodeURIComponent(req.params.id)}`;
  return router.handle(req, res);
});

/* ======================================================================
   VIRTUAL ACCOUNTS (Base: /api/admin/virtual-accounts)
====================================================================== */

// GET /api/admin/virtual-accounts
router.get('/virtual-accounts', adminAuth, async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  try {
    const pool = db.getPool();
    if (pool) {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM virtual_accounts`);
      const total = countRes.rows[0]?.total || 0;
      const rows = (await pool.query(
        `SELECT va.*, 
                va.account_number AS "accountNumber", 
                va.bank_name AS "bankName", 
                va.account_name AS "accountName", 
                va.created_at AS "createdAt",
                u.email, u.username, u.first_name, u.last_name 
         FROM virtual_accounts va 
         LEFT JOIN users u ON va.user_id = u.id 
         ORDER BY va.created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit]
      )).rows;
      return res.status(200).json({
        success: true,
        data: rows,
        virtualAccounts: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }
    const memList = db.inMemory.virtualAccounts || [];
    const total = memList.length;
    const paged = memList.slice((page - 1) * limit, page * limit);
    return res.status(200).json({
      success: true,
      data: paged,
      virtualAccounts: paged,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve virtual accounts' });
  }
});

// GET /api/admin/virtual-accounts/:userId
router.get('/virtual-accounts/:userId', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      const rows = (await pool.query(
        `SELECT va.*, u.email, u.username FROM virtual_accounts va LEFT JOIN users u ON va.user_id = u.id WHERE va.user_id = $1 LIMIT 1`,
        [req.params.userId]
      )).rows;
      if (rows.length) {
        return res.status(200).json({ success: true, data: rows[0], virtualAccount: rows[0] });
      }
    }
    return res.status(404).json({ success: false, error: 'Virtual account not found' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve virtual account' });
  }
});

/* ======================================================================
   ANNOUNCEMENTS (Base: /api/admin/announcements)
====================================================================== */
let inMemoryAnnouncements = [
  {
    id: 'ann_default_1',
    title: 'Important Announcement',
    subtitle: 'Tips (5)',
    category: 'tips',
    content: '💡 Delete and reinstall WhatsApp before getting a number\n💡 Avoid Business WhatsApp. They ban faster... use normal WhatsApp instead\n💡 Ensure Your Time Zone & VPN matches the country of the number\n💡 Use a fresh WhatsApp installation for better success rates\n💡 Complete verification within the allocated time frame',
    message: '💡 Delete and reinstall WhatsApp before getting a number\n💡 Avoid Business WhatsApp. They ban faster... use normal WhatsApp instead\n💡 Ensure Your Time Zone & VPN matches the country of the number\n💡 Use a fresh WhatsApp installation for better success rates\n💡 Complete verification within the allocated time frame',
    whatsappUrl: 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// GET /api/admin/announcements/active
router.get('/announcements/active', (req, res) => {
  const active = inMemoryAnnouncements.find(a => a.active);
  return res.status(200).json({
    success: true,
    data: active || null,
    announcement: active || null
  });
});

// GET /api/admin/announcements
router.get('/announcements', adminAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    data: inMemoryAnnouncements,
    announcements: inMemoryAnnouncements
  });
});

// POST /api/admin/announcements
router.post('/announcements', adminAuth, (req, res) => {
  const ann = req.body;
  if (!ann || !ann.content) {
    return res.status(400).json({ success: false, error: 'Announcement content is required' });
  }

  const newAnn = {
    id: ann.id || ('ann_' + Date.now()),
    title: ann.title || 'Important Announcement',
    subtitle: ann.subtitle || 'Notice',
    category: ann.category || 'tips',
    content: ann.content || ann.message || '',
    message: ann.message || ann.content || '',
    whatsappUrl: ann.whatsappUrl || 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq',
    active: ann.active !== false,
    createdAt: ann.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (newAnn.active) {
    inMemoryAnnouncements.forEach(a => a.active = false);
  }

  const existingIdx = inMemoryAnnouncements.findIndex(a => a.id === newAnn.id);
  if (existingIdx !== -1) {
    inMemoryAnnouncements[existingIdx] = newAnn;
  } else {
    inMemoryAnnouncements.unshift(newAnn);
  }

  return res.status(201).json({
    success: true,
    message: 'Announcement saved successfully',
    data: newAnn,
    announcement: newAnn
  });
});

/* ======================================================================
   REFERRALS MANAGEMENT (Base: /api/admin/referrals)
====================================================================== */

// GET /api/admin/referrals
router.get('/referrals', adminAuth, async (req, res) => {
  try {
    const pool = db.getPool();
    if (pool) {
      const statsQuery = `
        SELECT 
          u.id AS referrer_id,
          u.email,
          u.username,
          u.referral_code,
          u.referral_balance,
          u.created_at,
          COUNT(r.id)::int AS referred_count,
          COALESCE(SUM(r.reward_amount), 0)::numeric AS total_rewards
        FROM users u
        LEFT JOIN referrals r ON u.id = r.referrer_id
        WHERE u.referral_code IS NOT NULL
        GROUP BY u.id, u.email, u.username, u.referral_code, u.referral_balance, u.created_at
        ORDER BY referred_count DESC, u.created_at DESC
        LIMIT 100
      `;
      const rows = (await pool.query(statsQuery)).rows;

      const summaryQuery = `
        SELECT 
          COUNT(*)::int AS total_referrals,
          COALESCE(SUM(reward_amount), 0)::numeric AS total_rewards_paid
        FROM referrals
      `;
      const summary = (await pool.query(summaryQuery)).rows[0] || { total_referrals: 0, total_rewards_paid: 0 };

      return res.status(200).json({
        success: true,
        data: rows,
        referrals: rows,
        summary: {
          totalReferrals: summary.total_referrals || 0,
          totalRewards: parseFloat(summary.total_rewards_paid || 0),
          activeCodes: rows.length
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: [],
      referrals: [],
      summary: { totalReferrals: 0, totalRewards: 0, activeCodes: 0 }
    });
  } catch (err) {
    console.error('Admin referrals error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve referral records' });
  }
});

/* ======================================================================
   ADMIN PASSWORD / CREDENTIAL UPDATE (Base: /api/admin/auth/update-credentials)
====================================================================== */

// POST /api/admin/auth/update-credentials
router.post('/auth/update-credentials', adminAuth, async (req, res) => {
  const { currentPassword, newPassword, username } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
  }

  try {
    const user = await db.findUserById(req.admin.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Administrator user not found.' });
    }

    const passwordHash = user.password || user.password_hash;
    const isMatch = await bcrypt.compare(currentPassword, passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password does not match.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const pool = db.getPool();
    if (pool) {
      const updates = ['password_hash = $1', 'updated_at = NOW()'];
      const params = [newHash];
      if (username) {
        params.push(username);
        updates.push(`username = $${params.length}`);
      }
      params.push(req.admin.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }

    return res.status(200).json({
      success: true,
      message: 'Administrator credentials updated successfully.'
    });
  } catch (err) {
    console.error('Update credentials error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update credentials.' });
  }
});

module.exports = router;


