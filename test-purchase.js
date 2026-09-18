const API_BASE_URL = 'https://nurasms-api.onrender.com';
const USERNAME = 'prince34';
const PASSWORD = 'prince34$#';

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('[Test] Logging in...');
    const loginRes = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: USERNAME, password: PASSWORD })
    });
    
    if (!loginRes.ok) {
        console.log('Login failed:', await loginRes.text());
        return;
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token || loginData.accessToken;
    console.log('[Test] Logged in. Token:', token.substring(0, 10) + '...');

    console.log('[Test] Buying activation number...');
    const buyRes = await fetch(`${API_BASE_URL}/api/buy/activation`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
            country: 'nigeria',
            product: 'whatsapp',
            service: 'whatsapp',
            currency: 'NGN',
            operator: 'any',
            network: 'any'
        })
    });
    
    console.log('[Test] Buy Response status:', buyRes.status);
    const buyData = await buyRes.text();
    console.log('[Test] Buy Response body:', buyData);
    
    let buyJson;
    try {
        buyJson = JSON.parse(buyData);
    } catch(e) {
        return;
    }
    
    if (buyRes.ok && buyJson.id) {
        console.log('[Test] Purchase successful. ID:', buyJson.id, 'Phone:', buyJson.phone);
        
        console.log('[Test] Checking order...');
        for (let i = 0; i < 3; i++) {
            await delay(3000);
            const checkRes = await fetch(`${API_BASE_URL}/api/order/${buyJson.id}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('[Test] Check status:', checkRes.status, await checkRes.text());
        }
    }
}

run();
