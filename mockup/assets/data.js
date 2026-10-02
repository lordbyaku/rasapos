// Data dummy untuk mockup — tidak terhubung ke backend
window.MOCK = {
    tenant: { name: 'Kopi & Makan Nusantara', plan: 'Pro — 4 outlet' },

    outlets: [
        { id: 1, code: 'JKT-SDM', name: 'Sudirman', city: 'Jakarta', online: true, shiftOpen: true, cashier: 'Rina', lastTx: '1 mnt lalu', sales: 18450000, trx: 214, guests: 356, openOrders: 9 },
        { id: 2, code: 'JKT-KMG', name: 'Kemang', city: 'Jakarta', online: true, shiftOpen: true, cashier: 'Dimas', lastTx: '3 mnt lalu', sales: 14320000, trx: 168, guests: 271, openOrders: 6 },
        { id: 3, code: 'BDG-DGO', name: 'Dago', city: 'Bandung', online: true, shiftOpen: true, cashier: 'Sari', lastTx: '6 mnt lalu', sales: 9870000, trx: 131, guests: 198, openOrders: 4 },
        { id: 4, code: 'SBY-GUB', name: 'Gubeng', city: 'Surabaya', online: false, shiftOpen: false, cashier: '-', lastTx: '2 jam lalu', sales: 6120000, trx: 82, guests: 120, openOrders: 0 }
    ],

    categories: [
        { id: 'all', name: 'Semua', icon: 'fa-border-all' },
        { id: 'kopi', name: 'Kopi', icon: 'fa-mug-hot' },
        { id: 'nonkopi', name: 'Non-Kopi', icon: 'fa-glass-water' },
        { id: 'makanan', name: 'Makanan', icon: 'fa-bowl-rice' },
        { id: 'snack', name: 'Snack', icon: 'fa-cookie-bite' },
        { id: 'paket', name: 'Paket', icon: 'fa-box' }
    ],

    modifierGroups: {
        size: { name: 'Ukuran', required: true, max: 1, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 6000 }] },
        temp: { name: 'Suhu', required: true, max: 1, options: [{ name: 'Hot', price: 0 }, { name: 'Ice', price: 0 }] },
        sugar: { name: 'Gula', required: false, max: 1, options: [{ name: 'Normal', price: 0 }, { name: 'Less Sugar', price: 0 }, { name: 'No Sugar', price: 0 }] },
        addon: { name: 'Tambahan', required: false, max: 3, options: [{ name: 'Extra Shot', price: 5000 }, { name: 'Oat Milk', price: 8000 }, { name: 'Boba', price: 5000 }] },
        spicy: { name: 'Level Pedas', required: true, max: 1, options: [{ name: 'Tidak Pedas', price: 0 }, { name: 'Sedang', price: 0 }, { name: 'Pedas', price: 0 }, { name: 'Extra Pedas', price: 2000 }] },
        topping: { name: 'Topping', required: false, max: 3, options: [{ name: 'Telur Mata Sapi', price: 5000 }, { name: 'Keju', price: 6000 }, { name: 'Kerupuk', price: 3000 }] }
    },

    menus: [
        { id: 1, cat: 'kopi', name: 'Kopi Susu Gula Aren', price: 25000, emoji: '☕', color: 'bg-amber-100', mods: ['size', 'temp', 'sugar', 'addon'], station: 'Bar' },
        { id: 2, cat: 'kopi', name: 'Americano', price: 22000, emoji: '☕', color: 'bg-stone-200', mods: ['size', 'temp', 'addon'], station: 'Bar' },
        { id: 3, cat: 'kopi', name: 'Cafe Latte', price: 28000, emoji: '🥛', color: 'bg-orange-100', mods: ['size', 'temp', 'sugar', 'addon'], station: 'Bar' },
        { id: 4, cat: 'kopi', name: 'Cappuccino', price: 28000, emoji: '☕', color: 'bg-amber-200', mods: ['size', 'temp', 'addon'], station: 'Bar' },
        { id: 5, cat: 'kopi', name: 'Espresso', price: 18000, emoji: '☕', color: 'bg-stone-300', mods: ['addon'], station: 'Bar' },
        { id: 6, cat: 'nonkopi', name: 'Matcha Latte', price: 30000, emoji: '🍵', color: 'bg-lime-100', mods: ['size', 'temp', 'sugar', 'addon'], station: 'Bar' },
        { id: 7, cat: 'nonkopi', name: 'Coklat Signature', price: 28000, emoji: '🍫', color: 'bg-yellow-100', mods: ['size', 'temp', 'sugar'], station: 'Bar' },
        { id: 8, cat: 'nonkopi', name: 'Es Teh Leci', price: 20000, emoji: '🧋', color: 'bg-pink-100', mods: ['size', 'sugar'], station: 'Bar' },
        { id: 9, cat: 'nonkopi', name: 'Air Mineral', price: 8000, emoji: '💧', color: 'bg-sky-100', mods: [], station: 'Bar', soldOut: false },
        { id: 10, cat: 'makanan', name: 'Nasi Goreng Kampung', price: 35000, emoji: '🍛', color: 'bg-orange-100', mods: ['spicy', 'topping'], station: 'Dapur' },
        { id: 11, cat: 'makanan', name: 'Mie Goreng Jawa', price: 33000, emoji: '🍜', color: 'bg-yellow-100', mods: ['spicy', 'topping'], station: 'Dapur' },
        { id: 12, cat: 'makanan', name: 'Ayam Bakar Madu', price: 42000, emoji: '🍗', color: 'bg-red-100', mods: ['spicy'], station: 'Dapur' },
        { id: 13, cat: 'makanan', name: 'Nasi Ayam Geprek', price: 30000, emoji: '🍗', color: 'bg-rose-100', mods: ['spicy', 'topping'], station: 'Dapur' },
        { id: 14, cat: 'makanan', name: 'Sop Buntut', price: 65000, emoji: '🍲', color: 'bg-amber-100', mods: [], station: 'Dapur', soldOut: true },
        { id: 15, cat: 'snack', name: 'Kentang Goreng', price: 22000, emoji: '🍟', color: 'bg-yellow-100', mods: [], station: 'Dapur' },
        { id: 16, cat: 'snack', name: 'Pisang Goreng Keju', price: 24000, emoji: '🍌', color: 'bg-yellow-200', mods: [], station: 'Dapur' },
        { id: 17, cat: 'snack', name: 'Croissant Butter', price: 26000, emoji: '🥐', color: 'bg-orange-100', mods: [], station: 'Pastry' },
        { id: 18, cat: 'snack', name: 'Tahu Cabe Garam', price: 20000, emoji: '🧆', color: 'bg-stone-100', mods: ['spicy'], station: 'Dapur' },
        { id: 19, cat: 'paket', name: 'Paket Hemat Geprek + Es Teh', price: 42000, emoji: '🍱', color: 'bg-emerald-100', mods: ['spicy'], station: 'Dapur' },
        { id: 20, cat: 'paket', name: 'Paket Ngopi Berdua', price: 85000, emoji: '🎁', color: 'bg-violet-100', mods: [], station: 'Bar' }
    ],

    areas: ['Indoor', 'Outdoor', 'Lantai 2'],

    tables: [
        { name: 'A1', area: 'Indoor', cap: 2, status: 'empty' },
        { name: 'A2', area: 'Indoor', cap: 2, status: 'ordered', guests: 2, mins: 24, total: 118000, waiter: 'Budi' },
        { name: 'A3', area: 'Indoor', cap: 4, status: 'ordered', guests: 4, mins: 41, total: 286000, waiter: 'Budi' },
        { name: 'A4', area: 'Indoor', cap: 4, status: 'bill', guests: 3, mins: 67, total: 214500, waiter: 'Ayu' },
        { name: 'A5', area: 'Indoor', cap: 4, status: 'empty' },
        { name: 'A6', area: 'Indoor', cap: 6, status: 'seated', guests: 5, mins: 3, total: 0, waiter: 'Ayu' },
        { name: 'A7', area: 'Indoor', cap: 2, status: 'dirty' },
        { name: 'A8', area: 'Indoor', cap: 8, status: 'ordered', guests: 7, mins: 15, total: 532000, waiter: 'Budi' },
        { name: 'B1', area: 'Outdoor', cap: 4, status: 'ordered', guests: 2, mins: 12, total: 76000, waiter: 'Ayu' },
        { name: 'B2', area: 'Outdoor', cap: 4, status: 'empty' },
        { name: 'B3', area: 'Outdoor', cap: 2, status: 'empty' },
        { name: 'B4', area: 'Outdoor', cap: 6, status: 'bill', guests: 6, mins: 88, total: 645000, waiter: 'Budi' },
        { name: 'C1', area: 'Lantai 2', cap: 10, status: 'ordered', guests: 9, mins: 33, total: 1240000, waiter: 'Rizky' },
        { name: 'C2', area: 'Lantai 2', cap: 4, status: 'empty' },
        { name: 'C3', area: 'Lantai 2', cap: 4, status: 'empty' }
    ],

    cashiers: ['Rina', 'Dimas', 'Sari', 'Yoga'],
    payMethods: ['Tunai', 'QRIS', 'Debit BCA', 'GoPay', 'OVO'],
    orderTypes: ['Dine-in', 'Take Away', 'GoFood', 'GrabFood']
};

window.rp = function (n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
};
