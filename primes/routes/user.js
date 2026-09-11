const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'primes_secret_key_123';

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user; // { id, username, role }
    next();
  });
};

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, email, username, name, phone, balance, role, referralCode, createdAt FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Fetch latest orders to act as transactions
    const orders = await dbAll('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC LIMIT 10', [req.user.id]);
    user.transactions = orders.map(o => ({
      id: o.orderId,
      type: 'Purchase',
      amount: -o.amountUSD,
      description: `Bought ${o.service} number — ${o.country}`,
      timestamp: o.createdAt
    }));

    res.json({ success: true, user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    await dbRun('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, email, phone, req.user.id]);
    await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'update', 'Profile updated.')", [req.user.id]);

    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.post('/recharge', authenticateToken, async (req, res) => {
  try {
    const { amount, reference } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount.' });
    if (!reference) return res.status(400).json({ error: 'Reference is required.' });

    // Note: In production, verify the transaction with Paystack using the reference.
    await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, req.user.id]);
    await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'recharge', ?)", [req.user.id, `Deposited $${amount} via Paystack. Ref: ${reference}`]);
    await dbRun("INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, 'wallet_deposit')", [req.user.id, 'Wallet Funded', `Successfully deposited $${amount} to your wallet.`]);

    res.json({ success: true, message: 'Recharge successful.' });
  } catch (error) {
    console.error('Recharge error:', error);
    res.status(500).json({ error: 'Failed to process recharge.' });
  }
});

router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await dbAll('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC', [req.user.id]);
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const activity = await dbAll('SELECT * FROM activity WHERE userId = ? ORDER BY createdAt DESC LIMIT 50', [req.user.id]);
    res.json({ success: true, activity });
  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
});

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await dbAll('SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50', [req.user.id]);
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

router.post('/notifications/mark-read', authenticateToken, async (req, res) => {
  try {
    await dbRun('UPDATE notifications SET read = TRUE WHERE userId = ? AND read = FALSE', [req.user.id]);
    res.json({ success: true, message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
});

module.exports = { router, authenticateToken };
