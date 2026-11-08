// db.js - Database connection and user repository abstraction
try { require('dotenv').config(); } catch (_) {}
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

let mongoose = null;
let pool = null;
let dbType = 'none';

// Attempt MongoDB initialization if URI is available
const mongoUri = process.env.MONGODB_URI || 
                 process.env.MONGO_URI || 
                 process.env.MONGO_URL || 
                 process.env.MONGODB_URL || 
                 (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('mongodb') ? process.env.DATABASE_URL : null);

if (mongoUri) {
  try {
    mongoose = require('mongoose');
    mongoose.connect(mongoUri)
      .then(() => {
        console.log('✅ Connected to MongoDB database.');
        dbType = 'mongo';
      })
      .catch(err => {
        console.error('⚠️ MongoDB connection error:', err.message);
      });
  } catch (err) {
    console.warn('⚠️ mongoose module not available:', err.message);
  }
}

// Attempt PostgreSQL initialization if DATABASE_URL is available
const pgUri = (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('mongodb')) ? process.env.DATABASE_URL : (process.env.POSTGRES_URL || process.env.PG_URI);
if (!mongoUri && pgUri) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: pgUri,
      ssl: pgUri.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    pool.connect((err, client, release) => {
      if (err) {
        console.error('⚠️ PostgreSQL connection error:', err.message);
      } else {
        console.log('✅ Connected to PostgreSQL database.');
        dbType = 'pg';
        initPgTables();
        release();
      }
    });
  } catch (err) {
    console.warn('⚠️ pg module not available:', err.message);
  }
}

// PostgreSQL table initialization
async function initPgTables() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        balance NUMERIC DEFAULT 0,
        role TEXT DEFAULT 'user',
        referral_code TEXT UNIQUE,
        referred_by INTEGER REFERENCES users(id),
        referral_balance NUMERIC DEFAULT 0,
        is_suspended BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_balance NUMERIC DEFAULT 0;

      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER NOT NULL REFERENCES users(id),
        referred_user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
        referral_code TEXT NOT NULL,
        status TEXT DEFAULT 'completed',
        reward_amount NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        email TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        reference TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        user_email TEXT,
        amount NUMERIC NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS virtual_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        account_number TEXT,
        bank_name TEXT,
        account_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        notification_id TEXT UNIQUE,
        user_id TEXT NOT NULL,
        user_email TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'system',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id TEXT UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        user_email TEXT,
        phone TEXT,
        country TEXT NOT NULL,
        service TEXT NOT NULL,
        operator TEXT DEFAULT 'any',
        amount NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        sms_code TEXT,
        provider TEXT DEFAULT '5sim',
        provider_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    `);
  } catch (err) {
    console.error('Error creating PostgreSQL tables:', err.message);
  }
}

// In-memory data store (fallback when no external database is connected)
const inMemory = {
  users: [],
  referrals: [],
  transactions: [],
  login_logs: [],
  virtual_accounts: [],
  notifications: [],
  orders: []
};

// Masking helpers for privacy
function maskUsername(u) {
  if (!u) return 'user';
  if (u.length <= 3) return u[0] + '**';
  return u.slice(0, 2) + '***' + u.slice(-1);
}

function maskEmail(e) {
  if (!e || !e.includes('@')) return '***@***';
  const parts = e.split('@');
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? name[0] + '*' : name.slice(0, 2) + '***';
  return `${maskedName}@${domain}`;
}

// User repository functions
async function findUserByEmailOrUsername(identifier) {
  const cleanId = String(identifier || '').trim().toLowerCase();
  
  if (dbType === 'mongo' && mongoose) {
    const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
      email: { type: String },
      username: { type: String },
      password: { type: String },
      role: { type: String, default: 'user' }
    }, { strict: false, timestamps: true }));

    const user = await User.findOne({
      $or: [
        { email: cleanId },
        { username: cleanId }
      ]
    }).lean();

    return user;
  }

  if (pool) {
    const res = await pool.query(
      `SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1 LIMIT 1`,
      [cleanId]
    );
    return res.rows[0] || null;
  }

  // In-memory fallback
  return inMemory.users.find(u => 
    String(u.email || '').toLowerCase() === cleanId || 
    String(u.username || '').toLowerCase() === cleanId
  ) || null;
}

async function findUserById(id) {
  const strId = String(id || '');
  if (dbType === 'mongo' && mongoose) {
    const User = mongoose.models.User;
    if (User) return await User.findById(id).select('-password');
  }

  if (pool) {
    const res = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
    if (res.rows[0]) {
      const { password_hash, ...safe } = res.rows[0];
      return safe;
    }
  }

  // In-memory fallback
  const found = inMemory.users.find(u => String(u.id || u._id) === strId);
  if (found) {
    const { password_hash, password, ...safe } = found;
    return safe;
  }

  return null;
}

async function recordLoginLog({ userId, email, ipAddress, userAgent, status }) {
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO login_logs (user_id, email, ip_address, user_agent, status) VALUES ($1, $2, $3, $4, $5)`,
        [userId || null, email, ipAddress, userAgent, status]
      );
    } catch (_) {}
  } else {
    inMemory.login_logs.push({
      id: inMemory.login_logs.length + 1,
      user_id: userId || null,
      email,
      ip_address: ipAddress,
      user_agent: userAgent,
      status,
      created_at: new Date().toISOString()
    });
  }
}

// ── Referral Functions ──

async function findUserByReferralCode(code) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return null;

  if (pool) {
    const res = await pool.query(
      `SELECT * FROM users WHERE UPPER(referral_code) = $1 LIMIT 1`,
      [cleanCode]
    );
    return res.rows[0] || null;
  }

  if (dbType === 'mongo' && mongoose) {
    const User = mongoose.models.User;
    if (User) return await User.findOne({ referral_code: new RegExp(`^${cleanCode}$`, 'i') }).lean();
  }

  // In-memory fallback
  return inMemory.users.find(u => 
    String(u.referral_code || u.referralCode || '').toUpperCase() === cleanCode
  ) || null;
}

async function generateUniqueReferralCode(username) {
  const crypto = require('crypto');
  const cleanUser = String(username || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
  for (let attempts = 0; attempts < 15; attempts++) {
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 chars e.g. 7A9B
    const code = cleanUser ? `NXQ-${cleanUser}-${rand}` : `NXQ-${rand}`;
    const existing = await findUserByReferralCode(code);
    if (!existing) return code;
  }
  return `NXQ-${Date.now().toString(36).toUpperCase()}`;
}

async function ensureUserReferralCode(userId, username) {
  if (!userId) return null;
  const user = await findUserById(userId);
  if (!user) return null;
  if (user.referral_code || user.referralCode) {
    return user.referral_code || user.referralCode;
  }

  const newCode = await generateUniqueReferralCode(username || user.username);
  if (pool) {
    try {
      await pool.query(`UPDATE users SET referral_code = $1 WHERE id = $2`, [newCode, userId]);
    } catch (_) {}
  } else if (dbType === 'mongo' && mongoose) {
    const User = mongoose.models.User;
    if (User) await User.findByIdAndUpdate(userId, { referral_code: newCode });
  } else {
    const memUser = inMemory.users.find(u => String(u.id || u._id) === String(userId));
    if (memUser) {
      memUser.referral_code = newCode;
      memUser.referralCode = newCode;
    }
  }
  return newCode;
}

async function recordReferral({ referrerId, referredUserId, referralCode, rewardAmount = 0, status = 'completed' }) {
  if (!referrerId || !referredUserId) return null;

  if (pool) {
    try {
      const res = await pool.query(
        `INSERT INTO referrals (referrer_id, referred_user_id, referral_code, status, reward_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (referred_user_id) DO NOTHING
         RETURNING *`,
        [referrerId, referredUserId, referralCode, status, rewardAmount]
      );
      if (rewardAmount > 0) {
        await pool.query(
          `UPDATE users SET balance = balance + $1, referral_balance = referral_balance + $1 WHERE id = $2`,
          [rewardAmount, referrerId]
        );
        const refUser = await findUserById(referrerId);
        await pool.query(
          `INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
           VALUES ($1, $2, $3, $4, 'credit', 'success', $5)`,
          ['REF-REW-' + Date.now().toString(36).toUpperCase(), referrerId, refUser?.email || '', rewardAmount, 'Referral Reward']
        );
      }
      return res.rows[0] || null;
    } catch (err) {
      console.error('Error recording referral in PostgreSQL:', err.message);
      return null;
    }
  }

  // In-memory fallback
  const already = inMemory.referrals.find(r => String(r.referred_user_id) === String(referredUserId));
  if (already) return already;
  const refRecord = {
    id: inMemory.referrals.length + 1,
    referrer_id: referrerId,
    referred_user_id: referredUserId,
    referral_code: referralCode,
    status: status || 'completed',
    reward_amount: rewardAmount,
    created_at: new Date().toISOString()
  };
  inMemory.referrals.push(refRecord);

  if (rewardAmount > 0) {
    const refUser = inMemory.users.find(u => String(u.id || u._id) === String(referrerId));
    if (refUser) {
      refUser.balance = (parseFloat(refUser.balance) || 0) + rewardAmount;
      refUser.referral_balance = (parseFloat(refUser.referral_balance) || 0) + rewardAmount;
      inMemory.transactions.push({
        id: inMemory.transactions.length + 1,
        reference: 'REF-REW-' + Date.now().toString(36).toUpperCase(),
        user_id: referrerId,
        user_email: refUser.email,
        amount: rewardAmount,
        type: 'credit',
        status: 'success',
        reason: 'Referral Reward',
        created_at: new Date().toISOString()
      });
    }
  }
  return refRecord;
}

async function getReferralStats(userId) {
  if (pool) {
    try {
      const userRes = await pool.query(`SELECT balance, referral_balance FROM users WHERE id = $1`, [userId]);
      const user = userRes.rows[0] || {};
      const refRes = await pool.query(
        `SELECT r.id, r.referral_code, r.status, r.reward_amount, r.created_at,
                u.username, u.email
         FROM referrals r
         JOIN users u ON r.referred_user_id = u.id
         WHERE r.referrer_id = $1
         ORDER BY r.created_at DESC`,
        [userId]
      );
      const rows = refRes.rows;
      const total = rows.length;
      const successful = rows.filter(r => r.status === 'completed').length;
      const rewardsEarned = rows.reduce((sum, r) => sum + (parseFloat(r.reward_amount) || 0), 0);

      const maskedList = rows.map(r => ({
        id: r.id,
        username: maskUsername(r.username),
        email: maskEmail(r.email),
        status: r.status,
        reward: parseFloat(r.reward_amount || 0),
        createdAt: r.created_at
      }));

      return {
        totalReferrals: total,
        successfulReferrals: successful,
        referralBalance: parseFloat(user.referral_balance || 0),
        rewardsEarned,
        referrals: maskedList
      };
    } catch (err) {
      console.error('getReferralStats SQL error:', err.message);
    }
  }

  // In-memory fallback
  const user = inMemory.users.find(u => String(u.id || u._id) === String(userId)) || {};
  const refs = inMemory.referrals.filter(r => String(r.referrer_id) === String(userId));
  const total = refs.length;
  const successful = refs.filter(r => r.status === 'completed').length;
  const rewardsEarned = refs.reduce((sum, r) => sum + (parseFloat(r.reward_amount) || 0), 0);
  const maskedList = refs.map(r => {
    const u = inMemory.users.find(x => String(x.id || x._id) === String(r.referred_user_id)) || {};
    return {
      id: r.id,
      username: maskUsername(u.username || 'user'),
      email: maskEmail(u.email || ''),
      status: r.status,
      reward: parseFloat(r.reward_amount || 0),
      createdAt: r.created_at
    };
  });

  return {
    totalReferrals: total,
    successfulReferrals: successful,
    referralBalance: parseFloat(user.referral_balance || 0),
    rewardsEarned,
    referrals: maskedList
  };
}

async function createNotification({ userId, userEmail, title, message, type = 'system' }) {
  const notifId = 'notif_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO notifications (notification_id, user_id, user_email, title, message, type, read)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [notifId, String(userId), userEmail || null, title, message, type]
      );
    } catch (_) {}
  } else {
    inMemory.notifications.push({
      id: inMemory.notifications.length + 1,
      notification_id: notifId,
      user_id: String(userId),
      user_email: userEmail,
      title,
      message,
      type,
      read: false,
      created_at: new Date().toISOString()
    });
  }
}

// ── Wallet & Transaction Operations ──

async function getUserWallet(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  return {
    userId: String(user.id || user._id),
    balance: parseFloat(user.balance || 0),
    referralBalance: parseFloat(user.referral_balance || user.referralBalance || 0),
    isSuspended: Boolean(user.is_suspended || user.isSuspended)
  };
}

async function findTransactionByReference(reference) {
  const ref = String(reference || '').trim();
  if (!ref) return null;
  if (pool) {
    try {
      const res = await pool.query('SELECT * FROM transactions WHERE reference = $1 LIMIT 1', [ref]);
      return res.rows[0] || null;
    } catch (_) {}
  }
  return inMemory.transactions.find(t => String(t.reference) === ref) || null;
}

async function creditUserWallet(userId, amount, reference, reason, type = 'deposit') {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Credit amount must be greater than zero');
  }
  const ref = String(reference || ('DEP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()));

  // 1. Check idempotency: if reference already exists with success/completed, do not credit again!
  const existingTx = await findTransactionByReference(ref);
  if (existingTx && (existingTx.status === 'completed' || existingTx.status === 'success')) {
    const currentWallet = await getUserWallet(userId);
    return {
      alreadyProcessed: true,
      balance: currentWallet.balance,
      transaction: existingTx
    };
  }

  let updatedUser = null;
  let txRecord = null;

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        'SELECT id, email, balance, referral_balance, referred_by FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (!userRes.rows.length) {
        throw new Error('User not found');
      }
      const u = userRes.rows[0];

      const updateRes = await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, balance, referral_balance, referred_by',
        [numAmount, userId]
      );
      updatedUser = updateRes.rows[0];

      const txRes = await client.query(
        `INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6)
         ON CONFLICT (reference) DO UPDATE SET status = 'completed'
         RETURNING *`,
        [ref, userId, u.email, numAmount, type, reason || 'Wallet deposit']
      );
      txRecord = txRes.rows[0];

      // If user has a referrer and this is a deposit, award 10% referral commission!
      if (type === 'deposit' && u.referred_by) {
        const bonusAmount = parseFloat((numAmount * 0.10).toFixed(2));
        if (bonusAmount > 0) {
          await client.query(
            'UPDATE users SET balance = balance + $1, referral_balance = referral_balance + $1 WHERE id = $2',
            [bonusAmount, u.referred_by]
          );
          const refBonusTx = 'REF-DEP-' + Date.now().toString(36).toUpperCase();
          const refUser = (await client.query('SELECT email FROM users WHERE id = $1', [u.referred_by])).rows[0];
          await client.query(
            `INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
             VALUES ($1, $2, $3, $4, 'credit', 'completed', $5)`,
            [refBonusTx, u.referred_by, refUser?.email || '', bonusAmount, `10% referral commission from ${u.email}`]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // In-memory fallback
    const memUser = inMemory.users.find(u => String(u.id || u._id) === String(userId));
    if (!memUser) throw new Error('User not found');

    memUser.balance = (parseFloat(memUser.balance) || 0) + numAmount;
    updatedUser = memUser;

    txRecord = {
      id: inMemory.transactions.length + 1,
      reference: ref,
      user_id: String(userId),
      user_email: memUser.email,
      amount: numAmount,
      type: type,
      status: 'completed',
      reason: reason || 'Wallet deposit',
      created_at: new Date().toISOString()
    };
    inMemory.transactions.push(txRecord);

    // 10% referral reward in-memory
    if (type === 'deposit' && memUser.referred_by) {
      const bonusAmount = parseFloat((numAmount * 0.10).toFixed(2));
      const referrer = inMemory.users.find(u => String(u.id || u._id) === String(memUser.referred_by));
      if (referrer && bonusAmount > 0) {
        referrer.balance = (parseFloat(referrer.balance) || 0) + bonusAmount;
        referrer.referral_balance = (parseFloat(referrer.referral_balance) || 0) + bonusAmount;
        inMemory.transactions.push({
          id: inMemory.transactions.length + 1,
          reference: 'REF-DEP-' + Date.now().toString(36).toUpperCase(),
          user_id: String(referrer.id || referrer._id),
          user_email: referrer.email,
          amount: bonusAmount,
          type: 'credit',
          status: 'completed',
          reason: `10% referral commission from ${memUser.email}`,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  return {
    success: true,
    balance: parseFloat(updatedUser.balance || 0),
    transaction: txRecord
  };
}

async function debitUserWallet(userId, amount, reference, reason, type = 'purchase') {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Debit amount must be greater than zero');
  }
  const ref = String(reference || ('PUR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()));

  let updatedUser = null;
  let txRecord = null;

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        'SELECT id, email, balance, is_suspended FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (!userRes.rows.length) {
        throw new Error('User not found');
      }
      const u = userRes.rows[0];
      if (u.is_suspended) {
        throw new Error('Account wallet is frozen or suspended');
      }
      const currentBal = parseFloat(u.balance || 0);
      if (currentBal < numAmount) {
        throw new Error(`Insufficient wallet balance. Required: ₦${numAmount.toLocaleString()}, Available: ₦${currentBal.toLocaleString()}`);
      }

      const updateRes = await client.query(
        'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, balance',
        [numAmount, userId]
      );
      updatedUser = updateRes.rows[0];

      const txRes = await client.query(
        `INSERT INTO transactions (reference, user_id, user_email, amount, type, status, reason)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6)
         RETURNING *`,
        [ref, userId, u.email, -numAmount, type, reason || 'Virtual number purchase']
      );
      txRecord = txRes.rows[0];

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // In-memory fallback
    const memUser = inMemory.users.find(u => String(u.id || u._id) === String(userId));
    if (!memUser) throw new Error('User not found');
    if (memUser.is_suspended) throw new Error('Account wallet is frozen or suspended');
    const currentBal = parseFloat(memUser.balance || 0);
    if (currentBal < numAmount) {
      throw new Error(`Insufficient wallet balance. Required: ₦${numAmount.toLocaleString()}, Available: ₦${currentBal.toLocaleString()}`);
    }

    memUser.balance = currentBal - numAmount;
    updatedUser = memUser;

    txRecord = {
      id: inMemory.transactions.length + 1,
      reference: ref,
      user_id: String(userId),
      user_email: memUser.email,
      amount: -numAmount,
      type: type,
      status: 'completed',
      reason: reason || 'Virtual number purchase',
      created_at: new Date().toISOString()
    };
    inMemory.transactions.push(txRecord);
  }

  return {
    success: true,
    balance: parseFloat(updatedUser.balance || 0),
    transaction: txRecord
  };
}

async function refundUserWallet(userId, amount, reference, reason) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) return null;
  const refundRef = 'REFUND-' + String(reference || Date.now().toString(36).toUpperCase());

  // Prevent duplicate refunds
  const existingRefund = await findTransactionByReference(refundRef);
  if (existingRefund) {
    const currentWallet = await getUserWallet(userId);
    return { alreadyRefunded: true, balance: currentWallet.balance };
  }

  return await creditUserWallet(userId, numAmount, refundRef, reason || 'Order cancellation refund', 'refund');
}

async function getUserTransactions(userId, { page = 1, limit = 20, type = null } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (p - 1) * l;

  if (pool) {
    try {
      let q = 'SELECT * FROM transactions WHERE user_id = $1';
      const params = [userId];
      if (type && type !== 'all') {
        params.push(type);
        q += ` AND type = $${params.length}`;
      }
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${q}) AS sub`, params);
      const total = countRes.rows[0]?.total || 0;

      q += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(l, offset);

      const rows = (await pool.query(q, params)).rows;
      return {
        transactions: rows,
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l)
        }
      };
    } catch (err) {
      console.error('Error fetching user transactions SQL:', err.message);
    }
  }

  // In-memory fallback
  let list = inMemory.transactions.filter(t => String(t.user_id) === String(userId));
  if (type && type !== 'all') {
    list = list.filter(t => String(t.type || '').toLowerCase() === String(type).toLowerCase());
  }
  list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const total = list.length;
  const paged = list.slice(offset, offset + l);
  return {
    transactions: paged,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

async function getUserVirtualAccount(userId) {
  if (pool) {
    try {
      const res = await pool.query(
        'SELECT account_number AS "accountNumber", bank_name AS "bankName", account_name AS "accountName", created_at AS "createdAt" FROM virtual_accounts WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (res.rows.length) return res.rows[0];
    } catch (_) {}
  }
  return inMemory.virtual_accounts.find(v => String(v.user_id) === String(userId)) || null;
}

async function saveUserVirtualAccount(userId, accountData) {
  const { accountNumber, bankName, accountName } = accountData;
  if (!accountNumber) return null;

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO virtual_accounts (user_id, account_number, bank_name, account_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [userId, accountNumber, bankName, accountName]
      );
    } catch (_) {}
  } else {
    const existing = inMemory.virtual_accounts.find(v => String(v.user_id) === String(userId));
    if (existing) {
      existing.account_number = accountNumber;
      existing.bank_name = bankName;
      existing.account_name = accountName;
    } else {
      inMemory.virtual_accounts.push({
        id: inMemory.virtual_accounts.length + 1,
        user_id: String(userId),
        account_number: accountNumber,
        bank_name: bankName,
        account_name: accountName,
        created_at: new Date().toISOString()
      });
    }
  }
  return { accountNumber, bankName, accountName };
}

/* ======================================================================
   ORDERS & ACTIVATIONS REPOSITORY
====================================================================== */

async function saveOrder(orderData) {
  const {
    orderId,
    userId,
    userEmail,
    phone,
    country,
    service,
    operator = 'any',
    amount = 0,
    status = 'PENDING',
    smsCode = null,
    provider = '5sim',
    providerData = null
  } = orderData;

  if (!orderId) throw new Error('Order ID is required to save an order.');

  if (pool) {
    try {
      const q = `
        INSERT INTO orders (
          order_id, user_id, user_email, phone, country, service, operator, amount, status, sms_code, provider, provider_data, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
        )
        ON CONFLICT (order_id) DO UPDATE SET
          status = EXCLUDED.status,
          phone = COALESCE(EXCLUDED.phone, orders.phone),
          sms_code = COALESCE(EXCLUDED.sms_code, orders.sms_code),
          provider_data = COALESCE(EXCLUDED.provider_data, orders.provider_data),
          updated_at = NOW()
        RETURNING *
      `;
      const res = await pool.query(q, [
        String(orderId),
        userId ? parseInt(userId, 10) : null,
        userEmail || null,
        phone || null,
        String(country).toLowerCase(),
        String(service).toLowerCase(),
        operator || 'any',
        parseFloat(amount || 0),
        String(status).toUpperCase(),
        smsCode || null,
        provider,
        providerData ? JSON.stringify(providerData) : null
      ]);
      return res.rows[0];
    } catch (err) {
      console.error('[DB] Error saving order to PostgreSQL:', err.message);
    }
  }

  // Fallback to in-memory store
  const existingIdx = inMemory.orders.findIndex(o => String(o.order_id || o.id) === String(orderId));
  const record = {
    id: existingIdx !== -1 ? inMemory.orders[existingIdx].id : inMemory.orders.length + 1,
    order_id: String(orderId),
    user_id: userId ? String(userId) : null,
    user_email: userEmail || null,
    phone: phone || null,
    country: String(country || '').toLowerCase(),
    service: String(service || '').toLowerCase(),
    operator: operator || 'any',
    amount: parseFloat(amount || 0),
    status: String(status).toUpperCase(),
    sms_code: smsCode || null,
    provider: provider || '5sim',
    created_at: existingIdx !== -1 ? inMemory.orders[existingIdx].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    inMemory.orders[existingIdx] = { ...inMemory.orders[existingIdx], ...record };
  } else {
    inMemory.orders.unshift(record);
  }
  return record;
}

async function updateOrderStatus(orderId, status, smsCode = null, extraData = null) {
  if (!orderId) return null;
  const cleanStatus = String(status).toUpperCase();

  if (pool) {
    try {
      const updates = ['status = $2', 'updated_at = NOW()'];
      const params = [String(orderId), cleanStatus];

      if (smsCode) {
        params.push(String(smsCode));
        updates.push(`sms_code = $${params.length}`);
      }
      if (extraData) {
        params.push(JSON.stringify(extraData));
        updates.push(`provider_data = $${params.length}`);
      }

      const q = `UPDATE orders SET ${updates.join(', ')} WHERE order_id = $1 RETURNING *`;
      const res = await pool.query(q, params);
      if (res.rows.length) return res.rows[0];
    } catch (err) {
      console.error('[DB] Error updating order in PostgreSQL:', err.message);
    }
  }

  const existing = inMemory.orders.find(o => String(o.order_id || o.id) === String(orderId));
  if (existing) {
    existing.status = cleanStatus;
    if (smsCode) existing.sms_code = String(smsCode);
    existing.updated_at = new Date().toISOString();
    return existing;
  }
  return null;
}

async function getAdminOrders(params = {}) {
  const page = Math.max(1, parseInt(params.page || 1, 10));
  const limit = Math.max(1, parseInt(params.limit || 50, 10));
  const status = params.status ? String(params.status).toLowerCase().trim() : null;
  const search = params.search ? String(params.search).toLowerCase().trim() : null;
  const country = params.country ? String(params.country).toLowerCase().trim() : null;
  const operator = params.operator ? String(params.operator).toLowerCase().trim() : null;
  const from = params.from ? new Date(params.from) : null;
  const to = params.to ? new Date(params.to) : null;

  if (pool) {
    try {
      // Safe idempotent sync of any purchases in transactions table into orders
      try {
        await pool.query(`
          INSERT INTO orders (order_id, user_id, user_email, country, service, operator, amount, status, created_at, updated_at)
          SELECT 
            SUBSTRING(t.reference FROM 5),
            t.user_id,
            t.user_email,
            COALESCE(NULLIF(SUBSTRING(t.reason FROM '\\(([^)]+)\\)'), ''), 'usa'),
            COALESCE(NULLIF(SUBSTRING(t.reason FROM 'for\\s+([A-Za-z0-9_]+)'), ''), 'any'),
            'any',
            ABS(t.amount),
            CASE WHEN LOWER(t.status) IN ('success', 'completed') THEN 'FINISHED' ELSE 'PENDING' END,
            t.created_at,
            t.created_at
          FROM transactions t
          WHERE (t.reference LIKE 'BUY-%' OR LOWER(t.type) = 'purchase')
            AND LENGTH(t.reference) > 4
            AND NOT EXISTS (
              SELECT 1 FROM orders o WHERE o.order_id = SUBSTRING(t.reference FROM 5) OR o.order_id = t.reference
            )
          ON CONFLICT (order_id) DO NOTHING;
        `);
      } catch (_) {}

      let query = `
        SELECT 
          o.id,
          o.order_id AS "orderId",
          o.user_id AS "userId",
          COALESCE(u.username, o.user_email, 'User') AS "username",
          COALESCE(u.email, o.user_email, '—') AS "userEmail",
          o.phone,
          o.country,
          o.service,
          o.operator,
          o.amount AS "amountNGN",
          o.status,
          o.sms_code AS "smsCode",
          o.provider,
          o.created_at AS "createdAt",
          o.updated_at AS "updatedAt"
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE 1=1
      `;
      const qParams = [];

      if (status && status !== 'all') {
        if (status === 'successful' || status === 'completed') {
          query += ` AND UPPER(o.status) IN ('FINISHED', 'COMPLETED', 'SUCCESS', '6', '10')`;
        } else if (status === 'banned') {
          query += ` AND UPPER(o.status) IN ('BANNED', '8')`;
        } else if (status === 'cancelled' || status === 'canceled') {
          query += ` AND UPPER(o.status) IN ('CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2')`;
        } else if (status === 'pending' || status === 'received' || status === 'active') {
          query += ` AND UPPER(o.status) IN ('RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3')`;
        } else {
          qParams.push(status.toUpperCase());
          query += ` AND UPPER(o.status) = $${qParams.length}`;
        }
      }

      if (search) {
        qParams.push(`%${search}%`);
        query += ` AND (
          LOWER(o.order_id) LIKE $${qParams.length} OR
          LOWER(COALESCE(o.user_email, '')) LIKE $${qParams.length} OR
          LOWER(COALESCE(u.username, '')) LIKE $${qParams.length} OR
          LOWER(COALESCE(u.email, '')) LIKE $${qParams.length} OR
          LOWER(o.service) LIKE $${qParams.length} OR
          LOWER(o.country) LIKE $${qParams.length} OR
          LOWER(COALESCE(o.phone, '')) LIKE $${qParams.length}
        )`;
      }

      if (country && country !== 'all') {
        qParams.push(country.toLowerCase());
        query += ` AND LOWER(o.country) = $${qParams.length}`;
      }

      if (operator && operator !== 'all') {
        qParams.push(operator.toLowerCase());
        query += ` AND LOWER(o.operator) = $${qParams.length}`;
      }

      if (from && !isNaN(from.getTime())) {
        qParams.push(from.toISOString());
        query += ` AND o.created_at >= $${qParams.length}`;
      }

      if (to && !isNaN(to.getTime())) {
        qParams.push(to.toISOString());
        query += ` AND o.created_at <= $${qParams.length}`;
      }

      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM (${query}) AS filtered`, qParams);
      const total = countRes.rows[0]?.total || 0;

      query += ` ORDER BY o.created_at DESC LIMIT $${qParams.length + 1} OFFSET $${qParams.length + 2}`;
      qParams.push(limit, (page - 1) * limit);

      const rows = (await pool.query(query, qParams)).rows;

      return {
        orders: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (err) {
      console.error('[DB] Error fetching admin orders from PostgreSQL:', err.message);
    }
  }

  // Fallback to in-memory
  let filtered = [...inMemory.orders];
  if (status && status !== 'all') {
    if (status === 'successful' || status === 'completed') {
      filtered = filtered.filter(o => ['FINISHED', 'COMPLETED', 'SUCCESS', '6', '10'].includes(String(o.status).toUpperCase()));
    } else if (status === 'banned') {
      filtered = filtered.filter(o => ['BANNED', '8'].includes(String(o.status).toUpperCase()));
    } else if (status === 'cancelled' || status === 'canceled') {
      filtered = filtered.filter(o => ['CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2'].includes(String(o.status).toUpperCase()));
    } else if (status === 'pending' || status === 'received' || status === 'active') {
      filtered = filtered.filter(o => ['RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3'].includes(String(o.status).toUpperCase()));
    } else {
      filtered = filtered.filter(o => String(o.status).toUpperCase() === status.toUpperCase());
    }
  }
  if (search) {
    filtered = filtered.filter(o =>
      String(o.order_id || '').toLowerCase().includes(search) ||
      String(o.user_email || '').toLowerCase().includes(search) ||
      String(o.username || '').toLowerCase().includes(search) ||
      String(o.service || '').toLowerCase().includes(search) ||
      String(o.country || '').toLowerCase().includes(search) ||
      String(o.phone || '').toLowerCase().includes(search)
    );
  }
  if (country && country !== 'all') {
    filtered = filtered.filter(o => String(o.country || '').toLowerCase() === country.toLowerCase());
  }
  if (operator && operator !== 'all') {
    filtered = filtered.filter(o => String(o.operator || '').toLowerCase() === operator.toLowerCase());
  }

  const total = filtered.length;
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + limit).map(o => ({
    id: o.id,
    orderId: o.order_id,
    userId: o.user_id,
    userEmail: o.user_email,
    username: o.username || o.user_email || 'User',
    userName: o.username || o.user_email || 'User',
    phone: o.phone,
    country: o.country,
    service: o.service,
    operator: o.operator,
    amountNGN: o.amount,
    status: o.status,
    smsCode: o.sms_code,
    provider: o.provider,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  }));

  return {
    orders: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getUserOrders(userId, userEmail = null) {
  if (pool) {
    try {
      let query = `
        SELECT 
          o.id,
          o.order_id AS "orderId",
          o.user_id AS "userId",
          o.user_email AS "userEmail",
          o.phone,
          o.country,
          o.service,
          o.operator,
          o.amount AS "amountNGN",
          o.status,
          o.sms_code AS "smsCode",
          o.provider,
          o.created_at AS "createdAt",
          o.updated_at AS "updatedAt"
        FROM orders o
        WHERE o.user_id::text = $1
      `;
      const params = [String(userId)];
      if (userEmail) {
        params.push(String(userEmail).toLowerCase());
        query += ` OR LOWER(COALESCE(o.user_email, '')) = $${params.length}`;
      }
      query += ` ORDER BY o.created_at DESC`;

      const rows = (await pool.query(query, params)).rows;
      if (rows && rows.length > 0) return rows;
    } catch (err) {
      console.error('[DB] Error querying user orders from PostgreSQL:', err.message);
    }
  }

  // Fallback to in-memory store
  const matched = inMemory.orders.filter(o => 
    (userId && String(o.user_id) === String(userId)) ||
    (userEmail && String(o.user_email || '').toLowerCase() === String(userEmail).toLowerCase())
  );
  return matched.map(o => ({
    id: o.id,
    orderId: o.order_id,
    userId: o.user_id,
    userEmail: o.user_email,
    phone: o.phone,
    country: o.country,
    service: o.service,
    operator: o.operator,
    amountNGN: o.amount,
    status: o.status,
    smsCode: o.sms_code,
    provider: o.provider,
    createdAt: o.created_at,
    updatedAt: o.updated_at
  }));
}

async function getOrderStats() {
  if (pool) {
    try {
      // Safe idempotent sync of any purchases in transactions table into orders
      try {
        await pool.query(`
          INSERT INTO orders (order_id, user_id, user_email, country, service, operator, amount, status, created_at, updated_at)
          SELECT 
            SUBSTRING(t.reference FROM 5),
            t.user_id,
            t.user_email,
            COALESCE(NULLIF(SUBSTRING(t.reason FROM '\\(([^)]+)\\)'), ''), 'usa'),
            COALESCE(NULLIF(SUBSTRING(t.reason FROM 'for\\s+([A-Za-z0-9_]+)'), ''), 'any'),
            'any',
            ABS(t.amount),
            CASE WHEN LOWER(t.status) IN ('success', 'completed') THEN 'FINISHED' ELSE 'PENDING' END,
            t.created_at,
            t.created_at
          FROM transactions t
          WHERE (t.reference LIKE 'BUY-%' OR LOWER(t.type) = 'purchase')
            AND LENGTH(t.reference) > 4
            AND NOT EXISTS (
              SELECT 1 FROM orders o WHERE o.order_id = SUBSTRING(t.reference FROM 5) OR o.order_id = t.reference
            )
          ON CONFLICT (order_id) DO NOTHING;
        `);
      } catch (_) {}

      const q = `
        SELECT 
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE UPPER(status) IN ('RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3'))::int AS pending,
          COUNT(*) FILTER (WHERE UPPER(status) IN ('FINISHED', 'COMPLETED', 'SUCCESS', '6', '10'))::int AS successful,
          COUNT(*) FILTER (WHERE UPPER(status) IN ('CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2'))::int AS cancelled,
          COUNT(*) FILTER (WHERE UPPER(status) IN ('BANNED', '8'))::int AS banned,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
          COALESCE(SUM(amount), 0)::numeric AS total_revenue,
          COALESCE(SUM(amount) FILTER (WHERE created_at >= CURRENT_DATE), 0)::numeric AS today_revenue
        FROM orders
      `;
      const res = await pool.query(q);
      const row = res.rows[0] || {};
      const total = row.total || 0;
      const successful = row.successful || 0;
      const banned = row.banned || 0;
      const cancelled = row.cancelled || 0;
      const pending = row.pending || 0;

      return {
        total,
        successful,
        completed: successful,
        banned,
        cancelled,
        pending,
        active: pending,
        failed: 0,
        today: row.today || 0,
        totalRevenue: parseFloat(row.total_revenue || 0),
        todayRevenue: parseFloat(row.today_revenue || 0)
      };
    } catch (err) {
      console.error('[DB] Error querying order stats from PostgreSQL:', err.message);
    }
  }

  // In-memory stats
  const total = inMemory.orders.length;
  const pending = inMemory.orders.filter(o => ['RECEIVED', 'PENDING', 'ACTIVE', 'WAITING', '1', '3'].includes(String(o.status).toUpperCase())).length;
  const successful = inMemory.orders.filter(o => ['FINISHED', 'COMPLETED', 'SUCCESS', '6', '10'].includes(String(o.status).toUpperCase())).length;
  const cancelled = inMemory.orders.filter(o => ['CANCELED', 'CANCELLED', 'TIMEOUT', 'EXPIRED', 'FAILED', '2'].includes(String(o.status).toUpperCase())).length;
  const banned = inMemory.orders.filter(o => ['BANNED', '8'].includes(String(o.status).toUpperCase())).length;
  const today = inMemory.orders.filter(o => String(o.created_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const totalRevenue = inMemory.orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);
  const todayRevenue = inMemory.orders
    .filter(o => String(o.created_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((s, o) => s + (parseFloat(o.amount) || 0), 0);

  return {
    total,
    successful,
    completed: successful,
    banned,
    cancelled,
    pending,
    active: pending,
    failed: 0,
    today,
    totalRevenue,
    todayRevenue
  };
}

module.exports = {
  get dbType() { return dbType; },
  findUserByEmailOrUsername,
  findUserById,
  recordLoginLog,
  findUserByReferralCode,
  generateUniqueReferralCode,
  ensureUserReferralCode,
  recordReferral,
  getReferralStats,
  createNotification,
  getUserWallet,
  findTransactionByReference,
  creditUserWallet,
  debitUserWallet,
  refundUserWallet,
  getUserTransactions,
  getUserVirtualAccount,
  saveUserVirtualAccount,
  saveOrder,
  updateOrderStatus,
  getUserOrders,
  getAdminOrders,
  getOrderStats,
  inMemory,
  getPool: () => pool,
  getMongoose: () => mongoose
};
