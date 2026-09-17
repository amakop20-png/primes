const API_BASE_URL = 'https://nurasms-api.onrender.com';
const USERNAME = 'prince34';
const PASSWORD = 'prince34$#';

async function testFlow() {
    console.log(`[Test] 1. Attempting login for user: ${USERNAME}...`);
    
    let token;
    try {
        const loginRes = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: USERNAME, password: PASSWORD })
        });
        
        const loginData = await loginRes.json();
        
        if (!loginRes.ok) {
            console.error(`[Error] Login failed! Status: ${loginRes.status}, Message:`, loginData.message);
            console.error(`[Test] Aborting test flow because authentication failed.`);
            return;
        }
        
        token = loginData.token || loginData.accessToken;
        console.log(`[Test] ✓ Login successful. Token obtained.`);
    } catch (err) {
        console.error(`[Error] Network error during login:`, err.message);
        return;
    }

    console.log(`\n[Test] 2. Testing Wallet Balance Endpoint...`);
    try {
        const walletRes = await fetch(`${API_BASE_URL}/api/get-wallet-balance`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const walletData = await walletRes.json();
        console.log(`[Test] Wallet Status: ${walletRes.status}`);
        console.log(`[Test] Wallet Data:`, walletData);
    } catch (err) {
        console.error(`[Error] Failed to fetch wallet:`, err.message);
    }

    console.log(`\n[Test] 3. Testing Virtual Account Endpoint...`);
    try {
        const vaRes = await fetch(`${API_BASE_URL}/api/get-virtual-account`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const vaData = await vaRes.json();
        console.log(`[Test] Virtual Account Status: ${vaRes.status}`);
        console.log(`[Test] Virtual Account Data:`, vaData);
    } catch (err) {
        console.error(`[Error] Failed to fetch virtual account:`, err.message);
    }

    console.log(`\n[Test] 4. Testing Transactions Endpoint...`);
    try {
        const txRes = await fetch(`${API_BASE_URL}/api/get-transactions?page=1&limit=5`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const txData = await txRes.json();
        console.log(`[Test] Transactions Status: ${txRes.status}`);
        console.log(`[Test] Transactions Data:`, txData);
    } catch (err) {
        console.error(`[Error] Failed to fetch transactions:`, err.message);
    }
}

testFlow();
