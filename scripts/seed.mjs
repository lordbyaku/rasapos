// Isi data demo ke server lokal: `npm run seed` (server `npm run dev` harus berjalan).
// Akun: superadmin admin@rasapos.local / admin12345 · owner demo@rasapos.local / demo12345
import { randomUUID } from 'node:crypto';
import '../public/js/shared/money.js';
const { Money } = globalThis;

const BASE = process.argv[2] || 'http://localhost:8787';
async function call(method, path, body, headers = {}) {
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return data;
}
async function loginOrRegister(email, password, reg) {
    try { return await call('POST', '/auth/login', { email, password }); } catch { return call('POST', '/auth/register', { ...reg, email, password }); }
}

const admin = await loginOrRegister('admin@rasapos.local', 'admin12345', { business_name: 'RasaPOS Admin', owner_name: 'Admin', outlet_name: 'Demo' });
let owner = await loginOrRegister('demo@rasapos.local', 'demo12345', { business_name: 'Kopi & Makan Nusantara', owner_name: 'Trisna', phone: '081234567890', outlet_name: 'Sudirman' });
const A = { authorization: 'Bearer ' + admin.access_token };
await call('POST', `/admin/tenants/${owner.tenant.id}/subscription`, { action: 'extend', months: 12, packs: 1 }, A);
owner = await call('POST', '/auth/login', { email: 'demo@rasapos.local', password: 'demo12345' });
const U = { authorization: 'Bearer ' + owner.access_token };
console.log('Tenant demo #' + owner.tenant.id, owner.tenant.license.state);

let meta = await call('GET', '/t/meta', null, U);
if (meta.outlets.length >= 3) { console.log('Data demo sudah ada. Lewati.'); process.exit(0); }

// Outlet
const o1 = meta.outlets[0];
await call('PATCH', `/t/outlets/${o1.id}`, { code: 'JKT-SDM', address: 'Jl. Jend. Sudirman No. 21, Jakarta', phone: '021-555-0101', service_rate: 5, receipt_footer: 'WiFi: nusantara / ngopidulu\nTerima kasih!' }, U);
const o2 = (await call('POST', '/t/outlets', { name: 'Kemang', code: 'JKT-KMG', address: 'Jl. Kemang Raya 8, Jakarta', service_rate: 5 }, U)).item;
const o3 = (await call('POST', '/t/outlets', { name: 'Dago', code: 'BDG-DGO', address: 'Jl. Ir. H. Juanda 120, Bandung', service_rate: 0, tax_rate: 10 }, U)).item;
const outlets = [o1, o2, o3];
for (const o of [o2, o3]) {
    const area = (await call('GET', `/t/areas?outlet=${o.id}`, null, U)).items[0];
    for (let i = 1; i <= 8; i++) await call('POST', '/t/tables', { outlet_id: o.id, area_id: area.id, name: 'A' + i, capacity: i % 3 === 0 ? 6 : 4, sort: i }, U);
}
const out1 = (await call('POST', '/t/areas', { outlet_id: o1.id, name: 'Outdoor', sort: 1 }, U)).item;
for (let i = 1; i <= 4; i++) await call('POST', '/t/tables', { outlet_id: o1.id, area_id: out1.id, name: 'B' + i, capacity: 4, sort: 10 + i }, U);
console.log('Outlet & meja dibuat');

// Kategori & modifier
meta = await call('GET', '/t/meta', null, U);
const cat = Object.fromEntries(meta.categories.map(c => [c.name, c.id]));
await call('PATCH', `/t/categories/${cat.Minuman}`, { name: 'Kopi', color: '#92400e' }, U);
cat.Kopi = cat.Minuman;
cat['Non-Kopi'] = (await call('POST', '/t/categories', { name: 'Non-Kopi', station: 'Bar', color: '#0ea5e9', sort: 2 }, U)).item.id;
cat.Snack = (await call('POST', '/t/categories', { name: 'Snack', station: 'Dapur', color: '#eab308', sort: 3 }, U)).item.id;
cat.Paket = (await call('POST', '/t/categories', { name: 'Paket', station: 'Dapur', color: '#22c55e', sort: 4 }, U)).item.id;
const grp = async (name, min, max, options) => (await call('POST', '/t/modifier-groups', { name, min_select: min, max_select: max, options }, U)).item;
const gSize = await grp('Ukuran', 1, 1, [{ name: 'Regular', price: 0 }, { name: 'Large', price: 6000 }]);
const gTemp = await grp('Suhu', 1, 1, [{ name: 'Hot', price: 0 }, { name: 'Ice', price: 0 }]);
const gSugar = await grp('Gula', 0, 1, [{ name: 'Normal', price: 0 }, { name: 'Less Sugar', price: 0 }, { name: 'No Sugar', price: 0 }]);
const gAddon = await grp('Tambahan', 0, 3, [{ name: 'Extra Shot', price: 5000 }, { name: 'Oat Milk', price: 8000 }, { name: 'Boba', price: 5000 }]);
const gSpicy = await grp('Level Pedas', 1, 1, [{ name: 'Tidak Pedas', price: 0 }, { name: 'Sedang', price: 0 }, { name: 'Pedas', price: 0 }, { name: 'Extra Pedas', price: 2000 }]);
const gTop = await grp('Topping', 0, 3, [{ name: 'Telur Mata Sapi', price: 5000 }, { name: 'Keju', price: 6000 }, { name: 'Kerupuk', price: 3000 }]);

// Bahan
const ing = async (name, unit, cost, min) => (await call('POST', '/t/ingredients', { name, unit, cost, min_stock: min }, U)).item.id;
const iKopi = await ing('Biji kopi espresso', 'gr', 250, 500), iSusu = await ing('Susu UHT', 'ml', 18, 3000), iAren = await ing('Gula aren cair', 'ml', 40, 500);
const iBeras = await ing('Beras', 'gr', 14, 5000), iAyam = await ing('Ayam potong', 'pcs', 9000, 20), iTelur = await ing('Telur', 'butir', 2200, 30), iCup = await ing('Cup 16oz + tutup', 'pcs', 1400, 200);

const M = [
    ['Kopi Susu Gula Aren', 'Kopi', 25000, [gSize, gTemp, gSugar, gAddon], [[iKopi, 18], [iSusu, 150], [iAren, 25], [iCup, 1]]],
    ['Americano', 'Kopi', 22000, [gSize, gTemp, gAddon], [[iKopi, 18], [iCup, 1]]],
    ['Cafe Latte', 'Kopi', 28000, [gSize, gTemp, gSugar, gAddon], [[iKopi, 18], [iSusu, 180], [iCup, 1]]],
    ['Cappuccino', 'Kopi', 28000, [gSize, gTemp, gAddon], [[iKopi, 18], [iSusu, 150], [iCup, 1]]],
    ['Espresso', 'Kopi', 18000, [gAddon], [[iKopi, 18]]],
    ['Matcha Latte', 'Non-Kopi', 30000, [gSize, gTemp, gSugar, gAddon], [[iSusu, 180], [iCup, 1]]],
    ['Coklat Signature', 'Non-Kopi', 28000, [gSize, gTemp, gSugar], [[iSusu, 180], [iCup, 1]]],
    ['Es Teh Leci', 'Non-Kopi', 20000, [gSize, gSugar], [[iCup, 1]]],
    ['Air Mineral', 'Non-Kopi', 8000, [], []],
    ['Nasi Goreng Kampung', 'Makanan', 35000, [gSpicy, gTop], [[iBeras, 200], [iTelur, 1]]],
    ['Mie Goreng Jawa', 'Makanan', 33000, [gSpicy, gTop], [[iTelur, 1]]],
    ['Ayam Bakar Madu', 'Makanan', 42000, [gSpicy], [[iBeras, 150], [iAyam, 1]]],
    ['Nasi Ayam Geprek', 'Makanan', 30000, [gSpicy, gTop], [[iBeras, 150], [iAyam, 1]]],
    ['Kentang Goreng', 'Snack', 22000, [], []],
    ['Pisang Goreng Keju', 'Snack', 24000, [], []],
    ['Croissant Butter', 'Snack', 26000, [], []],
    ['Paket Hemat Geprek + Es Teh', 'Paket', 42000, [gSpicy], [[iBeras, 150], [iAyam, 1], [iCup, 1]]]
];
const menus = [];
for (const [i, [name, c, price, groups, recipe]] of M.entries()) {
    const station = c === 'Snack' && name.includes('Croissant') ? 'Pastry' : undefined;
    menus.push((await call('POST', '/t/menus', { name, category_id: cat[c], price, sort: i, station, modifier_group_ids: groups.map(g => g.id), recipe: recipe.map(([ingredient_id, qty]) => ({ ingredient_id, qty })) }, U)).item);
}
await call('PUT', '/t/outlet-menus', { outlet_id: o2.id, items: menus.map(m => ({ menu_id: m.id, price: m.price + 3000, is_available: true })) }, U);
console.log(menus.length + ' menu dibuat');

// Stok awal & promo & pelanggan
for (const o of outlets) await call('POST', '/t/stock/moves', { outlet_id: o.id, type: 'purchase', note: 'Stok awal', items: [[iKopi, 3000, 240], [iSusu, 20000, 17], [iAren, 3000, 38], [iBeras, 25000, 13], [iAyam, 80, 8800], [iTelur, 120, 2100], [iCup, 600, 1350]].map(([ingredient_id, qty, cost]) => ({ ingredient_id, qty, cost })) }, U);
await call('POST', '/t/promos', { name: 'Happy Hour Kopi', type: 'percent', value: 15, start_time: '14:00', end_time: '17:00', days: [1, 2, 3, 4, 5], min_subtotal: 50000 }, U);
await call('POST', '/t/promos', { name: 'Diskon Member 10%', type: 'percent', value: 10, auto_apply: 0 }, U);
for (const [n, p] of [['Andi Wijaya', '081211110001'], ['Sari Lestari', '081211110002'], ['Budi Santoso', '081211110003']]) await call('POST', '/t/customers', { name: n, phone: p }, U);
await call('PUT', '/t/settings', { settings: { loyalty: { enabled: true, amount_per_point: 10000 } } }, U);

// Staff
const staff = {};
for (const o of outlets) {
    staff[o.id] = {
        mgr: (await call('POST', '/t/staff', { name: 'Manager ' + o.name, role: 'manager', pin: '111111', outlet_ids: [o.id] }, U)).item,
        kasir: (await call('POST', '/t/staff', { name: ['Rina', 'Dimas', 'Sari'][outlets.indexOf(o)], role: 'cashier', pin: '1234', outlet_ids: [o.id] }, U)).item,
        waiter: (await call('POST', '/t/staff', { name: ['Budi', 'Ayu', 'Rizky'][outlets.indexOf(o)], role: 'waiter', pin: '2222', outlet_ids: [o.id] }, U)).item
    };
}
await call('POST', '/t/staff', { name: 'Chef Dapur', role: 'kitchen', pin: '3333', outlet_ids: outlets.map(o => o.id) }, U);
console.log('Staff: manager PIN 111111, kasir PIN 1234, waiter PIN 2222');

// Transaksi historis 7 hari per outlet (via perangkat simulasi)
const rnd = n => Math.floor(Math.random() * n);
for (const o of outlets) {
    const pc = await call('POST', '/t/pair-codes', { outlet_id: o.id, type: 'pos', name: 'Kasir-Seed' }, U);
    const dev = await call('POST', '/auth/pair', { code: pc.code });
    const D = { authorization: 'Bearer ' + dev.access_token };
    const sl = await call('POST', '/t/staff-login', { staff_id: staff[o.id].kasir.id, pin: '1234' }, D);
    const S = { ...D, 'x-staff-token': sl.staff_token };
    const boot = await call('GET', '/t/bootstrap', null, S);
    const priceOf = m => boot.menus.find(x => x.id === m.id).outlet_price ?? m.price;
    const ops = [];
    let seq = 0;
    for (let day = 6; day >= 0; day--) {
        const n = 12 + rnd(14) + (o === o1 ? 10 : o === o3 ? -4 : 0);
        for (let k = 0; k < n; k++) {
            const d = new Date(); d.setDate(d.getDate() - day); d.setHours(8 + rnd(13), rnd(60), 0, 0);
            const at = Math.min(d.getTime(), Date.now() - 60000);
            const id = randomUUID();
            const chRoll = rnd(10);
            const channel = chRoll < 6 ? 'dine_in' : chRoll < 8 ? 'take_away' : chRoll < 9 ? 'gofood' : 'grabfood';
            const items = [];
            for (let j = 0; j < 1 + rnd(4); j++) {
                const m = menus[rnd(menus.length)];
                const mods = m.modifier_group_ids.map(gid => [gSize, gTemp, gSugar, gAddon, gSpicy, gTop].find(g => g.id === gid)).filter(g => g.min_select > 0).map(g => ({ group: g.name, option_id: g.options[0].id, name: g.options[0].name, price: 0 }));
                let base = priceOf(m);
                if (channel === 'gofood' || channel === 'grabfood') base = Math.ceil(base * 1.2 / 100) * 100;
                items.push({ id: randomUUID(), menu_id: m.id, name: m.name, price: base, qty: 1 + (rnd(5) === 0 ? 1 : 0), mods });
            }
            const off = { offline: true, at };
            ops.push({ op_id: randomUUID(), type: 'order.open', order_id: id, payload: { id, order_no: `${dev.device.code}S${String(++seq).padStart(4, '0')}`, channel, guests: channel === 'dine_in' ? 1 + rnd(4) : 0 }, ...off });
            ops.push({ op_id: randomUUID(), type: 'order.add_items', order_id: id, payload: { items }, ...off });
            const type = channel === 'dine_in' ? 'dine_in' : channel === 'take_away' ? 'take_away' : 'online';
            const total = Money.calc({ type, items }, boot.outlet).total;
            const method = channel === 'gofood' || channel === 'grabfood' ? 'online' : ['cash', 'qris', 'qris', 'debit'][rnd(4)];
            ops.push({ op_id: randomUUID(), type: 'order.pay', order_id: id, payload: { payments: [{ method, amount: method === 'cash' ? Math.ceil(total / 1000) * 1000 + 1000 : total }] }, ...off });
        }
    }
    for (let i = 0; i < ops.length; i += 90) {
        const r = await call('POST', '/t/ops', { ops: ops.slice(i, i + 90) }, S);
        const bad = r.results.filter(x => !x.ok);
        if (bad.length) console.log('  gagal:', bad.slice(0, 2));
    }
    await call('POST', `/t/devices/${dev.device.id}/revoke`, null, U);
    console.log(`Transaksi demo ${o.name}: ${ops.length / 3}`);
}
console.log('\nSelesai. Login back office: demo@rasapos.local / demo12345 · superadmin: admin@rasapos.local / admin12345');
