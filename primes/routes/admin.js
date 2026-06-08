const express = require('express');
const router = express.Router();
const { dbGet, dbRun, dbAll } = require('../database');
const { authenticateToken } = require('./user');

// Admin Auth Middleware
const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
};

router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const users = await dbAll('SELECT id, email, username, name, phone, balance, role, createdAt FROM users');
    const orders = await dbAll(`
      SELECT o.*, u.username as userName 
      FROM orders o 
      LEFT JOIN users u ON o.userId = u.id 
      ORDER BY o.createdAt DESC
    `);
    const activity = await dbAll(`
      SELECT a.*, u.username 
      FROM activity a 
      LEFT JOIN users u ON a.userId = u.id 
      ORDER BY a.createdAt DESC LIMIT 100
    `);

    // Fetch config
    const configs = await dbAll('SELECT * FROM config');
    const configMap = {};
    configs.forEach(c => configMap[c.key] = c.value);

    res.json({
      success: true,
      users,
      orders,
      activity,
      config: configMap
    });
  } catch (error) {
    console.error('Admin DB error:', error);
    res.status(500).json({ error: 'Failed to load admin data.' });
  }
});

router.post('/fund', authenticateAdmin, async (req, res) => {
  try {
    const { username, amountUSD } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await dbRun('UPDATE users SET balance = balance + ?, totalRecharge = totalRecharge + ? WHERE id = ?', [amountUSD, amountUSD, user.id]);
    await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'recharge', ?)", [user.id, `Admin funded account with $${amountUSD}`]);

    res.json({ success: true, message: `Successfully funded $${amountUSD} to ${username}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fund user.' });
  }
});

router.post('/config', authenticateAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    await dbRun('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
    res.json({ success: true, message: 'Config updated.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config.' });
  }
});

router.delete('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    // Optionally delete orders/activity or cascade
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;
