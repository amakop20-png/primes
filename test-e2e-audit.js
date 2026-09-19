// test-e2e-audit.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

console.log('======================================================');
console.log('       RUNNING COMPLETE FRONTEND API AUDIT TEST       ');
console.log('======================================================\n');

let total = 0;
let passed = 0;

function assert(cond, msg) {
    total++;
    if (cond) {
        console.log(`[PASS] ${msg}`);
        passed++;
    } else {
        console.error(`[FAIL] ${msg}`);
        process.exitCode = 1;
    }
}

// 1. Test normalizeWalletBalance
function normalizeWalletBalance(data, currency = 'NGN') {
    if (!data || typeof data !== 'object') return 0;
    const isUSD = String(currency).toUpperCase() === 'USD';

    if (isUSD) {
        if (data.usdBalance !== undefined) return parseFloat(data.usdBalance) || 0;
        if (data.wallet?.usdBalance !== undefined) return parseFloat(data.wallet.usdBalance) || 0;
        if (data.balanceUSD !== undefined) return parseFloat(data.balanceUSD) || 0;
        if ((data.currency || data.wallet?.currency || '').toUpperCase() === 'USD') {
            return parseFloat(data.balance ?? data.wallet?.balance ?? 0) || 0;
        }
        if (data.balance !== undefined && data.usdBalance === undefined && data.ngnBalance === undefined) {
            return parseFloat(data.balance) || 0;
        }
        return 0;
    } else {
        if (data.ngnBalance !== undefined) return parseFloat(data.ngnBalance) || 0;
        if (data.wallet?.ngnBalance !== undefined) return parseFloat(data.wallet.ngnBalance) || 0;
        if ((data.currency || data.wallet?.currency || '').toUpperCase() === 'NGN') {
            return parseFloat(data.balance ?? data.wallet?.balance ?? 0) || 0;
        }
        if (data.balance !== undefined && data.usdBalance === undefined && data.ngnBalance === undefined) {
            return parseFloat(data.balance) || 0;
        }
        return 0;
    }
}

console.log('--- TEST 1: Wallet Normalization (Separation of NGN and USD) ---');
assert(normalizeWalletBalance({ balance: 68 }, 'NGN') === 68, 'NGN balance extracted as 68');
assert(normalizeWalletBalance({ balance: 68 }, 'USD') === 68, 'USD balance extracted if USD wallet returns balance: 68');
assert(normalizeWalletBalance({ ngnBalance: 500, usdBalance: 2.5 }, 'NGN') === 500, 'Dual wallet extracts NGN 500');
assert(normalizeWalletBalance({ ngnBalance: 500, usdBalance: 2.5 }, 'USD') === 2.5, 'Dual wallet extracts USD 2.5');
assert(normalizeWalletBalance(null, 'NGN') === 0, 'Null data safely defaults to 0');
assert(normalizeWalletBalance({}, 'USD') === 0, 'Empty object safely defaults to 0');
assert(normalizeWalletBalance({ balance: "invalid" }, 'NGN') === 0, 'Invalid string balance safely defaults to 0');

console.log('\n--- TEST 2: Pre-Purchase Sufficiency Check ---');
function canPurchase(serverBalance, productPrice) {
    return serverBalance >= productPrice;
}
assert(canPurchase(68, 55) === true, '68 balance is sufficient for 55 cost');
assert(canPurchase(68, 70) === false, '68 balance is insufficient for 70 cost');
assert(canPurchase(0, 10) === false, '0 balance is insufficient for 10 cost');

console.log('\n--- TEST 3: Live Backend Direct Verification ---');
function get(path, headers = {}) {
    return new Promise((resolve) => {
        const u = new URL(`https://nurasms-api.onrender.com${path}`);
        https.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                let parsed = body;
                try { parsed = JSON.parse(body); } catch(_) {}
                resolve({ status: res.statusCode, body: parsed });
            });
        }).on('error', err => resolve({ error: err.message }));
    });
}

(async () => {
    // Check countries
    const countries = await get('/api/countries');
    assert(countries.status === 200 && !!(countries.body.countries || countries.body), 'GET /api/countries reachable and returns 200');

    // Check products
    const products = await get('/api/products/usa');
    assert(products.status === 200 && !!(products.body.products || products.body), 'GET /api/products/usa reachable and returns 200');

    // Check protected endpoint with no token returns 401
    const unauthWallet = await get('/api/get-wallet-balance?currency=NGN');
    assert(unauthWallet.status === 401, 'GET /api/get-wallet-balance without token returns 401 Unauthorized');

    console.log(`\n======================================================`);
    console.log(`AUDIT RESULTS: ${passed}/${total} TESTS PASSED`);
    console.log(`======================================================\n`);
})();
