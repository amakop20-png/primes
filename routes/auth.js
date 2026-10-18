// routes/auth.js - Customer authentication router
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
const { JWT_SECRET, authenticate } = require('../middleware/adminAuth');
const db = require('../db');

// POST /api/auth/signup or /api/signup
router.post('/signup', async (req, res) => {
  const { username, email, password, firstName, lastName, phoneNumber, phone, referral_code, referralCode, ref } = req.body;
  const userPhone = phoneNumber || phone;
  const inputRefCode = String(referral_code || referralCode || ref || '').trim();

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

    const existingUsername = await db.findUserByEmailOrUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Validate referral code if provided
    let referrer = null;
    let referredBy = null;
    if (inputRefCode) {
      referrer = await db.findUserByReferralCode(inputRefCode);
      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code entered. Please verify the code or leave the field blank.'
        });
      }

      // Prevent self-referral
      if (
        (referrer.email && referrer.email.toLowerCase() === email.toLowerCase()) ||
        (referrer.username && referrer.username.toLowerCase() === username.toLowerCase()) ||
        (referrer.phone && userPhone && referrer.phone === userPhone)
      ) {
        return res.status(400).json({
          success: false,
          message: 'You cannot use your own referral code.'
        });
      }

      referredBy = referrer.id || referrer._id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUserRefCode = await db.generateUniqueReferralCode(username);
    const pool = db.getPool();

    let newUser = null;

    if (pool) {
      const result = await pool.query(`
        INSERT INTO users (email, username, first_name, last_name, phone, password_hash, role, balance, referral_code, referred_by, referral_balance)
        VALUES ($1, $2, $3, $4, $5, $6, 'user', 0, $7, $8, 0)
        RETURNING id, email, username, first_name, last_name, phone, role, balance, referral_code, referred_by, referral_balance, created_at
      `, [email.toLowerCase(), username, firstName, lastName, userPhone || null, passwordHash, newUserRefCode, referredBy || null]);

      newUser = result.rows[0];
    } else {
      // In-memory fallback
      const inMemoryId = db.inMemory.users.length + 1;
      newUser = {
        id: inMemoryId,
        _id: String(inMemoryId),
        email: email.toLowerCase(),
        username,
        first_name: firstName,
        last_name: lastName,
        phone: userPhone || null,
        password_hash: passwordHash,
        role: 'user',
        balance: 0,
        referral_code: newUserRefCode,
        referred_by: referredBy || null,
        referral_balance: 0,
        created_at: new Date().toISOString()
      };
      db.inMemory.users.push(newUser);
    }

    // Record the referral relationship if a referrer was found
    if (referredBy && newUser) {
      const signupReward = parseFloat(process.env.REFERRAL_SIGNUP_REWARD || 0);
      await db.recordReferral({
        referrerId: referredBy,
        referredUserId: newUser.id,
        referralCode: inputRefCode,
        rewardAmount: signupReward,
        status: 'completed'
      });

      // Notify the referrer of the new referee
      await db.createNotification({
        userId: String(referrer.id || referrer._id),
        userEmail: referrer.email,
        title: 'New Referral Joined! 🎁',
        message: `${username} just registered with your referral code (${inputRefCode}). You will earn a 10% instant bonus when they recharge!`,
        type: 'referral'
      });
    }

    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

    const safeUser = {
      _id: String(newUser.id),
      id: String(newUser.id),
      username: newUser.username,
      email: newUser.email,
      firstName: newUser.first_name || firstName,
      lastName: newUser.last_name || lastName,
      phoneNumber: newUser.phone || userPhone,
      role: newUser.role || 'user',
      balance: parseFloat(newUser.balance || 0),
      referralCode: newUser.referral_code || newUserRefCode,
      referral_code: newUser.referral_code || newUserRefCode,
      referralBalance: parseFloat(newUser.referral_balance || 0),
      createdAt: newUser.created_at
    };

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      userId: newUser.id,
      user: safeUser,
      accessToken: token,
      token
    });
  } catch (err) {
    console.error('Customer signup error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
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

    // Ensure persistent referral code exists for older accounts
    const refCode = await db.ensureUserReferralCode(user.id || user._id, user.username);

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
      referralCode: refCode,
      referral_code: refCode,
      referralBalance: parseFloat(user.referral_balance || user.referralBalance || 0),
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

// GET /api/auth/me or /api/me
router.get('/me', authenticate, async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const refCode = await db.ensureUserReferralCode(userId, user.username);
    const safeUser = {
      _id: String(user.id || user._id),
      id: String(user.id || user._id),
      username: user.username,
      email: user.email,
      firstName: user.first_name || user.firstName,
      lastName: user.last_name || user.lastName,
      phoneNumber: user.phone || user.phoneNumber,
      role: user.role || 'user',
      balance: parseFloat(user.balance || 0),
      referralCode: refCode,
      referral_code: refCode,
      referralBalance: parseFloat(user.referral_balance || 0),
      createdAt: user.created_at
    };

    return res.status(200).json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Customer /me error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
