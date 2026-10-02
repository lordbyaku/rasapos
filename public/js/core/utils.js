// Utilitas umum (global)
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function rp(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-Rp ' : 'Rp ') + Math.abs(v).toLocaleString('id-ID');
}
const num = n => (Math.round(Number(n) * 100) / 100).toLocaleString('id-ID');

/** Escape HTML — WAJIB untuk semua data dinamis yang dirender via innerHTML */
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
const fmtDateTime = ms => ms ? `${fmtDate(ms)} ${fmtTime(ms)}` : '-';
const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }) : '-';

/** Tanggal lokal perangkat YYYY-MM-DD */
function localDate(ms = Date.now()) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return localDate(d.getTime());
}

/** Tanggal bisnis outlet (sama dengan server) */
function businessDate(ms, tzOffsetMin = 420, cutoffHour = 4) {
    return new Date(ms + tzOffsetMin * 60000 - cutoffHour * 3600000).toISOString().slice(0, 10);
}

function timeAgo(ms) {
    if (!ms) return '-';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return Math.floor(s / 86400) + ' hari lalu';
}

function minutesSince(ms) { return Math.max(0, Math.floor((Date.now() - ms) / 60000)); }

function debounce(fn, ms = 250) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- Dialog & toast ----------
const SwalBase = typeof Swal !== 'undefined' ? Swal.mixin({ confirmButtonColor: '#f97316', cancelButtonColor: '#a8a29e', confirmButtonText: 'OK', cancelButtonText: 'Batal', reverseButtons: true }) : null;

function toast(msg, type = 'info', ms = 2600) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-sm text-white shadow-lg hidden max-w-[90vw] text-center';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove('hidden', 'bg-stone-900', 'bg-red-600', 'bg-emerald-600');
    el.classList.add(type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-stone-900');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), ms);
}

async function confirmDialog(title, text = '', confirmText = 'Ya', danger = false) {
    const r = await SwalBase.fire({ title, text, icon: danger ? 'warning' : 'question', showCancelButton: true, confirmButtonText: confirmText, confirmButtonColor: danger ? '#ef4444' : '#f97316' });
    return r.isConfirmed;
}

async function promptDialog(title, opts = {}) {
    const r = await SwalBase.fire({ title, input: opts.input || 'text', inputValue: opts.value ?? '', inputLabel: opts.label || '', inputPlaceholder: opts.placeholder || '', inputOptions: opts.options, showCancelButton: true, confirmButtonText: opts.confirm || 'Simpan', inputValidator: opts.validate });
    return r.isConfirmed ? r.value : null;
}

function errorDialog(e, title = 'Gagal') {
    SwalBase.fire({ icon: 'error', title, text: e && e.message ? e.message : String(e) });
}

function infoDialog(title, html, icon = 'info') {
    return SwalBase.fire({ icon, title, html });
}

/** Tampilkan modal (elemen dengan class hidden) */
function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

// ---------- Ekspor ----------
function downloadBlob(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function downloadCSV(name, rows, columns) {
    const cell = v => {
        const s = String(v ?? '');
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map(c => cell(c.label)).join(',')];
    for (const r of rows) lines.push(columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
    downloadBlob(name, new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}

/** Kompres gambar ke WebP (maks. sisi 600px) untuk foto menu */
async function compressImage(file, max = 600, quality = 0.8) {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', quality));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { mime: blob.type || 'image/webp', data: btoa(s), size: buf.length };
}

const ROLE_LABEL = { owner: 'Pemilik', manager: 'Manager', cashier: 'Kasir', waiter: 'Waiter', kitchen: 'Dapur' };
const PERM_LABEL = {
    order: 'Input pesanan', pay: 'Terima pembayaran', void: 'Void item terkirim', discount: 'Diskon manual besar', refund: 'Refund',
    shift: 'Buka/tutup shift', cash: 'Kas masuk/keluar', reprint: 'Cetak ulang struk', table: 'Pindah/gabung/split meja',
    soldout: 'Tandai menu habis', close_day: 'Tutup hari', kds: 'Layar dapur', reports: 'Lihat laporan', inventory: 'Kelola stok'
};
const ORDER_STATUS = { open: 'Terbuka', paid: 'Lunas', void: 'Batal', refunded: 'Refund', merged: 'Digabung' };
