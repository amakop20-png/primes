require('dotenv').config({path: 'primes/buy.env'});
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("UPDATE users SET role = 'admin' WHERE email = 'forgot2@test.com'").then(() => {
  console.log('Made admin');
  pool.end();
});
