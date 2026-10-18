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
  notifications: []
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
  inMemory,
  getPool: () => pool,
  getMongoose: () => mongoose
};
