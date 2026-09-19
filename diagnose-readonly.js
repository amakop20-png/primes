// diagnose-readonly.js - STRICTLY READ-ONLY (NO PURCHASES)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

console.log('======================================================');
console.log('   SAFE READ-ONLY INSPECTION (NO PURCHASES AT ALL)    ');
console.log('======================================================\n');

function request(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const reqOpts = {
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        if (postData) {
            reqOpts.headers['Content-Length'] = Buffer.byteLength(postData);
        }
        const req = https.request(reqOpts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = body;
                try { parsed = JSON.parse(body); } catch(e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

(async () => {
    try {
        // 1. Inspect Products for USA
        console.log('--- 1. Inspecting Products & Raw Prices for USA ---');
        const prodRes = await request('https://nurasms-api.onrender.com/api/products/usa');
        console.log('Products API Status:', prodRes.status);
        if (prodRes.body) {
            const raw = prodRes.body.products || prodRes.body;
            const sampleKeys = Object.keys(raw).slice(0, 10);
            console.log('Sample product keys:', sampleKeys);
            for (let k of ['whatsapp', 'telegram', 'aliexpress', 'google', 'tinder']) {
                if (raw[k]) {
                    console.log(`\nRaw structure for "${k}":`, JSON.stringify(raw[k], null, 2));
                }
            }
        }

        // 2. Inspect Products for Nigeria
        console.log('\n--- 2. Inspecting Products & Raw Prices for Nigeria ---');
        const ngRes = await request('https://nurasms-api.onrender.com/api/products/nigeria');
        if (ngRes.body) {
            const raw = ngRes.body.products || ngRes.body;
            for (let k of ['whatsapp', 'telegram', 'google']) {
                if (raw[k]) {
                    console.log(`\nRaw structure for Nigeria "${k}":`, JSON.stringify(raw[k], null, 2));
                }
            }
        }
    } catch (e) {
        console.error('Diagnostic error:', e);
    }
})();
