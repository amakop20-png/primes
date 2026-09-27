const fs = require('fs');

['styles.css', 'style.css', 'policy.css', 'help.css'].forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`File ${file} does not exist!`);
    return;
  }
  const css = fs.readFileSync(file, 'utf8');
  console.log(`\n=== Rules in ${file} ===`);
  const lines = css.split('\n');
  lines.forEach((l, i) => {
    if (
      l.includes('header') ||
      l.includes('.header__') ||
      l.includes('themeToggle') ||
      l.includes('dark-theme') ||
      l.includes('--surface') ||
      l.includes('--text')
    ) {
      if (l.trim().endsWith('{') || l.includes(':') && !l.includes(';')) {
        console.log(`${i+1}: ${l.trim()}`);
      } else if (l.includes('header') || l.includes('dark-theme')) {
        console.log(`${i+1}: ${l.trim().slice(0, 80)}`);
      }
    }
  });
});
