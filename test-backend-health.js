// test-backend-health.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function checkEndpoint(path, method = 'GET', headers = {}) {
    return new Promise((resolve) => {
        const u = new URL(`https://nurasms-api.onrender.com${path}`);
        const req = https.request({
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: method,
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: body.substring(0, 300)
                });
            });
        });
        req.on('error', (err) => {
            resolve({ error: err.message, code: err.code });
        });
        req.end();
    });
}

(async () => {
    console.log('Testing Backend Health & CORS headers...\n');

    // 1. Root / health
    const root = await checkEndpoint('/');
    console.log('1. GET / status:', root.status || root.error);
    console.log('   CORS header:', root.headers ? root.headers['access-control-allow-origin'] : 'None');

    // 2. OPTIONS preflight check for CORS
    const options = await checkEndpoint('/api/buy/activation', 'OPTIONS', {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization,Content-Type'
    });
    console.log('\n2. OPTIONS /api/buy/activation status:', options.status || options.error);
    console.log('   CORS Allow-Origin:', options.headers ? options.headers['access-control-allow-origin'] : 'None');
    console.log('   CORS Allow-Methods:', options.headers ? options.headers['access-control-allow-methods'] : 'None');
    console.log('   CORS Allow-Headers:', options.headers ? options.headers['access-control-allow-headers'] : 'None');

    // 3. GET /api/countries
    const countries = await checkEndpoint('/api/countries');
    console.log('\n3. GET /api/countries status:', countries.status || countries.error);
    console.log('   CORS Allow-Origin:', countries.headers ? countries.headers['access-control-allow-origin'] : 'None');

    // 4. GET /api/products/usa
    const products = await checkEndpoint('/api/products/usa');
    console.log('\n4. GET /api/products/usa status:', products.status || products.error);

    // 5. GET /api/get-wallet-balance?currency=NGN (unauth)
    const walletNGN = await checkEndpoint('/api/get-wallet-balance?currency=NGN');
    console.log('\n5. GET /api/get-wallet-balance?currency=NGN status:', walletNGN.status || walletNGN.error);
    console.log('   Body:', walletNGN.body);

    // 6. GET /api/get-wallet-balance?currency=USD (unauth)
    const walletUSD = await checkEndpoint('/api/get-wallet-balance?currency=USD');
    console.log('\n6. GET /api/get-wallet-balance?currency=USD status:', walletUSD.status || walletUSD.error);
    console.log('   Body:', walletUSD.body);
})();
