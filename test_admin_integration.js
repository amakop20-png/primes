const fs = require('fs');
const path = require('path');

console.log('=== NURAXQ ADMIN & FAVICON INTEGRATION AUDIT ===\n');

// 1. Audit Favicon Files
console.log('1. Favicon Assets Verification:');
const requiredAssets = ['favicon.ico', 'favicon.png', 'favicon.svg', 'nuraxq-icon.png'];
for (const asset of requiredAssets) {
  const p = path.join(__dirname, asset);
  if (fs.existsSync(p)) {
    console.log(`  ✓ ${asset} exists (${fs.statSync(p).size} bytes)`);
  } else {
    console.error(`  ✗ ${asset} MISSING`);
  }
}

// 2. Audit Favicon references in all HTML files
console.log('\n2. Favicon HTML References Verification:');
const htmlFiles = [
  'dashboard.html',
  'index.html',
  'login.html',
  'signup.html',
  'admin.html',
  'buy.html',
  'terms.html',
  'privacy.html',
  'help.html',
  'refund.html'
];

for (const h of htmlFiles) {
  const content = fs.readFileSync(path.join(__dirname, h), 'utf8');
  const hasIco = content.includes('favicon.ico');
  const hasPng = content.includes('favicon.png') || content.includes('nuraxq-icon.png');
  const hasSvg = content.includes('favicon.svg');
  if (hasIco && hasPng && hasSvg) {
    console.log(`  ✓ ${h}: All favicon link tags present (ICO, PNG, SVG)`);
  } else {
    console.warn(`  ⚠ ${h}: Missing some tags: ico=${hasIco}, png=${hasPng}, svg=${hasSvg}`);
  }
}

// 3. Audit Admin Route Definitions in routes/admin.js
console.log('\n3. Admin Router Endpoints Audit (routes/admin.js):');
const adminRouteFile = fs.readFileSync(path.join(__dirname, 'routes/admin.js'), 'utf8');

const documentedEndpoints = [
  { method: 'POST', path: '/auth/login', desc: 'Admin login' },
  { method: 'GET',  path: '/auth/me', desc: 'Current admin profile' },
  { method: 'POST', path: '/auth/logout', desc: 'Admin logout' },
  { method: 'POST', path: '/auth/register', desc: 'Provision admin via setup key' },
  { method: 'GET',  path: '/dashboard/stats', desc: 'Dashboard overview stats' },
  { method: 'GET',  path: '/users', desc: 'List users with pagination & search' },
  { method: 'GET',  path: '/users/:id', desc: 'Get single user with wallet & VA' },
  { method: 'PATCH', path: '/users/:id', desc: 'Update user profile' },
  { method: 'POST', path: '/users/:id/suspend', desc: 'Suspend user' },
  { method: 'POST', path: '/users/:id/unsuspend', desc: 'Unsuspend user' },
  { method: 'GET',  path: '/wallets', desc: 'List wallets with isFrozen filter' },
  { method: 'GET',  path: '/wallets/:userId', desc: 'Get user wallet' },
  { method: 'POST', path: '/wallets/:userId/credit', desc: 'Credit user wallet' },
  { method: 'POST', path: '/wallets/:userId/debit', desc: 'Debit user wallet' },
  { method: 'POST', path: '/wallets/:userId/freeze', desc: 'Freeze user wallet' },
  { method: 'POST', path: '/wallets/:userId/unfreeze', desc: 'Unfreeze user wallet' },
  { method: 'GET',  path: '/transactions', desc: 'List transactions with filters' },
  { method: 'GET',  path: '/transactions/:id', desc: 'Get transaction by ID/ref' },
  { method: 'PATCH', path: '/transactions/:id/status', desc: 'Update transaction status' },
  { method: 'GET',  path: '/virtual-accounts', desc: 'List virtual accounts' },
  { method: 'GET',  path: '/virtual-accounts/:userId', desc: 'Get user virtual account' },
  { method: 'GET',  path: '/announcements/active', desc: 'Get active announcement' },
  { method: 'GET',  path: '/announcements', desc: 'List announcements' },
  { method: 'POST', path: '/announcements', desc: 'Create/update announcement' }
];

let allRoutesPresent = true;
for (const ep of documentedEndpoints) {
  const pattern = new RegExp(`router\\.${ep.method.toLowerCase()}\\s*\\(\\s*['"]${ep.path.replace(/:[a-zA-Z]+/g, ':[a-zA-Z]+')}['"]`);
  const found = pattern.test(adminRouteFile);
  if (found) {
    console.log(`  ✓ ${ep.method} /api/admin${ep.path} - ${ep.desc}`);
  } else {
    console.error(`  ✗ MISSING: ${ep.method} /api/admin${ep.path} - ${ep.desc}`);
    allRoutesPresent = false;
  }
}

// 4. Audit Server.js Mounting
console.log('\n4. Server.js Mount Verification:');
const serverFile = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const mountsAdmin = serverFile.includes("app.use('/api/admin', adminRoutes)");
const mountsAnnouncements = serverFile.includes("app.get('/api/announcements/active'");
console.log(`  ${mountsAdmin ? '✓' : '✗'} app.use('/api/admin', adminRoutes) mounted`);
console.log(`  ${mountsAnnouncements ? '✓' : '✗'} /api/announcements/active alias mounted`);

console.log('\n=== AUDIT SUMMARY: ' + (allRoutesPresent && mountsAdmin ? 'ALL 21+ ADMIN ROUTES REGISTERED & VERIFIED' : 'ISSUES DETECTED') + ' ===');
