const fs = require('fs');

['terms.html', 'refund.html', 'privacy.html', 'help.html'].forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  const styleCss = fs.readFileSync('style.css', 'utf8');
  console.log(`\n=== Analyzing ${file} for style.css usage ===`);

  // Extract all class names from the HTML
  const classMatches = html.match(/class=["']([^"']*)["']/g) || [];
  const classes = new Set();
  classMatches.forEach(m => {
    const val = m.replace(/class=["']/, '').replace(/["']$/, '');
    val.split(/\s+/).forEach(c => classes.add(c));
  });

  // Check which classes are defined in style.css vs policy.css / help.css / styles.css
  let inStyleCss = 0;
  classes.forEach(c => {
    if (styleCss.includes('.' + c)) inStyleCss++;
  });
  console.log(`Total unique classes in ${file}: ${classes.size}`);
  console.log(`Classes matching style.css: ${inStyleCss}`);
});
