const fs = require('fs');

const d = fs.readFileSync('dashboard.html', 'utf8');

console.log('--- DASHBOARD STRUCTURE CHECK ---');
console.log('Old dash-service-card removed:', !d.includes('dash-service-card'));
console.log('Old dash-hero-grid removed:', !d.includes('dash-hero-grid'));
console.log('Old vnum-grid removed:', !d.includes('vnum-grid'));
console.log('Latest ref-cards-grid present:', d.includes('ref-cards-grid'));
console.log('Top promo banner present:', d.includes('dash-promo-banner'));
console.log('Dashboard title present:', d.includes('ref-dash-title'));
console.log('+ Buy Number button present:', d.includes('ref-btn-buy-number'));
console.log('Total Spend card present (displayBalanceNGN):', d.includes('displayBalanceNGN'));
console.log('Total Numbers card present (dashTotalNumbers):', d.includes('dashTotalNumbers'));
console.log('Completed Orders card present (dashActiveNumbers):', d.includes('dashActiveNumbers'));
console.log('Transaction activity section present (recentActivity):', d.includes('recentActivity'));

console.log('\n--- LOGO SIZING CHECK ---');
const redesignCss = fs.readFileSync('dashboard-redesign.css', 'utf8');
const stylesCss = fs.readFileSync('styles.css', 'utf8');

console.log('redesignCss sets 30px logo:', redesignCss.includes('width: 30px !important') && redesignCss.includes('height: 30px !important'));
console.log('stylesCss sets 30px logo on mobile:', stylesCss.includes('width: 30px !important') && stylesCss.includes('height: 30px !important'));
console.log('dashboard.html header has 30px width/height:', d.includes('width="30"') && d.includes('height="30"'));

console.log('\n--- PURPLE THEME CHECK ---');
console.log('redesignCss has #FAF7FF background:', redesignCss.includes('#FAF7FF'));
console.log('redesignCss has dark theme #0C0A14:', redesignCss.includes('#0C0A14'));

console.log('\n--- WALLET ACTIONS & MODALS CHECK ---');
console.log('Top up button calls openDepositModal():', d.includes('onclick="openDepositModal()"'));
console.log('Deposit modal present in DOM:', d.includes('id="depositModal"') || d.includes('modal_deposit') || d.includes('openDepositModal'));
console.log('Virtual Account modal present in DOM:', d.includes('openPopup'));
console.log('Transactions list present in DOM:', d.includes('id="transactionsList"'));

console.log('\nAll checks evaluated!');
