// tests/test-wallet-isolation.js
// Automated verification suite for the 8 required test scenarios

const http = require('http');
const express = require('express');
const path = require('path');

// Load environment
try { require('dotenv').config(); } catch (_) {}

// Import main server and db
const db = require('../db');
const authRoutes = require('../routes/auth');
const walletRoutes = require('../routes/wallet');
const adminRoutes = require('../routes/admin');

// Construct isolated test server instance
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.post('/api/login', (req, res) => { req.url = '/login'; authRoutes(req, res); });
app.post('/api/signup', (req, res) => { req.url = '/signup'; authRoutes(req, res); });
app.get('/api/me', (req, res) => { req.url = '/me'; authRoutes(req, res); });

app.use('/api', walletRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

const TEST_PORT = 3456;
let server = null;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING NURAXQ WALLET ACCOUNT ISOLATION TEST SUITE');
  console.log('====================================================\n');

  const timestamp = Date.now().toString(36);
  const userA_email = `usera_${timestamp}@test.com`;
  const userA_user = `userA_${timestamp}`;
  const userB_email = `userb_${timestamp}@test.com`;
  const userB_user = `userB_${timestamp}`;
  const password = 'Password123!';

  let userA_token = null;
  let userA_id = null;
  let userB_token = null;
  let userB_id = null;

  try {
    // ---------------------------------------------------------
    // TEST 1: Register User A. Confirm new wallet is created with initial balance 0.
    // ---------------------------------------------------------
    console.log('👉 TEST 1: Register User A and verify new isolated wallet (balance = ₦0)...');
    const resA = await request('/api/signup', {
      method: 'POST',
      body: {
        firstName: 'Alice',
        lastName: 'Adebayo',
        username: userA_user,
        email: userA_email,
        phoneNumber: '+2348011112222',
        password: password
      }
    });

    if (resA.status !== 201 || !resA.data?.token) {
      throw new Error(`TEST 1 FAILED: Could not register User A: ${JSON.stringify(resA.data)}`);
    }

    userA_token = resA.data.token;
    userA_id = resA.data.user?.id || resA.data.userId;

    // Verify initial balance via /api/get-wallet-balance
    const balA = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${userA_token}` }
    });

    if (balA.status !== 200 || balA.data?.balance !== 0) {
      throw new Error(`TEST 1 FAILED: Expected balance 0, got status ${balA.status}, data: ${JSON.stringify(balA.data)}`);
    }
    console.log(`✅ TEST 1 PASSED: User A registered (ID: ${userA_id}). Wallet balance = ₦${balA.data.balance}.\n`);

    // ---------------------------------------------------------
    // TEST 2: Fund User A's wallet. Confirm backend balance updates.
    // ---------------------------------------------------------
    console.log('👉 TEST 2: Fund User A wallet with ₦5,000 via backend recharge...');
    const fundRefA = `PSTK-TEST-${Date.now()}-A`;
    const fundA = await request('/api/wallet/recharge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userA_token}` },
      body: {
        amount: 5000,
        reference: fundRefA,
        currency: 'NGN'
      }
    });

    if (fundA.status !== 200 || fundA.data?.balance !== 5000) {
      throw new Error(`TEST 2 FAILED: Expected balance 5000, got: ${JSON.stringify(fundA.data)}`);
    }

    // Double check via GET /api/get-wallet-balance
    const balAAfter = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${userA_token}` }
    });
    if (balAAfter.data?.balance !== 5000) {
      throw new Error(`TEST 2 FAILED: Backend wallet did not persist ₦5000. Got: ${balAAfter.data?.balance}`);
    }
    console.log(`✅ TEST 2 PASSED: User A wallet funded. Backend balance updated to ₦${balAAfter.data.balance}.\n`);

    // ---------------------------------------------------------
    // TEST 3: Log out and register User B. Confirm User B receives a separate wallet.
    // ---------------------------------------------------------
    console.log('👉 TEST 3: Register User B under a completely new account...');
    const resB = await request('/api/signup', {
      method: 'POST',
      body: {
        firstName: 'Bob',
        lastName: 'Bello',
        username: userB_user,
        email: userB_email,
        phoneNumber: '+2348033334444',
        password: password
      }
    });

    if (resB.status !== 201 || !resB.data?.token) {
      throw new Error(`TEST 3 FAILED: Could not register User B: ${JSON.stringify(resB.data)}`);
    }
    userB_token = resB.data.token;
    userB_id = resB.data.user?.id || resB.data.userId;

    const balB = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${userB_token}` }
    });

    if (balB.status !== 200 || balB.data?.balance !== 0) {
      throw new Error(`TEST 3 FAILED: Expected User B balance 0, got: ${JSON.stringify(balB.data)}`);
    }
    console.log(`✅ TEST 3 PASSED: User B registered (ID: ${userB_id}). Separate wallet initialized with ₦${balB.data.balance}.\n`);

    // ---------------------------------------------------------
    // TEST 4: Confirm User B cannot see User A's balance or transaction history.
    // ---------------------------------------------------------
    console.log("👉 TEST 4: Confirm User B cannot see User A's balance or transactions...");
    const txB = await request('/api/get-transactions', {
      headers: { Authorization: `Bearer ${userB_token}` }
    });

    if (txB.status !== 200 || !Array.isArray(txB.data?.transactions)) {
      throw new Error(`TEST 4 FAILED: Transactions endpoint error: ${JSON.stringify(txB.data)}`);
    }

    if (txB.data.transactions.length !== 0) {
      throw new Error(`TEST 4 FAILED: User B saw transactions from another user! Found: ${JSON.stringify(txB.data.transactions)}`);
    }

    if (balB.data?.balance === 5000) {
      throw new Error(`TEST 4 FAILED: User B inherited User A's ₦5000 balance!`);
    }
    console.log(`✅ TEST 4 PASSED: User B wallet is 100% isolated: balance is ₦0, and transactions count is 0.\n`);

    // ---------------------------------------------------------
    // TEST 5: Log out and sign back into User A. Confirm original User A balance restored.
    // ---------------------------------------------------------
    console.log('👉 TEST 5: Authenticate back into User A and confirm ₦5,000 balance is preserved in DB...');
    const loginA = await request('/api/login', {
      method: 'POST',
      body: {
        identifier: userA_email,
        password: password
      }
    });

    if (loginA.status !== 200 || !loginA.data?.token) {
      throw new Error(`TEST 5 FAILED: Login failed for User A: ${JSON.stringify(loginA.data)}`);
    }
    const freshTokenA = loginA.data.token;

    const restoredBalA = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${freshTokenA}` }
    });

    if (restoredBalA.data?.balance !== 5000) {
      throw new Error(`TEST 5 FAILED: Expected restored balance 5000, got: ${restoredBalA.data?.balance}`);
    }

    const txA = await request('/api/get-transactions', {
      headers: { Authorization: `Bearer ${freshTokenA}` }
    });
    if (txA.data?.transactions?.length !== 1 || txA.data.transactions[0].reference !== fundRefA) {
      throw new Error(`TEST 5 FAILED: User A transaction history missing or corrupted: ${JSON.stringify(txA.data)}`);
    }
    console.log(`✅ TEST 5 PASSED: User A logged in; DB restored balance ₦${restoredBalA.data.balance} and verified 1 transaction.\n`);

    // ---------------------------------------------------------
    // TEST 6: Purchase a virtual number / debit wallet. Confirm only purchasing user is debited.
    // ---------------------------------------------------------
    console.log('👉 TEST 6: Process purchase debit on User A. Confirm only User A is charged, not User B...');
    // Directly invoke db.debitUserWallet simulating virtual number purchase deduction
    const debitRes = await db.debitUserWallet(userA_id, 1200, `BUY-TEST-${Date.now()}`, 'Telegram virtual number purchase');

    if (debitRes.balance !== 3800) {
      throw new Error(`TEST 6 FAILED: Expected User A balance 3800, got: ${debitRes.balance}`);
    }

    // Verify User A balance is now 3800
    const checkA = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${freshTokenA}` }
    });
    if (checkA.data?.balance !== 3800) {
      throw new Error(`TEST 6 FAILED: User A backend balance is ${checkA.data?.balance}, expected 3800`);
    }

    // Verify User B balance is STILL 0
    const checkB = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${userB_token}` }
    });
    if (checkB.data?.balance !== 0) {
      throw new Error(`TEST 6 FAILED: User B balance was affected! Value: ${checkB.data?.balance}`);
    }
    console.log(`✅ TEST 6 PASSED: User A debited by ₦1,200 (balance: ₦3,800). User B balance remained strictly ₦0.\n`);

    // ---------------------------------------------------------
    // TEST 7: Log in from another browser/session. Confirm actual DB balance retrieved.
    // ---------------------------------------------------------
    console.log('👉 TEST 7: New session login simulation. Confirm DB balance ₦3,800 is retrieved...');
    const sessionRes = await request('/api/login', {
      method: 'POST',
      body: {
        identifier: userA_user, // test login by username
        password: password
      }
    });

    const newDeviceToken = sessionRes.data?.token;
    const deviceBal = await request('/api/get-wallet-balance', {
      headers: { Authorization: `Bearer ${newDeviceToken}` }
    });

    if (deviceBal.data?.balance !== 3800) {
      throw new Error(`TEST 7 FAILED: Expected 3800 from new session, got ${deviceBal.data?.balance}`);
    }
    console.log(`✅ TEST 7 PASSED: Second session/device successfully retrieved authoritative DB balance: ₦${deviceBal.data.balance}.\n`);

    // ---------------------------------------------------------
    // TEST 8: Attempt to access another user's wallet by manipulating parameters.
    // Confirm backend rejects unauthorized access or isolates query strictly to JWT.
    // ---------------------------------------------------------
    console.log("👉 TEST 8: Parameter tampering security test: User B passes ?userId=A to /api/get-wallet-balance...");
    const tampered = await request(`/api/get-wallet-balance?userId=${userA_id}&id=${userA_id}`, {
      headers: { Authorization: `Bearer ${userB_token}` }
    });

    if (tampered.data?.balance !== 0 || String(tampered.data?.wallet?.userId) === String(userA_id)) {
      throw new Error(`TEST 8 FAILED: Tampering succeeded! User B saw User A's wallet! Data: ${JSON.stringify(tampered.data)}`);
    }

    // Unauthenticated request
    const unauth = await request('/api/get-wallet-balance');
    if (unauth.status !== 401) {
      throw new Error(`TEST 8 FAILED: Expected 401 for unauthenticated request, got ${unauth.status}`);
    }

    console.log(`✅ TEST 8 PASSED: Backend strictly enforced JWT identity (ignored ?userId parameter) and rejected unauthenticated request with 401.\n`);

    console.log('====================================================');
    console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS');
    console.log('====================================================\n');

  } catch (err) {
    console.error('❌ TEST SUITE FAILURE:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

server = app.listen(TEST_PORT, () => {
  runTests().then(() => {
    server.close();
    process.exit(process.exitCode || 0);
  });
});
