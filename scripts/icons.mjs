// Membuat ikon PWA PNG (kotak oranye dengan huruf "R") tanpa dependensi tambahan.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Glyph "R" 5x7
const R = ['11110', '10001', '10001', '11110', '10100', '10010', '10001'];

function png(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.22;
  const cell = Math.floor(size * (maskable ? 0.075 : 0.09));
  const gx = Math.floor((size - cell * 5) / 2), gy = Math.floor((size - cell * 7) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const dx = Math.max(radius - x, 0, x - (size - 1 - radius)), dy = Math.max(radius - y, 0, y - (size - 1 - radius));
    const inside = dx * dx + dy * dy <= radius * radius;
    if (!inside) continue;
    const cx = Math.floor((x - gx) / cell), cy = Math.floor((y - gy) / cell);
    const on = cx >= 0 && cx < 5 && cy >= 0 && cy < 7 && R[cy][cx] === '1';
    px.set(on ? [255, 255, 255, 255] : [249, 115, 22, 255], i);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, false));
writeFileSync('public/icons/icon-512.png', png(512, false));
writeFileSync('public/icons/maskable-512.png', png(512, true));
writeFileSync('public/icons/favicon-32.png', png(32, false));
console.log('icons: dibuat di public/icons');
