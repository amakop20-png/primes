const { execSync } = require('child_process');
try {
  const commits = execSync('git rev-list --all -n 20', { encoding: 'utf8' }).trim().split('\n');
  for (const c of commits) {
    try {
      const out = execSync(`git grep "Email and password are required" ${c}`, { encoding: 'utf8' });
      if (out) console.log(`Found in ${c}:\n${out}`);
    } catch (_) {}
  }
} catch (e) {
  console.error(e.message);
}
