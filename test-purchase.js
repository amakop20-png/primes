/**
 * test-purchase.js
 * In-depth diagnostics and flow verification
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_BASE_URL = 'https://nurasms-api.onrender.com';

async function run() {
    const rand = Math.floor(1000000 + Math.random() * 9000000);
    const testUser = {
        username: `diag_${rand}`,
        email: `diag_${rand}@testdomain.com`,
        password: 'Password123!',
        firstName: 'Diag',
        lastName: 'Tester',
        phoneNumber: `+2348${rand}`
    };

    console.log('[1] Signing up...');
    await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
    });

    console.log('[2] Logging in...');
    const loginRes = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testUser.email, password: testUser.password })
    });
    const loginData = await loginRes.json();
    const token = loginData.token || loginData.accessToken;

    console.log('[3] Checking wallet balance...');
    const wRes = await fetch(`${API_BASE_URL}/api/get-wallet-balance`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Wallet Status:', wRes.status, await wRes.text());

    // Test A: Albania 99app with extra fields
    console.log('\n[4A] Buying Albania 99app with { country, product, service, currency, operator, price }...');
    const resA = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ country: 'albania', product: '99app', service: '99app', currency: 'NGN', operator: 'any', price: 0 })
    });
    console.log('Status A:', resA.status, await resA.text());

    // Test B: Albania 99app with clean { country, product }
    console.log('\n[4B] Buying Albania 99app with clean { country, product }...');
    const resB = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ country: 'albania', product: '99app' })
    });
    console.log('Status B:', resB.status, await resB.text());

    // Test C: USA whatsapp with clean { country, product }
    console.log('\n[4C] Buying USA whatsapp with clean { country, product }...');
    const resC = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ country: 'usa', product: 'whatsapp' })
    });
    console.log('Status C:', resC.status, await resC.text());

    // Test D: Provision virtual account first, then buy
    console.log('\n[5] Provisioning Virtual Account...');
    const vaRes = await fetch(`${API_BASE_URL}/api/create-virtual-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currency: 'NGN' })
    });
    console.log('VA Status:', vaRes.status, await vaRes.text());

    console.log('[6] Checking wallet balance after VA:');
    const wRes2 = await fetch(`${API_BASE_URL}/api/get-wallet-balance`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Wallet Status 2:', wRes2.status, await wRes2.text());

    console.log('\n[7] Buying Albania 99app after VA:');
    const resD = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ country: 'albania', product: '99app' })
    });
    console.log('Status D:', resD.status, await resD.text());
}

run();
