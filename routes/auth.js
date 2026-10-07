// routes/auth.js - Customer authentication router
const express = require('express');
const router = express.Router();
let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_) { bcrypt = require('bcryptjs'); }
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/adminAuth');
const db = require('../db');

// POST /api/auth/signup or /api/signup
router.post('/signup', async (req, res) => {
  const { username, email, password, firstName, lastName, phoneNumber, phone } = req.body;
  const userPhone = phoneNumber || phone;

  if (!username || !email || !password || !firstName || !lastName) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  try {
    const existing = await db.findUserByEmailOrUsername(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email or username already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pool = db.getPool();

    if (pool) {
      const result = await pool.query(`
        INSERT INTO users (email, username, first_name, last_name, phone, password_hash, role, balance)
        VALUES ($1, $2, $3, $4, $5, $6, 'user', 0)
        RETURNING id, email, username, first_name, last_name, phone, role, balance, created_at
      `, [email.toLowerCase(), username, firstName, lastName, userPhone || null, passwordHash]);

      const newUser = result.rows[0];
      const token = jwt.sign({ id: newUser.id, email: newUser.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        userId: newUser.id,
        user: newUser,
        accessToken: token,
        token
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful'
    });
  } catch (err) {
    console.error('Customer signup error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/login or /api/login
router.post('/login', async (req, res) => {
  const { identifier, email, username, password } = req.body;
  const loginId = identifier || email || username;

  if (!loginId || !password) {
    return res.status(400).json({
      success: false,
      message: 'Identifier and password are required'
    });
  }

  try {
    const user = await db.findUserByEmailOrUsername(loginId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const passwordHash = user.password || user.password_hash;
    const isMatch = await bcrypt.compare(password, passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const userId = String(user.id || user._id);
    const token = jwt.sign({ id: userId, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });

    const safeUser = {
      _id: userId,
      id: userId,
      username: user.username,
      email: user.email,
      firstName: user.firstName || user.first_name,
      lastName: user.lastName || user.last_name,
      phoneNumber: user.phoneNumber || user.phone,
      role: user.role || 'user',
      balance: parseFloat(user.balance || 0),
      createdAt: user.createdAt || user.created_at
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: safeUser,
      accessToken: token,
      token
    });
  } catch (err) {
    console.error('Customer login error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
