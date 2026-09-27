const fs = require('fs');

console.log('=== TERMS.HTML SCRIPT 3 ===');
const terms = fs.readFileSync('terms.html', 'utf8');
const scripts = terms.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
console.log(scripts[2]);

console.log('=== HELP.JS ===');
if (fs.existsSync('help.js')) {
  console.log(fs.readFileSync('help.js', 'utf8'));
} else {
  console.log('help.js not found');
}
