/**
 * diagnose.js
 * Comprehensive diagnostic script for NuraSMS API
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_BASE_URL = 'https://nurasms-api.onrender.com';

async function logResponse(stepName, method, endpoint, payload, response) {
    const status = response.status;
    const text = await response.text();
    console.log(`\n======================================================`);
    console.log(`[${stepName}]`);
    console.log(`Request URL:    ${API_BASE_URL}${endpoint}`);
    console.log(`HTTP Method:    ${method}`);
    if (payload) {
        console.log(`Request Body:   ${JSON.stringify(payload, null, 2)}`);
    } else {
        console.log(`Request Body:   None`);
    }
    console.log(`Response Status:${status}`);
    console.log(`Response Body:  ${text}`);
    console.log(`======================================================\n`);
    
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (_) {}
    return { status, text, json };
}

async function runDiagnostics() {
    console.log('######################################################');
    console.log('     NURASMS API BACKEND DIAGNOSTIC TEST SUITE        ');
    console.log('######################################################');

    // ── STEP 1: Signup ──
    const rand = Math.floor(1000000 + Math.random() * 9000000);
    const signupPayload = {
        username: `diag_${rand}`,
        email: `diag_${rand}@testdomain.com`,
        password: 'Password123!',
        firstName: 'Diag',
        lastName: 'Tester',
        phoneNumber: `+2348${rand}`
    };

    const signupRes = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupPayload)
    });
    const signupData = await logResponse('STEP 1: Signup', 'POST', '/api/signup', signupPayload, signupRes);

    // ── STEP 2: Login ──
    const loginPayload = {
        identifier: signupPayload.email,
        password: signupPayload.password
    };
    const loginRes = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload)
    });
    const loginData = await logResponse('STEP 2: Login', 'POST', '/api/login', loginPayload, loginRes);

    const token = loginData.json?.token || loginData.json?.accessToken || loginData.json?.access_token;
    if (!token) {
        console.error('FATAL: Could not obtain JWT token from login.');
        return;
    }
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // ── STEP 3: Initial Wallet Balance ──
    const wRes1 = await fetch(`${API_BASE_URL}/api/get-wallet-balance`, {
        method: 'GET',
        headers: authHeaders
    });
    await logResponse('STEP 3: Initial Wallet Balance', 'GET', '/api/get-wallet-balance', null, wRes1);

    // ── STEP 4: Buy Activation (Albania / 99app) ──
    const buyPayload1 = {
        country: 'albania',
        product: '99app'
    };
    const buyRes1 = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(buyPayload1)
    });
    const buyData1 = await logResponse('STEP 4: Buy Activation (Albania / 99app)', 'POST', '/api/buy/activation', buyPayload1, buyRes1);

    // ── STEP 5: Create Virtual Account ──
    const vaPayload = { currency: 'NGN' };
    const vaRes = await fetch(`${API_BASE_URL}/api/create-virtual-account`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(vaPayload)
    });
    await logResponse('STEP 5: Create Virtual Account', 'POST', '/api/create-virtual-account', vaPayload, vaRes);

    // ── STEP 6: Check Wallet Balance After Virtual Account ──
    const wRes2 = await fetch(`${API_BASE_URL}/api/get-wallet-balance`, {
        method: 'GET',
        headers: authHeaders
    });
    await logResponse('STEP 6: Wallet Balance After VA', 'GET', '/api/get-wallet-balance', null, wRes2);

    // ── STEP 7: Buy Activation After Virtual Account (Albania / 99app) ──
    const buyRes2 = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(buyPayload1)
    });
    const buyData2 = await logResponse('STEP 7: Buy Activation After VA (Albania / 99app)', 'POST', '/api/buy/activation', buyPayload1, buyRes2);

    // ── STEP 8: Test Other Supported Payloads ──
    const testPayloads = [
        { label: '8A: USA / WhatsApp', payload: { country: 'usa', product: 'whatsapp' } },
        { label: '8B: USA / Telegram', payload: { country: 'usa', product: 'telegram' } },
        { label: '8C: Albania / 99app with Price', payload: { country: 'albania', product: '99app', price: 100 } }
    ];

    let capturedOrder = null;

    for (const item of testPayloads) {
        const res = await fetch(`${API_BASE_URL}/api/buy/activation`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(item.payload)
        });
        const d = await logResponse(`STEP ${item.label}`, 'POST', '/api/buy/activation', item.payload, res);
        if (d.json && (d.json.order || d.json.id)) {
            capturedOrder = d.json.order || d.json;
        }
    }

    // ── STEP 9: Step 4 Order Status Check (GET /api/order/:orderId) ──
    const testOrderId = (capturedOrder && (capturedOrder.id || capturedOrder._id || capturedOrder.orderId)) || '1080296451';
    console.log(`\nTesting Step 4 Order Check Endpoint with Order ID: ${testOrderId}...`);
    const orderRes = await fetch(`${API_BASE_URL}/api/order/${encodeURIComponent(testOrderId)}`, {
        method: 'GET',
        headers: authHeaders
    });
    await logResponse('STEP 9: Check Order (GET /api/order/:orderId)', 'GET', `/api/order/${testOrderId}`, null, orderRes);
}

runDiagnostics().catch(console.error);
