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

  const { email, password, username, firstName, lastName } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required to initialize administrator.'
    });
  }

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
        VALUES ($1, $2, $3, $4, $5, 'admin')
        RETURNING id, email, username, role, created_at
      `, [email.toLowerCase(), username || email.split('@')[0], firstName || 'Admin', lastName || 'User', passwordHash]);

      return res.status(201).json({
        success: true,
        message: 'Administrator account created successfully.',
        admin: result.rows[0]
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Administrator registered.'
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
    let stats = {
      users: { total: 0, newToday: 0, suspended: 0 },
      wallets: { totalBalance: 0, totalWallets: 0, frozen: 0 },
      transactions: { total: 0, success: 0, totalAmount: 0 },
      virtualAccounts: { total: 0, active: 0 },
      recentUsers: [],
      recentTransactions: []
    };

    if (pool) {
      const [{ count: userCount }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM users`)).rows;
      const [{ count: newToday }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`)).rows;
      const [{ sum: totalBal }] = (await pool.query(`SELECT COALESCE(SUM(balance), 0)::numeric AS sum FROM users`)).rows;
      const [{ count: txCount }] = (await pool.query(`SELECT COUNT(*)::int AS count FROM transactions`)).rows;

      const recentUsers = (await pool.query(`SELECT id, email, username, role, balance, created_at FROM users ORDER BY created_at DESC LIMIT 5`)).rows;
      const recentTx = (await pool.query(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5`)).rows;

      stats.users.total = userCount || 0;
      stats.users.newToday = newToday || 0;
      stats.wallets.totalBalance = parseFloat(totalBal || 0);
      stats.transactions.total = txCount || 0;
      stats.recentUsers = recentUsers;
      stats.recentTransactions = recentTx;
    }

    return res.status(200).json({
      success: true,
      data: stats
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
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const search = req.query.search ? String(req.query.search).trim() : null;
  const isSuspended = req.query.isSuspended !== undefined ? req.query.isSuspended === 'true' : null;

  try {
    const pool = db.getPool();
    if (pool) {
      let query = `SELECT id, email, username, first_name, last_name, phone, balance, role, is_suspended, created_at FROM users WHERE 1=1`;
      const params = [];

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (LOWER(email) LIKE $${params.length} OR LOWER(username) LIKE $${params.length} OR LOWER(first_name) LIKE $${params.length} OR LOWER(last_name) LIKE $${params.length})`;
      }

      if (isSuspended !== null) {
        params.push(isSuspended);
        query += ` AND is_suspended = $${params.length}`;
      }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) AS filtered`, params);
      const total = countRes.rows[0]?.total || 0;

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, (page - 1) * limit);

      const rows = (await pool.query(query, params)).rows;

      return res.status(200).json({
        success: true,
        data: rows,
        users: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }

    return res.status(200).json({ success: true, data: [], users: [], pagination: { page, limit, total: 0 } });
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
    }

    const userData = {
      ...user,
      wallet: {
        balance: parseFloat(user.balance || 0),
        isFrozen: Boolean(user.is_suspended)
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
  const isFrozen = req.query.isFrozen !== undefined ? (req.query.isFrozen === 'true' || req.query.isFrozen === true) : null;

  try {
    const pool = db.getPool();
    if (pool) {
      let query = `SELECT id AS user_id, email, username, balance, is_suspended AS is_frozen FROM users WHERE 1=1`;
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
    return res.status(200).json({ success: true, data: [], wallets: [], pagination: { page, limit, total: 0 } });
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
    const pool = db.getPool();
    if (pool) {
      const userRes = await pool.query(`UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING id, email, balance`, [amount, req.params.userId]);
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ success: false, error: 'User wallet not found' });

      await pool.query(`
        INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
        VALUES ($1, $2, $3, $4, 'credit', 'success', $5)
      `, ['ADM-CR-' + Date.now().toString(36).toUpperCase(), user.id, user.email, amount, reason]);

      return res.status(200).json({ success: true, message: `Successfully credited ₦${amount.toLocaleString()}`, data: user });
    }
    return res.status(200).json({ success: true, message: 'Wallet credited' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to credit wallet' });
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
    const pool = db.getPool();
    if (pool) {
      const userRes = await pool.query(`UPDATE users SET balance = GREATEST(0, balance - $1) WHERE id = $2 RETURNING id, email, balance`, [amount, req.params.userId]);
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ success: false, error: 'User wallet not found' });

      await pool.query(`
        INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
        VALUES ($1, $2, $3, $4, 'debit', 'success', $5)
      `, ['ADM-DR-' + Date.now().toString(36).toUpperCase(), user.id, user.email, amount, reason]);

      return res.status(200).json({ success: true, message: `Successfully debited ₦${amount.toLocaleString()}`, data: user });
    }
    return res.status(200).json({ success: true, message: 'Wallet debited' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to debit wallet' });
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
   VIRTUAL ACCOUNTS (Base: /api/admin/virtual-accounts)
====================================================================== */

// GET /api/admin/virtual-accounts
router.get('/virtual-accounts', adminAuth, async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  try {
    const pool = db.getPool();
    if (pool) {
      const rows = (await pool.query(
        `SELECT va.*, u.email, u.username FROM virtual_accounts va LEFT JOIN users u ON va.user_id = u.id ORDER BY va.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit]
      )).rows;
      return res.status(200).json({ success: true, data: rows, virtualAccounts: rows });
    }
    return res.status(200).json({ success: true, data: [], virtualAccounts: [] });
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

module.exports = router;


