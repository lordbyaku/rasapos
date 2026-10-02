// Builder perintah ESC/POS untuk printer thermal 58/80 mm
const ESC = 0x1b, GS = 0x1d;

function asciiText(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E\n]/g, '?');
}

class EscPos {
    constructor(cols = 32) { this.cols = cols; this.buf = []; this.init(); }
    raw(...b) { this.buf.push(...b); return this; }
    init() { return this.raw(ESC, 0x40, ESC, 0x74, 0); }
    align(a) { return this.raw(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
    bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
    size(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }
    text(s) { for (const ch of asciiText(s)) this.buf.push(ch.charCodeAt(0)); return this; }
    line(s = '') { return this.text(s).raw(0x0a); }
    feed(n = 1) { return this.raw(ESC, 0x64, n); }
    cut() { return this.feed(3).raw(GS, 0x56, 0x42, 0); }
    drawer() { return this.raw(ESC, 0x70, 0, 25, 250); }
    bytes() { return new Uint8Array(this.buf); }
}

/** Bungkus teks panjang per lebar kolom */
function wrapText(s, width) {
    const words = asciiText(s).split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
        if (!cur) cur = w;
        else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
        else { out.push(cur); cur = w; }
        while (cur.length > width) { out.push(cur.slice(0, width)); cur = cur.slice(width); }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
}

/** Baris kiri-kanan rata */
function padRow(left, right, width) {
    left = asciiText(left); right = asciiText(right);
    const space = width - right.length - 1;
    const lines = wrapText(left, Math.max(8, space));
    const last = lines.pop();
    const out = lines;
    out.push(last + ' '.repeat(Math.max(1, width - last.length - right.length)) + right);
    return out;
}
