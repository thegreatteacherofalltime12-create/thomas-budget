// Stamp a version into the service worker and deploy to Cloudflare.  Usage: node deploy.js
const fs = require('fs'), { execSync } = require('child_process');
const version = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13); // e.g. 20260920T1922
const swPath = 'public/sw.js';
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, "const VERSION = '" + version + "';"));
console.log('version', version);
execSync('npx wrangler deploy', { stdio: 'inherit' });
