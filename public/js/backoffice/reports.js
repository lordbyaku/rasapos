// Laporan: harian, menu, kasir, shift, pembayaran & channel, pajak, tutup hari, audit, HPP
BO.page('reports', {
    title: 'Laporan',
    tab: 'daily',
    chart: null,
    async render(view) {
        BO.filters({ outlet: 'multi', date: true, onChange: () => this.load() });
        view.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-4"><div id="r-tabs"></div><button id="r-export" class="btn-outline ml-auto"><i class="fas fa-file-csv"></i>Export CSV</button></div><div id="r-body"></div>`;
        BO.tabs($('#r-tabs'), [['daily', 'Penjualan Harian'], ['items', 'Menu'], ['staff', 'Kasir'], ['shifts', 'Shift'], ['payments', 'Pembayaran & Channel'], ['tax', 'Pajak & Service'], ['days', 'Tutup Hari'], ['audit', 'Audit'], ['hpp', 'HPP & Margin']], this.tab, t => { this.tab = t; this.load(); });
        $('#r-export').onclick = () => this.export && this.export();
        await this.load();
    },
    table(cols, rows, foot) {
        return `<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr>${cols.map(c => `<th class="${c.right ? 'text-right' : ''}">${c.label}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.right ? 'text-right' : ''} ${c.cls || ''}">${c.html ? c.html(r) : esc(c.value ? c.value(r) : r[c.key])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="text-center text-stone-400 py-8">Tidak ada data</td></tr>`}</tbody>
            ${foot ? `<tfoot><tr class="font-bold bg-stone-50">${cols.map(c => `<td class="${c.right ? 'text-right' : ''} border-t border-stone-200 px-3 py-2.5">${foot[c.key] !== undefined ? esc(foot[c.key]) : ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div></div>`;
    },
    csv(name, rows, cols) {
        const r = BO.rangeDates();
        downloadCSV(`${name}-${r.from}_${r.to}.csv`, rows, cols.map(c => ({ label: c.label.replace(/<[^>]+>/g, ''), value: c.csv || c.value || (x => x[c.key]) })));
    },
    async load() {
        const body = $('#r-body');
        body.innerHTML = '<div class="py-16 text-center text-stone-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        if (this.chart) { this.chart.destroy(); this.chart = null; }
        try { await this['load_' + this.tab](body); } catch (e) { body.innerHTML = `<div class="card p-6 text-red-600">${esc(e.message)}</div>`; }
    },

    async load_daily(body) {
        const d = await API.get('/t/reports/daily?' + BO.qs());
        const cols = [
            { label: 'Tanggal', key: 'business_date', value: r => fmtDay(r.business_date), csv: r => r.business_date },
            { label: 'Transaksi', key: 'trx', right: true }, { label: 'Tamu', key: 'guests', right: true },
            { label: 'Penjualan kotor', key: 'gross', right: true, value: r => rp(r.gross), csv: r => r.gross },
            { label: 'Diskon', key: 'discount', right: true, value: r => rp(r.discount), csv: r => r.discount },
            { label: 'Penjualan bersih', key: 'net', right: true, value: r => rp(r.net), csv: r => r.net },
            { label: 'Service', key: 'service', right: true, value: r => rp(r.service), csv: r => r.service },
            { label: 'Pajak', key: 'tax', right: true, value: r => rp(r.tax), csv: r => r.tax },
            { label: 'Total', key: 'total', right: true, value: r => rp(r.total), csv: r => r.total, cls: 'font-semibold' },
            { label: 'Komisi online', key: 'commission', right: true, value: r => rp(r.commission), csv: r => r.commission },
            { label: 'HPP', key: 'cost', right: true, value: r => rp(r.cost), csv: r => r.cost },
            { label: 'Refund', key: 'refund_total', right: true, value: r => r.refund_trx ? `${r.refund_trx} · ${rp(r.refund_total)}` : '-', csv: r => r.refund_total }
        ];
        const sum = k => d.items.reduce((s, r) => s + r[k], 0);
        const foot = { business_date: 'Total', trx: sum('trx'), guests: sum('guests'), gross: rp(sum('gross')), discount: rp(sum('discount')), net: rp(sum('net')), service: rp(sum('service')), tax: rp(sum('tax')), total: rp(sum('total')), commission: rp(sum('commission')), cost: rp(sum('cost')), refund_total: rp(sum('refund_total')) };
        body.innerHTML = `<div class="card p-4 mb-4"><div class="h-56"><canvas id="r-chart"></canvas></div></div>` + this.table(cols, d.items, d.items.length ? foot : null);
        this.chart = new Chart($('#r-chart'), { type: 'bar', data: { labels: d.items.map(r => fmtDay(r.business_date)), datasets: [{ label: 'Total', data: d.items.map(r => r.total), backgroundColor: '#f97316', borderRadius: 4 }, { label: 'Bersih', data: d.items.map(r => r.net), backgroundColor: '#fdba74', borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
        this.export = () => this.csv('penjualan-harian', d.items, cols);
    },

    async load_items(body) {
        const d = await API.get('/t/reports/items?' + BO.qs());
        const cols = [
            { label: 'Menu', key: 'name' }, { label: 'Kategori', key: 'category' }, { label: 'Terjual', key: 'qty', right: true },
            { label: 'Penjualan', key: 'gross', right: true, value: r => rp(r.gross), csv: r => r.gross },
            { label: 'HPP', key: 'cost', right: true, value: r => r.cost ? rp(r.cost) : '-', csv: r => r.cost },
            { label: 'Margin', key: 'margin', right: true, value: r => r.cost ? rp(r.margin) : '-', csv: r => r.margin }
        ];
        const catCols = [{ label: 'Kategori', key: 'category' }, { label: 'Terjual', key: 'qty', right: true }, { label: 'Penjualan', key: 'gross', right: true, value: r => rp(r.gross) }];
        body.innerHTML = `<div class="grid xl:grid-cols-3 gap-4"><div class="xl:col-span-2">${this.table(cols, d.items)}</div><div>${this.table(catCols, d.categories)}</div></div>`;
        this.export = () => this.csv('penjualan-menu', d.items, cols);
    },

    async load_staff(body) {
        const d = await API.get('/t/reports/staff?' + BO.qs());
        const cols = [
            { label: 'Kasir/Staff', key: 'name' }, { label: 'Peran', key: 'role', value: r => ROLE_LABEL[r.role] || r.role },
            { label: 'Transaksi', key: 'trx', right: true }, { label: 'Total', key: 'total', right: true, value: r => rp(r.total), csv: r => r.total },
            { label: 'Diskon', key: 'discount', right: true, value: r => rp(r.discount), csv: r => r.discount },
            { label: 'Item void', key: 'void_items', right: true, html: r => r.void_items ? `<span class="text-red-600 font-semibold">${r.void_items}</span>` : '0', csv: r => r.void_items },
            { label: 'Order batal', key: 'void_orders', right: true }, { label: 'Refund', key: 'refunds', right: true }
        ];
        body.innerHTML = this.table(cols, d.items);
        this.export = () => this.csv('laporan-kasir', d.items, cols);
    },

    async load_shifts(body) {
        const d = await API.get('/t/reports/shifts?' + BO.qs());
        const cols = [
            { label: 'Outlet', key: 'outlet_id', value: r => BO.outletName(r.outlet_id) }, { label: 'Kasir', key: 'staff_name' },
            { label: 'Buka', key: 'opened_at', value: r => fmtDateTime(r.opened_at) }, { label: 'Tutup', key: 'closed_at', value: r => r.closed_at ? fmtDateTime(r.closed_at) : 'Masih buka' },
            { label: 'Modal', key: 'opening_cash', right: true, value: r => rp(r.opening_cash), csv: r => r.opening_cash },
            { label: 'Penjualan', key: 'total', right: true, value: r => r.summary ? rp(r.summary.total) : '-', csv: r => r.summary && r.summary.total },
            { label: 'Kas seharusnya', key: 'expected_cash', right: true, value: r => r.expected_cash !== null ? rp(r.expected_cash) : '-', csv: r => r.expected_cash },
            { label: 'Kas aktual', key: 'closing_cash', right: true, value: r => r.closing_cash !== null ? rp(r.closing_cash) : '-', csv: r => r.closing_cash },
            { label: 'Selisih', key: 'diff', right: true, html: r => { const x = r.summary ? r.summary.difference : null; return x === null || x === undefined ? '-' : `<span class="${x < 0 ? 'text-red-600' : x > 0 ? 'text-amber-600' : 'text-emerald-600'} font-semibold">${rp(x)}</span>`; }, csv: r => r.summary && r.summary.difference }
        ];
        body.innerHTML = this.table(cols, d.items);
        this.export = () => this.csv('laporan-shift', d.items, cols);
    },

    async load_payments(body) {
        const d = await API.get('/t/reports/summary?' + BO.qs());
        const payCols = [{ label: 'Metode', key: 'name' }, { label: 'Jumlah', key: 'count', right: true }, { label: 'Nominal', key: 'amount', right: true, value: r => rp(r.amount), csv: r => r.amount }];
        const chCols = [
            { label: 'Channel', key: 'channel', value: r => BO.channelName(r.channel) }, { label: 'Transaksi', key: 'trx', right: true },
            { label: 'Total', key: 'total', right: true, value: r => rp(r.total), csv: r => r.total },
            { label: 'Komisi', key: 'commission', right: true, value: r => rp(r.commission), csv: r => r.commission },
            { label: 'Neto setelah komisi', key: 'netc', right: true, value: r => rp(r.total - r.commission), csv: r => r.total - r.commission }
        ];
        body.innerHTML = `<div class="grid xl:grid-cols-2 gap-4"><div><h3 class="font-bold mb-2">Metode Pembayaran</h3>${this.table(payCols, d.payments)}</div><div><h3 class="font-bold mb-2">Channel Penjualan</h3>${this.table(chCols, d.by_channel)}</div></div>`;
        this.export = () => this.csv('pembayaran', d.payments, payCols);
    },

    async load_tax(body) {
        const d = await API.get('/t/reports/daily?' + BO.qs());
        const cols = [
            { label: 'Tanggal', key: 'business_date', value: r => fmtDay(r.business_date), csv: r => r.business_date },
            { label: 'Penjualan bersih (DPP)', key: 'net', right: true, value: r => rp(r.net), csv: r => r.net },
            { label: 'Service charge', key: 'service', right: true, value: r => rp(r.service), csv: r => r.service },
            { label: 'Pajak (PBJT)', key: 'tax', right: true, value: r => rp(r.tax), csv: r => r.tax, cls: 'font-semibold' },
            { label: 'Total diterima', key: 'total', right: true, value: r => rp(r.total), csv: r => r.total }
        ];
        const sum = k => d.items.reduce((s, r) => s + r[k], 0);
        body.innerHTML = `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Untuk pelaporan pajak daerah (PBJT makanan & minuman). Filter per outlet sesuai NPWPD masing-masing.</p>` +
            this.table(cols, d.items, d.items.length ? { business_date: 'Total', net: rp(sum('net')), service: rp(sum('service')), tax: rp(sum('tax')), total: rp(sum('total')) } : null);
        this.export = () => this.csv('laporan-pajak', d.items, cols);
    },

    async load_days(body) {
        const r = BO.rangeDates();
        const d = await API.get(`/t/days?from=${r.from}&to=${r.to}`);
        const items = d.items.filter(x => !BO.outletIds.length || BO.outletIds.includes(x.outlet_id));
        const cols = [
            { label: 'Tanggal', key: 'business_date', value: x => fmtDay(x.business_date), csv: x => x.business_date }, { label: 'Outlet', key: 'outlet_id', value: x => BO.outletName(x.outlet_id) },
            { label: 'Transaksi', key: 'trx', right: true, value: x => x.summary.trx }, { label: 'Total', key: 'total', right: true, value: x => rp(x.summary.total), csv: x => x.summary.total },
            { label: 'Ditutup oleh', key: 'closed_by' }, { label: 'Waktu', key: 'closed_at', value: x => fmtDateTime(x.closed_at) },
            { label: '', key: 'print', html: x => `<button class="btn-light !py-1" data-day="${x.outlet_id}|${x.business_date}"><i class="fas fa-print"></i></button>`, csv: () => '' }
        ];
        body.innerHTML = this.table(cols, items);
        $$('[data-day]').forEach(b => b.onclick = () => { const x = items.find(i => `${i.outlet_id}|${i.business_date}` === b.dataset.day); Printer.printHtml(Receipt.day(x.summary)); });
        this.export = () => this.csv('tutup-hari', items, cols);
    },

    async load_audit(body) {
        const r = BO.rangeDates();
        const from = new Date(r.from + 'T00:00:00').getTime(), to = new Date(r.to + 'T23:59:59').getTime();
        const d = await API.get(`/t/audit?from_ms=${from}&to_ms=${to}`);
        const items = d.items.filter(x => !BO.outletIds.length || !x.outlet_id || BO.outletIds.includes(x.outlet_id));
        const label = { void_item: 'Void item', void_order: 'Batal order', refund: 'Refund', discount: 'Diskon', no_sale: 'Buka laci', cash_difference: 'Selisih kas', price_mismatch: 'Selisih harga (offline)', custom_item: 'Item custom', merge: 'Gabung bill', split: 'Split bill', close_day: 'Tutup hari', reprint_bill: 'Cetak ulang bill', stock_opname: 'Stok opname', stock_waste: 'Waste', stock_adjust: 'Penyesuaian stok', promo_mismatch: 'Promo tidak cocok' };
        const tone = a => ['void_item', 'void_order', 'refund', 'cash_difference', 'no_sale'].includes(a) ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-600';
        const detail = x => {
            const v = x.data || {};
            if (x.action === 'void_item') return `${v.qty || ''}× ${v.item || ''} — ${v.reason || ''}${v.approved_by ? ' (disetujui ' + v.approved_by + ')' : ''}`;
            if (x.action === 'cash_difference') return `Seharusnya ${rp(v.expected)}, aktual ${rp(v.actual)}, selisih ${rp(v.difference)}`;
            if (x.action === 'price_mismatch') return `${v.menu}: perangkat ${rp(v.device_price)}, server ${rp(v.server_price)}`;
            if (x.action === 'discount') return `${v.discount && v.discount.name || ''} ${rp(v.amount)}`;
            if (x.action === 'refund' || x.action === 'void_order') return `${v.reason || ''} · ${rp(v.total)}`;
            return Object.entries(v).map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join(', ');
        };
        const cols = [
            { label: 'Waktu', key: 'created_at', value: x => fmtDateTime(x.created_at) }, { label: 'Outlet', key: 'outlet_id', value: x => x.outlet_id ? BO.outletName(x.outlet_id) : '-' },
            { label: 'Aksi', key: 'action', html: x => `<span class="badge ${tone(x.action)}">${esc(label[x.action] || x.action)}</span>`, csv: x => label[x.action] || x.action },
            { label: 'Referensi', key: 'ref' }, { label: 'Oleh', key: 'actor' }, { label: 'Detail', key: 'data', value: detail, cls: 'whitespace-normal min-w-[240px]' }
        ];
        body.innerHTML = this.table(cols, items);
        this.export = () => this.csv('audit-log', items, cols);
    },

    async load_hpp(body) {
        const d = await API.get('/t/reports/hpp');
        const cols = [
            { label: 'Menu', key: 'name' }, { label: 'Kategori', key: 'category' },
            { label: 'Harga', key: 'price', right: true, value: r => rp(r.price), csv: r => r.price },
            { label: 'HPP (resep)', key: 'cost', right: true, html: r => r.has_recipe ? rp(r.cost) : '<span class="text-stone-400">belum ada resep</span>', csv: r => r.cost },
            { label: 'Margin', key: 'margin', right: true, value: r => r.has_recipe ? rp(r.margin) : '-', csv: r => r.margin },
            { label: 'Margin %', key: 'margin_pct', right: true, html: r => r.has_recipe ? `<span class="font-semibold ${r.margin_pct < 50 ? 'text-red-600' : r.margin_pct < 65 ? 'text-amber-600' : 'text-emerald-600'}">${r.margin_pct}%</span>` : '-', csv: r => r.margin_pct }
        ];
        body.innerHTML = `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>HPP dihitung dari resep × harga rata-rata bahan (diperbarui setiap pembelian). Atur resep di Menu & Harga.</p>` + this.table(cols, d.items);
        this.export = () => this.csv('hpp-menu', d.items, cols);
    }
});
