// inspect-transactions.js - READ-ONLY
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function request(url, token) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        https.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = body;
                try { parsed = JSON.parse(body); } catch(e) {}
                resolve({ status: res.statusCode, body: parsed });
            });
        }).on('error', reject);
    });
}

(async () => {
    console.log('--- Inspecting USA products around ₦55 ---');
    const u = new URL('https://nurasms-api.onrender.com/api/products/usa');
    const prodRes = await new Promise(resolve => {
        https.get(u, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        });
    });

    const products = prodRes.products || prodRes;
    for (let k of ['signal', 'aliexpress', 'tinder', 'aol', 'airbnb', 'alibaba']) {
        if (products[k]) {
            console.log(`[${k}]`, products[k]);
        }
    }
})();
