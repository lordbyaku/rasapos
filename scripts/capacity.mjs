// Simulasi kapasitas: 1 tenant × N outlet × T transaksi/hari dengan alur seperti tablet asli,
// mengukur request, baris dibaca/ditulis (header x-rows-* dari DEBUG_METRICS=1), dan latensi,
// lalu memproyeksikan ke beberapa tenant dan membandingkan dengan kuota Cloudflare.
//   node scripts/capacity.mjs [--outlets 10] [--trx 100] [--tenants 3]   (server lokal dengan DEBUG_METRICS=1)
import { randomUUID } from 'node:crypto';
import '../public/js/shared/money.js';
import '../public/js/shared/order-ops.js';
import '../public/js/shared/pricing.js';
const { Money, OrderOps, Pricing } = globalThis;

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
const BASE = 'http://localhost:8787';
const OUTLETS = opt('outlets', 10), TRX = opt('trx', 100), TENANTS = opt('tenants', 3);
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

const stats = {}; // kategori → {n, read, written, ms[]}
function rec(cat, res, ms) {
    const s = stats[cat] ||= { n: 0, read: 0, written: 0, ms: [] };
    s.n++; s.read += Number(res.headers.get('x-rows-read') || 0); s.written += Number(res.headers.get('x-rows-written') || 0); s.ms.push(ms);
}
async function call(method, path, body, headers = {}, cat = null) {
    const t0 = performance.now();
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body != null ? JSON.stringify(body) : undefined });
    const ms = performance.now() - t0;
    if (cat) rec(cat, res, ms);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    return data;
}

// ---------------- setup
const stamp = Date.now();
const sa = await call('POST', '/auth/login', { email: 'admin@rasapos.local', password: 'admin12345' });
const A = { authorization: 'Bearer ' + sa.access_token };
const email = `kapasitas+${stamp}@contoh.id`;
const reg = await call('POST', '/auth/register', { accept_terms: true, business_name: 'Uji Kapasitas', owner_name: 'K', email, password: 'rahasia123' });
await call('POST', `/admin/tenants/${reg.tenant.id}/subscription`, { action: 'extend', months: 12, packs: Math.ceil(OUTLETS / 5), plan: 'pro' }, A);
const U = { authorization: 'Bearer ' + (await call('POST', '/auth/login', { email, password: 'rahasia123' })).access_token };
const outlets = [(await call('GET', '/t/meta', null, U)).outlets[0]];
for (let i = 2; i <= OUTLETS; i++) outlets.push((await call('POST', '/t/outlets', { name: 'Outlet ' + i, service_rate: i % 3 === 0 ? 5 : 0 }, U)).item);
for (const o of outlets) {
    const area = (await call('GET', `/t/areas?outlet=${o.id}`, null, U)).items[0];
    for (let k = 1; k <= 10; k++) await call('POST', '/t/tables', { outlet_id: o.id, area_id: area.id, name: 'A' + k }, U);
}
const ing = [];
for (let i = 0; i < 12; i++) ing.push((await call('POST', '/t/ingredients', { name: 'Bahan ' + i, unit: 'gr', cost: 50 }, U)).item.id);
const g1 = (await call('POST', '/t/modifier-groups', { name: 'Level', min_select: 1, max_select: 1, options: [{ name: 'Biasa', price: 0 }, { name: 'Pedas', price: 2000 }] }, U)).item;
const g2 = (await call('POST', '/t/modifier-groups', { name: 'Tambahan', min_select: 0, max_select: 2, options: [{ name: 'Keju', price: 5000, recipe: [{ ingredient_id: ing[0], qty: 20 }] }, { name: 'Telur', price: 4000 }] }, U)).item;
const menus = [];
for (let i = 0; i < 25; i++) menus.push((await call('POST', '/t/menus', { name: 'Menu ' + i, price: 15000 + i * 2000, modifier_group_ids: i % 2 ? [g1.id, g2.id] : [], recipe: [0, 1, 2].map(k => ({ ingredient_id: ing[(i + k) % 12], qty: 10 + k })) }, U)).item);
const cust = [];
for (let i = 0; i < 30; i++) cust.push((await call('POST', '/t/customers', { name: 'Pelanggan ' + i, phone: '0812' + (100000 + i) }, U)).item);
await call('PUT', '/t/settings', { settings: { loyalty: { enabled: true, amount_per_point: 10000 } } }, U);
await call('POST', '/t/promos', { name: 'Promo 10%', type: 'percent', value: 10, auto_apply: 0 }, U);
const kasir = (await call('POST', '/t/staff', { name: 'Kasir', role: 'cashier', pin: '1234', outlet_ids: outlets.map(o => o.id) }, U)).item;
for (const o of outlets) await call('POST', '/t/stock/moves', { outlet_id: o.id, type: 'purchase', items: ing.map(id => ({ ingredient_id: id, qty: 100000, cost: 50 })) }, U);
async function device(o, type) {
    const pc = await call('POST', '/t/pair-codes', { outlet_id: o.id, type, name: type + o.id }, U);
    const p = await call('POST', '/auth/pair', { code: pc.code });
    const D = { authorization: 'Bearer ' + p.access_token };
    if (type === 'kds') return { D, dev: p.device };
    const sl = await call('POST', '/t/staff-login', { staff_id: kasir.id, pin: '1234' }, D);
    return { D, S: { ...D, 'x-staff-token': sl.staff_token }, dev: p.device };
}
const devs = [];
for (const o of outlets) devs.push({ o, pos: await device(o, 'pos'), kds: await device(o, 'kds') });
for (const d of devs) await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'shift.open', payload: { shift_id: randomUUID(), opening_cash: 500000 }, at: Date.now() }] }, d.pos.S);
console.log(`Setup: tenant #${reg.tenant.id}, ${outlets.length} outlet, ${menus.length} menu (resep 3 bahan), ${devs.length * 2} perangkat`);

// ---------------- satu "hari" transaksi (semua outlet bersamaan)
const t0 = Date.now();
let errors = 0;
async function outletDay(d) {
    const boot = await call('GET', '/t/bootstrap', null, d.pos.S, 'bootstrap (muat data)');
    const opn = async (type, id, payload) => {
        const r = await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type, order_id: id, payload, at: Date.now() }] }, d.pos.S, 'kasir: ' + type);
        if (!r.results[0].ok) { errors++; return null; }
        return r.results[0].order;
    };
    for (let k = 0; k < TRX; k++) {
        const roll = Math.random();
        const channel = roll < 0.55 ? 'dine_in' : roll < 0.85 ? 'take_away' : 'gofood';
        const id = randomUUID();
        const member = Math.random() < 0.15 ? pick(cust) : null;
        let o = await opn('order.open', id, { id, order_no: `C${d.dev ? '' : ''}${d.pos.dev.code}-${k}`, channel, guests: channel === 'dine_in' ? 2 : 0, ...(channel === 'dine_in' ? { table_id: pick(boot.tables).id } : {}) });
        if (!o) continue;
        const n = 1 + rnd(4);
        for (let j = 0; j < n; j++) {
            const m = pick(boot.menus);
            const ch = boot.channels.find(c => c.code === channel);
            const base = Pricing.basePrice(m, m.outlet_price, ch, m.channel_prices[channel] ?? null);
            const mods = m.modifier_group_ids.length ? [{ group: 'Level', option_id: g1.options[rnd(2)].id, name: 'x', price: 0 }] : [];
            const modsFixed = mods.map(x => ({ ...x, price: g1.options.find(op => op.id === x.option_id).price, name: g1.options.find(op => op.id === x.option_id).name }));
            o = await opn('order.add_items', id, { items: [{ id: randomUUID(), menu_id: m.id, name: m.name, price: Pricing.unitPrice(base, modsFixed), base_price: base, mods: modsFixed, qty: 1 }] }) || o;
        }
        if (member) o = await opn('order.set', id, { customer_id: member.id }) || o;
        if (channel === 'dine_in') {
            o = await opn('order.send', id, {}) || o;
            if (Math.random() < 0.3) o = await opn('order.print_bill', id, {}) || o;
        }
        const total = o.totals.total;
        const cash = Math.random() < 0.4 && channel !== 'gofood';
        await opn('order.pay', id, { payments: [{ method: channel === 'gofood' ? 'online' : cash ? 'cash' : 'qris', amount: cash ? Money.cashDue(total, Number(boot.outlet.cash_rounding) || 0) : total }] });
        // layar dapur memproses tiket: mulai → siap
        const tk = await call('GET', `/t/tickets?outlet=${d.o.id}`, null, d.kds.D, 'kds: muat tiket').catch(() => ({ active: [] }));
        for (const x of tk.active.filter(x => x.order_id === id)) {
            await call('PATCH', `/t/tickets/${x.id}`, { status: 'progress' }, d.kds.D, 'kds: ubah status');
            await call('PATCH', `/t/tickets/${x.id}`, { status: 'ready' }, d.kds.D, 'kds: ubah status');
        }
    }
}
await Promise.all(devs.map(outletDay));
const elapsed = (Date.now() - t0) / 1000;

// ---------------- back office, tutup hari, ekspor (≈ backup)
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
for (let i = 0; i < 5; i++) await call('GET', `/t/reports/summary?from=${today}&to=${today}`, null, U, 'back office: dashboard');
await call('GET', `/t/reports/transactions?from=${today}&to=${today}`, null, U, 'back office: daftar transaksi');
await call('GET', `/t/reports/items?from=${today}&to=${today}`, null, U, 'back office: laporan menu');
for (const d of devs) {
    const sh = await call('GET', '/t/shifts/current', null, d.pos.S);
    await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'shift.close', payload: { shift_id: sh.shift.id, closing_cash: sh.shift.live.expected_cash }, at: Date.now() }] }, d.pos.S, 'kasir: tutup shift');
}
let openLeft = 0;
for (const o of outlets) { try { await call('POST', '/t/days/close', { outlet_id: o.id }, U, 'tutup hari'); } catch { openLeft++; } }
// Ekspor dialirkan: baris dibaca = jumlah baris yang diekspor (semua tabel)
const exp = await call('GET', '/t/export', null, U);
const exportRows = Object.values(exp.tables).reduce((s, rows) => s + rows.length, 0);
console.log('Baris data tenant setelah 1 hari:', exportRows);

// ---------------- laporan
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
let req = 0, rd = 0, wr = 0;
console.log(`\nWaktu: ${elapsed.toFixed(0)} dtk untuk ${OUTLETS * TRX} transaksi (${OUTLETS} outlet bersamaan) · operasi ditolak: ${errors} · outlet gagal tutup hari: ${openLeft}\n`);
console.log('Kategori'.padEnd(36), 'req'.padStart(6), 'baca/req'.padStart(9), 'tulis/req'.padStart(10), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8));
for (const [k, s] of Object.entries(stats).sort((a, b) => b[1].written - a[1].written)) {
    console.log(k.padEnd(36), String(s.n).padStart(6), (s.read / s.n).toFixed(1).padStart(9), (s.written / s.n).toFixed(1).padStart(10), pct(s.ms, 0.5).toFixed(0).padStart(8), pct(s.ms, 0.95).toFixed(0).padStart(8));
    if (!k.startsWith('ekspor') && !k.startsWith('bootstrap')) { req += s.n; rd += s.read; wr += s.written; }
}
const trx = OUTLETS * TRX;
const per = { req: req / trx, read: rd / trx, written: wr / trx };
console.log(`\nPer transaksi (alur kasir + dapur + back office): ${per.req.toFixed(1)} request, ${per.read.toFixed(0)} baris dibaca, ${per.written.toFixed(1)} baris ditulis`);

// proyeksi harian
const devices = OUTLETS * 2 * TENANTS, hours = 14;
const boot = stats['bootstrap (muat data)'];
const bootReadEach = boot.read / boot.n;
const exportRead = exportRows;
const dayTrx = trx * TENANTS;
const reqDay = dayTrx * per.req + devices * (hours * 6) /* bootstrap 10 mnt */ + devices * 6 /* sambung ulang ws */ + TENANTS * 300 /* back office */;
const wsBilled = devices * (hours * 3600 / 25) / 20;
const writeDay = dayTrx * per.written + TENANTS * 50;
const readDay = dayTrx * per.read + devices * hours * 6 * bootReadEach + TENANTS * exportRead;
console.log(`\n=== Proyeksi ${TENANTS} tenant × ${OUTLETS} outlet × ${TRX} trx/hari (${dayTrx} trx) ===`);
const row = (label, v, free, note = '') => console.log(label.padEnd(34), Math.round(v).toLocaleString('id-ID').padStart(12), ' / ', free.toLocaleString('id-ID').padStart(11), `${(v / free * 100).toFixed(0)}%`.padStart(6), note);
row('Worker requests/hari', reqDay, 100000);
row('Durable Object requests/hari', reqDay + wsBilled, 100000, '(+ping realtime 20:1)');
row('DO baris ditulis/hari', writeDay, 100000);
row('DO baris dibaca/hari (hari 1)', readDay, 5000000, '(backup baca semua data)');
for (const days of [30, 180, 365]) row(`DO baris dibaca/hari (hari ke-${days})`, dayTrx * per.read + devices * hours * 6 * bootReadEach + TENANTS * exportRead * days, 5000000, '(backup tumbuh)');
console.log(`\nPaid ($5/bln): termasuk 10 jt request Worker, 1 jt request DO, 50 jt baris tulis & 25 miliar baca per bulan.`);
console.log(`Kebutuhan bulanan: ${(reqDay * 30 / 1e6).toFixed(2)} jt req Worker, ${((reqDay + wsBilled) * 30 / 1e6).toFixed(2)} jt req DO, ${(writeDay * 30 / 1e6).toFixed(2)} jt baris tulis`);
