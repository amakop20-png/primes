const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getDatabase } = require('@netlify/database');

const JWT_SECRET = process.env.primes_secret_key_123 || 'dev_secret_change_in_prod';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// GET /api/orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const orders = await db.sql`
      SELECT * FROM orders WHERE user_id = ${req.user.id} ORDER BY created_at DESC LIMIT 50
    `;
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/orders
router.post('/', authMiddleware, async (req, res) => {
  const { number, country, service, operator, price, fivesimOrderId, expiresAt } = req.body;

  try {
    const db = getDatabase();
    const [order] = await db.sql`
      INSERT INTO orders (user_id, number, country, service, operator, price, status, fivesim_order_id, expires_at)
      VALUES (${req.user.id}, ${number}, ${country}, ${service}, ${operator}, ${price}, 'waiting', ${fivesimOrderId || null}, ${expiresAt || null})
      RETURNING *
    `;
    res.json({ success: true, order });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
