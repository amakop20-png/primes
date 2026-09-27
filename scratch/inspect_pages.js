const fs = require('fs');

const files = ['terms.html', 'refund.html', 'privacy.html', 'help.html'];

files.forEach(file => {
  console.log(`\n================== ${file} ==================`);
  const html = fs.readFileSync(file, 'utf8');

  // Check stylesheets
  const linkMatches = html.match(/<link\b[^>]*>/gi) || [];
  console.log('Stylesheets:', linkMatches.filter(l => l.includes('rel="stylesheet"')));

  // Check head style tags
  const styleCount = (html.match(/<style\b[^>]*>/gi) || []).length;
  console.log('Style tags count:', styleCount);

  // Check header
  const hStart = html.indexOf('<header');
  const hEnd = html.indexOf('</header>');
  if (hStart !== -1 && hEnd !== -1) {
    console.log('Header snippet:', html.slice(hStart, hEnd + 9).slice(0, 300) + '...');
  } else {
    console.log('NO <header> TAG FOUND!');
  }

  // Check body theme init script
  const bodyIdx = html.indexOf('<body');
  console.log('First 200 chars of body:', html.slice(bodyIdx, bodyIdx + 200));

  // Check script tags for theme
  const hasDashboardTheme = html.includes('dashboardTheme');
  console.log('References dashboardTheme:', hasDashboardTheme);
});
