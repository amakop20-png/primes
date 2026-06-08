const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDatabase } = require('@netlify/database');

const JWT_SECRET = process.env.primes_secret_key_123 || 'dev_secret_change_in_prod';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { name, username, email, phone, password } = req.body;
  if (!name || !username || !email || !password) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const db = getDatabase();
    const existing = await db.sql`SELECT id FROM users WHERE email = ${email} OR username = ${username} LIMIT 1`;
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email or username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.sql`
      INSERT INTO users (name, username, email, phone, password_hash, role, balance)
      VALUES (${name}, ${username}, ${email}, ${phone || null}, ${passwordHash}, 'user', 0)
      RETURNING id, name, username, email, phone, role, balance, created_at
    `;

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }

  try {
    const db = getDatabase();
    const [user] = await db.sql`
      SELECT * FROM users WHERE email = ${identifier} OR username = ${identifier} LIMIT 1
    `;

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const db = getDatabase();
    const [user] = await db.sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await db.sql`
        INSERT INTO password_resets (user_id, token, expires_at)
        VALUES (${user.id}, ${token}, ${expiresAt})
        ON CONFLICT (user_id) DO UPDATE SET token = ${token}, expires_at = ${expiresAt}
      `;
    }

    res.json({ success: true, message: 'If that email exists, a reset link was sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'Token and password are required' });
  }

  try {
    const db = getDatabase();
    const [reset] = await db.sql`
      SELECT * FROM password_resets WHERE token = ${token} AND expires_at > NOW() LIMIT 1
    `;

    if (!reset) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${reset.user_id}`;
    await db.sql`DELETE FROM password_resets WHERE token = ${token}`;

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
