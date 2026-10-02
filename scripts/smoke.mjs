// Smoke test end-to-end terhadap server lokal (`npm run dev`). Jalankan: npm run smoke [-- http://localhost:8787]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const BASE = process.argv[2] || 'http://localhost:8787';
let step = 0;
const log = (msg) => console.log(`  ${String(++step).padStart(2, '0')}. ${msg}`);

async function call(method, path, body, headers = {}) {
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}
async function ok(method, path, body, headers) {
    const r = await call(method, path, body, headers);
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
}

const email = `owner+${Date.now()}@contoh.id`;
console.log('Smoke test RasaPOS →', BASE);

const reg = await ok('POST', '/auth/register', { business_name: 'Kopi Uji', owner_name: 'Uji', email, password: 'rahasia123', outlet_name: 'Sudirman' });
const U = { authorization: 'Bearer ' + reg.access_token };
assert.equal(reg.tenant.license.state, 'trial');
log('Daftar tenant baru (trial)');

const login = await ok('POST', '/auth/login', { email, password: 'rahasia123' });
assert.ok(login.refresh_token);
const bad = await call('POST', '/auth/login', { email, password: 'salah' });
assert.equal(bad.status, 401);
const ref = await ok('POST', '/auth/refresh', { refresh_token: login.refresh_token });
assert.ok(ref.access_token);
log('Login, password salah ditolak, refresh token');

const meta = await ok('GET', '/t/meta', null, U);
const outlet = meta.outlets[0];
assert.equal(outlet.name, 'Sudirman');
const quota = await call('POST', '/t/outlets', { name: 'Outlet Kedua' }, U);
assert.equal(quota.status, 402, 'trial dibatasi 1 outlet');
log('Meta back office + kuota outlet trial (1) ditegakkan');

await ok('PATCH', `/t/outlets/${outlet.id}`, { service_rate: 5, tax_rate: 10 }, U);
const catFood = meta.categories.find(c => c.name === 'Makanan');
const catDrink = meta.categories.find(c => c.name === 'Minuman');
const grp = await ok('POST', '/t/modifier-groups', { name: 'Level Pedas', min_select: 1, max_select: 1, options: [{ name: 'Sedang', price: 0 }, { name: 'Extra Pedas', price: 2000 }] }, U);
const ing = await ok('POST', '/t/ingredients', { name: 'Beras', unit: 'gr', cost: 15 }, U);
const nasgor = await ok('POST', '/t/menus', { name: 'Nasi Goreng', price: 35000, category_id: catFood.id, modifier_group_ids: [grp.item.id], recipe: [{ ingredient_id: ing.item.id, qty: 200 }] }, U);
const kopi = await ok('POST', '/t/menus', { name: 'Kopi Susu', price: 25000, category_id: catDrink.id }, U);
await ok('PUT', '/t/channel-prices', { channel: 'gofood', items: [{ menu_id: kopi.item.id, price: 30000 }] }, U);
await ok('POST', '/t/stock/moves', { outlet_id: outlet.id, type: 'purchase', items: [{ ingredient_id: ing.item.id, qty: 5000, cost: 14 }] }, U);
log('Outlet (service 5%, pajak 10%), modifier, bahan+resep, menu, harga GoFood, pembelian stok');

const mgr = await ok('POST', '/t/staff', { name: 'Ayu', role: 'manager', pin: '654321', outlet_ids: [outlet.id] }, U);
const kasir = await ok('POST', '/t/staff', { name: 'Rina', role: 'cashier', pin: '1234', outlet_ids: [outlet.id] }, U);
const shortMgr = await call('POST', '/t/staff', { name: 'X', role: 'manager', pin: '1234', outlet_ids: [outlet.id] }, U);
assert.equal(shortMgr.status, 400);
log('Staff manager (PIN 6) & kasir; PIN manager 4 digit ditolak');

const pc = await ok('POST', '/t/pair-codes', { outlet_id: outlet.id, type: 'pos', name: 'Kasir-01' }, U);
const pair = await ok('POST', '/auth/pair', { code: pc.code });
const reuse = await call('POST', '/auth/pair', { code: pc.code });
assert.equal(reuse.status, 400, 'kode pairing sekali pakai');
const dtok = await ok('POST', '/auth/device-token', { device_id: pair.device.id, secret: pair.device.secret });
const D = { authorization: 'Bearer ' + dtok.access_token };
log(`Pairing perangkat (kode ${pc.code}) → device ${pair.device.code}`);

const boot = await ok('GET', '/t/bootstrap', null, D);
assert.equal(boot.menus.length, 2);
assert.ok(boot.staff.find(s => s.name === 'Rina').pin_hash, 'hash PIN tersedia untuk login offline');
const noStaff = await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'shift.open', payload: { shift_id: randomUUID(), opening_cash: 0 } }] }, D);
assert.equal(noStaff.data.results[0].status, 403, 'tanpa login staff ditolak');
const wrongPin = await call('POST', '/t/staff-login', { staff_id: kasir.item.id, pin: '0000' }, D);
assert.equal(wrongPin.status, 401);
const sl = await ok('POST', '/t/staff-login', { staff_id: kasir.item.id, pin: '1234' }, D);
const S = { ...D, 'x-staff-token': sl.staff_token };
log('Bootstrap perangkat, PIN salah ditolak, login kasir');

const shiftId = randomUUID();
const op = (type, order_id, payload, extra = {}) => ({ op_id: randomUUID(), type, order_id, payload, at: Date.now(), ...extra });
const sendOps = async (ops, h = S) => (await ok('POST', '/t/ops', { ops }, h)).results;
let r = await sendOps([op('shift.open', null, { shift_id: shiftId, opening_cash: 500000 })]);
assert.ok(r[0].ok, JSON.stringify(r[0]));
log('Buka shift (modal 500.000)');

// Order dine-in
const table = boot.tables[0];
const oid = randomUUID();
const opt = boot.modifier_groups[0].options[1];
const opOpen = op('order.open', oid, { id: oid, order_no: `${pair.device.code}TEST-0001`, channel: 'dine_in', table_id: table.id, guests: 2 });
r = await sendOps([
    opOpen,
    op('order.add_items', oid, { items: [
        { id: randomUUID(), menu_id: nasgor.item.id, name: 'Nasi Goreng', price: 1, qty: 2, mods: [{ group: 'Level Pedas', option_id: opt.id, name: opt.name, price: 0 }] },
        { id: 'kopi-1', menu_id: kopi.item.id, name: 'Kopi Susu', price: 25000, qty: 2, mods: [] }
    ] }),
    op('order.send', oid, {})
]);
assert.ok(r.every(x => x.ok), JSON.stringify(r));
const afterAdd = r[2].order;
assert.equal(afterAdd.items[0].price, 37000, 'harga dihitung ulang server (35.000 + extra pedas 2.000)');
const dup = await sendOps([opOpen]);
assert.ok(dup[0].duplicate, 'op_id sama tidak diproses dua kali');
log('Order dine-in: buka meja, tambah item (harga divalidasi server), kirim dapur, idempoten');

const tickets = await ok('GET', '/t/tickets', null, D);
assert.equal(tickets.active.length, 2, 'tiket terpisah per stasiun (Dapur & Bar)');
await ok('PATCH', `/t/tickets/${tickets.active[0].id}`, { status: 'ready' }, S);
log('Tiket dapur per stasiun + update status');

const busy = await sendOps([op('order.open', randomUUID(), { id: randomUUID(), order_no: 'X-1', channel: 'dine_in', table_id: table.id })]);
assert.equal(busy[0].code, 'table_busy');
const noVoid = await sendOps([op('order.void_item', oid, { item_id: 'kopi-1', qty: 1, reason: 'salah' })]);
assert.equal(noVoid[0].code, 'approval_required', 'kasir butuh persetujuan manager untuk void item terkirim');
r = await sendOps([op('order.void_item', oid, { item_id: 'kopi-1', qty: 1, reason: 'salah input', approval: { staff_id: mgr.item.id, pin: '654321' } })]);
assert.ok(r[0].ok, JSON.stringify(r[0]));
log('Meja terpakai ditolak; void item butuh PIN manager → disetujui');

const total = r[0].order.totals.total; // (74.000 + 25.000) = 99.000 + service 4.950 + pajak 10.395 = 114.345
assert.equal(total, 114345);
const under = await sendOps([op('order.pay', oid, { payments: [{ method: 'cash', amount: 100000 }] })]);
assert.equal(under[0].code, 'underpaid');
r = await sendOps([op('order.pay', oid, { payments: [{ method: 'qris', amount: 50000 }, { method: 'cash', amount: 70000 }] })]);
assert.ok(r[0].ok, JSON.stringify(r[0]));
assert.equal(r[0].order.rounding, -45);
assert.equal(r[0].order.change, 5700);
log(`Bayar split QRIS + tunai: total ${total}, pembulatan tunai -45, kembali 5.700`);

// Order take away + GoFood (harga channel)
const o2 = randomUUID();
r = await sendOps([
    op('order.open', o2, { id: o2, order_no: `${pair.device.code}TEST-0002`, channel: 'gofood', customer_name: 'GF-123' }),
    op('order.add_items', o2, { items: [{ id: randomUUID(), menu_id: kopi.item.id, name: 'Kopi Susu', price: 0, qty: 1, mods: [] }] }),
    op('order.pay', o2, { payments: [{ method: 'online', amount: 33000 }] })
]);
assert.ok(r.every(x => x.ok), JSON.stringify(r));
assert.equal(r[1].order.items[0].price, 30000, 'harga GoFood khusus');
log('Order GoFood dengan harga channel (30.000) + pajak');

// Operasi offline (diterapkan belakangan)
const o3 = randomUUID();
const past = Date.now() - 60000;
r = await sendOps([
    op('order.open', o3, { id: o3, order_no: `${pair.device.code}TEST-0003`, channel: 'take_away' }, { offline: true, at: past }),
    op('order.add_items', o3, { items: [{ id: randomUUID(), menu_id: kopi.item.id, name: 'Kopi Susu', price: 24000, qty: 1, mods: [] }] }, { offline: true, at: past }),
    op('order.pay', o3, { shift_id: shiftId, payments: [{ method: 'cash', amount: 26400 }] }, { offline: true, at: past })
]);
assert.ok(r.every(x => x.ok), JSON.stringify(r));
assert.equal(r[1].order.items[0].price, 24000, 'harga offline dipertahankan');
const offMove = await sendOps([op('order.move', o3, { table_id: table.id }, { offline: true })]);
assert.equal(offMove[0].code, 'online_only');
log('Sinkron operasi offline (harga perangkat dipertahankan, selisih dicatat audit); pindah meja offline ditolak');

r = await sendOps([op('shift.cash', null, { id: randomUUID(), shift_id: shiftId, type: 'out', amount: 20000, note: 'beli es batu' })]);
assert.ok(r[0].ok);
const cur = await ok('GET', '/t/shifts/current', null, S);
r = await sendOps([op('shift.close', null, { shift_id: shiftId, closing_cash: cur.shift.live.expected_cash })]);
assert.ok(r[0].ok, JSON.stringify(r[0]));
assert.equal(r[0].shift.summary.difference, 0);
log(`Kas keluar, tutup shift: kas seharusnya ${cur.shift.live.expected_cash}, selisih 0`);

const today = boot.business_date;
const sum = await ok('GET', `/t/reports/summary?from=${today}&to=${today}`, null, U);
assert.equal(sum.totals.trx, 3);
assert.ok(sum.top_items.length >= 2);
const stock = await ok('GET', `/t/stock?outlet=${outlet.id}`, null, U);
assert.equal(stock.items[0].qty, 4600, 'stok beras terpotong 2 porsi × 200 gr');
const audit = await ok('GET', '/t/audit', null, U);
assert.ok(audit.items.some(x => x.action === 'void_item') && audit.items.some(x => x.action === 'price_mismatch'));
const trx = await ok('GET', `/t/reports/transactions?from=${today}&to=${today}`, null, U);
assert.equal(trx.total_rows, 3);
log(`Laporan: ${sum.totals.trx} transaksi, total ${sum.totals.total}; stok terpotong; audit void & selisih harga`);

r = await ok('POST', '/t/days/close', { outlet_id: outlet.id }, U);
assert.equal(r.summary.trx, 3);
log('Tutup hari (Z-report)');

const rv = await ok('POST', `/t/devices/${pair.device.id}/revoke`, null, U);
const revoked = await call('GET', '/t/bootstrap', null, D);
assert.equal(revoked.status, 401);
log('Cabut perangkat → akses langsung ditolak');

console.log(`\n✅ Semua ${step} langkah lulus`);
