const fs = require('fs');

const pages = ['index.html', 'terms.html', 'refund.html', 'privacy.html', 'help.html'];

pages.forEach(p => {
  const html = fs.readFileSync(p, 'utf8');
  const hStart = html.indexOf('<header>');
  const hEnd = html.indexOf('</header>') + 9;
  const headerHtml = html.slice(hStart, hEnd);
  console.log(`\n=== ${p} Header ===`);
  console.log(headerHtml.trim());
});
