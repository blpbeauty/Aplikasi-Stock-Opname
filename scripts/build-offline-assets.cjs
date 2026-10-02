const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(process.cwd(), '.next', 'static');
const assets = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|css|woff2?|png|svg)$/.test(entry.name)) assets.push('/_next/static/' + path.relative(root, file).split(path.sep).join('/'));
  }
}
walk(root);
assets.sort();
const version = crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16);
fs.writeFileSync('public/offline-assets.js', `self.__OFFLINE_VERSION = ${JSON.stringify(version)};\nself.__OFFLINE_ASSETS = ${JSON.stringify(assets)};\n`);
console.log(`Offline precache: ${assets.length} assets (${version})`);
