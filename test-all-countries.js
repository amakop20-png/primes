// test-all-countries.js - Read-only test for all country price parsing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const CONVERSION_RATE = 1500;

function request(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
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

function parseProducts(raw) {
    return Object.entries(raw)
        .filter(([, info]) => info && typeof info === 'object')
        .map(([key, info]) => {
            let priceUSD = 0;
            let priceNGN = 0;
            let qty = 0;

            if (info.cost !== undefined && info.Price !== undefined) {
                priceUSD = parseFloat(info.Price) || 0;
                priceNGN = parseFloat(info.cost) || 0;
                qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
            } else if (info.cost !== undefined || info.rate !== undefined) {
                priceNGN = parseFloat(info.cost || info.rate || 0);
                priceUSD = priceNGN / CONVERSION_RATE;
                qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
            } else if (info.Price !== undefined || info.price !== undefined || info.Cost !== undefined) {
                priceUSD = parseFloat(info.Price || info.price || info.Cost || 0);
                priceNGN = priceUSD * CONVERSION_RATE;
                qty = parseInt(info.Qty || info.count || info.qty || info.quantity || 0, 10);
            } else {
                const operators = Object.values(info).filter(v => v && typeof v === 'object');
                if (operators.length > 0) {
                    const validUsdPrices = operators.map(op => parseFloat(op.Price || op.price || 0)).filter(p => p > 0);
                    const validNgnPrices = operators.map(op => parseFloat(op.cost || op.rate || op.Cost || 0)).filter(p => p > 0);
                    priceUSD = validUsdPrices.length > 0 ? Math.min(...validUsdPrices) : 0;
                    priceNGN = validNgnPrices.length > 0 ? Math.min(...validNgnPrices) : 0;
                    if (priceNGN === 0 && priceUSD > 0) priceNGN = priceUSD * CONVERSION_RATE;
                    if (priceUSD === 0 && priceNGN > 0) priceUSD = priceNGN / CONVERSION_RATE;
                    qty = operators.reduce((sum, op) => sum + parseInt(op.count || op.qty || op.quantity || 0, 10), 0);
                }
            }

            return { key, priceUSD, priceNGN, qty };
        })
        .filter(p => p.priceNGN >= 0);
}

(async () => {
    console.log('Testing price extraction across multiple countries...');
    const countries = ['albania', 'usa', 'nigeria', 'ghana', 'india', 'kenya', 'canada', 'germany'];

    for (let c of countries) {
        try {
            const res = await request(`https://nurasms-api.onrender.com/api/products/${c}`);
            if (res.status === 200) {
                const raw = res.body.products || res.body;
                const parsed = parseProducts(raw);
                const sample = parsed.slice(0, 3);
                console.log(`\n[${c.toUpperCase()}] Total services: ${parsed.length}`);
                for (let s of sample) {
                    console.log(`  - ${s.key}: $${s.priceUSD.toFixed(2)} USD | ₦${s.priceNGN.toLocaleString()} NGN (Stock: ${s.qty})`);
                }
            } else {
                console.log(`\n[${c.toUpperCase()}] Status ${res.status}`);
            }
        } catch (e) {
            console.error(`Error testing ${c}:`, e.message);
        }
    }
})();
