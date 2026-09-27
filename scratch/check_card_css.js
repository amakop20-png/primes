const fs = require('fs');

function checkFile(filename) {
  const css = fs.readFileSync(filename, 'utf8');
  const lines = css.split('\n');
  console.log(`=== ${filename} ===`);
  lines.forEach((l, i) => {
    if (
      l.includes('.cards-grid') ||
      l.includes('.card-title') ||
      l.includes('.card-meta') ||
      l.includes('.card-price') ||
      l.includes('.service-icon-badge') ||
      l.includes('.btn-buy') ||
      l.includes('.cards ') ||
      l.includes('.card {') ||
      l.includes('.card[') ||
      l.includes('.card.') ||
      l.includes('.buy-container')
    ) {
      console.log((i+1) + ': ' + l.trim());
    }
  });
}

checkFile('buy.css');
checkFile('styles.css');
