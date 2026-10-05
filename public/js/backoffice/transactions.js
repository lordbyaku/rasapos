// Transaksi lintas outlet: filter, detail, refund, cetak ulang, export CSV
const Transactions = {
    state: { page: 1, status: '', channel: '', q: '' },

    async openDetail(id) {
        BO.drawer('Detail Transaksi', '<div class="py-10 text-center text-stone-400"><i class="fas fa-spinner fa-spin"></i></div>');
        let o;
        try { o = (await API.get('/t/orders/' + id)).order; } catch (e) { BO.drawer('Detail Transaksi', `<p class="text-red-600">${esc(e.message)}</p>`); return; }
        const outlet = BO.outlets.find(x => x.id === o.outlet_id) || {};
        const tt = o.totals || {};
        const statusTone = { paid: 'bg-emerald-50 text-emerald-700', open: 'bg-sky-50 text-sky-700', void: 'bg-red-50 text-red-600', refunded: 'bg-amber-50 text-amber-700', merged: 'bg-stone-100 text-stone-500' };
        const body = `
            <div class="flex items-center justify-between"><span class="font-mono font-bold">${esc(o.order_no)}</span><span class="badge ${statusTone[o.status] || ''}">${ORDER_STATUS[o.status] || o.status}</span></div>
            <div class="grid grid-cols-2 gap-y-1.5 mt-4 text-stone-500">
                <span>Outlet</span><b class="text-stone-800">${esc(outlet.name || '-')}</b>
                <span>Tanggal bisnis</span><b class="text-stone-800">${fmtDay(o.business_date)}</b>
                <span>Dibuka</span><b class="text-stone-800">${fmtDateTime(o.opened_at)}</b>
                <span>Ditutup</span><b class="text-stone-800">${fmtDateTime(o.closed_at)}</b>
                <span>Channel</span><b class="text-stone-800">${esc(BO.channelName(o.channel))}${o.table_name ? ' · Meja ' + esc(o.table_name) : ''}</b>
                <span>Tamu</span><b class="text-stone-800">${o.guests || '-'}</b>
                ${o.customer_name ? `<span>Pelanggan</span><b class="text-stone-800">${esc(o.customer_name)}</b>` : ''}
                ${o.offline ? '<span>Catatan</span><b class="text-amber-600">Dibuat saat offline</b>' : ''}
            </div>
            <div class="border-t border-dashed border-stone-300 my-4"></div>
            <div class="space-y-2">${o.items.map(i => `
                <div class="flex justify-between gap-2 ${i.status === 'void' ? 'text-stone-400 line-through' : ''}">
                    <div><b>${i.qty}×</b> ${esc(i.name)}${i.mods && i.mods.length ? `<div class="text-xs text-stone-500 no-underline">${esc(i.mods.map(m => m.name).join(', '))}</div>` : ''}
                    ${i.note ? `<div class="text-xs text-amber-700">${esc(i.note)}</div>` : ''}
                    ${i.status === 'void' ? `<div class="text-xs text-red-500">void: ${esc(i.void_reason || '')}</div>` : ''}</div>
                    <span class="whitespace-nowrap">${rp(i.price * i.qty)}</span></div>`).join('')}</div>
            <div class="border-t border-dashed border-stone-300 my-4"></div>
            <div class="space-y-1">
                <div class="flex justify-between"><span>Subtotal</span><span>${rp(tt.subtotal)}</span></div>
                ${tt.order_discount ? `<div class="flex justify-between text-red-500"><span>${esc(o.discount && o.discount.name || 'Diskon')}</span><span>-${rp(tt.order_discount)}</span></div>` : ''}
                ${tt.service ? `<div class="flex justify-between"><span>Service</span><span>${rp(tt.service)}</span></div>` : ''}
                ${tt.tax ? `<div class="flex justify-between"><span>Pajak</span><span>${rp(tt.tax)}</span></div>` : ''}
                ${o.rounding ? `<div class="flex justify-between"><span>Pembulatan</span><span>${rp(o.rounding)}</span></div>` : ''}
                <div class="flex justify-between text-lg font-extrabold"><span>Total</span><span>${rp((tt.total || 0) + (o.rounding || 0))}</span></div>
                ${(o.payments || []).map(p => `<div class="flex justify-between text-stone-500"><span>${esc(p.name)}</span><span>${rp(p.amount)}</span></div>`).join('')}
                ${o.change ? `<div class="flex justify-between text-stone-500"><span>Kembali</span><span>${rp(o.change)}</span></div>` : ''}
            </div>
            ${o.status === 'refunded' ? `<div class="mt-4 p-3 rounded-xl bg-amber-50 text-amber-800 text-xs">Refund: ${esc(o.refund_reason)} · ${fmtDateTime(o.refunded_at)}</div>` : ''}
            ${o.status === 'void' ? `<div class="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs">Dibatalkan: ${esc(o.void_reason)}</div>` : ''}`;
        const foot = `<button id="tx-print" class="btn-light flex-1"><i class="fas fa-print"></i>Cetak</button>${o.status === 'paid' ? '<button id="tx-refund" class="btn-danger flex-1"><i class="fas fa-rotate-left"></i>Refund</button>' : ''}`;
        BO.drawer('Detail Transaksi', body, foot);
        $('#tx-print').onclick = () => Printer.printHtml(Receipt.order(o, { outlet, tenantName: BO.me.tenant.name, channels: BO.meta.channels, copy: true }, o.status === 'open' ? 'bill' : 'receipt'));
        const rf = $('#tx-refund');
        if (rf) rf.onclick = async () => {
            const reason = await promptDialog('Refund transaksi ' + o.order_no, { label: 'Alasan refund (wajib)', placeholder: 'mis. pesanan salah, komplain', validate: v => !v.trim() && 'Alasan wajib diisi', confirm: 'Refund' });
            if (!reason) return;
            const res = await API.post('/t/ops', { ops: [{ op_id: uuid(), type: 'order.refund', order_id: o.id, payload: { reason }, at: Date.now() }] });
            const r = res.results[0];
            if (!r.ok) return errorDialog(new Error(r.error));
            toast('Refund dicatat', 'success');
            $('#bo-drawer').classList.add('hidden');
            if (location.hash === '#transactions') BO.refresh();
        };
    }
};

BO.page('transactions', {
    title: 'Transaksi',
    async render(view) {
        BO.filters({ outlet: 'multi', date: true, onChange: () => { Transactions.state.page = 1; this.load(); } });
        const s = Transactions.state;
        view.innerHTML = `
            <div class="flex flex-wrap gap-2 mb-3">
                <div class="relative flex-1 min-w-[200px]"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i><input id="tx-q" value="${esc(s.q)}" placeholder="Cari no. order, meja, pelanggan…" class="input pl-9"></div>
                <select id="tx-status" class="input !w-auto"><option value="">Semua status</option>${Object.entries(ORDER_STATUS).filter(([k]) => k !== 'merged').map(([k, v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
                <select id="tx-channel" class="input !w-auto"><option value="">Semua channel</option>${BO.meta.channels.map(c => `<option value="${c.code}" ${s.channel === c.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
                <button id="tx-export" class="btn-outline"><i class="fas fa-file-csv"></i>Export CSV</button>
            </div>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Waktu</th><th>No. Order</th><th>Outlet</th><th>Channel</th><th>Meja/Pelanggan</th><th>Kasir</th><th>Bayar</th><th>Status</th><th class="text-right">Total</th></tr></thead><tbody id="tx-rows"></tbody></table></div>
            <div id="tx-pager" class="flex items-center justify-between p-3 text-sm border-t border-stone-100"></div></div>`;
        $('#tx-q').oninput = debounce(e => { s.q = e.target.value; s.page = 1; this.load(); }, 350);
        $('#tx-status').onchange = e => { s.status = e.target.value; s.page = 1; this.load(); };
        $('#tx-channel').onchange = e => { s.channel = e.target.value; s.page = 1; this.load(); };
        $('#tx-export').onclick = () => this.export();
        BO.on('sale.new', BO.live(() => this.load(), 30000));
        await this.load();
    },
    params(extra) {
        const s = Transactions.state;
        return BO.qs({ page: s.page, ...(s.status ? { status: s.status } : {}), ...(s.channel ? { channel: s.channel } : {}), ...(s.q ? { q: s.q } : {}), ...extra });
    },
    async load() {
        const d = await API.get('/t/reports/transactions?' + this.params());
        const tone = { paid: 'bg-emerald-50 text-emerald-700', open: 'bg-sky-50 text-sky-700', void: 'bg-red-50 text-red-600', refunded: 'bg-amber-50 text-amber-700' };
        $('#tx-rows').innerHTML = d.items.map(x => `<tr data-id="${x.id}" class="cursor-pointer hover:bg-stone-50">
            <td class="text-stone-500">${fmtDateTime(x.closed_at || x.opened_at)}</td><td class="font-mono text-xs">${esc(x.order_no)}${x.offline ? ' <i class="fas fa-wifi text-stone-300" title="dibuat offline"></i>' : ''}</td>
            <td>${esc(BO.outletName(x.outlet_id))}</td><td>${esc(BO.channelName(x.channel))}</td><td>${esc([x.table_name && 'Meja ' + x.table_name, x.customer_name].filter(Boolean).join(' · ') || '-')}</td>
            <td>${esc(x.staff || '-')}</td><td>${esc(x.payments || '-')}</td><td><span class="badge ${tone[x.status] || 'bg-stone-100'}">${ORDER_STATUS[x.status] || x.status}</span>${x.voids ? ` <span class="badge bg-red-50 text-red-500">${x.voids} void</span>` : ''}</td>
            <td class="text-right font-semibold">${rp(x.total)}</td></tr>`).join('') || '<tr><td colspan="9" class="text-center text-stone-400 py-8">Tidak ada transaksi</td></tr>';
        $$('#tx-rows [data-id]').forEach(tr => tr.onclick = () => Transactions.openDetail(tr.dataset.id));
        const pages = Math.max(1, Math.ceil(d.total_rows / d.per_page));
        $('#tx-pager').innerHTML = `<span class="text-stone-500">${d.total_rows} transaksi · ${BO.rangeLabel()}</span>
            <div class="flex items-center gap-2"><button class="btn-light !py-1.5" ${d.page <= 1 ? 'disabled' : ''} data-p="${d.page - 1}"><i class="fas fa-chevron-left"></i></button><span>${d.page} / ${pages}</span><button class="btn-light !py-1.5" ${d.page >= pages ? 'disabled' : ''} data-p="${d.page + 1}"><i class="fas fa-chevron-right"></i></button></div>`;
        $$('#tx-pager [data-p]').forEach(b => b.onclick = () => { Transactions.state.page = Number(b.dataset.p); this.load(); });
    },
    async export() {
        const d = await API.get('/t/reports/transactions?' + this.params({ all: 1 }));
        const r = BO.rangeDates();
        downloadCSV(`transaksi-${r.from}_${r.to}.csv`, d.items, [
            { label: 'Tanggal Bisnis', key: 'business_date' }, { label: 'Waktu', value: x => fmtDateTime(x.closed_at || x.opened_at) },
            { label: 'No Order', key: 'order_no' }, { label: 'Outlet', value: x => BO.outletName(x.outlet_id) }, { label: 'Channel', value: x => BO.channelName(x.channel) },
            { label: 'Meja', key: 'table_name' }, { label: 'Pelanggan', key: 'customer_name' }, { label: 'Kasir', key: 'staff' }, { label: 'Status', value: x => ORDER_STATUS[x.status] },
            { label: 'Item', key: 'items' }, { label: 'Subtotal', key: 'subtotal' }, { label: 'Diskon', key: 'discount' }, { label: 'Service', key: 'service' }, { label: 'Pajak', key: 'tax' },
            { label: 'Total', key: 'total' }, { label: 'Pembayaran', key: 'payments' }, { label: 'Offline', value: x => (x.offline ? 'ya' : '') }
        ]);
    }
});
