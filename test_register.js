process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function test(path, method, body, headers = {}) {
  return new Promise((resolve) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
    };

    const req = https.request({
      hostname: 'nurasms-api.onrender.com',
      port: 443,
      path,
      method,
      headers: reqHeaders,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`${method} ${path} -> ${res.statusCode} | ${data}`);
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('timeout', () => { req.destroy(); resolve({ error: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ error: err.message }));
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

(async () => {
  console.log('Testing /api/admin/auth/register:');
  await test('/api/admin/auth/register', 'POST', { setupKey: 'wrong' });
  await test('/api/admin/auth/register', 'POST', { setupKey: 'primes_admin_setup_key_2026' });
})();
