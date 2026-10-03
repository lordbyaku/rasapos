// Pencarian isi panduan (BM25 sederhana, bahasa Indonesia) — dipakai halaman tutorial (offline)
// dan Worker /api/assist (memilih potongan panduan untuk Gemini). Tanpa DOM.
(function (root) {
    const STOP = new Set(('yang dan di ke dari untuk dengan ini itu atau pada adalah akan juga bisa dapat tidak belum sudah ' +
        'saya aku kami kita anda kamu dia mereka nya apa apakah bagaimana gimana cara caranya kenapa mengapa kapan dimana mana ' +
        'siapa berapa harus perlu mau ingin tolong mohon gak ga nggak tdk bgmn gmn kalau kalo jika bila agar supaya karena ' +
        'saat sedang masih lagi sih dong ya kah lah pun jadi tapi tetapi namun oleh sebagai secara seperti hal ada adanya ' +
        'jual jualan berjualan dijual the a an of to is in').split(' '));

    // Kelompok sinonim → satu kata dasar (berlaku untuk dokumen dan pertanyaan).
    const SYN = {};
    [
        ['bayar', 'pembayaran', 'membayar', 'dibayar', 'payment', 'lunas', 'pelunasan', 'checkout'],
        ['struk', 'nota', 'receipt', 'kuitansi', 'bon', 'bill'],
        ['void', 'batal', 'pembatalan', 'membatalkan', 'dibatalkan', 'cancel', 'hapus'],
        ['printer', 'cetak', 'mencetak', 'print', 'dicetak', 'thermal'],
        ['meja', 'table', 'dinein', 'denah'],
        ['offline', 'internet', 'sinyal', 'koneksi', 'wifi', 'putus', 'mati'],
        ['sinkron', 'sinkronisasi', 'sync', 'tertunda', 'outbox'],
        ['password', 'sandi'],
        ['shift', 'laci', 'kas', 'modal', 'setoran', 'drawer'],
        ['dapur', 'kds', 'kitchen', 'koki', 'bar', 'barista', 'tiket'],
        ['promo', 'diskon', 'potongan', 'discount', 'voucher'],
        ['stok', 'bahan', 'inventori', 'inventory', 'resep', 'gudang', 'persediaan'],
        ['pajak', 'pbjt', 'pb1', 'ppn', 'tax'],
        ['service', 'servis', 'layanan'],
        ['tablet', 'perangkat', 'pairing', 'pasang', 'dipasangkan', 'device', 'hp', 'android'],
        ['laporan', 'report', 'rekap', 'omzet', 'penjualan', 'statistik'],
        ['menu', 'produk', 'item', 'barang'],
        ['varian', 'modifier', 'topping', 'tambahan', 'opsi', 'level', 'ukuran'],
        ['staff', 'karyawan', 'pegawai', 'kasir', 'waiter', 'pelayan', 'user', 'akun'],
        ['outlet', 'cabang', 'toko', 'gerai'],
        ['split', 'pisah', 'dipisah', 'memisah'],
        ['gabung', 'merge', 'digabung', 'menggabung'],
        ['refund', 'retur', 'kembalikan', 'pengembalian'],
        ['qris', 'nontunai', 'transfer', 'debit', 'kartu', 'ewallet', 'gopay', 'ovo', 'dana'],
        ['tunai', 'cash', 'uang', 'kembalian'],
        ['paket', 'langganan', 'lisensi', 'license', 'trial', 'berlangganan'],
        ['ojol', 'gofood', 'grabfood', 'shopeefood', 'online', 'kanal', 'channel'],
        ['tutup', 'closing', 'akhir'],
        ['harian', 'hari']
    ].forEach(g => g.forEach(w => { SYN[w] = SYN[w] || g[0]; }));

    const PREFIX = /^(meng|mem|men|meny|me|peng|pem|pen|peny|pe|ber|be|ter|te|di|ke|se)(?=[a-z]{4,})/;
    const SUFFIX = /(kannya|kan|annya|an|nya|lah|kah|i)$/;

    function stem(w) {
        if (SYN[w]) return SYN[w];
        let s = w;
        if (s.length > 5) s = s.replace(SUFFIX, '');
        if (SYN[s]) return SYN[s];
        if (s.length > 5) s = s.replace(PREFIX, '');
        return SYN[s] || s;
    }

    function stripHtml(html) {
        return String(html || '')
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<\/(p|li|tr|div|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/t[dh]>/gi, ' | ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&rarr;/g, '→')
            .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    }

    function tokens(text) {
        return String(text || '').toLowerCase()
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .split(/[^a-z0-9]+/)
            .filter(w => w.length > 1 && !STOP.has(w))
            .map(stem);
    }

    /** Potongan dokumen: satu per pelajaran (+ FAQ). Judul diberi bobot ganda. */
    function buildIndex(modules, faq) {
        const docs = [];
        modules.forEach(m => m.lessons.forEach((l, i) => {
            if (stripHtml(l.html).length < 20) return; // mis. wadah FAQ (isinya diindeks terpisah)
            docs.push({ id: `${m.id}:${i}`, module: m.id, lesson: i, moduleTitle: m.title, title: l.title, text: stripHtml(l.html) });
        }));
        (faq || []).forEach(([q, a], i) => docs.push({ id: `faq:${i}`, module: 'faq', lesson: i, moduleTitle: 'Tanya-jawab', title: q, text: a }));
        const df = {};
        let totalLen = 0;
        docs.forEach(d => {
            const toks = tokens(d.title + ' ' + d.title + ' ' + d.moduleTitle + ' ' + d.moduleTitle + ' ' + d.text);
            d.len = toks.length; totalLen += d.len;
            d.tf = {};
            toks.forEach(t => { d.tf[t] = (d.tf[t] || 0) + 1; });
            Object.keys(d.tf).forEach(t => { df[t] = (df[t] || 0) + 1; });
            d.titleToks = new Set(tokens(d.title + ' ' + d.moduleTitle));
        });
        return { docs, df, avgLen: totalLen / Math.max(1, docs.length) };
    }

    function search(index, query, k = 5) {
        const q = [...new Set(tokens(query))];
        if (!q.length) return [];
        const N = index.docs.length, k1 = 1.4, b = 0.6;
        const res = [];
        for (const d of index.docs) {
            let s = 0, hit = 0;
            for (const t of q) {
                const f = d.tf[t];
                if (!f) continue;
                hit++;
                const idf = Math.log(1 + (N - index.df[t] + 0.5) / (index.df[t] + 0.5));
                s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avgLen));
                if (d.titleToks.has(t)) s += idf * 1.5;
            }
            if (s > 0) res.push({ doc: d, score: s * (0.5 + 0.5 * hit / q.length) });
        }
        return res.sort((a, z) => z.score - a.score).slice(0, k);
    }

    /** Kalimat paling relevan dari satu dokumen (untuk jawaban mode pencarian). */
    function snippet(doc, query, maxChars = 420) {
        const q = new Set(tokens(query));
        const parts = doc.text.split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 12);
        if (!parts.length) return doc.text.slice(0, maxChars);
        const scored = parts.map((s, i) => ({ s, i, n: tokens(s).filter(t => q.has(t)).length }));
        const best = scored.slice().sort((a, z) => z.n - a.n || a.i - z.i);
        const pick = [];
        let len = 0;
        for (const p of best) {
            if (p.n === 0 && pick.length) break;
            if (len + p.s.length > maxChars && pick.length) break;
            pick.push(p); len += p.s.length;
            if (pick.length >= 3) break;
        }
        return pick.sort((a, z) => a.i - z.i).map(p => p.s).join(' … ');
    }

    root.TutorialSearch = { buildIndex, search, snippet, tokens, stripHtml };
})(typeof globalThis !== 'undefined' ? globalThis : window);
