const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { dbGet, dbRun } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'primes_secret_key_123';

// Helper to validate email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Helper to validate phone format
const isValidPhone = (phone) => /^\+?[\d\s-]{10,}$/.test(phone);

router.post('/signup', async (req, res) => {
  try {
    const { email, phone, name, username, password, acceptTerms } = req.body;

    if (!acceptTerms) return res.status(400).json({ error: 'You must accept the terms and conditions.' });
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email.' });
    if (!phone || !isValidPhone(phone)) return res.status(400).json({ error: 'Please provide a valid phone number.' });
    if (!username || username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Name is required.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    // Check existing
    const existingEmail = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) return res.status(400).json({ error: 'Email is already registered.' });

    const existingUsername = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsername) return res.status(400).json({ error: 'Username is already taken.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = 'REF-' + username.toUpperCase();

    // Insert user
    const result = await dbRun(
      'INSERT INTO users (email, username, name, phone, password, referralCode) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [email, username, name, phone, hashedPassword, referralCode]
    );

    // Log activity
    await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'signup', 'Account created successfully.')", [result.lastID]);

    const token = jwt.sign({ id: result.lastID, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

    const userData = {
      id: result.lastID,
      email,
      username,
      name,
      phone,
      balance: 0,
      role: 'user'
    };

    res.setHeader('Content-Type', 'application/json');
    return res.json({
      success: true,
      message: 'Registration successful!',
      token,
      user: userData
    });

  } catch (err) {
    console.error('Signup error:', err);
    console.error('Signup error:', err.message);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: `An error occurred during registration: ${err.message}`, success: false });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) return res.status(400).json({ error: 'Please provide email/username and password.' });

    const user = await dbGet('SELECT * FROM users WHERE email = ? OR username = ?', [identifier, identifier]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });

    // Log activity
    await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'login', 'Successful login.')", [user.id]);

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        phone: user.phone,
        balance: user.balance,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

// --- FORGOT PASSWORD FLOW ---
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email.' });

    const user = await dbGet('SELECT id, name FROM users WHERE email = ?', [email]);
    if (!user) {
      // Return success even if email doesn't exist to prevent email enumeration attacks
      return res.json({ success: true, message: 'If that email exists in our system, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await dbRun(
      'INSERT INTO password_resets (email, token, expiresAt) VALUES (?, ?, ?)',
      [email, token, expiresAt]
    );

    const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;
    
    // MOCK EMAIL LOG
    console.log('\n=============================================');
    console.log(`MOCK EMAIL SENT TO: ${email}`);
    console.log(`Hello ${user.name}, you requested a password reset.`);
    console.log(`Click here to reset it: ${resetLink}`);
    console.log('=============================================\n');

    res.json({ success: true, message: 'If that email exists in our system, a reset link has been sent. (Check the server console!)' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'An error occurred processing your request.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token) return res.status(400).json({ error: 'Invalid or missing token.' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const resetRecord = await dbGet('SELECT email, expiresAt FROM password_resets WHERE token = ?', [token]);
    
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    if (new Date(resetRecord.expiresAt) < new Date()) {
      await dbRun('DELETE FROM password_resets WHERE token = ?', [token]);
      return res.status(400).json({ error: 'This reset token has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await dbRun('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, resetRecord.email]);
    await dbRun('DELETE FROM password_resets WHERE email = ?', [resetRecord.email]);

    res.json({ success: true, message: 'Password has been successfully reset! You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'An error occurred resetting your password.' });
  }
});

module.exports = router;
