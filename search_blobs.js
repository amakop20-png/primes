const { execSync } = require('child_process');
const fs = require('fs');

try {
  const allBlobs = execSync('git rev-list --objects --all', { encoding: 'utf8' }).split('\n');
  console.log(`Total objects: ${allBlobs.length}`);
  for (const line of allBlobs) {
    const [hash, path] = line.split(' ');
    if (path && (path.endsWith('.js') || path.endsWith('.json'))) {
      try {
        const content = execSync(`git cat-file -p ${hash}`, { encoding: 'utf8' });
        if (content.includes('Email and password are required') || content.includes('Invalid credentials')) {
          console.log(`Found in object ${hash} (${path}):`);
          const matches = content.split('\n').filter(l => l.includes('Email and password are required') || l.includes('Invalid credentials'));
          console.log(matches.join('\n'));
        }
      } catch (_) {}
    }
  }
} catch (e) {
  console.error(e.message);
}
