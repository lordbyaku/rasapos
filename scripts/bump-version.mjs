// Menulis versi build ke public/version.json & nama cache service worker (agar tablet mendapat update),
// lalu memastikan semua file app shell yang di-precache benar-benar ada (satu file hilang = SW gagal install).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const build = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const version = `${pkg.version}+${build}`;

let sw = readFileSync('public/sw.js', 'utf8');
const shell = [...sw.matchAll(/'(\/[^']*)'/g)].map(m => m[1]).filter(p => p.includes('.') || p === '/');
const missing = shell.filter(p => p !== '/' && !existsSync('public' + p));
if (missing.length) {
    console.error('File app shell tidak ditemukan:\n  ' + missing.join('\n  '));
    process.exit(1);
}

writeFileSync('public/version.json', JSON.stringify({ version }, null, 2) + '\n');
sw = sw.replace(/const VERSION = '.*?';/, `const VERSION = '${version}';`);
writeFileSync('public/sw.js', sw);
console.log(`version: ${version} (${shell.length} file app shell OK)`);
