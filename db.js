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
        is_suspended BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
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
    `);
  } catch (err) {
    console.error('Error creating PostgreSQL tables:', err.message);
  }
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

  return null;
}

async function findUserById(id) {
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
  }
}

module.exports = {
  dbType,
  findUserByEmailOrUsername,
  findUserById,
  recordLoginLog,
  getPool: () => pool,
  getMongoose: () => mongoose
};
