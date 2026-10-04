// Tenant demo lengkap "Burger Mantul" (3 outlet: Jogja, Solo, Semarang) untuk simulasi & presentasi.
// Semua data dibuat lewat API resmi, sehingga laporan, stok, poin, audit, shift, dan tiket dapur konsisten.
//
//   node scripts/demo-burger.mjs <BASE_URL> --email <email-owner> [--days 14] [--activate wrangler|admin]
//
// --activate wrangler : aktifkan 1 paket (5 outlet) lewat `wrangler d1 execute --remote` (butuh login wrangler)
// --activate admin    : lewat API superadmin (env SA_EMAIL & SA_PASSWORD)
// Kredensial (password owner/manajer, PIN staff) ditulis ke .demo-burger-mantul.md (diabaikan git), tidak dicetak.
import { randomUUID, randomBytes, randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import '../public/js/shared/money.js';
import '../public/js/shared/order-ops.js';
import '../public/js/shared/pricing.js';
const { Money, OrderOps, Pricing } = globalThis;

const args = process.argv.slice(2);
const BASE = (args.find(a => /^https?:\/\//.test(a)) || 'http://localhost:8787').replace(/\/$/, '');
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const OWNER_EMAIL = opt('email', 'owner@burgermantul.demo');
const DAYS = Number(opt('days', 14));
const ACTIVATE = opt('activate', BASE.includes('localhost') ? 'admin' : 'wrangler');
const BUSINESS = 'Burger Mantul';

const pw = () => randomBytes(9).toString('base64url');
const pin = n => Array.from({ length: n }, () => randomInt(10)).join('');
const rnd = n => Math.floor(Math.random() * n);
const pick = arr => arr[rnd(arr.length)];
const weighted = pairs => { let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

let requests = 0;
async function call(method, path, body, headers = {}) {
    requests++;
    const res = await fetch(BASE + '/api' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body != null ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    return data;
}
const log = (...m) => console.log(...m);

// ---------------------------------------------------------------- 1. pendaftaran & lisensi
const ownerPassword = pw();
log(`Mendaftarkan "${BUSINESS}" di ${BASE} …`);
let owner = await call('POST', '/auth/register', { accept_terms: true, business_name: BUSINESS, owner_name: 'Raka Pratama', phone: '0812-2700-1188', outlet_name: 'Jogja', email: OWNER_EMAIL, password: ownerPassword });
const tid = owner.tenant.id;
log(`Tenant #${tid} dibuat (trial)`);

if (ACTIVATE === 'admin') {
    const sa = await call('POST', '/auth/login', { email: process.env.SA_EMAIL || 'admin@rasapos.local', password: process.env.SA_PASSWORD || 'admin12345' });
    await call('POST', `/admin/tenants/${tid}/subscription`, { action: 'extend', months: 12, packs: 1 }, { authorization: 'Bearer ' + sa.access_token });
} else {
    const until = Date.now() + 365 * 86400000;
    execSync(`npx wrangler d1 execute rasapos-core --remote --command "UPDATE tenants SET status = 'active', outlet_packs = 1, paid_until = ${until} WHERE id = ${tid}; INSERT INTO subscription_logs (tenant_id, action, detail, created_at) VALUES (${tid}, 'extend', 'Tenant demo: 1 paket (5 outlet) 12 bulan', ${Date.now()});"`, { stdio: 'ignore' });
}
owner = await call('POST', '/auth/login', { email: OWNER_EMAIL, password: ownerPassword });
const U = { authorization: 'Bearer ' + owner.access_token };
log(`Lisensi: ${owner.tenant.license.state}, maks ${owner.tenant.license.max_outlets} outlet`);

// ---------------------------------------------------------------- 2. outlet, area, meja
let meta = await call('GET', '/t/meta', null, U);
const oJogja = meta.outlets[0];
await call('PATCH', `/t/outlets/${oJogja.id}`, { name: 'Jogja', code: 'JOG', address: 'Jl. Kaliurang Km 5,6 No. 12, Sleman, Yogyakarta', phone: '0274-555-0110', service_rate: 0, cash_rounding: 500, receipt_header: 'BURGER MANTUL JOGJA\nJl. Kaliurang Km 5,6', receipt_footer: 'IG @burgermantul.id\nWiFi: mantul / burgerenak\nTerima kasih, mantul!' }, U);
const oSolo = (await call('POST', '/t/outlets', { name: 'Solo', code: 'SOC', address: 'Jl. Slamet Riyadi No. 301, Surakarta', phone: '0271-555-0220', service_rate: 0, cash_rounding: 500, receipt_header: 'BURGER MANTUL SOLO\nJl. Slamet Riyadi 301', receipt_footer: 'IG @burgermantul.id\nTerima kasih, mantul!' }, U)).item;
const oSmg = (await call('POST', '/t/outlets', { name: 'Semarang', code: 'SMG', address: 'Jl. Pandanaran No. 58, Semarang', phone: '024-555-0330', service_rate: 5, cash_rounding: 500, receipt_header: 'BURGER MANTUL SEMARANG\nJl. Pandanaran 58', receipt_footer: 'Sudah termasuk service 5%\nIG @burgermantul.id' }, U)).item;
const outlets = [oJogja, oSolo, oSmg];

async function tables(o, layout) {
    const areas = (await call('GET', `/t/areas?outlet=${o.id}`, null, U)).items;
    let sort = 0;
    for (const [i, [areaName, prefix, n, cap]] of layout.entries()) {
        const area = i === 0 && areas[0] ? (await call('PATCH', `/t/areas/${areas[0].id}`, { name: areaName }, U)).item : (await call('POST', '/t/areas', { outlet_id: o.id, name: areaName, sort: i }, U)).item;
        const existing = (await call('GET', `/t/tables?outlet=${o.id}`, null, U)).items.filter(t => t.area_id === area.id && t.is_active);
        for (const t of existing) await call('DELETE', `/t/tables/${t.id}`, undefined, U);
        for (let k = 1; k <= n; k++) await call('POST', '/t/tables', { outlet_id: o.id, area_id: area.id, name: prefix + k, capacity: typeof cap === 'function' ? cap(k) : cap, sort: ++sort }, U);
    }
}
await tables(oJogja, [['Indoor', 'A', 10, k => (k % 4 === 0 ? 6 : 4)], ['Teras', 'T', 6, 2], ['Lesehan', 'L', 4, 6]]);
await tables(oSolo, [['Lantai 1', 'A', 8, 4], ['Lantai 2', 'B', 6, k => (k > 4 ? 8 : 4)]]);
await tables(oSmg, [['Indoor', 'A', 10, 4], ['Smoking Area', 'S', 5, 4], ['VIP', 'V', 2, 10]]);
log('3 outlet + area & meja dibuat');

// ---------------------------------------------------------------- 3. pengaturan: stasiun, channel, pembayaran, poin
const settings = await call('GET', '/t/settings', null, U);
await call('PUT', '/t/settings', {
    settings: { stations: ['Grill', 'Fryer', 'Bar'], discount_limit_pct: 10, loyalty: { enabled: true, amount_per_point: 10000 } },
    channels: settings.channels.map(c => ({ ...c, active: ['dine_in', 'take_away', 'gofood', 'grabfood', 'shopeefood'].includes(c.code), markup_pct: c.type === 'online' ? 20 : c.markup_pct, commission_pct: c.code === 'shopeefood' ? 18 : c.type === 'online' ? 20 : 0 })),
    payment_methods: settings.payment_methods.map(m => ({ ...m, active: ['cash', 'qris', 'debit', 'credit', 'transfer', 'online', 'compliment', 'gopay', 'ovo'].includes(m.code) }))
}, U);

// ---------------------------------------------------------------- 4. kategori, modifier, bahan, menu
meta = await call('GET', '/t/meta', null, U);
for (const c of meta.categories) await call('DELETE', `/t/categories/${c.id}`, undefined, U).catch(() => { });
const cat = {};
for (const [i, [name, station, color]] of [['Burger Sapi', 'Grill', '#b45309'], ['Burger Ayam', 'Grill', '#f97316'], ['Paket Hemat', 'Grill', '#16a34a'], ['Sides', 'Fryer', '#eab308'], ['Minuman', 'Bar', '#0ea5e9'], ['Dessert', 'Bar', '#db2777']].entries()) {
    cat[name] = (await call('POST', '/t/categories', { name, station, color, sort: i }, U)).item.id;
}
const grp = async (name, min, max, options) => (await call('POST', '/t/modifier-groups', { name, min_select: min, max_select: max, options }, U)).item;
const ing = async (name, unit, cost, min_stock) => (await call('POST', '/t/ingredients', { name, unit, cost, min_stock }, U)).item.id;
const I = {
    bun: await ing('Roti burger wijen', 'pcs', 2500, 60), patty: await ing('Patty sapi 120 g', 'pcs', 9500, 40), chicken: await ing('Fillet ayam crispy', 'pcs', 7000, 40),
    cheese: await ing('Keju slice', 'lembar', 1600, 80), lettuce: await ing('Selada', 'gr', 40, 1000), tomato: await ing('Tomat', 'gr', 25, 1000), onion: await ing('Bawang bombay', 'gr', 30, 800),
    bbq: await ing('Saus BBQ', 'ml', 45, 800), mayo: await ing('Mayones', 'ml', 35, 1000), sambal: await ing('Sambal matah', 'gr', 60, 500), mushroom: await ing('Jamur kancing', 'gr', 80, 500),
    fries: await ing('Kentang beku', 'gr', 38, 5000), oil: await ing('Minyak goreng', 'ml', 18, 8000), wings: await ing('Sayap ayam', 'pcs', 3200, 60), nugget: await ing('Nugget ayam', 'pcs', 1200, 100),
    onionring: await ing('Onion ring beku', 'pcs', 900, 100), tea: await ing('Teh celup', 'pcs', 350, 100), sugar: await ing('Gula cair', 'ml', 15, 2000), milk: await ing('Susu UHT', 'ml', 18, 4000),
    icecream: await ing('Es krim vanila', 'gr', 55, 2000), choco: await ing('Saus coklat', 'ml', 50, 500), coffee: await ing('Kopi espresso', 'gr', 260, 500), soda: await ing('Sirup soda', 'ml', 30, 2000),
    lemon: await ing('Lemon', 'pcs', 1500, 30), cup: await ing('Cup 16 oz + tutup', 'pcs', 1300, 300), box: await ing('Box burger', 'pcs', 900, 300), bag: await ing('Paper bag', 'pcs', 1100, 200)
};
const G = {
    doneness: await grp('Kematangan', 1, 1, [{ name: 'Medium Well', price: 0 }, { name: 'Well Done', price: 0 }]),
    spicy: await grp('Level Pedas', 1, 1, [{ name: 'Level 0', price: 0 }, { name: 'Level 1', price: 0 }, { name: 'Level 2', price: 0 }, { name: 'Level 3 (Mantul)', price: 2000 }]),
    extra: await grp('Tambahan', 0, 4, [{ name: 'Extra Keju', price: 6000, recipe: [{ ingredient_id: I.cheese, qty: 1 }] }, { name: 'Extra Patty', price: 16000, recipe: [{ ingredient_id: I.patty, qty: 1 }] }, { name: 'Telur Mata Sapi', price: 5000 }, { name: 'Jamur', price: 6000, recipe: [{ ingredient_id: I.mushroom, qty: 30 }] }, { name: 'Jalapeno', price: 4000 }]),
    sauce: await grp('Saus Ekstra', 0, 2, [{ name: 'BBQ', price: 0, recipe: [{ ingredient_id: I.bbq, qty: 15 }] }, { name: 'Mayo', price: 0, recipe: [{ ingredient_id: I.mayo, qty: 15 }] }, { name: 'Sambal Matah', price: 3000, recipe: [{ ingredient_id: I.sambal, qty: 20 }] }, { name: 'Keju Leleh', price: 5000, recipe: [{ ingredient_id: I.cheese, qty: 1 }] }]),
    size: await grp('Ukuran', 1, 1, [{ name: 'Regular', price: 0 }, { name: 'Large', price: 5000 }]),
    ice: await grp('Es', 0, 1, [{ name: 'Normal Ice', price: 0 }, { name: 'Less Ice', price: 0 }, { name: 'No Ice', price: 0 }]),
    drink: await grp('Pilih Minuman Paket', 1, 1, [{ name: 'Es Teh', price: 0 }, { name: 'Lemon Tea', price: 3000 }, { name: 'Soda Float', price: 6000 }]),
    wings: await grp('Rasa Wings', 1, 1, [{ name: 'Original', price: 0 }, { name: 'Hot BBQ', price: 0 }, { name: 'Korean Spicy', price: 2000 }])
};
const burgerBase = [[I.bun, 1], [I.lettuce, 15], [I.tomato, 20], [I.onion, 10], [I.box, 1]];
const MENU = [
    // nama, kategori, harga, grup, resep, sku, deskripsi
    ['Mantul Classic Beef', 'Burger Sapi', 38000, ['doneness', 'extra', 'sauce'], [...burgerBase, [I.patty, 1], [I.cheese, 1], [I.mayo, 15]], 'BS01', 'Patty sapi 120 g, keju, selada, tomat, saus mantul'],
    ['Double Mantul', 'Burger Sapi', 56000, ['doneness', 'extra', 'sauce'], [...burgerBase, [I.patty, 2], [I.cheese, 2], [I.mayo, 15]], 'BS02', 'Dua patty sapi, dua keju — paling laris'],
    ['Smoky BBQ Beef', 'Burger Sapi', 45000, ['doneness', 'extra', 'sauce'], [...burgerBase, [I.patty, 1], [I.cheese, 1], [I.bbq, 25], [I.onionring, 2]], 'BS03', 'Saus BBQ asap & onion ring'],
    ['Cheese Lava Beef', 'Burger Sapi', 48000, ['doneness', 'extra'], [...burgerBase, [I.patty, 1], [I.cheese, 3]], 'BS04', 'Keju leleh tumpah ruah'],
    ['Sambal Matah Beef', 'Burger Sapi', 45000, ['doneness', 'spicy', 'extra'], [...burgerBase, [I.patty, 1], [I.sambal, 30]], 'BS05', 'Rasa Bali, pedas segar'],
    ['Truffle Mushroom', 'Burger Sapi', 52000, ['doneness', 'extra'], [...burgerBase, [I.patty, 1], [I.mushroom, 40], [I.cheese, 1], [I.mayo, 10]], 'BS06', 'Jamur tumis & truffle mayo'],
    ['Crispy Chicken Burger', 'Burger Ayam', 32000, ['spicy', 'extra', 'sauce'], [...burgerBase, [I.chicken, 1], [I.mayo, 15], [I.oil, 40]], 'BA01', 'Fillet ayam crispy'],
    ['Geprek Mantul Burger', 'Burger Ayam', 34000, ['spicy', 'extra'], [...burgerBase, [I.chicken, 1], [I.sambal, 25], [I.oil, 40]], 'BA02', 'Ayam geprek sambal bawang'],
    ['Chicken Teriyaki', 'Burger Ayam', 36000, ['extra', 'sauce'], [...burgerBase, [I.chicken, 1], [I.mayo, 10], [I.oil, 30]], 'BA03', 'Ayam saus teriyaki & wijen'],
    ['Paket Mantul (Classic + Fries + Minum)', 'Paket Hemat', 55000, ['doneness', 'drink'], [...burgerBase, [I.patty, 1], [I.cheese, 1], [I.fries, 120], [I.oil, 60], [I.tea, 1], [I.cup, 1], [I.bag, 1]], 'PK01', 'Hemat Rp 11.000'],
    ['Paket Ayam (Crispy + Fries + Minum)', 'Paket Hemat', 48000, ['spicy', 'drink'], [...burgerBase, [I.chicken, 1], [I.fries, 120], [I.oil, 90], [I.tea, 1], [I.cup, 1], [I.bag, 1]], 'PK02', 'Hemat Rp 10.000'],
    ['Paket Keluarga (4 Burger + 2 Fries)', 'Paket Hemat', 175000, [], [[I.bun, 4], [I.patty, 2], [I.chicken, 2], [I.cheese, 4], [I.fries, 300], [I.oil, 200], [I.box, 4], [I.bag, 2]], 'PK03', '2 Classic, 2 Crispy Chicken, 2 Fries Large'],
    ['Kentang Goreng', 'Sides', 18000, ['size'], [[I.fries, 150], [I.oil, 60]], 'SD01', ''],
    ['Cheese Fries', 'Sides', 26000, [], [[I.fries, 150], [I.oil, 60], [I.cheese, 2]], 'SD02', ''],
    ['Onion Rings', 'Sides', 22000, [], [[I.onionring, 8], [I.oil, 50]], 'SD03', ''],
    ['Chicken Wings (6 pcs)', 'Sides', 38000, ['wings'], [[I.wings, 6], [I.oil, 80], [I.bbq, 20]], 'SD04', ''],
    ['Nugget (8 pcs)', 'Sides', 20000, [], [[I.nugget, 8], [I.oil, 40]], 'SD05', ''],
    ['Es Teh Manis', 'Minuman', 8000, ['size', 'ice'], [[I.tea, 1], [I.sugar, 25], [I.cup, 1]], 'MN01', ''],
    ['Lemon Tea', 'Minuman', 15000, ['size', 'ice'], [[I.tea, 1], [I.sugar, 20], [I.lemon, 0.5], [I.cup, 1]], 'MN02', ''],
    ['Soda Float', 'Minuman', 20000, ['ice'], [[I.soda, 40], [I.icecream, 60], [I.cup, 1]], 'MN03', ''],
    ['Milkshake Coklat', 'Minuman', 26000, ['size'], [[I.milk, 200], [I.icecream, 80], [I.choco, 20], [I.cup, 1]], 'MN04', ''],
    ['Kopi Susu Mantul', 'Minuman', 22000, ['size', 'ice'], [[I.coffee, 18], [I.milk, 150], [I.sugar, 20], [I.cup, 1]], 'MN05', ''],
    ['Air Mineral', 'Minuman', 7000, [], [], 'MN06', ''],
    ['Choco Lava Sundae', 'Dessert', 22000, [], [[I.icecream, 120], [I.choco, 25], [I.cup, 1]], 'DS01', ''],
    ['Pisang Goreng Keju Coklat', 'Dessert', 20000, [], [[I.oil, 40], [I.cheese, 1], [I.choco, 10]], 'DS02', '']
];
const menus = [];
for (const [i, [name, c, price, groups, recipe, sku, description]] of MENU.entries()) {
    const m = (await call('POST', '/t/menus', { name, category_id: cat[c], price, sku, description, sort: i, modifier_group_ids: groups.map(g => G[g].id), recipe: recipe.map(([ingredient_id, qty]) => ({ ingredient_id, qty })) }, U)).item;
    menus.push({ ...m, cat: c });
}
const byName = n => menus.find(m => m.name === n);
// Semarang: harga burger +Rp 2.000; Solo: Truffle belum tersedia
await call('PUT', '/t/outlet-menus', { outlet_id: oSmg.id, items: menus.filter(m => m.cat.startsWith('Burger')).map(m => ({ menu_id: m.id, price: m.price + 2000, is_available: true })) }, U);
await call('PUT', '/t/outlet-menus', { outlet_id: oSolo.id, items: [{ menu_id: byName('Truffle Mushroom').id, price: null, is_available: false }] }, U);
// Harga khusus GoFood untuk paket (bukan markup otomatis)
await call('PUT', '/t/channel-prices', { channel: 'gofood', items: [{ menu_id: byName('Paket Mantul (Classic + Fries + Minum)').id, price: 64000 }, { menu_id: byName('Paket Keluarga (4 Burger + 2 Fries)').id, price: 199000 }] }, U).catch(e => log('  (lewati harga channel:', e.message.slice(0, 80) + ')'));
log(`${menus.length} menu, ${Object.keys(G).length} grup varian, ${Object.keys(I).length} bahan baku`);

// ---------------------------------------------------------------- 5. promo & pelanggan
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const promos = {
    happy: (await call('POST', '/t/promos', { name: 'Happy Hour 15%', type: 'percent', value: 15, start_time: '14:00', end_time: '17:00', days: [1, 2, 3, 4, 5], min_subtotal: 75000, channels: ['dine_in', 'take_away'] }, U)).item,
    family: (await call('POST', '/t/promos', { name: 'Weekend Family Rp 20.000', type: 'amount', value: 20000, days: [0, 6], min_subtotal: 150000 }, U)).item,
    student: (await call('POST', '/t/promos', { name: 'Diskon Pelajar 10%', type: 'percent', value: 10, auto_apply: 0 }, U)).item,
    member: (await call('POST', '/t/promos', { name: 'Member Mantul 5%', type: 'percent', value: 5, auto_apply: 0 }, U)).item,
    opening: (await call('POST', '/t/promos', { name: 'Grand Opening Semarang 25%', type: 'percent', value: 25, outlet_ids: [oSmg.id], start_date: '2026-08-01', end_date: '2026-08-31' }, U)).item
};
const NAMES = ['Andi Saputra', 'Bunga Lestari', 'Citra Ayuningtyas', 'Dimas Prakoso', 'Eka Wulandari', 'Fajar Nugroho', 'Gita Permata', 'Hendra Wijaya', 'Intan Maharani', 'Joko Susilo', 'Kartika Sari', 'Lukman Hakim', 'Maya Anggraini', 'Nanda Pratiwi', 'Oki Setiawan', 'Putri Ramadhani', 'Rizal Firmansyah', 'Sinta Dewi', 'Taufik Hidayat', 'Umi Kalsum', 'Vino Aditya', 'Wulan Safitri', 'Yoga Pamungkas', 'Zahra Amelia'];
const customers = [];
for (const [i, n] of NAMES.entries()) customers.push((await call('POST', '/t/customers', { name: n, phone: '0813' + String(27000000 + i * 7919).padStart(8, '0') }, U)).item);
log(`${Object.keys(promos).length} promo, ${customers.length} pelanggan member`);

// ---------------------------------------------------------------- 6. staff & akun manajer
const creds = { staff: [] };
const staff = {};
const STAFF = {
    [oJogja.id]: { mgr: 'Bayu Aji', kasir: ['Laras', 'Nadia'], waiter: 'Gilang', kitchen: 'Pak Slamet' },
    [oSolo.id]: { mgr: 'Ratna Sari', kasir: ['Tika', 'Ardi'], waiter: 'Hana', kitchen: 'Mas Joko' },
    [oSmg.id]: { mgr: 'Kevin Tan', kasir: ['Melati', 'Steven'], waiter: 'Ayu', kitchen: 'Chef Rudi' }
};
async function addStaff(o, name, role) {
    const p = pin(role === 'manager' ? 6 : 4);
    const s = (await call('POST', '/t/staff', { name, role, pin: p, outlet_ids: [o.id] }, U)).item;
    creds.staff.push({ outlet: o.name, name, role, pin: p });
    return { ...s, pin: p };
}
for (const o of outlets) {
    const d = STAFF[o.id];
    staff[o.id] = { mgr: await addStaff(o, d.mgr, 'manager'), kasir: [await addStaff(o, d.kasir[0], 'cashier'), await addStaff(o, d.kasir[1], 'cashier')], waiter: await addStaff(o, d.waiter, 'waiter'), kitchen: await addStaff(o, d.kitchen, 'kitchen') };
}
const areaMgr = await call('POST', '/t/users', { name: 'Dewi Kurnia (Area Manager Jateng)', email: OWNER_EMAIL.replace('@', '+area@'), outlet_ids: [oSolo.id, oSmg.id] }, U);
creds.areaManager = { email: OWNER_EMAIL.replace('@', '+area@'), password: areaMgr.temp_password };
log(`${creds.staff.length} staff (PIN acak) + 1 akun area manager (Solo & Semarang)`);

// ---------------------------------------------------------------- 7. stok awal & mutasi
const purchase = {
    [I.bun]: [700, 2400], [I.patty]: [420, 9300], [I.chicken]: [330, 6800], [I.cheese]: [900, 1550], [I.lettuce]: [9000, 38], [I.tomato]: [11000, 24], [I.onion]: [7000, 29],
    [I.bbq]: [6000, 44], [I.mayo]: [9000, 34], [I.sambal]: [5000, 58], [I.mushroom]: [4000, 78], [I.fries]: [45000, 37], [I.oil]: [60000, 17], [I.wings]: [500, 3100],
    [I.nugget]: [800, 1150], [I.onionring]: [900, 880], [I.tea]: [600, 340], [I.sugar]: [12000, 14], [I.milk]: [20000, 17], [I.icecream]: [14000, 53], [I.choco]: [3000, 48],
    [I.coffee]: [2500, 255], [I.soda]: [8000, 29], [I.lemon]: [120, 1450], [I.cup]: [1500, 1250], [I.box]: [1300, 880], [I.bag]: [700, 1050]
};
const supplier = (await call('POST', '/t/suppliers', { name: 'CV Sumber Pangan Jaya', phone: '0274-555-7788', note: 'Daging, roti, frozen food' }, U).catch(() => ({ item: null }))).item;
for (const [k, o] of outlets.entries()) {
    const f = [1.25, 0.95, 1.05][k];
    await call('POST', '/t/stock/moves', { outlet_id: o.id, type: 'purchase', note: 'Stok awal bulan', supplier_id: supplier ? supplier.id : undefined, items: Object.entries(purchase).map(([ingredient_id, [qty, cost]]) => ({ ingredient_id: Number(ingredient_id), qty: Math.round(qty * f), cost })) }, U);
}
log('Stok awal 3 outlet');

// ---------------------------------------------------------------- 8. transaksi historis
async function device(o, name, kasir) {
    const pc = await call('POST', '/t/pair-codes', { outlet_id: o.id, type: 'pos', name }, U);
    const dev = await call('POST', '/auth/pair', { code: pc.code });
    const D = { authorization: 'Bearer ' + dev.access_token };
    const sl = await call('POST', '/t/staff-login', { staff_id: kasir.id, pin: kasir.pin }, D);
    return { dev, D, S: { ...D, 'x-staff-token': sl.staff_token } };
}
async function seal(key, staffId, p, opId) {
    const k = await crypto.subtle.importKey('jwk', { kty: key.jwk.kty, n: key.jwk.n, e: key.jwk.e, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, k, new TextEncoder().encode(JSON.stringify({ s: staffId, p, o: opId })));
    return key.kid + '.' + Buffer.from(ct).toString('base64url');
}

const HOURS = [[10, 2], [11, 6], [12, 10], [13, 9], [14, 5], [15, 4], [16, 5], [17, 7], [18, 10], [19, 11], [20, 8], [21, 4]];
const VOLUME = { [oJogja.id]: 30, [oSolo.id]: 21, [oSmg.id]: 25 };
const CHANNELS = [['dine_in', 50], ['take_away', 22], ['gofood', 15], ['grabfood', 9], ['shopeefood', 4]];
const POPULAR = menus.map(m => [m, m.name.startsWith('Mantul Classic') || m.name.startsWith('Double') ? 9 : m.cat === 'Burger Sapi' ? 5 : m.cat === 'Burger Ayam' ? 6 : m.cat === 'Paket Hemat' ? (m.name.includes('Keluarga') ? 1 : 6) : m.cat === 'Sides' ? 5 : m.cat === 'Minuman' ? 7 : 3]);
const stats = { orders: 0, voidItems: 0, voidOrders: 0, discounts: 0, members: 0 };

function buildItem(boot, m, channel) {
    const bm = boot.menus.find(x => x.id === m.id);
    if (!bm) return null;
    const ch = boot.channels.find(c => c.code === channel);
    const base = Pricing.basePrice(bm, bm.outlet_price, ch, bm.channel_prices[channel] ?? null);
    const mods = [];
    for (const gid of bm.modifier_group_ids) {
        const g = boot.modifier_groups.find(x => x.id === gid);
        if (!g) continue;
        const n = g.min_select > 0 ? 1 : Math.random() < 0.25 ? 1 : 0;
        const opts = [...g.options].sort(() => Math.random() - 0.5).slice(0, Math.min(n, g.max_select));
        for (const o of g.min_select > 0 && Math.random() < 0.6 ? [g.options[0]] : opts) mods.push({ group: g.name, option_id: o.id, name: o.name, price: o.price });
    }
    return { id: randomUUID(), menu_id: m.id, name: m.name, category_id: m.category_id, station: bm.station || 'Grill', base_price: base, price: Pricing.unitPrice(base, mods), mods, qty: Math.random() < 0.15 ? 2 : 1, note: '', taxable: true };
}

for (const o of outlets) {
    const kasirs = staff[o.id].kasir, mgr = staff[o.id].mgr;
    const { dev, S } = await device(o, 'Kasir-Riwayat', kasirs[0]);
    const boot = await call('GET', '/t/bootstrap', null, S);
    const tablesAll = boot.tables;
    const ops = [];
    let seq = 0;
    for (let day = DAYS; day >= 1; day--) {
        const date = new Date(Date.now() - day * 86400000);
        const dow = new Date(date.getTime() + 7 * 3600000).getUTCDay();
        const n = Math.round(VOLUME[o.id] * (dow === 5 ? 1.25 : dow === 6 ? 1.5 : dow === 0 ? 1.35 : dow === 1 ? 0.85 : 1) * (0.85 + Math.random() * 0.3));
        for (let k = 0; k < n; k++) {
            const hour = weighted(HOURS.map(([h, w]) => [h, w]));
            // jam lokal WIB → UTC
            const at = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 7, rnd(60), rnd(60));
            if (at > Date.now() - 3600000) continue;
            const channel = weighted(CHANNELS);
            const kasir = kasirs[rnd(2)];
            const ctx = op => ({ outlet: boot.outlet, at, staff_id: kasir.id, device_id: dev.device.id, offline: true });
            const id = randomUUID();
            const orderOps = [];
            const mk = (type, payload) => { const x = { op_id: randomUUID(), type, order_id: id, payload, at, staff_id: kasir.id, offline: true }; orderOps.push(x); return x; };
            const dine = channel === 'dine_in';
            const member = Math.random() < 0.22 ? pick(customers) : null;
            mk('order.open', { id, order_no: `${dev.device.code}${String(++seq).padStart(5, '0')}`, channel, type: boot.channels.find(c => c.code === channel).type, guests: dine ? 1 + rnd(5) : 0, ...(dine && Math.random() < 0.8 ? { table_id: pick(tablesAll).id } : {}), ...(member ? { customer_id: member.id, customer_name: member.name } : channel !== 'dine_in' && channel !== 'take_away' ? { customer_name: (channel === 'gofood' ? 'GF-' : channel === 'grabfood' ? 'GB-' : 'SF-') + (100 + rnd(900)) } : {}) });
            const count = channel === 'dine_in' ? 1 + rnd(5) : 1 + rnd(3);
            const items = [];
            for (let j = 0; j < count; j++) { const it = buildItem(boot, weighted(POPULAR), channel); if (it) items.push(it); }
            if (!items.length) continue;
            mk('order.add_items', { items });
            if (dine) mk('order.send', {});
            // void sebagian item (salah input) dengan persetujuan manager
            if (dine && items.length > 1 && Math.random() < 0.05) {
                const v = mk('order.void_item', { item_id: items[0].id, qty: items[0].qty, reason: pick(['Salah input', 'Tamu batal pesan', 'Menu habis']) });
                v.payload.approval = { staff_id: mgr.id, proof: await seal(boot.approval_key, mgr.id, mgr.pin, v.op_id) };
                v.payload.approved_by = mgr.id;
                stats.voidItems++;
            }
            // batal seluruh order (jarang)
            if (dine && Math.random() < 0.015) {
                const v = mk('order.void', { reason: 'Tamu pergi sebelum makanan datang' });
                v.payload.approval = { staff_id: mgr.id, proof: await seal(boot.approval_key, mgr.id, mgr.pin, v.op_id) };
                v.payload.approved_by = mgr.id;
                stats.voidOrders++;
                ops.push(...orderOps);
                continue;
            }
            // diskon: pelajar / member (manual) atau promo otomatis yang berlaku
            let order = null;
            for (const x of orderOps) order = OrderOps.apply(order, x, ctx(x));
            const sub = order.totals.subtotal;
            const isWeekend = dow === 0 || dow === 6;
            let discount = null;
            if (isWeekend && sub >= 150000) discount = { type: 'amount', value: 20000, name: promos.family.name, promo_id: promos.family.id };
            else if (!isWeekend && hour >= 14 && hour < 17 && sub >= 75000 && (channel === 'dine_in' || channel === 'take_away')) discount = { type: 'percent', value: 15, name: promos.happy.name, promo_id: promos.happy.id };
            else if (member && Math.random() < 0.5) discount = { type: 'percent', value: 5, name: promos.member.name, promo_id: promos.member.id };
            else if (Math.random() < 0.04) discount = { type: 'percent', value: 10, name: promos.student.name, promo_id: promos.student.id };
            if (discount) { const x = mk('order.discount', { discount }); order = OrderOps.apply(order, x, ctx(x)); stats.discounts++; }
            if (member) stats.members++;
            const total = order.totals.total;
            const online = ['gofood', 'grabfood', 'shopeefood'].includes(channel);
            const method = online ? 'online' : weighted([['cash', 34], ['qris', 42], ['debit', 12], ['credit', 3], ['transfer', 4], ['gopay', 3], ['ovo', 2]]);
            const r = Number(boot.outlet.cash_rounding) || 0;
            const due = method === 'cash' ? Money.cashDue(total, r) : total;
            const amount = method === 'cash' ? (Math.random() < 0.4 ? due : Math.ceil(due / 50000) * 50000) : total;
            mk('order.pay', { payments: [{ method, amount }] });
            ops.push(...orderOps);
            stats.orders++;
        }
    }
    let failed = 0;
    for (let i = 0; i < ops.length; i += 95) {
        const batch = ops.slice(i, i + 95);
        const r = await call('POST', '/t/ops', { ops: batch }, S);
        const bad = r.results.filter(x => !x.ok);
        failed += bad.length;
        if (bad.length && failed <= bad.length) log('  gagal contoh:', JSON.stringify(bad.slice(0, 2)).slice(0, 300));
    }
    await call('POST', `/t/devices/${dev.device.id}/revoke`, undefined, U);
    log(`Riwayat ${o.name}: ${ops.filter(x => x.type === 'order.open').length} order, ${failed} operasi ditolak`);
}

// tutup hari untuk hari-hari yang sudah lewat (laporan "Tutup hari")
for (const o of outlets) {
    let closed = 0;
    for (let day = DAYS; day >= 1; day--) {
        const bd = new Date(Date.now() + 7 * 3600000 - day * 86400000).toISOString().slice(0, 10);
        try { await call('POST', '/t/days/close', { outlet_id: o.id, business_date: bd }, U); closed++; } catch { /* hari tanpa transaksi / sudah ditutup */ }
    }
    log(`Tutup hari ${o.name}: ${closed} hari`);
}

// ---------------------------------------------------------------- 9. mutasi stok tambahan
await call('POST', '/t/stock/moves', { outlet_id: oJogja.id, type: 'purchase', note: 'Belanja mingguan', supplier_id: supplier ? supplier.id : undefined, items: [{ ingredient_id: I.patty, qty: 150, cost: 9400 }, { ingredient_id: I.bun, qty: 200, cost: 2450 }, { ingredient_id: I.fries, qty: 15000, cost: 37 }] }, U);
await call('POST', '/t/stock/moves', { outlet_id: oSolo.id, type: 'waste', note: 'Selada layu & roti kedaluwarsa', items: [{ ingredient_id: I.lettuce, qty: 600 }, { ingredient_id: I.bun, qty: 12 }] }, U);
await call('POST', '/t/stock/moves', { outlet_id: oJogja.id, type: 'transfer', to_outlet_id: oSolo.id, note: 'Solo kehabisan keju', items: [{ ingredient_id: I.cheese, qty: 120 }] }, U);
const stockSmg = (await call('GET', `/t/stock?outlet=${oSmg.id}`, null, U)).items;
await call('POST', '/t/stock/moves', { outlet_id: oSmg.id, type: 'opname', note: 'Opname mingguan', items: [I.patty, I.cheese, I.bun].map(id => { const s = stockSmg.find(x => x.id === id); return { ingredient_id: id, actual: Math.max(0, Math.round(s.qty) - rnd(4)) }; }) }, U);
log('Mutasi stok: pembelian, waste, transfer, opname');

// ---------------------------------------------------------------- 10. hari ini (live): shift terbuka, transaksi, meja terisi, tiket dapur
for (const o of outlets) {
    const kasir = staff[o.id].kasir[0];
    const { dev, S } = await device(o, 'Kasir-1', kasir);
    const shiftId = randomUUID();
    await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'shift.open', payload: { shift_id: shiftId, opening_cash: 500000 }, at: Date.now() }] }, S);
    await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'shift.cash', payload: { shift_id: shiftId, type: 'out', amount: 35000, note: 'Beli es batu & gas' }, at: Date.now() }] }, S).catch(() => { });
    const boot = await call('GET', '/t/bootstrap', null, S);
    const free = [...boot.tables];
    const one = async (payloadFn, { pay = true, send = true, channel = 'dine_in' } = {}) => {
        const id = randomUUID();
        const items = Array.from({ length: 1 + rnd(3) }, () => buildItem(boot, weighted(POPULAR), channel)).filter(Boolean);
        const tb = channel === 'dine_in' ? free.splice(rnd(free.length), 1)[0] : null;
        const list = [
            { op_id: randomUUID(), type: 'order.open', order_id: id, payload: { id, order_no: `${dev.device.code}${String(1 + rnd(9000)).padStart(5, '0')}`, channel, guests: channel === 'dine_in' ? 2 + rnd(3) : 0, ...(tb ? { table_id: tb.id } : {}), ...payloadFn() }, at: Date.now() },
            { op_id: randomUUID(), type: 'order.add_items', order_id: id, payload: { items }, at: Date.now() }
        ];
        if (send) list.push({ op_id: randomUUID(), type: 'order.send', order_id: id, payload: {}, at: Date.now() });
        const r = await call('POST', '/t/ops', { ops: list }, S);
        const ord = r.results[r.results.length - 1].order;
        if (pay && ord) {
            const total = ord.totals.total;
            await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'order.pay', order_id: id, payload: { payments: [{ method: channel === 'dine_in' || channel === 'take_away' ? pick(['cash', 'qris']) : 'online', amount: channel === 'dine_in' ? Money.cashDue(total, Number(boot.outlet.cash_rounding) || 0) : total }] }, at: Date.now() }] }, S).catch(async () => {
                await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'order.pay', order_id: id, payload: { payments: [{ method: 'qris', amount: total }] }, at: Date.now() }] }, S);
            });
        }
        return ord;
    };
    for (let i = 0; i < 4; i++) await one(() => ({}), { channel: pick(['dine_in', 'take_away', 'gofood']) });
    for (let i = 0; i < 3; i++) await one(() => (Math.random() < 0.5 ? { customer_id: pick(customers).id } : {}), { pay: false, send: true });
    await one(() => ({ customer_name: 'GF-' + (100 + rnd(900)) }), { pay: false, send: true, channel: 'gofood' });
    await one(() => ({}), { pay: false, send: false });
    // satu refund kemarin (non-tunai) dengan persetujuan manager
    if (o === oJogja) {
        const hist = (await call('GET', `/t/reports/transactions?outlet=${o.id}&from=${new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10)}`, null, U).catch(() => ({ items: [] }))).items || [];
        const target = hist.find(x => x.status === 'paid' && !String(x.payments || '').includes('Tunai'));
        if (target) await call('POST', '/t/ops', { ops: [{ op_id: randomUUID(), type: 'order.refund', order_id: target.id, payload: { reason: 'Burger salah pesanan, uang dikembalikan', approval: { staff_id: staff[o.id].mgr.id, pin: staff[o.id].mgr.pin } }, at: Date.now() }] }, S).catch(e => log('  (refund dilewati:', e.message.slice(0, 80) + ')'));
    }
    await call('POST', `/t/devices/${dev.device.id}/revoke`, undefined, U);
    log(`Hari ini ${o.name}: shift buka, transaksi berjalan, meja terisi & tiket dapur aktif`);
}
log(`\nRingkasan: ${stats.orders} order historis (${stats.members} member, ${stats.discounts} diskon/promo, ${stats.voidItems} void item, ${stats.voidOrders} batal order) · ${requests} request`);

// ---------------------------------------------------------------- kredensial (file lokal, diabaikan git)
const file = '.demo-burger-mantul.md';
writeFileSync(file, [
    `# Demo ${BUSINESS}`, '', `Dibuat ${new Date().toISOString()} di ${BASE} · Tenant #${tid}`, '',
    '## Back Office', '', '| Akun | Email | Password |', '|---|---|---|',
    `| Pemilik (semua outlet) | ${OWNER_EMAIL} | ${ownerPassword} |`,
    `| Area manager (Solo & Semarang) | ${creds.areaManager.email} | ${creds.areaManager.password} (sementara) |`, '',
    '## Staff (login PIN di tablet)', '', '| Outlet | Nama | Peran | PIN |', '|---|---|---|---|',
    ...creds.staff.map(s => `| ${s.outlet} | ${s.name} | ${s.role} | ${s.pin} |`), '',
    'Tablet kasir & layar dapur belum dipasangkan: Back Office → Perangkat → Pasangkan perangkat (pilih outlet).', ''
].join('\n'));
log(`Kredensial ditulis ke ${file}`);
