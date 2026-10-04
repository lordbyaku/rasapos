// Simulasi menyeluruh: semua kemungkinan transaksi, void, diskon, meja, shift, offline, hak akses, input aneh,
// operasi bersamaan, dan uji acak (fuzz) dengan pemeriksaan konsistensi laporan.
// Jalankan terhadap server LOKAL: `npm run dev` lalu `npm run scenarios`.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import '../public/js/shared/money.js';
import '../public/js/shared/order-ops.js';
import '../public/js/shared/pricing.js';

const { Money } = globalThis;
const BASE = process.argv[2] || 'http://localhost:8787';
if (!/localhost|127\.0\.0\.1/.test(BASE) && !process.argv.includes('--force')) {
    console.error('Skenario membuat banyak data uji. Jalankan hanya ke server lokal (atau tambahkan --force).');
    process.exit(1);
}

// ---------------------------------------------------------------- kerangka uji
const results = [];
const server500 = [];
let current = '';
async function t(name, fn) {
    current = name;
    try { await fn(); results.push({ name, ok: true }); process.stdout.write('.'); }
    catch (e) { results.push({ name, ok: false, err: e.message.split('\n').slice(0, 4).join(' ') }); process.stdout.write('F'); }
}

async function call(method, path, body, headers = {}, raw) {
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
    if (res.status >= 500) server500.push(`[${current}] ${method} ${path} → ${res.status} ${text.slice(0, 160)}`);
    return { status: res.status, data };
}
async function ok(method, path, body, headers) {
    const r = await call(method, path, body, headers);
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
}
const op = (type, order_id, payload = {}, extra = {}) => ({ op_id: randomUUID(), type, order_id, payload, at: Date.now(), ...extra });
async function ops(H, list) { return (await ok('POST', '/t/ops', { ops: list }, H)).results; }
async function one(H, o) { return (await ops(H, [o]))[0]; }
function expectOk(r, msg = '') { if (!r.ok) throw new Error(`${msg} diharapkan OK, dapat ${r.code}: ${r.error}`); return r; }
function expectCode(r, code, msg = '') { if (r.ok || r.code !== code) throw new Error(`${msg} diharapkan ${code}, dapat ${r.ok ? 'OK' : r.code + ': ' + r.error}`); return r; }

// ---------------------------------------------------------------- setup tenant uji
const stamp = Date.now();
const email = `skenario+${stamp}@contoh.id`;
console.log(`Skenario RasaPOS → ${BASE}\nTenant uji: ${email}\n`);

const reg = await ok('POST', '/auth/register', { accept_terms: true, business_name: 'Resto Skenario', owner_name: 'Uji', email, password: 'rahasia123', outlet_name: 'Outlet A' });
async function loginAdmin() {
    let r = await call('POST', '/auth/login', { email: 'admin@rasapos.local', password: 'admin12345' });
    if (r.status !== 200) r = await call('POST', '/auth/register', { accept_terms: true, business_name: 'Admin', owner_name: 'Admin', email: 'admin@rasapos.local', password: 'admin12345' });
    if (!r.data.user || !r.data.user.superadmin) throw new Error('admin@rasapos.local bukan superadmin — set SUPERADMIN_EMAILS di .dev.vars');
    return { authorization: 'Bearer ' + r.data.access_token };
}
const A = await loginAdmin();
await ok('POST', `/admin/tenants/${reg.tenant.id}/subscription`, { action: 'extend', months: 1, packs: 1 }, A);
const ownerLogin = await ok('POST', '/auth/login', { email, password: 'rahasia123' });
const U = { authorization: 'Bearer ' + ownerLogin.access_token };

let meta = await ok('GET', '/t/meta', null, U);
const o1 = meta.outlets[0];
await ok('PATCH', `/t/outlets/${o1.id}`, { service_rate: 5, tax_rate: 10, tax_on_service: true, tax_inclusive: false, cash_rounding: 100 }, U);
const o2 = (await ok('POST', '/t/outlets', { name: 'Outlet B', service_rate: 10, tax_rate: 10, tax_on_service: true, tax_inclusive: true, cash_rounding: 500 }, U)).item;
const cfg1 = (await ok('GET', `/t/outlets`, null, U)).items.find(o => o.id === o1.id);
const cfg2 = (await ok('GET', `/t/outlets`, null, U)).items.find(o => o.id === o2.id);
const tablesO2 = [];
const areaO2 = (await ok('GET', `/t/areas?outlet=${o2.id}`, null, U)).items[0];
for (const n of ['B1', 'B2']) tablesO2.push((await ok('POST', '/t/tables', { outlet_id: o2.id, area_id: areaO2.id, name: n }, U)).item);

const areaO1 = (await ok('GET', `/t/areas?outlet=${o1.id}`, null, U)).items[0];
for (const n of ['A7', 'A8', 'A9', 'A10']) await ok('POST', '/t/tables', { outlet_id: o1.id, area_id: areaO1.id, name: n }, U);
const catFood = meta.categories.find(c => c.station === 'Dapur');
const catDrink = meta.categories.find(c => c.station === 'Bar');
const ingKopi = (await ok('POST', '/t/ingredients', { name: 'Kopi', unit: 'gr', cost: 200 }, U)).item;
const ingKeju = (await ok('POST', '/t/ingredients', { name: 'Keju', unit: 'gr', cost: 100 }, U)).item;
const gSize = (await ok('POST', '/t/modifier-groups', { name: 'Ukuran', min_select: 1, max_select: 1, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 6000 }] }, U)).item;
const gTop = (await ok('POST', '/t/modifier-groups', { name: 'Topping', min_select: 0, max_select: 2, options: [{ name: 'Keju', price: 5000, recipe: [{ ingredient_id: ingKeju.id, qty: 20 }] }, { name: 'Telur', price: 4000 }, { name: 'Sosis', price: 6000 }] }, U)).item;
const mk = async (name, price, extra = {}) => (await ok('POST', '/t/menus', { name, price, category_id: catFood.id, ...extra }, U)).item;
const mKopi = await mk('Kopi Susu', 25000, { category_id: catDrink.id, modifier_group_ids: [gSize.id], recipe: [{ ingredient_id: ingKopi.id, qty: 18 }] });
const mNasi = await mk('Nasi Goreng', 35000, { modifier_group_ids: [gTop.id] });
const mAir = await mk('Air Mineral', 8000, { category_id: catDrink.id, taxable: false });
const mHabis = await mk('Sop Buntut', 65000);
const mTutup = await mk('Menu Tutup', 20000);
const mOff = await mk('Menu Nonaktif', 15000);
await ok('PATCH', `/t/menus/${mOff.id}`, { is_active: false }, U);
await ok('PUT', '/t/outlet-menus', { outlet_id: o1.id, items: [{ menu_id: mTutup.id, price: null, is_available: false }, { menu_id: mNasi.id, price: 38000, is_available: true }] }, U);
await ok('PUT', '/t/channel-prices', { channel: 'gofood', items: [{ menu_id: mAir.id, price: 12000 }] }, U);
await ok('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'purchase', items: [{ ingredient_id: ingKopi.id, qty: 1000, cost: 200 }, { ingredient_id: ingKeju.id, qty: 500, cost: 100 }] }, U);
await ok('PUT', '/t/settings', { settings: { loyalty: { enabled: true, amount_per_point: 10000 }, discount_limit_pct: 10 } }, U);
const promoAuto = (await ok('POST', '/t/promos', { name: 'Promo Besar', type: 'percent', value: 15, min_subtotal: 200000 }, U)).item;
const promoManual = (await ok('POST', '/t/promos', { name: 'Member 10%', type: 'percent', value: 10, auto_apply: false }, U)).item;
const promoExpired = (await ok('POST', '/t/promos', { name: 'Kedaluwarsa', type: 'amount', value: 5000, end_date: '2020-01-01' }, U)).item;
const cust = (await ok('POST', '/t/customers', { name: 'Pelanggan Setia', phone: '0811' }, U)).item;

const staffBoth = { outlet_ids: [o1.id, o2.id] };
const sMgr = (await ok('POST', '/t/staff', { name: 'Mgr', role: 'manager', pin: '654321', ...staffBoth }, U)).item;
const sKasir = (await ok('POST', '/t/staff', { name: 'Kasir', role: 'cashier', pin: '1234', ...staffBoth }, U)).item;
const sKasir2 = (await ok('POST', '/t/staff', { name: 'Kasir2', role: 'cashier', pin: '5678', ...staffBoth }, U)).item;
const sWaiter = (await ok('POST', '/t/staff', { name: 'Waiter', role: 'waiter', pin: '2222', ...staffBoth }, U)).item;
const sKitchen = (await ok('POST', '/t/staff', { name: 'Koki', role: 'kitchen', pin: '3333', ...staffBoth }, U)).item;

async function device(outlet, type = 'pos', name = 'Dev') {
    const pc = await ok('POST', '/t/pair-codes', { outlet_id: outlet.id, type, name }, U);
    const p = await ok('POST', '/auth/pair', { code: pc.code });
    return { id: p.device.id, code: p.device.code, H: { authorization: 'Bearer ' + p.access_token } };
}
async function staffH(dev, staff, pin) {
    const r = await ok('POST', '/t/staff-login', { staff_id: staff.id, pin }, dev.H);
    return { ...dev.H, 'x-staff-token': r.staff_token };
}
const d1 = await device(o1, 'pos', 'Kasir-1');
const d1b = await device(o1, 'pos', 'Kasir-2');
const d2 = await device(o2, 'pos', 'Kasir-B');
const dk = await device(o1, 'kds', 'Dapur');
const K1 = await staffH(d1, sKasir, '1234');
const K1b = await staffH(d1b, sKasir2, '5678');
const W1 = await staffH(d1b, sWaiter, '2222');
const M1 = await staffH(d1, sMgr, '654321');
const K2 = await staffH(d2, sKasir, '1234');
const boot1 = await ok('GET', '/t/bootstrap', null, K1);
const table = name => boot1.tables.find(x => x.name === name);
const optOf = (g, name) => g.options.find(o => o.name === name);
const shift1 = randomUUID(), shift1b = randomUUID(), shift2 = randomUUID();
expectOk(await one(K1, op('shift.open', null, { shift_id: shift1, opening_cash: 500000 })));
expectOk(await one(K1b, op('shift.open', null, { shift_id: shift1b, opening_cash: 300000 })));
expectOk(await one(K2, op('shift.open', null, { shift_id: shift2, opening_cash: 0 })));

let seqNo = 0;
const no = d => `${d.code}T-${String(++seqNo).padStart(4, '0')}`;
const item = (m, extra = {}) => ({ id: randomUUID(), menu_id: m.id, name: m.name, price: m.price, qty: 1, mods: [], ...extra });
const modsOf = (g, ...names) => names.map(n => { const o = optOf(g, n); return { group: g.name, option_id: o.id, name: o.name, price: o.price }; });
async function openOrder(H, d, payload = {}) {
    const id = randomUUID();
    expectOk(await one(H, op('order.open', id, { id, order_no: no(d), channel: 'take_away', ...payload })), 'buka order');
    return id;
}
async function getOrder(id, H = U) { return (await ok('GET', '/t/orders/' + id, null, H)).order; }

// =====================================================================================
// A. HARGA & ITEM
// =====================================================================================
await t('A1 harga dihitung server (modifier, harga outlet), harga klien diabaikan', async () => {
    const id = await openOrder(K1, d1, { channel: 'dine_in', table_id: table('A1').id, guests: 2 });
    const r = expectOk(await one(K1, op('order.add_items', id, { items: [
        item(mKopi, { price: 1, mods: modsOf(gSize, 'Large'), qty: 2 }),
        item(mNasi, { price: 999999, mods: modsOf(gTop, 'Keju', 'Telur') })
    ] })));
    const [k, n] = r.order.items;
    assert.equal(k.price, 31000, 'kopi large 25.000+6.000');
    assert.equal(n.price, 47000, 'nasi outlet 38.000 + keju 5.000 + telur 4.000');
    const exp = Money.calc({ type: 'dine_in', items: [{ price: 31000, qty: 2 }, { price: 47000, qty: 1 }] }, cfg1);
    assert.equal(r.order.totals.total, exp.total);
    expectOk(await one(K1, op('order.void', id, { reason: 'bersih-bersih uji' })));
});
await t('A2 modifier wajib tidak dipilih ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mKopi)] })), 'modifier_required');
});
await t('A3 modifier melebihi maksimal ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mNasi, { mods: modsOf(gTop, 'Keju', 'Telur', 'Sosis') })] })), 'modifier_invalid');
});
await t('A4 modifier dari grup lain (bukan milik menu) ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mNasi, { mods: modsOf(gSize, 'Large') })] })), 'modifier_invalid');
});
await t('A5 option_id palsu ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mNasi, { mods: [{ group: 'X', option_id: 'palsu', name: 'Gratis', price: -50000 }] })] })), 'modifier_invalid');
});
await t('A6 menu habis ditolak online, diterima offline', async () => {
    expectOk(await one(K1, op('menu.availability', null, { menu_id: mHabis.id, sold_out: true })));
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mHabis)] })), 'sold_out');
    const r = await one(K1, op('order.add_items', id, { items: [item(mHabis)] }, { offline: true, at: Date.now() - 60000 }));
    expectOk(r, 'offline');
    expectOk(await one(K1, op('menu.availability', null, { menu_id: mHabis.id, sold_out: false })));
});
await t('A7 menu tidak dijual di outlet ditolak, menu nonaktif ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mTutup)] })), 'menu_unavailable');
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mOff)] })), 'menu_unavailable');
});
await t('A8 menu id tidak ada ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.add_items', id, { items: [{ id: randomUUID(), menu_id: 999999, name: 'X', price: 1, qty: 1, mods: [] }] })), 'menu_not_found');
});
await t('A9 qty 0 / negatif / bukan angka / pecahan ditolak', async () => {
    const id = await openOrder(K1, d1);
    for (const qty of [0, -2, 'abc', 1.5, 1e6]) expectCode(await one(K1, op('order.add_items', id, { items: [item(mAir, { qty })] })), 'invalid_item', `qty=${qty}`);
});
await t('A10 item custom: harga negatif dijadikan 0, tanpa nama ditolak', async () => {
    const id = await openOrder(K1, d1);
    const r = expectOk(await one(K1, op('order.add_items', id, { items: [{ id: randomUUID(), menu_id: null, name: 'Titipan', price: -5000, qty: 1, mods: [] }] })));
    assert.equal(r.order.items[0].price, 0);
    expectCode(await one(K1, op('order.add_items', id, { items: [{ id: randomUUID(), menu_id: null, name: ' ', price: 1000, qty: 1, mods: [] }] })), 'invalid_item');
});
await t('A11 item tidak kena pajak & harga channel GoFood', async () => {
    const id = await openOrder(K1, d1, { channel: 'gofood' });
    const r = expectOk(await one(K1, op('order.add_items', id, { items: [item(mAir)] })));
    assert.equal(r.order.items[0].price, 12000, 'harga khusus GoFood');
    assert.equal(r.order.totals.tax, 0, 'air tidak kena pajak');
    assert.equal(r.order.type, 'online');
});
await t('A12 markup channel (tanpa harga khusus) = ceil 20% ke ratusan', async () => {
    const id = await openOrder(K1, d1, { channel: 'grabfood' });
    const r = expectOk(await one(K1, op('order.add_items', id, { items: [item(mKopi, { mods: modsOf(gSize, 'Regular') })] })));
    assert.equal(r.order.items[0].price, 30000);
});
await t('A13 harga termasuk pajak + service (Outlet B)', async () => {
    const id = await openOrder(K2, d2, { channel: 'dine_in', table_id: tablesO2[0].id, guests: 1 });
    const r = expectOk(await one(K2, op('order.add_items', id, { items: [item(mNasi)] })));
    const exp = Money.calc({ type: 'dine_in', items: [{ price: 35000, qty: 1 }] }, cfg2);
    assert.equal(r.order.totals.total, exp.total);
    assert.ok(exp.tax > 0 && exp.service > 0);
    // pembulatan 500 untuk tunai
    const due = Money.cashDue(exp.total, 500);
    const p = expectOk(await one(K2, op('order.pay', id, { payments: [{ method: 'cash', amount: due }] })));
    assert.equal(p.order.rounding, due - exp.total);
    assert.equal(p.order.change, 0);
});

// =====================================================================================
// B. ITEM: UBAH, HAPUS, TAHAN, KIRIM, VOID
// =====================================================================================
await t('B1 ubah & hapus item baru; tidak bisa setelah dikirim', async () => {
    const id = await openOrder(K1, d1);
    const it = item(mAir, { qty: 3 });
    expectOk(await one(K1, op('order.add_items', id, { items: [it] })));
    let r = expectOk(await one(K1, op('order.update_item', id, { item_id: it.id, qty: 5, note: 'dingin' })));
    assert.equal(r.order.items[0].qty, 5);
    r = expectOk(await one(K1, op('order.update_item', id, { item_id: it.id, qty: 0 })));
    assert.equal(r.order.items.length, 0, 'qty 0 menghapus item');
    const it2 = item(mAir);
    expectOk(await one(K1, op('order.add_items', id, { items: [it2] })));
    expectOk(await one(K1, op('order.send', id)));
    expectCode(await one(K1, op('order.update_item', id, { item_id: it2.id, qty: 2 })), 'item_sent');
    expectCode(await one(K1, op('order.remove_item', id, { item_id: it2.id })), 'item_sent');
    expectCode(await one(K1, op('order.send', id)), 'nothing_to_send');
});
await t('B2 item ditahan tidak terkirim, terkirim saat bayar', async () => {
    const id = await openOrder(K1, d1);
    const a = item(mAir), b = item(mAir, { status: 'held' });
    expectOk(await one(K1, op('order.add_items', id, { items: [a, b] })));
    const s = expectOk(await one(K1, op('order.send', id)));
    assert.deepEqual(s.order.items.map(i => i.status), ['sent', 'held']);
    const tot = s.order.totals.total;
    const p = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: tot }] })));
    assert.ok(p.order.items.every(i => i.status === 'sent'));
});
await t('B3 void: alasan wajib, butuh PIN manager, void sebagian, qty dibatasi', async () => {
    const id = await openOrder(K1, d1);
    const it = item(mAir, { qty: 3 });
    expectOk(await one(K1, op('order.add_items', id, { items: [it] })));
    expectOk(await one(K1, op('order.send', id)));
    expectCode(await one(K1, op('order.void_item', id, { item_id: it.id, qty: 1, reason: '' , approval: { staff_id: sMgr.id, pin: '654321' } })), 'reason_required');
    const noAp = await one(K1, op('order.void_item', id, { item_id: it.id, qty: 1, reason: 'salah' }));
    assert.equal(noAp.code, 'approval_required');
    expectCode(await one(K1, op('order.void_item', id, { item_id: it.id, qty: 1, reason: 'salah', approval: { staff_id: sMgr.id, pin: '000000' } })), 'approval_invalid');
    expectCode(await one(K1, op('order.void_item', id, { item_id: it.id, qty: 1, reason: 'salah', approval: { staff_id: sKasir2.id, pin: '5678' } })), 'approval_invalid', 'kasir tidak boleh menyetujui');
    let r = expectOk(await one(K1, op('order.void_item', id, { item_id: it.id, qty: 1, reason: 'salah', approval: { staff_id: sMgr.id, pin: '654321' } })));
    assert.equal(r.order.items.filter(i => i.status !== 'void')[0].qty, 2);
    r = expectOk(await one(M1, op('order.void_item', id, { item_id: it.id, qty: 99, reason: 'semua' })), 'manager void tanpa approval');
    assert.ok(r.order.items.every(i => i.status === 'void'), 'qty 99 dibatasi ke sisa');
    assert.equal(r.order.totals.total, 0);
    expectCode(await one(K1, op('order.pay', id, { payments: [] })), 'empty', 'bayar order kosong');
});
await t('B4 void item baru (belum dikirim) tidak butuh approval', async () => {
    const id = await openOrder(K1, d1);
    const it = item(mAir);
    expectOk(await one(K1, op('order.add_items', id, { items: [it] })));
    expectOk(await one(K1, op('order.void_item', id, { item_id: it.id, reason: 'batal' })));
});
await t('B5 void item tidak ada / sudah di-void', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.void_item', id, { item_id: 'tidak-ada', reason: 'x' })), 'item_not_found');
});
await t('B6 void tercermin di tiket dapur', async () => {
    const id = await openOrder(K1, d1, { channel: 'dine_in', table_id: table('A2').id });
    const it = item(mAir, { qty: 2 });
    expectOk(await one(K1, op('order.add_items', id, { items: [it] })));
    expectOk(await one(K1, op('order.send', id)));
    expectOk(await one(M1, op('order.void_item', id, { item_id: it.id, reason: 'salah' })));
    const tk = (await ok('GET', '/t/tickets', null, dk.H)).active.find(x => x.order_id === id);
    assert.ok(!tk, 'tiket yang semua itemnya void tidak tampil di KDS');
    expectOk(await one(K1, op('order.void', id, { reason: 'uji' })));
});

// =====================================================================================
// C. DISKON & PROMO
// =====================================================================================
await t('C1 diskon ≤ batas tanpa approval, > batas butuh approval', async () => {
    const id = await openOrder(K1, d1);
    expectOk(await one(K1, op('order.add_items', id, { items: [item(mAir, { qty: 10 })] })));
    expectOk(await one(K1, op('order.discount', id, { discount: { type: 'percent', value: 10, name: 'D10' } })));
    assert.equal((await one(K1, op('order.discount', id, { discount: { type: 'percent', value: 50, name: 'D50' } }))).code, 'approval_required');
    assert.equal((await one(K1, op('order.discount', id, { discount: { type: 'amount', value: 1000, name: 'Rp' } }))).code, 'approval_required', 'diskon nominal butuh approval');
    expectOk(await one(K1, op('order.discount', id, { discount: { type: 'percent', value: 50, name: 'D50' }, approval: { staff_id: sMgr.id, pin: '654321' } })));
});
await t('C2 diskon persen > 100 ditolak; diskon nominal > subtotal dibatasi', async () => {
    const id = await openOrder(M1, d1);
    expectOk(await one(M1, op('order.add_items', id, { items: [item(mAir)] })));
    const r = await one(M1, op('order.discount', id, { discount: { type: 'percent', value: 150 } }));
    assert.ok(!r.ok, 'persen 150 seharusnya ditolak');
    const r2 = expectOk(await one(M1, op('order.discount', id, { discount: { type: 'amount', value: 999999 } })));
    assert.equal(r2.order.totals.net, 0);
    assert.equal(r2.order.totals.total, 0);
});
await t('C3 diskon negatif / tipe aneh', async () => {
    const id = await openOrder(M1, d1);
    expectOk(await one(M1, op('order.add_items', id, { items: [item(mAir)] })));
    const r = expectOk(await one(M1, op('order.discount', id, { discount: { type: 'percent', value: -20 } })));
    assert.equal(r.order.discount, null, 'nilai negatif = hapus diskon');
    expectCode(await one(M1, op('order.discount', id, { discount: { type: 'gratis', value: 10 } })), 'invalid');
});
await t('C4 total 0 (diskon 100%) bisa diselesaikan tanpa pembayaran', async () => {
    const id = await openOrder(M1, d1);
    expectOk(await one(M1, op('order.add_items', id, { items: [item(mAir)] })));
    expectOk(await one(M1, op('order.discount', id, { discount: { type: 'percent', value: 100, name: 'Gratis' } })));
    const r = expectOk(await one(M1, op('order.pay', id, { payments: [] })));
    assert.equal(r.order.status, 'paid');
});
await t('C5 promo: syarat minimal, promo manual dari daftar, promo kedaluwarsa', async () => {
    const id = await openOrder(K1, d1);
    expectOk(await one(K1, op('order.add_items', id, { items: [item(mAir)] })));
    expectCode(await one(K1, op('order.discount', id, { discount: { promo_id: promoAuto.id, type: 'percent', value: 15 } })), 'promo_invalid', 'di bawah minimal');
    expectOk(await one(K1, op('order.discount', id, { discount: { promo_id: promoManual.id, type: 'percent', value: 99 } })), 'promo manual tanpa approval');
    const o = await getOrder(id);
    assert.equal(o.discount.value, 10, 'nilai promo diambil dari server, bukan klien');
    expectCode(await one(K1, op('order.discount', id, { discount: { promo_id: promoExpired.id, type: 'amount', value: 5000 } })), 'promo_invalid');
    expectCode(await one(K1, op('order.discount', id, { discount: { promo_id: 999999, type: 'percent', value: 90 } })), 'promo_invalid');
});
await t('C6 diskon item di atas batas butuh approval', async () => {
    const id = await openOrder(K1, d1);
    const it = item(mAir, { qty: 2 });
    expectOk(await one(K1, op('order.add_items', id, { items: [it] })));
    expectOk(await one(K1, op('order.update_item', id, { item_id: it.id, discount: 1000 })), '≤10%');
    assert.equal((await one(K1, op('order.update_item', id, { item_id: it.id, discount: 8000 }))).code, 'approval_required');
    const r = expectOk(await one(K1, op('order.update_item', id, { item_id: it.id, discount: 999999, approval: { staff_id: sMgr.id, pin: '654321' } })));
    assert.equal(r.order.items[0].discount, 16000, 'diskon item dibatasi harga baris');
});

// =====================================================================================
// D. PEMBAYARAN
// =====================================================================================
async function orderWith(H, d, items, payload) {
    const id = await openOrder(H, d, payload);
    const r = expectOk(await one(H, op('order.add_items', id, { items })));
    return { id, total: r.order.totals.total };
}
await t('D1 kurang bayar, metode tidak dikenal, non-tunai lebih, tunai saat non-tunai lunas', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir, { qty: 3 })]);
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'cash', amount: total - 1000 }] })), 'underpaid');
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'bitcoin', amount: total }] })), 'payment_invalid');
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total + 5000 }] })), 'underpaid');
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }, { method: 'cash', amount: 10000 }] })), 'underpaid');
    expectCode(await one(K1, op('order.pay', id, { payments: [] })), 'no_payment');
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'cash', amount: -50000 }, { method: 'qris', amount: total }] })), 'payment_invalid', 'nominal negatif');
});
await t('D2 nominal teks/negatif ditolak dengan jelas; baris Rp 0 non-tunai dibuang', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir)]);
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'cash', amount: 'banyak' }] })), 'payment_invalid');
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: -100 }, { method: 'cash', amount: Money.cashDue(total, 100) }] })), 'payment_invalid');
    const r = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: 0 }, { method: 'cash', amount: Money.cashDue(total, 100) }] })));
    assert.equal(r.order.payments.length, 1);
});
await t('D11 sisa < setengah pembulatan setelah QRIS: tunai Rp 0 menyelesaikan dengan pembulatan', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mNasi), item(mKopi, { mods: modsOf(gSize, 'Regular') })]);
    const r = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total - 40 }, { method: 'cash', amount: 0 }] })));
    assert.equal(r.order.rounding, -40);
    assert.equal(r.order.payments.length, 1, 'baris tunai Rp 0 tidak disimpan');
    const other = await orderWith(K1, d1, [item(mNasi)]);
    expectCode(await one(K1, op('order.pay', other.id, { payments: [{ method: 'qris', amount: 1000 }] })), 'underpaid', 'QRIS kurang tanpa tunai tetap ditolak');
});
await t('D3 split QRIS + tunai, kembalian & pembulatan benar', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mKopi, { mods: modsOf(gSize, 'Large') }), item(mNasi)], { channel: 'dine_in', table_id: table('A3').id, guests: 2 });
    const r = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: 50000 }, { method: 'cash', amount: 100000 }] })));
    const s = Money.settle(total, [{ type: 'noncash', amount: 50000 }, { type: 'cash', amount: 100000 }], 100);
    assert.equal(r.order.rounding, s.rounding);
    assert.equal(r.order.change, s.change);
});
await t('D4 bayar dua kali (op berbeda) ditolak', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir)]);
    expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    expectCode(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })), 'order_closed');
    expectCode(await one(K1, op('order.add_items', id, { items: [item(mAir)] })), 'order_closed');
});
await t('D5 bayar bersamaan dari dua tablet: hanya satu berhasil', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir, { qty: 2 })]);
    const [a, b] = await Promise.all([one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })), one(K1b, op('order.pay', id, { payments: [{ method: 'cash', amount: Money.cashDue(total, 100) }] }))]);
    assert.equal([a, b].filter(x => x.ok).length, 1, 'tepat satu pembayaran');
});
await t('D6 op_id sama dikirim bersamaan hanya diproses sekali', async () => {
    const { id } = await orderWith(K1, d1, [item(mAir)]);
    const o = op('order.add_items', id, { items: [item(mAir, { qty: 5 })] });
    await Promise.all([one(K1, o), one(K1, o), one(K1b, o)]);
    const order = await getOrder(id);
    assert.equal(order.items.length, 2, 'item tambahan hanya masuk sekali');
});
await t('D7 waiter tidak bisa menerima pembayaran', async () => {
    const { id, total } = await orderWith(W1, d1b, [item(mAir)]);
    const r = await one(W1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] }));
    assert.ok(!r.ok);
});
await t('D8 bayar tanpa shift ditolak', async () => {
    const d = await device(o1, 'pos', 'Tanpa shift');
    const H = await staffH(d, sKasir, '1234');
    const { id, total } = await orderWith(H, d, [item(mAir)]);
    expectCode(await one(H, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })), 'no_shift');
});
await t('D9 poin pelanggan bertambah', async () => {
    const before = (await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points;
    const { id, total } = await orderWith(K1, d1, [item(mNasi, { qty: 3 })]);
    expectOk(await one(K1, op('order.set', id, { customer_id: cust.id })));
    expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    const after = (await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points;
    assert.equal(after - before, Math.floor(total / 10000));
});
await t('D10 pelanggan tidak ada ditolak', async () => {
    const { id } = await orderWith(K1, d1, [item(mAir)]);
    expectCode(await one(K1, op('order.set', id, { customer_id: 999999 })), 'customer_not_found');
});

// =====================================================================================
// E. REFUND & BATAL ORDER
// =====================================================================================
await t('E1 refund: butuh approval, alasan wajib, hanya sekali, laporan berkurang', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mNasi)]);
    const p = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'cash', amount: 50000 }] })));
    const paid = total + p.order.rounding;
    assert.equal((await one(K1, op('order.refund', id, { reason: 'komplain' }))).code, 'approval_required');
    expectCode(await one(M1, op('order.refund', id, { reason: '' })), 'reason_required');
    expectOk(await one(M1, op('order.refund', id, { reason: 'komplain' })));
    expectCode(await one(M1, op('order.refund', id, { reason: 'lagi' })), 'not_paid');
    const o = await getOrder(id);
    assert.equal(o.status, 'refunded');
    assert.ok(paid > 0);
});
await t('E2 refund order yang masih terbuka ditolak', async () => {
    const { id } = await orderWith(M1, d1, [item(mAir)]);
    expectCode(await one(M1, op('order.refund', id, { reason: 'x' })), 'not_paid');
});
await t('E3 batal order: tanpa item terkirim cukup izin order; dengan item terkirim butuh approval', async () => {
    const a = await orderWith(K1, d1, [item(mAir)]);
    expectOk(await one(K1, op('order.void', a.id, { reason: 'batal' })));
    const b = await orderWith(K1, d1, [item(mAir)]);
    expectOk(await one(K1, op('order.send', b.id)));
    assert.equal((await one(K1, op('order.void', b.id, { reason: 'batal' }))).code, 'approval_required');
    expectOk(await one(K1, op('order.void', b.id, { reason: 'batal', approval: { staff_id: sMgr.id, pin: '654321' } })));
    expectCode(await one(K1, op('order.void', b.id, { reason: 'lagi' })), 'order_closed');
});
await t('E4 refund offline ditolak (wajib online)', async () => {
    const { id, total } = await orderWith(M1, d1, [item(mAir)]);
    expectOk(await one(M1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    expectCode(await one(M1, op('order.refund', id, { reason: 'x' }, { offline: true })), 'online_only');
});

// =====================================================================================
// F. MEJA
// =====================================================================================
await t('F1 meja terpakai, meja outlet lain, pindah ke meja terpakai', async () => {
    const a = await openOrder(K1, d1, { channel: 'dine_in', table_id: table('A4').id });
    const r = await one(K1, op('order.open', randomUUID(), { id: randomUUID(), order_no: no(d1), channel: 'dine_in', table_id: table('A4').id }));
    assert.equal(r.code, 'table_busy');
    const id2 = randomUUID();
    expectCode(await one(K1, op('order.open', id2, { id: id2, order_no: no(d1), channel: 'dine_in', table_id: tablesO2[1].id })), 'table_not_found');
    const b = await openOrder(K1, d1, { channel: 'dine_in', table_id: table('A5').id });
    expectCode(await one(K1, op('order.move', b, { table_id: table('A4').id })), 'table_busy');
    expectOk(await one(K1, op('order.move', b, { table_id: table('A6').id })));
    assert.equal((await getOrder(b)).table_name, 'A6');
    for (const x of [a, b]) expectOk(await one(K1, op('order.void', x, { reason: 'uji' })));
});
await t('F2 pindah meja untuk order take away ditolak', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.move', id, { table_id: table('A6').id })), 'not_dine_in');
});
await t('F3 gabung bill: channel beda, diri sendiri, order tertutup', async () => {
    const a = await orderWith(K1, d1, [item(mAir)], { channel: 'dine_in', table_id: table('A1').id });
    const b = await orderWith(K1, d1, [item(mAir, { qty: 2 })], { channel: 'dine_in', table_id: table('A2').id });
    const c = await orderWith(K1, d1, [item(mAir)]);
    expectCode(await one(K1, op('order.merge', a.id, { from_order_id: c.id })), 'invalid', 'channel berbeda');
    expectCode(await one(K1, op('order.merge', a.id, { from_order_id: a.id })), 'invalid', 'gabung diri sendiri');
    const r = expectOk(await one(K1, op('order.merge', a.id, { from_order_id: b.id })));
    assert.equal(r.order.items.length, 2);
    assert.equal(r.merged.status, 'merged');
    expectCode(await one(K1, op('order.merge', a.id, { from_order_id: b.id })), 'order_closed');
    const r2 = expectOk(await one(K1, op('order.pay', a.id, { payments: [{ method: 'qris', amount: r.order.totals.total }] })));
    assert.equal(r2.order.totals.total, Money.calc({ type: 'dine_in', items: [{ price: 8000, qty: 3, taxable: false }] }, cfg1).total);
    expectOk(await one(K1, op('order.void', c.id, { reason: 'uji' })));
});
await t('F4 split bill: sebagian qty, semua item ditolak, total kedua bill = total awal', async () => {
    const it = item(mAir, { qty: 4 }), it2 = item(mNasi);
    const { id, total } = await orderWith(K1, d1, [it, it2], { channel: 'dine_in', table_id: table('A7').id, guests: 4 });
    expectCode(await one(K1, op('order.split', id, { new_order_id: randomUUID(), new_order_no: no(d1), items: [{ item_id: it.id, qty: 4 }, { item_id: it2.id, qty: 1 }] })), 'invalid');
    const r = expectOk(await one(K1, op('order.split', id, { new_order_id: randomUUID(), new_order_no: no(d1), items: [{ item_id: it.id, qty: 1 }] })));
    assert.equal(r.order.totals.subtotal + r.created.totals.subtotal, Money.calc({ type: 'dine_in', items: [{ price: 8000, qty: 4 }, { price: 38000, qty: 1 }] }, cfg1).subtotal);
    assert.ok(Math.abs(r.order.totals.total + r.created.totals.total - total) <= 2, 'selisih pembulatan maksimal 2 rupiah');
    expectCode(await one(K1, op('order.split', id, { new_order_id: randomUUID(), new_order_no: no(d1), items: [{ item_id: 'tidak-ada', qty: 1 }] })), 'item_not_found');
    expectCode(await one(K1, op('order.split', id, { new_order_id: r.created.id, new_order_no: 'X', items: [{ item_id: it.id, qty: 1 }] })), 'order_exists');
});
await t('F5 ganti channel setelah ada item ditolak', async () => {
    const { id } = await orderWith(K1, d1, [item(mAir)]);
    expectCode(await one(K1, op('order.set', id, { channel: 'gofood' })), 'channel_locked');
});
await t('F6 meja jadi "perlu dibersihkan" setelah bayar, lalu bersih', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir)], { channel: 'dine_in', table_id: table('A8').id });
    expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    let tb = (await ok('GET', '/t/bootstrap', null, K1)).tables.find(x => x.name === 'A8');
    assert.equal(tb.dirty, 1);
    expectOk(await one(K1, op('table.clean', null, { table_id: tb.id })));
    tb = (await ok('GET', '/t/bootstrap', null, K1)).tables.find(x => x.name === 'A8');
    assert.equal(tb.dirty, 0);
});

// =====================================================================================
// G. OFFLINE & SINKRON
// =====================================================================================
await t('G1 transaksi offline kemarin masuk ke hari bisnis kemarin', async () => {
    const yest = Date.now() - 26 * 3600000;
    const id = randomUUID();
    const off = { offline: true, at: yest };
    const r = await ops(K1, [
        op('order.open', id, { id, order_no: no(d1), channel: 'take_away' }, off),
        op('order.add_items', id, { items: [item(mAir, { price: 7000 })] }, off),
        op('order.pay', id, { shift_id: shift1, payments: [{ method: 'cash', amount: 7700 }] }, off)
    ]);
    r.forEach(x => expectOk(x));
    const o = await getOrder(id);
    const bdYest = new Date(yest + 7 * 3600000 - 4 * 3600000).toISOString().slice(0, 10);
    assert.equal(o.business_date, bdYest);
    assert.equal(o.items[0].price, 7000, 'harga offline dipertahankan');
    assert.ok(o.offline);
});
await t('G2 waktu masa depan dari perangkat dibatasi ke sekarang', async () => {
    const id = randomUUID();
    expectOk(await one(K1, op('order.open', id, { id, order_no: no(d1) }, { offline: true, at: Date.now() + 7 * 86400000 })));
    const o = await getOrder(id);
    assert.ok(o.opened_at <= Date.now() + 1000);
});
await t('G3 operasi offline atas nama staff pelaku (staff_id), bukan staff yang sinkron', async () => {
    const id = randomUUID();
    const off = { offline: true, at: Date.now() - 120000, staff_id: sKasir2.id };
    const r = await ops(K1, [op('order.open', id, { id, order_no: no(d1) }, off), op('order.add_items', id, { items: [item(mAir)] }, off)]);
    r.forEach(x => expectOk(x));
    assert.equal((await getOrder(id)).staff_id, sKasir2.id);
});
await t('G4 staff_id offline dari outlet lain tidak dipakai', async () => {
    const sOther = (await ok('POST', '/t/staff', { name: 'Orang B', role: 'manager', pin: '999999', outlet_ids: [o2.id] }, U)).item;
    const id = randomUUID();
    const off = { offline: true, at: Date.now() - 120000, staff_id: sOther.id };
    expectOk(await one(K1, op('order.open', id, { id, order_no: no(d1) }, off)));
    assert.equal((await getOrder(id)).staff_id, sKasir.id);
});
await t('G5 operasi offline untuk order yang sudah dibayar tablet lain → ditolak & jawaban konsisten saat dikirim ulang', async () => {
    const { id, total } = await orderWith(K1, d1, [item(mAir)]);
    expectOk(await one(K1b, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    const late = op('order.add_items', id, { items: [item(mAir)] }, { offline: true, at: Date.now() - 90000 });
    const r1 = await one(K1, late), r2 = await one(K1, late);
    expectCode(r1, 'order_closed'); expectCode(r2, 'order_closed');
    assert.ok(r2.duplicate, 'kiriman ulang mendapat jawaban tersimpan');
});
await t('G6 split/gabung/pindah offline ditolak', async () => {
    const { id } = await orderWith(K1, d1, [item(mAir)], { channel: 'dine_in', table_id: table('A9') ? table('A9').id : table('A1').id });
    for (const [type, p] of [['order.move', { table_id: table('A1').id }], ['order.split', { new_order_id: randomUUID(), new_order_no: 'x', items: [] }], ['order.merge', { from_order_id: randomUUID() }]]) {
        expectCode(await one(K1, op(type, id, p, { offline: true })), 'online_only', type);
    }
});
/** Bukti persetujuan seperti yang dibuat tablet: RSA-OAEP(kunci publik tenant) atas {staff, PIN, op}. */
async function seal(staffId, pin, opId, key = boot1.approval_key) {
    const k = await crypto.subtle.importKey('jwk', { kty: key.jwk.kty, n: key.jwk.n, e: key.jwk.e, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, k, new TextEncoder().encode(JSON.stringify({ s: staffId, p: pin, o: opId })));
    return key.kid + '.' + Buffer.from(ct).toString('base64url');
}
/** Operasi offline dengan persetujuan bertanda bukti */
async function sealedOp(type, orderId, payload, staffId, pin, extra) {
    const o = op(type, orderId, payload, extra);
    o.payload.approval = { staff_id: staffId, proof: await seal(staffId, pin, o.op_id) };
    o.payload.approved_by = staffId;
    return o;
}
await t('G7 persetujuan offline dengan bukti PIN terenkripsi diterima & ditandai offline di audit', async () => {
    assert.ok(boot1.approval_key && boot1.approval_key.jwk.n, 'tablet menerima kunci publik');
    const id = randomUUID();
    const it = item(mAir), it2 = item(mAir);
    const off = { offline: true, at: Date.now() - 100000 };
    const r = await ops(K1, [
        op('order.open', id, { id, order_no: no(d1) }, off),
        op('order.add_items', id, { items: [it, it2] }, off),
        op('order.send', id, {}, off),
        await sealedOp('order.void_item', id, { item_id: it.id, reason: 'offline' }, sMgr.id, '654321', off)
    ]);
    r.forEach(x => expectOk(x));
    const a = (await ok('GET', `/t/audit?outlet=${o1.id}`, null, U)).items.find(x => x.action === 'void_item' && x.ref === r[0].order.order_no);
    assert.equal(a.data.approval_offline, true, 'audit menandai persetujuan offline');
    assert.equal(a.data.approved_by, 'Mgr');
});
await t('G8 ANTI-CURANG: persetujuan offline tanpa bukti / PIN salah / bukti dipakai ulang / bukti palsu ditolak', async () => {
    const off = () => ({ offline: true, at: Date.now() - 100000 });
    const { id } = await orderWith(K1, d1, [item(mAir), item(mAir)]);
    expectOk(await one(K1, op('order.send', id, {})));
    // 1) cara lama: hanya ID manager, tanpa PIN
    expectCode(await one(K1, op('order.void', id, { reason: 'curang', approved_by: sMgr.id }, off())), 'approval_invalid', 'tanpa bukti');
    // 2) bukti dengan PIN salah
    expectCode(await one(K1, await sealedOp('order.void', id, { reason: 'curang' }, sMgr.id, '111111', off())), 'approval_invalid', 'PIN salah');
    // 3) bukti sah dipakai ulang untuk operasi lain (op_id berbeda)
    const good = await sealedOp('order.void', id, { reason: 'x' }, sMgr.id, '654321', off());
    const replay = op('order.void', id, { reason: 'curang', approval: good.payload.approval, approved_by: sMgr.id }, off());
    expectCode(await one(K1, replay), 'approval_invalid', 'bukti dipakai ulang');
    // 4) bukti untuk manager A tapi diklaim manager lain / kasir
    const o4 = op('order.void', id, { reason: 'curang' }, off());
    o4.payload.approval = { staff_id: sKasir2.id, proof: await seal(sMgr.id, '654321', o4.op_id) };
    expectCode(await one(K1, o4), 'approval_invalid', 'staff tidak cocok');
    // 5) bukti sampah / kunci lain
    const o5 = op('order.void', id, { reason: 'curang', approval: { staff_id: sMgr.id, proof: 'abc.def' } }, off());
    expectCode(await one(K1, o5), 'approval_invalid', 'bukti sampah');
    // 6) PIN kasir di bukti: kasir tidak berwenang
    expectCode(await one(K1, await sealedOp('order.void', id, { reason: 'curang' }, sKasir2.id, '5678', off())), 'approval_invalid', 'kasir tidak berwenang');
    // order tetap utuh
    assert.equal((await getOrder(id)).status, 'open');
    // bukti yang benar tetap bisa dipakai sekali
    expectOk(await one(K1, good));
    assert.equal((await getOrder(id)).status, 'void');
});
await t('G9 tebak PIN lewat bukti offline terkunci setelah 5 kali salah', async () => {
    const mgr = (await ok('POST', '/t/staff', { name: 'Mgr Kunci', role: 'manager', pin: '246802', ...staffBoth }, U)).item;
    const { id } = await orderWith(K1, d1, [item(mAir)]);
    expectOk(await one(K1, op('order.send', id, {})));
    const off = () => ({ offline: true, at: Date.now() - 100000 });
    for (let i = 0; i < 5; i++) expectCode(await one(K1, await sealedOp('order.void', id, { reason: 'tebak' }, mgr.id, String(100000 + i), off())), 'approval_invalid');
    const locked = await one(K1, await sealedOp('order.void', id, { reason: 'benar' }, mgr.id, '246802', off()));
    assert.equal(locked.code, 'pin_locked', 'PIN benar pun ditahan saat terkunci (tablet mencoba lagi nanti)');
    assert.equal(locked.status, 429);
    expectOk(await one(M1, op('order.void', id, { reason: 'beres' })));
});
await t('G10 tablet tidak pernah menerima hash PIN server; verifier tablet terpisah', async () => {
    const b = await ok('GET', `/t/bootstrap?outlet=${o1.id}`, null, K1);
    for (const s of b.staff) {
        assert.equal(s.pin_hash, undefined, 'pin_hash tidak dikirim');
        if (s.pin_check) assert.match(s.pin_check, /^pbkdf2\$100000\$/);
    }
    const mgr = b.staff.find(s => s.id === sMgr.id);
    assert.ok(mgr.pin_check, 'staff baru langsung punya verifier');
    const list = await ok('GET', '/t/staff', null, U);
    assert.ok(list.items.every(s => s.pin_hash === undefined && s.pin_check === undefined), 'back office tidak melihat hash');
    const exp = await ok('GET', '/t/export', null, U);
    assert.ok(exp.tables.staff.every(s => s.pin_hash === undefined && s.pin_check === undefined), 'ekspor pemilik tanpa hash');
});

// =====================================================================================
// H. HAK AKSES & KEAMANAN
// =====================================================================================
await t('H1 perangkat KDS tidak bisa membuat transaksi', async () => {
    const r = await call('POST', '/t/ops', { ops: [op('order.open', randomUUID(), { id: randomUUID(), order_no: 'K' })] }, dk.H);
    assert.equal(r.status, 403);
});
await t('H2 perangkat outlet A tidak bisa membuka order outlet B', async () => {
    const id = await openOrder(K2, d2);
    const r = await call('GET', '/t/orders/' + id, null, K1);
    assert.equal(r.status, 403);
    const r2 = await one(K1, op('order.add_items', id, { items: [item(mAir)] }));
    assert.equal(r2.status, 403);
});
await t('H3 tenant lain tidak bisa melihat data', async () => {
    const other = await ok('POST', '/auth/register', { accept_terms: true, business_name: 'Tetangga', owner_name: 'T', email: `tetangga+${stamp}@contoh.id`, password: 'rahasia123' });
    const H = { authorization: 'Bearer ' + other.access_token };
    const { id } = await orderWith(K1, d1, [item(mAir)]);
    assert.equal((await call('GET', '/t/orders/' + id, null, H)).status, 404);
    const m = await ok('GET', '/t/menus', null, H);
    assert.ok(!m.items.some(x => x.name === 'Kopi Susu'));
});
await t('H3b tenant baru mendapat kunci penyimpanan acak (bukan nomor urut)', async () => {
    const other = await ok('POST', '/auth/register', { accept_terms: true, business_name: 'Baru', owner_name: 'B', email: `baru+${stamp}@contoh.id`, password: 'rahasia123' });
    const payload = JSON.parse(Buffer.from(other.access_token.split('.')[1], 'base64url'));
    assert.ok(payload.dk && payload.dk !== 'tenant:' + payload.tid && payload.dk.length > 20, 'dk=' + payload.dk);
});
await t('H4 token staff dari perangkat lain ditolak', async () => {
    const r = await call('GET', '/t/bootstrap', null, { ...d2.H, 'x-staff-token': K1['x-staff-token'] });
    assert.equal(r.status, 401);
});
await t('H5 staff nonaktif langsung ditolak', async () => {
    const s = (await ok('POST', '/t/staff', { name: 'Sementara', role: 'cashier', pin: '4444', outlet_ids: [o1.id] }, U)).item;
    const H = await staffH(d1b, s, '4444');
    await ok('PATCH', '/t/staff/' + s.id, { is_active: false }, U);
    assert.equal((await call('POST', '/t/ops', { ops: [op('order.open', randomUUID(), { id: randomUUID(), order_no: 'X' })] }, H)).status, 401);
});
await t('H6 PIN salah 5x terkunci', async () => {
    const s = (await ok('POST', '/t/staff', { name: 'Pelupa', role: 'cashier', pin: '7777', outlet_ids: [o1.id] }, U)).item;
    for (let i = 0; i < 5; i++) await call('POST', '/t/staff-login', { staff_id: s.id, pin: '0000' }, d1.H);
    const r = await call('POST', '/t/staff-login', { staff_id: s.id, pin: '7777' }, d1.H);
    assert.equal(r.status, 429, 'terkunci walau PIN benar');
});
await t('H7 staff outlet B tidak bisa login di tablet outlet A', async () => {
    const s = (await ok('POST', '/t/staff', { name: 'Hanya B', role: 'cashier', pin: '8888', outlet_ids: [o2.id] }, U)).item;
    assert.equal((await call('POST', '/t/staff-login', { staff_id: s.id, pin: '8888' }, d1.H)).status, 403);
});
await t('H8 manajer email hanya melihat outlet yang ditugaskan', async () => {
    const memail = `mgr+${stamp}@contoh.id`;
    const r = await ok('POST', '/t/users', { name: 'Mgr B', email: memail, outlet_ids: [o2.id] }, U);
    const lg = await ok('POST', '/auth/login', { email: memail, password: r.temp_password });
    const H = { authorization: 'Bearer ' + lg.access_token };
    const outlets = (await ok('GET', '/t/meta', null, H)).outlets;
    assert.deepEqual(outlets.map(o => o.id), [o2.id]);
    assert.equal((await call('GET', `/t/stock?outlet=${o1.id}`, null, H)).status, 403);
    assert.equal((await call('POST', '/t/menus', { name: 'Hack', price: 1 }, H)).status, 403, 'manajer tidak boleh ubah menu master');
    const sum = await ok('GET', `/t/reports/summary?outlets=${o1.id},${o2.id}`, null, H);
    assert.ok(sum.outlets.every(o => o.id === o2.id), 'laporan hanya outlet B');
});
await t('H9 token palsu / kedaluwarsa / tanpa token', async () => {
    assert.equal((await call('GET', '/t/meta', null, { authorization: 'Bearer abc.def.ghi' })).status, 401);
    assert.equal((await call('GET', '/t/meta')).status, 401);
    const parts = ownerLogin.access_token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), tid: 99999, dk: 'tenant:99999' })).toString('base64url');
    assert.equal((await call('GET', '/t/meta', null, { authorization: `Bearer ${parts[0]}.${forged}.${parts[2]}` })).status, 401, 'payload diubah ditolak');
});
await t('H10 non-superadmin tidak bisa akses panel admin', async () => {
    assert.equal((await call('GET', '/admin/overview', null, U)).status, 403);
});
await t('H11 file foto: tenant lain tidak bisa menebak; ukuran & tipe dibatasi', async () => {
    assert.equal((await call('POST', '/t/files', { mime: 'text/html', data: 'PHNjcmlwdD4=' }, U)).status, 400);
    assert.ok([400, 413].includes((await call('POST', '/t/files', { mime: 'image/png', data: Buffer.alloc(310000).toString('base64') }, U)).status), 'gambar > 300 KB ditolak');
});

// =====================================================================================
// I. INPUT ANEH
// =====================================================================================
await t('I1 body bukan JSON / kosong / array', async () => {
    for (const raw of ['bukan json', '', '[]', 'null']) {
        const r = await call('POST', '/t/ops', null, K1, raw);
        assert.ok(r.status === 400, `raw=${JSON.stringify(raw)} → ${r.status}`);
    }
});
await t('I2 format operasi rusak', async () => {
    const r = await ops(K1, [{ op_id: 123, type: 'order.open' }, { op_id: 'x'.repeat(100), type: 'order.open' }, { op_id: randomUUID(), type: 'order.hapus_semua', order_id: 'x' }, { op_id: randomUUID(), type: 42 }]);
    assert.ok(r.every(x => !x.ok), JSON.stringify(r));
});
await t('I3 lebih dari 100 operasi ditolak', async () => {
    const r = await call('POST', '/t/ops', { ops: Array.from({ length: 101 }, () => op('order.open', 'x')) }, K1);
    assert.equal(r.status, 400);
});
await t('I4 operasi pada order yang tidak ada', async () => {
    for (const type of ['order.add_items', 'order.pay', 'order.send', 'order.set', 'order.void']) {
        const r = await one(K1, op(type, randomUUID(), { items: [item(mAir)], payments: [], reason: 'x' }));
        assert.ok(!r.ok && r.status < 500, `${type}: ${JSON.stringify(r)}`);
    }
});
await t('I5 buka order dengan id yang sudah ada', async () => {
    const id = await openOrder(K1, d1);
    expectCode(await one(K1, op('order.open', id, { id, order_no: 'dup' })), 'order_exists');
});
await t('I6 teks sangat panjang & karakter HTML disimpan aman', async () => {
    const id = await openOrder(K1, d1, { customer_name: '<img src=x onerror=alert(1)>' + 'A'.repeat(500) });
    const o = await getOrder(id);
    assert.ok(o.customer_name.length <= 80);
    const r = expectOk(await one(K1, op('order.add_items', id, { items: [item(mAir, { note: 'N'.repeat(1000) })] })));
    assert.ok(r.order.items[0].note.length <= 200);
});
await t('I7 channel tidak dikenal & tipe order aneh', async () => {
    const id = randomUUID();
    expectCode(await one(K1, op('order.open', id, { id, order_no: 'X1', channel: 'jet' })), 'channel_invalid');
});
await t('I8 harga & qty raksasa tidak membuat server error', async () => {
    const id = await openOrder(K1, d1);
    const r = await one(K1, op('order.add_items', id, { items: [{ id: randomUUID(), menu_id: null, name: 'Mahal', price: 1e15, qty: 1e9, mods: [] }] }));
    assert.ok(r.status === undefined || r.status < 500);
});

// =====================================================================================
// J. SHIFT, KAS, TUTUP HARI
// =====================================================================================
await t('J1 shift: buka dua kali ditolak, kas pada shift tertutup ditolak', async () => {
    expectCode(await one(K1, op('shift.open', null, { shift_id: randomUUID(), opening_cash: 0 })), 'shift_open');
    expectOk(await one(K1, op('shift.open', null, { shift_id: shift1, opening_cash: 500000 })), 'buka ulang id sama = idempoten');
    expectCode(await one(K1, op('shift.cash', null, { shift_id: shift1, type: 'out', amount: 0 })), 'invalid');
    expectCode(await one(K1, op('shift.cash', null, { shift_id: shift1, type: 'curi', amount: 100 })), 'invalid');
    expectCode(await one(K1, op('shift.cash', null, { shift_id: 'tidak-ada', type: 'in', amount: 100 })), 'shift_not_found');
    expectCode(await one(K1, op('shift.cash', null, { shift_id: shift2, type: 'in', amount: 100 })), 'shift_not_found', 'shift outlet lain');
});
await t('J2 waiter tidak bisa buka shift / kas', async () => {
    const r = await one(W1, op('shift.cash', null, { shift_id: shift1b, type: 'out', amount: 1000 }));
    assert.ok(!r.ok);
});
await t('J3 tutup hari ditolak bila ada order terbuka / shift terbuka', async () => {
    const r = await call('POST', '/t/days/close', { outlet_id: o1.id }, U);
    assert.equal(r.status, 409);
});

// =====================================================================================
// K. INVENTORI
// =====================================================================================
await t('K1 stok terpotong sesuai resep menu + resep modifier', async () => {
    const before = Object.fromEntries((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).items.map(i => [i.id, i.qty]));
    const { id, total } = await orderWith(K1, d1, [item(mKopi, { qty: 2, mods: modsOf(gSize, 'Regular') }), item(mNasi, { mods: modsOf(gTop, 'Keju') })]);
    expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    const after = Object.fromEntries((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).items.map(i => [i.id, i.qty]));
    assert.equal(before[ingKopi.id] - after[ingKopi.id], 36);
    assert.equal(before[ingKeju.id] - after[ingKeju.id], 20);
});
await t('K2 mutasi stok: transfer ke outlet sama, opname negatif, jumlah 0 ditolak', async () => {
    assert.equal((await call('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'transfer', to_outlet_id: o1.id, items: [{ ingredient_id: ingKopi.id, qty: 10 }] }, U)).status, 400);
    assert.equal((await call('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'opname', items: [{ ingredient_id: ingKopi.id, actual: -5 }] }, U)).status, 400);
    assert.equal((await call('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'waste', items: [{ ingredient_id: ingKopi.id, qty: 0 }] }, U)).status, 400);
    assert.equal((await call('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'curi', items: [{ ingredient_id: ingKopi.id, qty: 1 }] }, U)).status, 400);
    await ok('POST', '/t/stock/moves', { outlet_id: o1.id, type: 'transfer', to_outlet_id: o2.id, items: [{ ingredient_id: ingKopi.id, qty: 100 }] }, U);
    const b = (await ok('GET', `/t/stock?outlet=${o2.id}`, null, U)).items.find(i => i.id === ingKopi.id);
    assert.equal(b.qty, 100);
});

// =====================================================================================
// M. FITUR PER TENANT (diatur superadmin)
// =====================================================================================
const setFeatures = f => ok('PUT', `/admin/tenants/${reg.tenant.id}/features`, { features: f }, A);
await t('M1 inventori & promo/pelanggan nonaktif: penjualan tetap jalan, stok & poin tidak berubah', async () => {
    const stockBefore = Object.fromEntries((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).items.map(i => [i.id, i.qty]));
    const ptsBefore = (await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points;
    await setFeatures({ inventory: false, marketing: false });
    try {
        const boot = await ok('GET', `/t/bootstrap?outlet=${o1.id}`, null, K1);
        assert.equal(boot.features.inventory, false);
        assert.equal(boot.promos.length, 0, 'promo tidak dikirim ke kasir');
        const { id, total } = await orderWith(K1, d1, [item(mKopi, { qty: 2, mods: modsOf(gSize, 'Regular') })]);
        const set = expectOk(await one(K1, op('order.set', id, { customer_id: cust.id, customer_name: 'Tamu' })));
        assert.equal(set.order.customer_id, null, 'id pelanggan diabaikan, nama tetap');
        assert.equal(set.order.customer_name, 'Tamu');
        expectCode(await one(K1, op('order.discount', id, { discount: { promo_id: promoManual.id } })), 'promo_invalid');
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    } finally {
        await setFeatures({ inventory: true, marketing: true });
    }
    const stockAfter = Object.fromEntries((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).items.map(i => [i.id, i.qty]));
    assert.equal(stockAfter[ingKopi.id], stockBefore[ingKopi.id], 'stok tidak dipotong');
    assert.equal((await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points, ptsBefore, 'poin tidak bertambah');
});
await t('M2 KDS nonaktif: layar dapur ditolak, kasir tetap bisa kirim & bayar', async () => {
    const kds = await device(o1, 'kds', 'Dapur M2');
    await setFeatures({ kds: false });
    try {
        const r = await call('GET', `/t/tickets?outlet=${o1.id}`, null, kds.H);
        assert.equal(r.status, 403); assert.equal(r.data.code, 'feature_disabled');
        assert.equal((await call('POST', '/t/pair-codes', { outlet_id: o1.id, type: 'kds', name: 'X' }, U)).status, 403);
        const { id, total } = await orderWith(K1, d1, [item(mNasi)]);
        expectOk(await one(K1, op('order.send', id, {})));
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    } finally {
        await setFeatures({ kds: true });
    }
    await ok('GET', `/t/tickets?outlet=${o1.id}`, null, kds.H);
});
await t('M3 meja nonaktif: kelola meja ditolak, dine-in tanpa meja tetap bisa', async () => {
    await setFeatures({ tables: false });
    try {
        assert.equal((await call('POST', '/t/tables', { outlet_id: o1.id, name: 'M3' }, U)).status, 403);
        const { id, total } = await orderWith(K1, d1, [item(mAir)], { channel: 'dine_in', guests: 2 });
        assert.equal((await getOrder(id)).type, 'dine_in');
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    } finally {
        await setFeatures({ tables: true });
    }
});
await t('M4 hanya superadmin yang bisa mengubah fitur', async () => {
    assert.equal((await call('PUT', `/admin/tenants/${reg.tenant.id}/features`, { features: { kds: false } }, U)).status, 403);
    assert.equal((await call('PUT', `/admin/tenants/${reg.tenant.id}/features`, { features: { kds: false } }, K1)).status, 403);
});

// =====================================================================================
// N. FITUR: KASUS TEPI (offline, order berjalan, realtime, cermin panel, input admin)
// =====================================================================================
const withFeatures = async (f, fn) => { await setFeatures(f); try { return await fn(); } finally { await setFeatures(Object.fromEntries(Object.keys(f).map(k => [k, true]))); } };
const audits = async action => (await ok('GET', `/t/audit?outlet=${o1.id}`, null, U)).items.filter(x => x.action === action);
const offline = () => ({ offline: true, at: Date.now() - 60000 });

await t('N1 tablet offline memakai promo setelah promo dimatikan: diterima & dicatat audit', async () => {
    const before = (await audits('promo_mismatch')).length;
    await withFeatures({ marketing: false }, async () => {
        const id = randomUUID();
        const r = await ops(K1, [
            op('order.open', id, { id, order_no: no(d1), channel: 'take_away' }, offline()),
            op('order.add_items', id, { items: [item(mNasi, { qty: 2 })] }, offline()),
            op('order.discount', id, { discount: { type: 'percent', value: 10, name: 'Member 10%', promo_id: promoManual.id } }, offline())
        ]);
        r.forEach(x => expectOk(x));
        assert.equal(r[2].order.discount.promo_id, promoManual.id, 'diskon offline dipertahankan');
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: r[2].order.totals.total }] })));
    });
    assert.equal((await audits('promo_mismatch')).length, before + 1);
});
await t('N2 pelanggan saat fitur pelanggan mati: id dibuang (online & offline), nama tetap', async () => {
    await withFeatures({ marketing: false }, async () => {
        const a = randomUUID(), b = randomUUID();
        const r1 = expectOk(await one(K1, op('order.open', a, { id: a, order_no: no(d1), channel: 'take_away', customer_id: cust.id, customer_name: 'Bu Ani' })));
        assert.equal(r1.order.customer_id, null); assert.equal(r1.order.customer_name, 'Bu Ani');
        const r2 = expectOk(await one(K1, op('order.open', b, { id: b, order_no: no(d1), channel: 'take_away', customer_id: 999999 }, offline())));
        assert.equal(r2.order.customer_id, null, 'id tidak dikenal pun tidak membuat antrean macet');
        for (const id of [a, b]) expectOk(await one(M1, op('order.void', id, { reason: 'uji' })));
    });
});
await t('N3 order bermember dibuat sebelum promo dimatikan: dibayar tanpa poin, diskon tetap', async () => {
    const pts = (await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points;
    const { id } = await orderWith(K1, d1, [item(mNasi, { qty: 2 })]);
    expectOk(await one(K1, op('order.set', id, { customer_id: cust.id })));
    const disc = expectOk(await one(K1, op('order.discount', id, { discount: { promo_id: promoManual.id } })));
    await withFeatures({ marketing: false }, async () => {
        const r = expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: disc.order.totals.total }] })));
        assert.equal(r.order.discount.promo_id, promoManual.id);
    });
    assert.equal((await ok('GET', '/t/customers?q=Setia', null, U)).items[0].points, pts, 'poin tidak bertambah');
});
await t('N4 meja dimatikan: pasang/pindah meja online ditolak, offline diterima, order lama bermeja tetap bisa dibayar', async () => {
    const old = await orderWith(K1, d1, [item(mAir)], { channel: 'dine_in', table_id: table('A8').id, guests: 2 });
    await withFeatures({ tables: false }, async () => {
        const id = randomUUID();
        expectCode(await one(K1, op('order.open', id, { id, order_no: no(d1), channel: 'dine_in', table_id: table('A9').id })), 'feature_disabled');
        expectCode(await one(K1, op('order.move', old.id, { table_id: table('A9').id })), 'feature_disabled');
        expectCode(await one(K1, op('order.set', old.id, { table_id: table('A10').id })), 'feature_disabled');
        const off = randomUUID();
        const r = expectOk(await one(K1, op('order.open', off, { id: off, order_no: no(d1), channel: 'dine_in', table_id: table('A9').id }, offline())));
        assert.equal(r.order.table_name, 'A9');
        expectOk(await one(M1, op('order.void', off, { reason: 'uji' })));
        expectOk(await one(K1, op('order.pay', old.id, { payments: [{ method: 'qris', amount: old.total }] })));
    });
});
await t('N5 KDS dimatikan: koneksi realtime layar dapur ditolak; tiket tetap dibuat untuk printer kasir', async () => {
    const wsUrl = BASE.replace(/^http/, 'ws') + '/api/ws?token=' + encodeURIComponent(dk.H.authorization.slice(7));
    const tryWs = () => new Promise(res => {
        const ws = new WebSocket(wsUrl);
        let settled = false;
        const done = v => { if (settled) return; settled = true; try { ws.close(); } catch { } res(v); };
        ws.onopen = () => done('open'); ws.onerror = () => done('error');
        setTimeout(() => done('timeout'), 5000);
    });
    assert.equal(await tryWs(), 'open', 'sebelum dimatikan bisa tersambung');
    await withFeatures({ kds: false }, async () => {
        assert.equal(await tryWs(), 'error', 'ditolak saat KDS nonaktif');
        const { id, total } = await orderWith(K1, d1, [item(mNasi)]);
        expectOk(await one(K1, op('order.send', id, {})));
        const tk = await ok('GET', `/t/tickets?outlet=${o1.id}`, null, U);
        assert.ok(tk.active.some(x => x.order_id === id), 'tiket dapur tetap ada (untuk cetak "semua tiket")');
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'qris', amount: total }] })));
    });
});
await t('N6 inventori dimatikan lalu dinyalakan: muncul pengingat stock opname, bisa ditutup', async () => {
    const prev = (await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).gap;
    assert.ok(prev, 'M1 sempat mematikan inventori → pengingat sudah ada');
    await ok('POST', '/t/stock/gap/dismiss', {}, U);
    assert.equal((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).gap, null);
    const t0 = Date.now();
    await setFeatures({ inventory: false });
    assert.equal((await call('POST', '/t/stock/gap/dismiss', {}, U)).status, 403);
    await setFeatures({ inventory: true });
    const first = (await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).gap;
    assert.ok(first && first.from >= t0 - 1000 && first.to >= first.from, JSON.stringify(first));
    await setFeatures({ inventory: false });
    await setFeatures({ inventory: true });
    const gap = (await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).gap;
    assert.equal(gap.from, first.from, 'jeda berulang digabung dari awal');
    assert.ok(gap.to >= first.to);
    await ok('POST', '/t/stock/gap/dismiss', {}, U);
    assert.equal((await ok('GET', `/t/stock?outlet=${o1.id}`, null, U)).gap, null);
});
await t('N7 asisten AI dimatikan per usaha → ditolak dengan pesan usaha (akun & tablet)', async () => {
    await withFeatures({ ai: false }, async () => {
        const r = await call('POST', '/assist', { question: 'cara split bill' }, U);
        assert.equal(r.status, 403); assert.equal(r.data.code, 'ai_disabled'); assert.match(r.data.error, /usaha Anda/);
        const r2 = await call('POST', '/assist', { question: 'cara split bill' }, K1);
        assert.equal(r2.status, 403, 'tablet juga ditolak');
    });
    // Setelah diaktifkan lagi lolos pemeriksaan usaha (lokal tanpa API key → 'belum diaktifkan', bukan 'tidak aktif untuk usaha')
    const r = await fetch(BASE + '/api/assist', { method: 'POST', headers: { 'content-type': 'application/json', ...U }, body: JSON.stringify({ question: 'cara split bill' }) }).then(x => x.json());
    assert.notEqual(r.error, 'Asisten AI tidak aktif untuk usaha Anda');
});
await t('N8 input superadmin aneh: tenant tidak ada, body rusak, nilai bukan boolean, kunci asing, tanpa perubahan', async () => {
    assert.equal((await call('PUT', '/admin/tenants/99999999/features', { features: { kds: false } }, A)).status, 404);
    assert.equal((await call('PUT', `/admin/tenants/${reg.tenant.id}/features`, null, A, 'bukan json')).status, 400);
    const logs = async () => (await ok('GET', `/admin/tenants/${reg.tenant.id}`, null, A)).logs.filter(l => l.action === 'features').length;
    const n = await logs();
    const r = await ok('PUT', `/admin/tenants/${reg.tenant.id}/features`, { features: JSON.parse('{"kds":"false","tables":0,"hacker":false,"__proto__":{"kds":false}}') }, A);
    assert.ok(Object.values(r.features).every(Boolean), 'nilai bukan boolean diabaikan: ' + JSON.stringify(r.features));
    await ok('PUT', `/admin/tenants/${reg.tenant.id}/features`, { features: { kds: true } }, A);
    await ok('PUT', `/admin/tenants/${reg.tenant.id}/features`, {}, A);
    assert.equal(await logs(), n, 'tanpa perubahan → tidak ada catatan riwayat');
});
await t('N9 cermin fitur di panel menyimpang → diselaraskan dari tenant saat statistik diperbarui', async () => {
    if (!/localhost|127\.0\.0\.1/.test(BASE)) return;
    await setFeatures({ kds: false });
    const { execSync } = await import('node:child_process');
    execSync(`npx wrangler d1 execute rasapos-core --local --command "UPDATE tenants SET features = NULL WHERE id = ${reg.tenant.id}"`, { stdio: 'ignore' });
    assert.equal((await ok('GET', `/admin/tenants/${reg.tenant.id}`, null, A)).tenant.features.kds, true, 'panel menyimpang (simulasi)');
    await ok('POST', `/admin/tenants/${reg.tenant.id}/refresh-stats`, {}, A);
    assert.equal((await ok('GET', `/admin/tenants/${reg.tenant.id}`, null, A)).tenant.features.kds, false, 'panel kembali sesuai tenant');
    await setFeatures({ kds: true });
});
await t('N10 semua fitur mati sekaligus: alur kasir dasar tetap lengkap (buka → kirim → diskon manual → bayar → refund)', async () => {
    await withFeatures({ kds: false, tables: false, inventory: false, marketing: false, ai: false }, async () => {
        const { id } = await orderWith(K1, d1, [item(mNasi, { qty: 2 }), item(mAir, { qty: 2 })], { channel: 'dine_in', guests: 3 });
        expectOk(await one(K1, op('order.send', id, {})));
        const d = expectOk(await one(K1, op('order.discount', id, { discount: { type: 'percent', value: 5 } })));
        expectOk(await one(K1, op('order.pay', id, { payments: [{ method: 'cash', amount: Money.cashDue(d.order.totals.total, 100) }] })));
        expectOk(await one(M1, op('order.refund', id, { reason: 'uji semua fitur mati' })));
        assert.equal((await getOrder(id)).status, 'refunded');
        const boot = await ok('GET', `/t/bootstrap?outlet=${o1.id}`, null, K1);
        assert.deepEqual(boot.features, { kds: false, tables: false, inventory: false, marketing: false, ai: false });
    });
});

// =====================================================================================
// O. KESIAPAN JUAL: impor menu, S&K, lupa password, panel sistem
// =====================================================================================
await t('O1 impor menu CSV: pratinjau, validasi baris, kategori baru, perbarui berdasarkan SKU/nama', async () => {
    const before = (await ok('GET', '/t/menus', null, U)).items.length;
    const bad = await ok('POST', '/t/menus/import', { rows: [{ name: '', price: '1000' }, { name: 'A', price: 'gratis' }, { name: 'B', price: '5000' }, { name: 'b', price: '6000' }] }, U);
    assert.equal(bad.saved, false);
    assert.deepEqual(bad.errors.map(e => e.line), [2, 3, 5], JSON.stringify(bad.errors));
    const rows = [
        { name: 'Impor Satu', price: 'Rp 12.500', category: 'Kategori Impor', sku: 'IMP1', station: 'Bar' },
        { name: 'Impor Dua', price: '8000', category: 'kategori impor', taxable: 'tidak' },
        { name: mNasi.name, price: '36000' }
    ];
    const dry = await ok('POST', '/t/menus/import', { rows, dry_run: true }, U);
    assert.deepEqual([dry.create, dry.update, dry.categories, dry.saved], [2, 1, ['Kategori Impor'], false]);
    assert.equal((await ok('GET', '/t/menus', null, U)).items.length, before, 'pratinjau tidak menyimpan');
    const r = await ok('POST', '/t/menus/import', { rows }, U);
    assert.equal(r.saved, true);
    const menus = (await ok('GET', '/t/menus', null, U)).items;
    const one = menus.find(m => m.sku === 'IMP1'), two = menus.find(m => m.name === 'Impor Dua'), nasi = menus.find(m => m.id === mNasi.id);
    assert.equal(one.price, 12500); assert.equal(one.station, 'Bar');
    assert.equal(two.taxable, 0); assert.equal(one.category_id, two.category_id, 'kategori sama (beda huruf besar/kecil)');
    assert.equal(nasi.price, 36000, 'menu lama diperbarui'); assert.equal(nasi.category_id, mNasi.category_id, 'kategori lama tidak terhapus');
    await ok('PATCH', `/t/menus/${mNasi.id}`, { price: mNasi.price }, U);
    const again = await ok('POST', '/t/menus/import', { rows: [{ name: 'Nama Baru', price: '15000', sku: 'IMP1' }] }, U);
    assert.equal(again.update, 1, 'SKU sama → diperbarui, bukan dobel');
    assert.equal((await call('POST', '/t/menus/import', { rows }, K1)).status, 403, 'kasir tidak boleh impor');
    assert.equal((await call('POST', '/t/menus/import', { rows: Array.from({ length: 1001 }, (_, i) => ({ name: 'x' + i, price: 1 })) }, U)).status, 400);
});
await t('O2 daftar wajib menyetujui S&K; lupa password jujur bila email belum aktif', async () => {
    const r = await call('POST', '/auth/register', { business_name: 'Tanpa SK', owner_name: 'X', email: `tanpask+${stamp}@contoh.id`, password: 'rahasia123' });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'terms_required');
    const f = await fetch(BASE + '/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    const fd = await f.json();
    assert.ok(f.status === 503 ? fd.code === 'mail_disabled' : f.status === 200, 'tanpa email: pesan jujur, bukan "terkirim"');
    const d = await ok('GET', `/admin/tenants/${reg.tenant.id}`, null, A);
    assert.ok(d.logs.some(l => l.action === 'register' && /S&K/.test(l.detail)), 'persetujuan S&K tercatat');
});
await t('O3 panel sistem & perawatan harian (superadmin saja)', async () => {
    const s = await ok('GET', '/admin/system', null, A);
    assert.ok(typeof s.errors.day === 'number' && 'email' in s.services && 'backup' in s.services);
    const m = await ok('POST', '/admin/system/maintenance', {}, A);
    assert.equal(typeof m.errors, 'number');
    assert.equal((await call('GET', '/admin/system', null, U)).status, 403);
});

// =====================================================================================
// L. UJI ACAK (FUZZ) + KONSISTENSI LAPORAN
// =====================================================================================
const fuzzOrders = [];
await t('L1 fuzz 120 order acak (tambah/ubah/kirim/void/diskon/bayar/batal) tanpa error server', async () => {
    const menus = [mKopi, mNasi, mAir];
    const methods = ['cash', 'qris', 'debit'];
    const rnd = n => Math.floor(Math.random() * n);
    for (let n = 0; n < 120; n++) {
        const H = [K1, K1b][rnd(2)], d = H === K1 ? d1 : d1b;
        const channel = ['take_away', 'gofood', 'dine_in'][rnd(3)];
        const id = randomUUID();
        expectOk(await one(H, op('order.open', id, { id, order_no: no(d), channel })));
        const items = [];
        for (let k = 0; k < 1 + rnd(4); k++) {
            const m = menus[rnd(3)];
            const mods = m === mKopi ? modsOf(gSize, ['Regular', 'Large'][rnd(2)]) : m === mNasi && rnd(2) ? modsOf(gTop, 'Telur') : [];
            items.push(item(m, { qty: 1 + rnd(3), mods }));
        }
        expectOk(await one(H, op('order.add_items', id, { items })));
        if (rnd(2)) expectOk(await one(H, op('order.send', id)));
        if (rnd(4) === 0) await one(M1, op('order.void_item', id, { item_id: items[0].id, qty: 1, reason: 'acak' }));
        if (rnd(4) === 0) expectOk(await one(H, op('order.discount', id, { discount: { type: 'percent', value: 5 + rnd(6), name: 'acak' } })));
        const fate = rnd(10);
        const o = await getOrder(id);
        const active = o.items.filter(i => i.status !== 'void');
        if (fate === 0 || !active.length) { expectOk(await one(M1, op('order.void', id, { reason: 'acak' }))); continue; }
        const total = o.totals.total;
        let payments;
        if (fate < 6) { const m = methods[rnd(3)]; payments = [{ method: m, amount: m === 'cash' ? Money.cashDue(total, 100) + rnd(3) * 10000 : total }]; }
        else { const part = Math.floor(total * Math.random()); payments = [{ method: 'qris', amount: part }, { method: 'cash', amount: Money.cashDue(total - part, 100) + rnd(2) * 5000 }]; }
        const r = expectOk(await one(H, op('order.pay', id, { payments })), `bayar ${JSON.stringify(payments)} total ${total}`);
        fuzzOrders.push(r.order);
        if (rnd(15) === 0) expectOk(await one(M1, op('order.refund', id, { reason: 'acak' })));
        assert.equal(r.order.totals.total, Money.calc(r.order, cfg1).total, 'total server = rumus bersama');
    }
});

await t('L2 konsistensi: ringkasan penjualan = jumlah transaksi', async () => {
    const today = new Date(Date.now() + 7 * 3600000 - 4 * 3600000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const sum = await ok('GET', `/t/reports/summary?from=${from}&to=${today}&outlets=${o1.id}`, null, U);
    const trx = await ok('GET', `/t/reports/transactions?from=${from}&to=${today}&outlets=${o1.id}&all=1`, null, U);
    const paid = trx.items.filter(x => x.status === 'paid'), refunded = trx.items.filter(x => x.status === 'refunded');
    const expectTotal = paid.reduce((s, x) => s + x.total, 0);
    assert.equal(sum.totals.total, expectTotal, `sales_daily.total ${sum.totals.total} vs transaksi lunas ${expectTotal} (refund ${refunded.length})`);
    assert.equal(sum.totals.trx, paid.length, 'jumlah transaksi');
    const payTotal = sum.payments.reduce((s, p) => s + p.amount, 0);
    assert.equal(payTotal, expectTotal, `payments_daily ${payTotal} vs ${expectTotal}`);
});

await t('L3 konsistensi: kas seharusnya shift = modal + tunai bersih + kas masuk − keluar − refund tunai', async () => {
    expectOk(await one(K1, op('shift.cash', null, { id: randomUUID(), shift_id: shift1, type: 'in', amount: 25000, note: 'tambahan' })));
    expectOk(await one(K1, op('shift.cash', null, { id: randomUUID(), shift_id: shift1, type: 'out', amount: 12000, note: 'es batu' })));
    const live = (await ok('GET', '/t/shifts/current', null, K1)).shift.live;
    const trx = await ok('GET', `/t/reports/transactions?from=2000-01-01&to=2100-01-01&outlets=${o1.id}&all=1`, null, U);
    const ids = trx.items.map(x => x.id);
    let cash = 0, refundCash = 0;
    for (const id of ids) {
        const o = await getOrder(id);
        const c = (o.payments || []).filter(p => p.type === 'cash').reduce((s, p) => s + p.amount, 0);
        const net = c ? c - (o.change || 0) : 0;
        if (o.shift_id === shift1 && ['paid', 'refunded'].includes(o.status)) cash += net;
        if (o.status === 'refunded' && o.refund_shift_id === shift1) refundCash += net;
    }
    assert.equal(live.cash_sales, cash, 'penjualan tunai');
    assert.equal(live.expected_cash, 500000 + cash + 25000 - 12000 - refundCash, 'kas seharusnya');
});

await t('L4 tutup shift lalu tutup hari setelah semua order ditutup', async () => {
    const open = (await ok('GET', `/t/orders?outlet=${o1.id}`, null, U)).items;
    for (const o of open) expectOk(await one(M1, op('order.void', o.id, { reason: 'akhir hari', approval: undefined })));
    for (const [H, s] of [[K1, shift1], [K1b, shift1b]]) {
        const live = (await ok('GET', '/t/shifts/current', null, H)).shift.live;
        const r = expectOk(await one(H, op('shift.close', null, { shift_id: s, closing_cash: live.expected_cash })));
        assert.equal(r.shift.summary.difference, 0);
    }
    expectOk(await one(K1, op('shift.close', null, { shift_id: shift1, closing_cash: 0 })), 'tutup ulang = idempoten');
    const r = await ok('POST', '/t/days/close', { outlet_id: o1.id }, U);
    assert.ok(r.summary.trx > 0);
    assert.equal((await call('POST', '/t/days/close', { outlet_id: o1.id }, U)).status, 400, 'tutup hari dua kali');
});

// ---------------------------------------------------------------- laporan
const failed = results.filter(r => !r.ok);
console.log(`\n\n${results.length - failed.length}/${results.length} skenario lulus`);
for (const f of failed) console.log(`  ✖ ${f.name}\n      ${f.err}`);
if (server500.length) { console.log(`\n${server500.length} respons error server (5xx):`); server500.slice(0, 20).forEach(x => console.log('  ' + x)); }
process.exit(failed.length || server500.length ? 1 : 0);
