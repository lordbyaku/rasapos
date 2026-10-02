// Dashboard pusat: semua outlet atau per outlet, realtime
BO.page('dashboard', {
    title: 'Dashboard',
    charts: [],
    async render(view) {
        BO.filters({ outlet: 'multi', date: true, onChange: () => this.load(view) });
        view.innerHTML = `
            <div id="d-kpi" class="grid grid-cols-2 xl:grid-cols-5 gap-4"></div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
                <div class="card p-4 xl:col-span-2"><div class="flex justify-between items-center"><h3 class="font-bold" id="d-chart-title">Penjualan per Jam</h3><span class="text-xs text-stone-500">per outlet</span></div><div class="h-64 mt-2"><canvas id="d-chart-main"></canvas></div></div>
                <div class="card p-4"><h3 class="font-bold">Channel Penjualan</h3><div class="h-64 mt-2"><canvas id="d-chart-channel"></canvas></div></div>
            </div>
            <div class="card mt-4 overflow-hidden">
                <div class="p-4 flex justify-between items-center"><h3 class="font-bold">Performa & Status Outlet</h3><span class="text-xs text-stone-500">klik baris untuk fokus</span></div>
                <div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Outlet</th><th>Status</th><th class="text-right">Penjualan</th><th class="w-40">Kontribusi</th><th class="text-right">Transaksi</th><th class="text-right">Rata-rata</th><th class="text-right">Tamu</th><th class="text-right">Order terbuka</th><th>Kasir aktif</th><th>Transaksi terakhir</th></tr></thead><tbody id="d-outlets"></tbody></table></div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
                <div class="card overflow-hidden xl:col-span-2">
                    <div class="p-4 flex justify-between items-center"><h3 class="font-bold">Transaksi Terbaru <span class="text-xs font-normal text-stone-500">— realtime</span></h3><a href="#transactions" class="text-sm text-brand-600">Lihat semua</a></div>
                    <div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Waktu</th><th>No.</th><th>Outlet</th><th>Channel</th><th>Kasir</th><th>Bayar</th><th class="text-right">Total</th></tr></thead><tbody id="d-feed"></tbody></table></div>
                </div>
                <div class="space-y-4">
                    <div class="card p-4"><h3 class="font-bold mb-3">Menu Terlaris</h3><div id="d-top" class="space-y-2 text-sm"></div></div>
                    <div class="card p-4"><h3 class="font-bold mb-3">Metode Pembayaran</h3><div id="d-pay" class="space-y-2 text-sm"></div></div>
                </div>
            </div>`;
        const reload = debounce(() => this.load(view, true), 2500);
        BO.on('sale.new', s => { this.prependSale(s); reload(); });
        BO.on('presence', () => reload());
        BO.on('shift.updated', () => reload());
        await this.load(view);
    },

    async load(view, silent) {
        const [d, feed] = await Promise.all([
            API.get('/t/reports/summary?' + BO.qs()),
            API.get('/t/reports/transactions?' + BO.qs({ page: 1 }))
        ]);
        this.data = d;
        const t = d.totals, p = d.previous;
        const avg = t.trx ? t.total / t.trx : 0, pavg = p.trx ? p.total / p.trx : 0;
        const openOrders = d.outlets.reduce((s, o) => s + o.open_orders, 0);
        $('#d-kpi').innerHTML =
            BO.kpi('Penjualan', rp(t.total), delta(t.total, p.total), 'fa-sack-dollar') +
            BO.kpi('Transaksi', t.trx.toLocaleString('id-ID'), delta(t.trx, p.trx), 'fa-receipt') +
            BO.kpi('Rata-rata / transaksi', rp(avg), delta(avg, pavg), 'fa-scale-balanced') +
            BO.kpi('Jumlah tamu', t.guests.toLocaleString('id-ID'), delta(t.guests, p.guests), 'fa-users') +
            BO.kpi('Order terbuka', openOrders, `Senilai ${rp(d.outlets.reduce((s, o) => s + o.open_total, 0))}`, 'fa-hourglass-half', 'text-stone-500');

        // Tabel outlet
        const totalSales = d.outlets.reduce((s, o) => s + o.total, 0) || 1;
        $('#d-outlets').innerHTML = d.outlets.map(o => {
            const online = o.devices.length > 0;
            const pct = o.total / totalSales * 100;
            return `<tr data-o="${o.id}" class="cursor-pointer hover:bg-brand-50/50">
                <td><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${outletColor(o.id)}"></span><div><b>${esc(o.name)}</b><div class="text-xs text-stone-400">${esc(o.code)}</div></div></div></td>
                <td><span class="badge ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'}">${online ? o.devices.length + ' perangkat online' : 'Offline'}</span><div class="text-[11px] text-stone-400 mt-0.5">${o.shifts_open ? o.shifts_open + ' shift buka' : 'Shift tutup'}</div></td>
                <td class="text-right font-semibold">${rp(o.total)}</td>
                <td><div class="h-2 bg-stone-100 rounded-full"><div class="h-2 rounded-full" style="width:${pct}%;background:${outletColor(o.id)}"></div></div><div class="text-[11px] text-stone-400">${pct.toFixed(1)}%</div></td>
                <td class="text-right">${o.trx}</td><td class="text-right">${rp(o.trx ? o.total / o.trx : 0)}</td><td class="text-right">${o.guests}</td>
                <td class="text-right">${o.open_orders}</td><td>${esc(o.cashiers || '-')}</td><td class="text-stone-500">${timeAgo(o.last_sale)}</td></tr>`;
        }).join('') || '<tr><td colspan="10" class="text-center text-stone-400 py-6">Belum ada outlet</td></tr>';
        $$('#d-outlets [data-o]').forEach(tr => tr.onclick = () => { BO.outletIds = [Number(tr.dataset.o)]; Store.set('bo_outlets', BO.outletIds); BO.refresh(); });

        // Feed
        $('#d-feed').innerHTML = feed.items.slice(0, 12).map(x => this.feedRow(x)).join('') || '<tr><td colspan="7" class="text-center text-stone-400 py-6">Belum ada transaksi pada periode ini</td></tr>';
        $$('#d-feed [data-id]').forEach(tr => tr.onclick = () => Transactions.openDetail(tr.dataset.id));

        // Top items & pembayaran
        const maxQ = Math.max(1, ...d.top_items.map(i => i.qty));
        $('#d-top').innerHTML = d.top_items.map((i, k) => `<div><div class="flex justify-between"><span>${k + 1}. ${esc(i.name)}</span><b>${i.qty}</b></div><div class="h-1.5 bg-stone-100 rounded-full mt-1"><div class="h-1.5 bg-brand-500 rounded-full" style="width:${i.qty / maxQ * 100}%"></div></div></div>`).join('') || '<p class="text-stone-400">Belum ada data</p>';
        $('#d-pay').innerHTML = d.payments.map(pm => `<div class="flex justify-between"><span>${esc(pm.name)} <span class="text-stone-400">(${pm.count})</span></span><b>${rp(pm.amount)}</b></div>`).join('') || '<p class="text-stone-400">Belum ada data</p>';

        this.drawCharts(d);
    },

    feedRow(x) {
        return `<tr data-id="${x.id}" class="cursor-pointer hover:bg-stone-50 ${x.fresh ? 'bg-emerald-50' : ''}">
            <td class="text-stone-500">${fmtTime(x.closed_at || x.opened_at)}</td><td class="font-mono text-xs">${esc(x.order_no)}${x.offline ? ' <i class="fas fa-wifi text-stone-300" title="offline"></i>' : ''}</td>
            <td><span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${outletColor(x.outlet_id)}"></span>${esc(BO.outletName(x.outlet_id))}</span></td>
            <td>${esc(BO.channelName(x.channel))}</td><td>${esc(x.staff || '-')}</td><td>${esc(x.payments || '-')}</td>
            <td class="text-right font-semibold ${['void', 'refunded'].includes(x.status) ? 'line-through text-stone-400' : ''}">${rp(x.total)}</td></tr>`;
    },

    prependSale(s) {
        if (BO.outletIds.length && !BO.outletIds.includes(s.outlet_id)) return;
        const tb = $('#d-feed');
        if (!tb) return;
        if (tb.querySelector('td[colspan]')) tb.innerHTML = '';
        tb.insertAdjacentHTML('afterbegin', this.feedRow({ id: s.id, order_no: s.order_no, outlet_id: s.outlet_id, channel: s.channel, staff: s.staff, payments: s.methods.join(', '), total: s.total, closed_at: s.closed_at, status: 'paid', fresh: true, offline: s.offline }));
        const tr = tb.firstElementChild;
        tr.onclick = () => Transactions.openDetail(s.id);
        while (tb.children.length > 12) tb.lastElementChild.remove();
    },

    drawCharts(d) {
        this.charts.forEach(c => c.destroy());
        this.charts = [];
        const multiDay = d.from !== d.to;
        $('#d-chart-title').textContent = multiDay ? 'Penjualan per Hari' : 'Penjualan per Jam';
        const outlets = d.outlets;
        let labels, series;
        if (multiDay) {
            labels = [];
            for (let x = d.from; x <= d.to; x = addDays(x, 1)) labels.push(x);
            series = outlets.map(o => labels.map(l => (d.by_date.find(r => r.business_date === l && r.outlet_id === o.id) || {}).total || 0));
        } else {
            const hours = d.hourly.map(h => h.hour);
            const minH = Math.min(8, ...hours), maxH = Math.max(22, ...hours);
            labels = [];
            for (let h = minH; h <= maxH; h++) labels.push(h);
            series = outlets.map(o => labels.map(h => (d.hourly.find(r => r.hour === h && r.outlet_id === o.id) || {}).total || 0));
        }
        this.charts.push(new Chart($('#d-chart-main'), {
            type: 'bar',
            data: { labels: multiDay ? labels.map(fmtDay) : labels.map(h => String(h).padStart(2, '0') + ':00'), datasets: outlets.map((o, i) => ({ label: o.name, data: series[i], backgroundColor: outletColor(o.id), borderRadius: 4 })) },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${rp(c.raw)}` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => v >= 1e6 ? v / 1e6 + ' jt' : v >= 1e3 ? v / 1e3 + ' rb' : v } } } }
        }));
        const chColors = ['#f97316', '#fdba74', '#16a34a', '#22c55e', '#f43f5e', '#0ea5e9', '#a855f7'];
        this.charts.push(new Chart($('#d-chart-channel'), {
            type: 'doughnut',
            data: { labels: d.by_channel.map(c => BO.channelName(c.channel)), datasets: [{ data: d.by_channel.map(c => c.total), backgroundColor: chColors, borderWidth: 0 }] },
            options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => `${c.label}: ${rp(c.raw)}` } } } }
        }));
    }
});
