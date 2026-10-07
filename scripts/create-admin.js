// scripts/create-admin.js - Secure Admin Account Provisioning Script
// Loads environment variables cleanly with fallback if dotenv is not yet installed
try {
  require('dotenv').config();
} catch (_) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  try {
    bcrypt = require('bcrypt');
  } catch (_) {
    const crypto = require('crypto');
    bcrypt = {
      hash: async (pwd) => '$pbkdf2$' + crypto.scryptSync(pwd, 'nuraxq_salt', 32).toString('hex'),
      compare: async (pwd, hash) => hash === ('$pbkdf2$' + crypto.scryptSync(pwd, 'nuraxq_salt', 32).toString('hex'))
    };
  }
}

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
  let name = args[2] || 'Administrator';

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

  console.log(`Checking database records for ${cleanEmail}...`);

  try {
    const existing = await db.findUserByEmailOrUsername(cleanEmail);
    const pool = db.getPool();
    const mongoose = db.getMongoose();

    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      console.log(`Account '${cleanEmail}' exists. Updating privileges to 'admin' and resetting password hash...`);
      
      // MongoDB Update
      if (db.dbType === 'mongo' && mongoose) {
        const User = mongoose.models.User;
        if (User) {
          await User.updateOne(
            { _id: existing._id || existing.id },
            { $set: { role: 'admin', is_admin: true, isAdmin: true, password: passwordHash } }
          );
        }
      }

      // PostgreSQL Update
      if (pool) {
        await pool.query(`
          UPDATE users
          SET role = 'admin', password_hash = $1, is_suspended = FALSE, updated_at = NOW()
          WHERE LOWER(email) = $2 OR LOWER(username) = $2
        `, [passwordHash, cleanEmail]);
      }

      console.log(`✅ Administrator account '${cleanEmail}' updated successfully.`);
    } else {
      console.log(`Creating new administrator account '${cleanEmail}'...`);
      
      // MongoDB Insert
      if (db.dbType === 'mongo' && mongoose) {
        const User = mongoose.models.User || mongoose.model('User');
        if (User) {
          await User.create({
            email: cleanEmail,
            username: username,
            firstName: name,
            lastName: 'Admin',
            password: passwordHash,
            role: 'admin',
            is_admin: true,
            isAdmin: true,
            isSuspended: false,
            balance: 0
          });
        }
      }

      // PostgreSQL Insert
      if (pool) {
        await pool.query(`
          INSERT INTO users (email, username, first_name, last_name, password_hash, role, balance)
          VALUES ($1, $2, $3, 'Admin', $4, 'admin', 0)
        `, [cleanEmail, username, name, passwordHash]);
      }

      console.log(`✅ Administrator account '${cleanEmail}' created successfully.`);
    }

    console.log('\n----------------------------------------------------');
    console.log('  Admin Account Ready for Login:');
    console.log(`  Login Page:     admin.html`);
    console.log(`  API Endpoint:   POST /api/admin/auth/login`);
    console.log(`  Admin Email:    ${cleanEmail}`);
    console.log(`  Admin Role:     admin`);
    console.log('----------------------------------------------------\n');

  } catch (err) {
    console.error('❌ Failed to create/update administrator:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
