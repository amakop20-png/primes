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

// GET /api/user/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const [user] = await db.sql`
      SELECT id, name, username, email, phone, role, balance, numbers_purchased, total_recharge, created_at
      FROM users WHERE id = ${req.user.id} LIMIT 1
    `;
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/user/recharge
router.post('/recharge', authMiddleware, async (req, res) => {
  const { amount, reference } = req.body;
  if (!amount || !reference) {
    return res.status(400).json({ success: false, error: 'amount and reference are required' });
  }

  try {
    const db = getDatabase();

    const [existing] = await db.sql`SELECT id FROM transactions WHERE reference = ${reference} LIMIT 1`;
    if (existing) {
      return res.status(400).json({ success: false, error: 'Transaction already processed' });
    }

    await db.sql`
      UPDATE users
      SET balance = balance + ${amount},
          total_recharge = COALESCE(total_recharge, 0) + ${amount}
      WHERE id = ${req.user.id}
    `;

    await db.sql`
      INSERT INTO transactions (user_id, type, amount, description, reference)
      VALUES (${req.user.id}, 'Recharge', ${amount}, 'Wallet recharge via Paystack', ${reference})
    `;

    res.json({ success: true, message: 'Balance updated' });
  } catch (err) {
    console.error('Recharge error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = { router };
