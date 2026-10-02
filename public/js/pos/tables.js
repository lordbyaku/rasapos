// Denah meja: status realtime, buka meja, pindah, gabung, split bill
const TABLE_STATUS = {
    empty: { label: 'Kosong', card: 'bg-white border-stone-200', dot: 'bg-stone-300', text: 'text-stone-400' },
    seated: { label: 'Terisi, belum pesan', card: 'bg-sky-50 border-sky-300', dot: 'bg-sky-500', text: 'text-sky-700' },
    ordered: { label: 'Sudah pesan', card: 'bg-brand-50 border-brand-500', dot: 'bg-brand-500', text: 'text-brand-700' },
    bill: { label: 'Minta bill', card: 'bg-red-50 border-red-500 pulse-red', dot: 'bg-red-500', text: 'text-red-600' },
    dirty: { label: 'Perlu dibersihkan', card: 'bg-stone-200 border-stone-300', dot: 'bg-stone-500', text: 'text-stone-500' }
};

const TablesView = {
    area: null,
    selected: null,

    orderAt(tableId) { return [...POS.orders.values()].find(o => o.table_id === tableId && o.status === 'open'); },
    statusOf(t) {
        const o = this.orderAt(t.id);
        if (o) return OrderOps.tableStatus(o);
        return t.dirty ? 'dirty' : 'empty';
    },

    render() {
        const el = $('#view-tables');
        const areas = POS.boot.areas;
        if (!this.area || !areas.some(a => a.id === this.area)) this.area = areas[0] ? areas[0].id : null;
        const tables = POS.boot.tables.filter(t => !areas.length || t.area_id === this.area || (!t.area_id && this.area === (areas[0] || {}).id));
        const occupied = POS.boot.tables.filter(t => this.orderAt(t.id)).length;
        el.innerHTML = `<div class="h-full flex">
            <main class="flex-1 flex flex-col min-w-0 p-4">
                <div class="flex items-center gap-3 flex-wrap">
                    <div class="flex bg-white rounded-xl p-1 border border-stone-200 text-sm font-semibold">${areas.map(a => `<button data-a="${a.id}" class="px-4 py-1.5 rounded-lg ${a.id === this.area ? 'bg-brand-500 text-white' : 'text-stone-600'}">${esc(a.name)}</button>`).join('')}</div>
                    <div class="hidden xl:flex gap-3 text-xs text-stone-600">${Object.values(TABLE_STATUS).map(s => `<span><i class="inline-block w-2.5 h-2.5 rounded-full ${s.dot} mr-1"></i>${s.label}</span>`).join('')}</div>
                    <div class="ml-auto text-sm bg-white border border-stone-200 rounded-xl px-3 py-2"><b>${occupied}/${POS.boot.tables.length}</b> terisi</div>
                </div>
                <div class="flex-1 mt-4 overflow-y-auto thin-scroll grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4 content-start">
                    ${tables.map(t => {
                        const st = this.statusOf(t), s = TABLE_STATUS[st], o = this.orderAt(t.id);
                        const mins = o ? minutesSince(o.opened_at) : 0;
                        return `<button data-t="${t.id}" class="relative rounded-2xl border-2 ${s.card} ${t.capacity >= 6 ? 'col-span-2' : ''} p-3 h-36 text-left flex flex-col ${this.selected === t.id ? 'ring-4 ring-stone-800/20' : ''}">
                            <div class="flex items-start justify-between"><span class="text-2xl font-extrabold">${esc(t.name)}</span><span class="text-xs text-stone-500"><i class="fas fa-user"></i> ${o ? o.guests + '/' : ''}${t.capacity}</span></div>
                            <div class="text-xs font-semibold ${s.text}">${s.label}</div>
                            ${o ? `<div class="mt-auto flex items-end justify-between gap-1"><div class="text-xs ${mins > 60 ? 'text-red-600 font-bold' : 'text-stone-500'}"><i class="fas fa-clock mr-1"></i>${mins} mnt<div class="text-stone-400 font-normal">${esc((POS.idx.staff[o.staff_id] || {}).name || '')}</div></div><div class="font-bold whitespace-nowrap">${rp(o.totals ? o.totals.total : 0)}</div></div>`
                                : `<div class="mt-auto text-stone-300 text-3xl text-center"><i class="fas ${st === 'dirty' ? 'fa-broom' : 'fa-plus'}"></i></div>`}
                        </button>`;
                    }).join('') || '<p class="col-span-full text-center text-stone-400 py-16">Belum ada meja. Atur di Back Office → Outlet & Meja.</p>'}
                </div>
            </main>
            <aside id="tb-detail" class="w-[340px] bg-white border-l border-stone-200 flex flex-col shrink-0"></aside></div>`;
        $$('[data-a]', el).forEach(b => b.onclick = () => { this.area = Number(b.dataset.a); this.render(); });
        $$('[data-t]', el).forEach(b => b.onclick = () => { this.selected = Number(b.dataset.t); this.render(); });
        this.renderDetail();
    },

    renderDetail() {
        const box = $('#tb-detail');
        const t = POS.idx.table[this.selected];
        if (!t) { box.innerHTML = '<div class="m-auto text-stone-400 text-center p-6"><i class="fas fa-chair text-4xl"></i><p class="mt-2">Pilih meja</p></div>'; return; }
        const o = this.orderAt(t.id), st = this.statusOf(t);
        if (!o) {
            box.innerHTML = `<div class="p-5 border-b border-stone-200"><div class="text-3xl font-extrabold">Meja ${esc(t.name)}</div><div class="text-sm text-stone-500">Kapasitas ${t.capacity}</div></div>
                <div class="p-5 space-y-3">
                    ${st === 'dirty' ? '<button id="tb-clean" class="btn w-full bg-stone-800 text-white py-3"><i class="fas fa-broom"></i>Tandai sudah bersih</button>' : ''}
                    ${POS.can('order') ? `<div class="text-sm font-semibold">Jumlah tamu</div><div class="grid grid-cols-4 gap-2">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<button data-g="${n}" class="py-3 rounded-xl border border-stone-200 font-semibold hover:border-brand-500">${n}</button>`).join('')}</div>` : ''}
                </div>`;
            const cl = $('#tb-clean'); if (cl) cl.onclick = async () => { t.dirty = 0; await POS.exec('table.clean', null, { table_id: t.id }); this.render(); };
            $$('[data-g]', box).forEach(b => b.onclick = () => { if (OrderView.canEdit()) OrderView.newOrder({ channel: (POS.boot.channels.find(c => c.type === 'dine_in') || {}).code, table_id: t.id, guests: Number(b.dataset.g) }); });
            return;
        }
        const s = TABLE_STATUS[st];
        const items = o.items.filter(i => i.status !== 'void');
        box.innerHTML = `<div class="p-5 border-b border-stone-200">
                <div class="flex items-start justify-between"><div class="text-3xl font-extrabold">Meja ${esc(t.name)}</div><span class="badge border ${s.card.replace('pulse-red', '')} ${s.text}">${s.label}</span></div>
                <div class="text-sm text-stone-500 mt-1">${o.guests} tamu · ${minutesSince(o.opened_at)} mnt · ${esc(o.order_no)}</div></div>
            <div class="flex-1 overflow-y-auto thin-scroll p-4 space-y-2 text-sm">${items.map(i => `<div class="flex justify-between gap-2"><div><b>${i.qty}×</b> ${esc(i.name)}${i.mods.length ? `<div class="text-xs text-stone-500 pl-5">${esc(i.mods.map(m => m.name).join(', '))}</div>` : ''}</div><span class="whitespace-nowrap">${rp(i.price * i.qty)}</span></div>`).join('') || '<div class="text-center text-stone-400 py-10">Belum ada pesanan</div>'}</div>
            <div class="p-4 border-t border-stone-200">
                <div class="flex justify-between text-lg font-extrabold mb-3"><span>Total</span><span>${rp(o.totals ? o.totals.total : 0)}</span></div>
                <div class="grid grid-cols-3 gap-2 text-xs font-semibold">
                    <button data-act="add" class="btn-light flex-col !gap-1 py-3"><i class="fas fa-plus text-base"></i>Tambah</button>
                    <button data-act="bill" class="btn-light flex-col !gap-1 py-3"><i class="fas fa-print text-base"></i>Pre-bill</button>
                    <button data-act="move" class="btn-light flex-col !gap-1 py-3" ${POS.can('table') ? '' : 'disabled'}><i class="fas fa-right-left text-base"></i>Pindah</button>
                    <button data-act="merge" class="btn-light flex-col !gap-1 py-3" ${POS.can('table') ? '' : 'disabled'}><i class="fas fa-object-group text-base"></i>Gabung</button>
                    <button data-act="split" class="btn-light flex-col !gap-1 py-3" ${POS.can('table') ? '' : 'disabled'}><i class="fas fa-scissors text-base"></i>Split</button>
                    <button data-act="open" class="btn-light flex-col !gap-1 py-3"><i class="fas fa-pen text-base"></i>Detail</button>
                </div>
                ${POS.can('pay') ? `<button data-act="pay" class="btn-primary w-full mt-2 py-3"><i class="fas fa-wallet"></i>Bayar ${rp(o.totals ? o.totals.total : 0)}</button>` : ''}
            </div>`;
        $$('[data-act]', box).forEach(b => b.onclick = () => {
            const a = b.dataset.act;
            if (a === 'add' || a === 'open') OrderView.open(o.id);
            if (a === 'bill') Payment.printBill(o);
            if (a === 'move') this.pickTable(nt => this.move(o, nt));
            if (a === 'merge') this.merge(o);
            if (a === 'split') this.split(o);
            if (a === 'pay') Payment.open(o);
        });
    },

    /** Modal pilih meja (kosong) */
    pickTable(cb, opts = {}) {
        const busy = id => !!this.orderAt(id);
        POS.modal({
            title: opts.title || 'Pilih meja', size: 'max-w-2xl',
            body: POS.boot.areas.map(a => {
                const list = POS.boot.tables.filter(t => t.area_id === a.id);
                return list.length ? `<div class="mb-4"><b class="text-sm">${esc(a.name)}</b><div class="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">${list.map(t => `<button data-t="${t.id}" ${busy(t.id) && !opts.allowBusy ? 'disabled' : ''} class="py-3 rounded-xl border-2 font-bold ${busy(t.id) ? 'border-brand-500 bg-brand-50 disabled:opacity-40' : 'border-stone-200 hover:border-brand-500'}">${esc(t.name)}<div class="text-[10px] font-normal text-stone-400">${busy(t.id) ? 'terisi' : t.capacity + ' kursi'}</div></button>`).join('')}</div></div>` : '';
            }).join('') || '<p class="text-stone-400">Belum ada meja</p>'
        });
        $$('#pos-modal-body [data-t]').forEach(b => b.onclick = () => { POS.closeModal(); cb(POS.idx.table[b.dataset.t]); });
    },

    async move(o, t) {
        if (!POS.can('table')) return toast('Tidak punya izin pindah meja', 'error');
        try { await POS.execOnline('order.move', o.id, { table_id: t.id }); toast(`Pindah ke meja ${t.name}`, 'success'); this.selected = t.id; }
        catch (e) { errorDialog(e); }
    },

    merge(o) {
        if (!POS.can('table')) return;
        const others = [...POS.orders.values()].filter(x => x.id !== o.id && x.channel === o.channel);
        if (!others.length) return toast('Tidak ada order lain dengan channel yang sama');
        POS.modal({
            title: `Gabungkan ke ${esc(o.table_name ? 'Meja ' + o.table_name : o.order_no)}`,
            body: `<p class="text-sm text-stone-500 mb-3">Pilih bill yang akan digabung. Item-nya dipindah ke bill ini.</p><div class="grid grid-cols-2 gap-2">${others.map(x => `<button data-o="${x.id}" class="p-3 rounded-xl border border-stone-200 hover:border-brand-500 text-left"><b>${esc(x.table_name ? 'Meja ' + x.table_name : x.order_no)}</b><div class="text-xs text-stone-500">${esc(x.order_no)} · ${x.items.filter(i => i.status !== 'void').length} item</div><div class="font-bold text-brand-600">${rp(x.totals ? x.totals.total : 0)}</div></button>`).join('')}</div>`
        });
        $$('#pos-modal-body [data-o]').forEach(b => b.onclick = async () => {
            try { await POS.execOnline('order.merge', o.id, { from_order_id: b.dataset.o }); POS.closeModal(); toast('Bill digabung', 'success'); }
            catch (e) { errorDialog(e); }
        });
    },

    split(o) {
        if (!POS.can('table')) return;
        const items = o.items.filter(i => i.status !== 'void');
        const sel = {};
        POS.modal({
            title: 'Split bill ' + esc(o.order_no), size: 'max-w-xl',
            body: `<p class="text-sm text-stone-500 mb-3">Pilih item & jumlah yang dipindah ke bill baru (bisa dibayar terpisah).</p>
                <div class="space-y-2">${items.map(i => `<div class="flex items-center gap-3 p-2.5 rounded-xl border border-stone-200"><div class="flex-1"><b>${esc(i.name)}</b><div class="text-xs text-stone-500">${i.qty} × ${rp(i.price)}</div></div>
                <div class="flex items-center border border-stone-200 rounded-xl"><button data-m="${esc(i.id)}" class="w-9 h-9">−</button><b data-q="${esc(i.id)}" class="w-8 text-center">0</b><button data-p="${esc(i.id)}" class="w-9 h-9">+</button></div></div>`).join('')}</div>
                <div class="flex justify-between mt-4 font-bold"><span>Bill baru</span><span id="sp-total">${rp(0)}</span></div>`,
            foot: '<button id="sp-go" class="btn-primary flex-1">Pisahkan bill</button>'
        });
        const upd = () => {
            for (const i of items) $(`[data-q="${CSS.escape(i.id)}"]`).textContent = sel[i.id] || 0;
            $('#sp-total').textContent = rp(items.reduce((s, i) => s + (sel[i.id] || 0) * i.price, 0));
        };
        $$('#pos-modal-body [data-m]').forEach(b => b.onclick = () => { sel[b.dataset.m] = Math.max(0, (sel[b.dataset.m] || 0) - 1); upd(); });
        $$('#pos-modal-body [data-p]').forEach(b => b.onclick = () => { const it = items.find(i => i.id === b.dataset.p); sel[it.id] = Math.min(it.qty, (sel[it.id] || 0) + 1); upd(); });
        $('#sp-go').onclick = async () => {
            const chosen = Object.entries(sel).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty }));
            if (!chosen.length) return toast('Pilih item');
            try {
                const bd = businessDate(Date.now(), POS.outlet.tz_offset_min, POS.outlet.day_cutoff_hour);
                const r = await POS.execOnline('order.split', o.id, { new_order_id: uuid(), new_order_no: await Sync.nextOrderNo(POS.device.code, bd), items: chosen });
                POS.closeModal();
                toast('Bill dipisah: ' + r.created.order_no, 'success');
                if (POS.can('pay')) Payment.open(r.created);
            } catch (e) { errorDialog(e); }
        };
    }
};

// Daftar order terbuka & riwayat transaksi perangkat
const OrdersView = {
    tab: 'open',
    async render() {
        const el = $('#view-orders');
        const open = [...POS.orders.values()].sort((a, b) => a.opened_at - b.opened_at);
        el.innerHTML = `<div class="h-full flex flex-col p-4"><div class="flex items-center gap-2 mb-4"><div class="inline-flex bg-stone-200/70 rounded-xl p-1"><button data-tab="open" class="tab ${this.tab === 'open' ? 'active' : ''}">Order terbuka (${open.length})</button><button data-tab="history" class="tab ${this.tab === 'history' ? 'active' : ''}">Riwayat hari ini</button></div>
            <button id="ov-new" class="btn-primary ml-auto"><i class="fas fa-plus"></i>Order baru</button></div><div id="ov-body" class="flex-1 overflow-y-auto thin-scroll"></div></div>`;
        $$('[data-tab]', el).forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.render(); });
        $('#ov-new').onclick = () => OrderView.newOrder();
        const body = $('#ov-body');
        if (this.tab === 'open') {
            body.innerHTML = open.length ? `<div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">${open.map(o => {
                const st = OrderOps.tableStatus(o);
                return `<button data-o="${o.id}" class="card p-4 text-left hover:border-brand-500">
                    <div class="flex justify-between gap-2"><b>${esc(o.table_name ? 'Meja ' + o.table_name : o.customer_name || o.order_no)}</b>${st === 'bill' ? '<span class="badge bg-red-100 text-red-600">MINTA BILL</span>' : o.items.some(i => i.status === 'new') ? '<span class="badge bg-brand-100 text-brand-700">Belum dikirim</span>' : ''}</div>
                    <div class="text-xs text-stone-500 mt-0.5">${esc((POS.idx.channel[o.channel] || {}).name || o.channel)} · ${esc(o.order_no)} · ${minutesSince(o.opened_at)} mnt</div>
                    <div class="text-xs text-stone-400 mt-1 truncate">${esc(o.items.filter(i => i.status !== 'void').map(i => i.qty + '× ' + i.name).join(', ') || 'Kosong')}</div>
                    <div class="font-bold text-brand-600 mt-2">${rp(o.totals ? o.totals.total : 0)}</div></button>`;
            }).join('')}</div>` : '<div class="text-center text-stone-400 py-20"><i class="fas fa-receipt text-4xl"></i><p class="mt-2">Tidak ada order terbuka</p></div>';
            $$('[data-o]', body).forEach(b => b.onclick = () => OrderView.open(b.dataset.o));
            return;
        }
        // Riwayat: gabungan data server (jika online) & lokal
        const bd = businessDate(Date.now(), POS.outlet.tz_offset_min, POS.outlet.day_cutoff_hour);
        let list = (await IDB.all('orders')).filter(o => o.status !== 'open' && o.business_date === bd && o.outlet_id === POS.outlet.id);
        if (POS.online) {
            try {
                const r = await API.get(`/t/orders?status=history&date=${bd}`);
                const ids = new Set(r.items.map(o => o.id));
                list = [...r.items.filter(o => o.status !== 'open' && o.status !== 'merged'), ...list.filter(o => !ids.has(o.id))];
            } catch { }
        }
        list.sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0));
        const tone = { paid: 'bg-emerald-50 text-emerald-700', void: 'bg-red-50 text-red-600', refunded: 'bg-amber-50 text-amber-700' };
        body.innerHTML = list.length ? `<div class="card overflow-hidden"><table class="tbl whitespace-nowrap"><thead><tr><th>Waktu</th><th>No.</th><th>Channel</th><th>Meja/Pelanggan</th><th>Bayar</th><th>Status</th><th class="text-right">Total</th><th></th></tr></thead><tbody>
            ${list.map(o => `<tr><td>${fmtTime(o.closed_at)}</td><td class="font-mono text-xs">${esc(o.order_no)}</td><td>${esc((POS.idx.channel[o.channel] || {}).name || o.channel)}</td><td>${esc(o.table_name ? 'Meja ' + o.table_name : o.customer_name || '-')}</td>
                <td>${esc((o.payments || []).map(p => p.name).join(', '))}</td><td><span class="badge ${tone[o.status] || 'bg-stone-100'}">${ORDER_STATUS[o.status] || o.status}</span></td><td class="text-right font-semibold">${rp((o.totals ? o.totals.total : 0) + (o.rounding || 0))}</td>
                <td class="text-right">${o.status === 'paid' ? `<button class="btn-light !py-1.5" data-rp="${o.id}"><i class="fas fa-print"></i></button> ${POS.can('refund') || POS.can('pay') ? `<button class="btn-danger !py-1.5" data-rf="${o.id}">Refund</button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="text-center text-stone-400 py-20">Belum ada transaksi hari ini</div>';
        $$('[data-rp]', body).forEach(b => b.onclick = () => Payment.reprint(list.find(o => o.id === b.dataset.rp)));
        $$('[data-rf]', body).forEach(b => b.onclick = () => Payment.refund(list.find(o => o.id === b.dataset.rf)));
    }
};
