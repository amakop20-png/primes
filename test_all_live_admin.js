process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function test(path, method = 'GET', body = null, headers = {}) {
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
        console.log(`${method} ${path} -> ${res.statusCode} | ${data.slice(0, 150)}`);
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('timeout', () => {
      console.log(`TIMEOUT: ${method} ${path}`);
      req.destroy();
      resolve({ error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      console.log(`ERROR: ${method} ${path} -> ${err.message}`);
      resolve({ error: err.message });
    });

    if (dataStr) req.write(dataStr);
    req.end();
  });
}

(async () => {
  console.log('--- TESTING ADMIN ROUTES ON LIVE RENDER ---');
  await test('/api/admin/auth/login', 'POST', { email: 'wrong@test.com', password: 'wrong' });
  await test('/api/admin/auth/me', 'GET');
  await test('/api/admin/dashboard/stats', 'GET');
  await test('/api/admin/users', 'GET');
  await test('/api/admin/wallets', 'GET');
  await test('/api/admin/virtual-accounts', 'GET');
  await test('/api/admin/transactions', 'GET');
  await test('/api/announcements/active', 'GET');
  await test('/api/admin/announcements/active', 'GET');
})();
