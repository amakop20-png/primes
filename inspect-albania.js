// inspect-albania.js - READ-ONLY INSPECTION
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function request(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        https.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {}
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
    console.log('--- Fetching GET /api/products/albania ---');
    const res = await request('https://nurasms-api.onrender.com/api/products/albania');
    console.log('Status:', res.status);
    console.log('Full Response (first 10 items):');
    const raw = res.body.products || res.body;
    const entries = Object.entries(raw);
    console.log(`Total products returned for Albania: ${entries.length}`);
    for (let i = 0; i < Math.min(10, entries.length); i++) {
        console.log(`\n[Product: ${entries[i][0]}]`, JSON.stringify(entries[i][1], null, 2));
    }
    // Check specific popular services
    for (let k of ['99app', 'whatsapp', 'telegram', 'google', 'facebook', 'instagram', 'tiktok']) {
        if (raw[k]) {
            console.log(`\n[Specific Service: ${k}]`, JSON.stringify(raw[k], null, 2));
        } else {
            console.log(`\n[Specific Service: ${k}] NOT FOUND in Albania products.`);
        }
    }
})();
