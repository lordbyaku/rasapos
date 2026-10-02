// Menyalin library pihak ketiga dari node_modules ke public/vendor agar aplikasi tidak bergantung CDN (aman offline).
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const out = 'public/vendor';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/fontawesome/css`, { recursive: true });

const copies = [
  ['node_modules/sweetalert2/dist/sweetalert2.all.min.js', `${out}/sweetalert2.all.min.js`],
  ['node_modules/chart.js/dist/chart.umd.js', `${out}/chart.umd.js`],
  ['node_modules/@fortawesome/fontawesome-free/css/all.min.css', `${out}/fontawesome/css/all.min.css`],
  ['node_modules/@fortawesome/fontawesome-free/webfonts', `${out}/fontawesome/webfonts`]
];
for (const [from, to] of copies) cpSync(from, to, { recursive: true });
console.log('vendor: disalin ke', out);
