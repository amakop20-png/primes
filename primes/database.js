const { Pool } = require('pg');

// Use the connection string from environment variables
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  // Required for many managed Postgres providers (e.g. Render, Heroku)
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

if (connectionString) {
  pool.connect((err, client, release) => {
    if (err) {
      console.error('Error acquiring client from pool', err.message);
    } else {
      console.log('✅ Connected to PostgreSQL database.');
      initDatabase();
      release();
    }
  });
} else {
  console.warn('⚠️ No DATABASE_URL found in environment. Database connection skipped.');
}

async function initDatabase() {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        balance NUMERIC DEFAULT 0,
        totalRecharge NUMERIC DEFAULT 0,
        numbersPurchased INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        referralCode TEXT UNIQUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        orderId TEXT UNIQUE NOT NULL,
        userId INTEGER NOT NULL REFERENCES users (id),
        service TEXT NOT NULL,
        product TEXT NOT NULL,
        country TEXT NOT NULL,
        phone TEXT NOT NULL,
        amountNGN NUMERIC NOT NULL,
        amountUSD NUMERIC NOT NULL,
        status TEXT DEFAULT 'RECEIVED',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Activity log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity (
        id SERIAL PRIMARY KEY,
        userId INTEGER REFERENCES users (id),
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings/Config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Password resets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expiresAt TIMESTAMP NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default config if not exists
    const res = await pool.query("SELECT key FROM config WHERE key = 'exchangeRate'");
    if (res.rowCount === 0) {
      await pool.query("INSERT INTO config (key, value) VALUES ('exchangeRate', '1500')");
      await pool.query("INSERT INTO config (key, value) VALUES ('markupMultiplier', '1.5')");
      await pool.query("INSERT INTO config (key, value) VALUES ('maintenance', '0')");
    }
  } catch (err) {
    console.error('Error during database initialization:', err.message);
  }
}

// Convert SQLite '?' parameters to PostgreSQL '$1, $2...' format
function convertQuery(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Wrapper for async queries
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  const pgSql = convertQuery(sql);
  pool.query(pgSql, params)
    .then(res => {
      // Return something similar to SQLite's `this` context
      resolve({ changes: res.rowCount, lastID: res.rows[0]?.id });
    })
    .catch(err => reject(err));
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  const pgSql = convertQuery(sql);
  pool.query(pgSql, params)
    .then(res => resolve(res.rows[0]))
    .catch(err => reject(err));
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  const pgSql = convertQuery(sql);
  pool.query(pgSql, params)
    .then(res => resolve(res.rows))
    .catch(err => reject(err));
});

module.exports = {
  db: pool,
  dbRun,
  dbGet,
  dbAll
};
