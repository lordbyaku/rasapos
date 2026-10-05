// Fitur per tenant yang bisa diaktifkan/dinonaktifkan superadmin. Dipakai Worker, Durable Object, dan semua halaman.
// Disimpan sebagai JSON { kunci: true|false } — kunci yang tidak ada memakai nilai default (aktif),
// sehingga tenant lama & fitur baru otomatis aktif.
(function (root) {
    const LIST = [
        { key: 'kds', icon: 'fa-fire-burner', label: 'Layar Dapur (KDS)', desc: 'Tablet/TV dapur menampilkan pesanan. Jika nonaktif: perangkat KDS tidak bisa dipasangkan & dibuka. Tiket dapur tetap bisa dicetak dari kasir.' },
        { key: 'tables', icon: 'fa-chair', label: 'Meja & denah', desc: 'Area, meja, pindah meja. Jika nonaktif: dine-in tanpa nomor meja (cukup nama pemesan).' },
        { key: 'inventory', icon: 'fa-boxes-stacked', label: 'Inventori & resep', desc: 'Bahan baku, resep, stok otomatis, HPP. Jika nonaktif: penjualan tidak memotong stok.' },
        { key: 'marketing', icon: 'fa-tags', label: 'Promo, pelanggan & poin', desc: 'Promo otomatis/manual, data pelanggan, poin loyalitas. Diskon manual kasir tetap ada.' },
        { key: 'ai', icon: 'fa-robot', label: 'Asisten AI panduan', desc: 'Jawaban AI (Gemini) di halaman panduan. Jika nonaktif: hanya pencarian panduan.' }
    ];
    const KEYS = LIST.map(f => f.key);

    /** JSON/objek tersimpan → objek lengkap { kds: true, ... } */
    function resolve(stored) {
        let v = stored;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
        const out = {};
        for (const k of KEYS) out[k] = !(v && v[k] === false);
        return out;
    }

    /** Hanya simpan kunci yang dikenal, nilai boolean. */
    function sanitize(input) {
        const out = {};
        for (const k of KEYS) if (input && typeof input[k] === 'boolean') out[k] = input[k];
        return out;
    }

    /** Paket langganan (harga per paket = maks. 5 outlet). Trial memakai semua fitur. */
    const PLANS = {
        basic: { key: 'basic', label: 'Basic', monthly: 100000, yearly: 1000000, excludes: ['kds', 'inventory'] },
        pro: { key: 'pro', label: 'Pro', monthly: 200000, yearly: 2000000, excludes: [] }
    };
    const planOf = p => PLANS[p] || PLANS.pro;

    /** Fitur yang berlaku = pengaturan manual superadmin DAN yang termasuk paket (kecuali masa trial). */
    function effective(stored, plan, licenseState) {
        const out = resolve(stored);
        if (licenseState !== 'trial') for (const k of planOf(plan).excludes) out[k] = false;
        return out;
    }

    /** Harga: paket × (12 bulan = harga tahunan, selain itu harga bulanan × bulan) */
    function price(plan, packs, months) {
        const p = planOf(plan);
        const m = Math.max(1, Number(months) || 1), n = Math.max(1, Number(packs) || 1);
        return n * (Math.floor(m / 12) * p.yearly + (m % 12) * p.monthly);
    }

    root.Features = { LIST, KEYS, PLANS, planOf, resolve, sanitize, effective, price };
})(typeof globalThis !== 'undefined' ? globalThis : window);
