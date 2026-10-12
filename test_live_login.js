process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

function test(name, path, method, body, headers = {}) {
  return new Promise((resolve) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
    };

    console.log(`[START] ${name} -> ${method} ${path}`);
    const req = https.request({
      hostname: 'nurasms-api.onrender.com',
      port: 443,
      path,
      method,
      headers: reqHeaders,
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[DONE] ${name} -> Status: ${res.statusCode}`);
        console.log(`       Headers: Content-Type=${res.headers['content-type']}`);
        console.log(`       Body: ${data.slice(0, 500)}`);
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('timeout', () => {
      console.log(`[TIMEOUT] ${name}`);
      req.destroy();
      resolve({ error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      console.log(`[ERROR] ${name} -> ${err.message}`);
      resolve({ error: err.message });
    });

    if (dataStr) req.write(dataStr);
    req.end();
  });
}

(async () => {
  // 1. Root
  await test('Root GET', '/', 'GET');

  // 2. Admin login with fake credentials
  await test('Admin Login Fake', '/api/admin/auth/login', 'POST', {
    email: 'admin_test_nonexistent@example.com',
    password: 'WrongPassword123!'
  });

  // 3. Admin login empty
  await test('Admin Login Empty', '/api/admin/auth/login', 'POST', {});
})();
