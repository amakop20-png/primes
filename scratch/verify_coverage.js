const fs = require('fs');

const stylesCss = fs.readFileSync('styles.css', 'utf8');
const policyCss = fs.readFileSync('policy.css', 'utf8');
const helpCss   = fs.readFileSync('help.css', 'utf8');

function checkPage(filename, extraCss) {
  const html = fs.readFileSync(filename, 'utf8');
  console.log(`\n=== Checking classes in ${filename} against styles.css + ${extraCss === policyCss ? 'policy.css' : 'help.css'} ===`);
  const classMatches = html.match(/class=["']([^"']*)["']/g) || [];
  const classes = new Set();
  classMatches.forEach(m => {
    const val = m.replace(/class=["']/, '').replace(/["']$/, '');
    val.split(/\s+/).forEach(c => {
      if (c && !c.startsWith('ph-') && c !== 'ph') classes.add(c);
    });
  });

  const combinedCss = stylesCss + '\n' + extraCss;
  const missing = [];
  classes.forEach(c => {
    if (!combinedCss.includes('.' + c) && !combinedCss.includes(c)) {
      missing.push(c);
    }
  });

  if (missing.length === 0) {
    console.log(`All ${classes.size} classes are defined in styles.css + specific css!`);
  } else {
    console.log(`Missing classes (${missing.length}):`, missing);
  }
}

checkPage('terms.html', policyCss);
checkPage('refund.html', policyCss);
checkPage('privacy.html', policyCss);
checkPage('help.html', helpCss);
