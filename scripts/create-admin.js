// scripts/create-admin.js - Secure Admin Account Provisioning Script
require('dotenv').config();
let bcrypt;
try { bcrypt = require('bcrypt'); } catch (_) { bcrypt = require('bcryptjs'); }
const readline = require('readline');
const db = require('../db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('====================================================');
  console.log('  NuraXQ / Primes - Administrator Setup Utility     ');
  console.log('====================================================');

  const args = process.argv.slice(2);
  let email = args[0];
  let password = args[1];
  let name = args[2] || 'Admin';

  if (!email) {
    email = await question('Enter Admin Email: ');
  }
  if (!password) {
    password = await question('Enter Admin Password: ');
  }

  if (!email || !password) {
    console.error('❌ Error: Email and password are required.');
    rl.close();
    process.exit(1);
  }

  const cleanEmail = email.trim().toLowerCase();
  const username = cleanEmail.split('@')[0];

  console.log(`\nChecking database for ${cleanEmail}...`);

  try {
    const existing = await db.findUserByEmailOrUsername(cleanEmail);
    const pool = db.getPool();

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      console.log(`User found. Updating role to 'admin' and resetting password...`);
      if (pool) {
        await pool.query(`
          UPDATE users
          SET role = 'admin', password_hash = $1, is_suspended = FALSE, updated_at = NOW()
          WHERE LOWER(email) = $2
        `, [passwordHash, cleanEmail]);
      }
      console.log(`✅ Administrator account '${cleanEmail}' updated successfully.`);
    } else {
      console.log(`Creating new administrator account...`);
      if (pool) {
        await pool.query(`
          INSERT INTO users (email, username, first_name, last_name, password_hash, role, balance)
          VALUES ($1, $2, $3, 'Administrator', $4, 'admin', 0)
        `, [cleanEmail, username, name, passwordHash]);
      }
      console.log(`✅ Administrator account '${cleanEmail}' created successfully.`);
    }

    console.log('\n--- Admin Login Information ---');
    console.log(`Login URL:      https://nurasms-api.onrender.com/admin.html`);
    console.log(`API Endpoint:   POST /api/admin/auth/login`);
    console.log(`Admin Email:    ${cleanEmail}`);
    console.log(`Admin Role:     admin`);
    console.log('-------------------------------\n');

  } catch (err) {
    console.error('❌ Failed to create/update administrator:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
