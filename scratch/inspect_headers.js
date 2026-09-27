const fs = require('fs');

const files = ['terms.html', 'refund.html', 'privacy.html', 'help.html'];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  console.log(`\n==================== ${f} ====================`);
  const hStart = content.indexOf('<header');
  const hEnd = content.indexOf('</header>') + 9;
  console.log('--- HEADER ---');
  console.log(content.slice(hStart, hEnd));

  console.log('--- SCRIPTS ---');
  const scripts = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach((s, i) => {
    console.log(`Script ${i+1}:`, s.slice(0, 300));
  });
});
