const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getDatabase } = require('@netlify/database');

const JWT_SECRET = process.env.primes_secret_key_123 || 'dev_secret_change_in_prod';

function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// GET /api/admin/stats
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const [{ count: userCount }] = await db.sql`SELECT COUNT(*)::int AS count FROM users`;
    const [{ count: orderCount }] = await db.sql`SELECT COUNT(*)::int AS count FROM orders`;
    const [{ total }] = await db.sql`SELECT COALESCE(SUM(balance), 0) AS total FROM users`;
    res.json({ success: true, stats: { users: userCount, orders: orderCount, totalBalance: total } });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const users = await db.sql`
      SELECT id, name, username, email, phone, role, balance, numbers_purchased, total_recharge, created_at
      FROM users ORDER BY created_at DESC LIMIT 100
    `;
    res.json({ success: true, users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/orders
router.get('/orders', adminMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const orders = await db.sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`;
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
