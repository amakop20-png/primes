const fs = require('fs');

const styleCss = fs.readFileSync('style.css', 'utf8');

['terms.html', 'refund.html', 'privacy.html', 'help.html'].forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  console.log(`\n=== Matching classes in ${file} ===`);
  const classMatches = html.match(/class=["']([^"']*)["']/g) || [];
  const classes = new Set();
  classMatches.forEach(m => {
    const val = m.replace(/class=["']/, '').replace(/["']$/, '');
    val.split(/\s+/).forEach(c => classes.add(c));
  });

  classes.forEach(c => {
    if (styleCss.includes('.' + c)) {
      console.log(`- .${c}`);
    }
  });
});
