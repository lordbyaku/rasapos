// Layar kasir: kategori, grid menu, modifier, keranjang, kirim dapur, diskon, pelanggan
const OrderView = {
    cat: 'all',
    q: '',
    draft: { channel: 'dine_in', table_id: null, guests: 2, customer_name: '', customer_id: null },

    get order() { return POS.currentId ? POS.orders.get(POS.currentId) : null; },
    channelCode() { return this.order ? this.order.channel : this.draft.channel; },
    channel() { return POS.idx.channel[this.channelCode()] || POS.boot.channels[0]; },

    priceOf(menu) {
        const ch = this.channel();
        return Pricing.basePrice(menu, menu.outlet_price, ch, menu.channel_prices ? menu.channel_prices[ch.code] : null);
    },

    /** Mulai order baru (dari kasir atau dari meja) */
    newOrder(opts = {}) {
        POS.currentId = null;
        const def = POS.boot.channels.find(c => c.code === 'dine_in') ? 'dine_in' : POS.boot.channels[0].code;
        this.draft = { channel: opts.channel || def, table_id: opts.table_id || null, guests: opts.guests || (opts.table_id ? 2 : 1), customer_name: '', customer_id: null };
        POS.setView('order');
    },
    open(id) { POS.currentId = id; POS.setView('order'); },

    async ensureOrder() {
        if (this.order) return this.order;
        const id = uuid();
        const bd = businessDate(Date.now(), POS.outlet.tz_offset_min, POS.outlet.day_cutoff_hour);
        const order_no = await Sync.nextOrderNo(POS.device.code, bd);
        const ch = POS.idx.channel[this.draft.channel];
        const table = this.draft.table_id ? POS.idx.table[this.draft.table_id] : null;
        if (table && [...POS.orders.values()].some(o => o.table_id === table.id)) throw new Error(`Meja ${table.name} sudah dipakai order lain`);
        await POS.exec('order.open', id, {
            id, order_no, channel: ch.code, type: ch.type, outlet_id: POS.outlet.id, business_date: bd,
            table_id: table ? table.id : null, table_name: table ? table.name : null,
            guests: ch.type === 'dine_in' ? this.draft.guests : 0, customer_name: this.draft.customer_name, customer_id: this.draft.customer_id,
            shift_id: POS.shift ? POS.shift.id : null
        }, { render: false });
        POS.currentId = id;
        return this.order;
    },

    // ---------------------------------------------------------------- render
    render() {
        const el = $('#view-order');
        if (!el.dataset.ready) {
            el.dataset.ready = '1';
            el.innerHTML = `
                <aside id="ov-cats" class="w-24 bg-white border-r border-stone-200 overflow-y-auto no-scrollbar py-2 flex flex-col gap-1 shrink-0"></aside>
                <main class="flex-1 flex flex-col min-w-0">
                    <div class="p-3 flex gap-2">
                        <div class="relative flex-1"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i><input id="ov-q" placeholder="Cari menu / SKU…" class="input pl-9"></div>
                        <button id="ov-custom" class="btn-outline"><i class="fas fa-pen"></i><span class="hidden lg:inline">Custom</span></button>
                    </div>
                    <div id="ov-grid" class="flex-1 overflow-y-auto thin-scroll px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 content-start"></div>
                </main>
                <section id="ov-cart" class="w-[360px] xl:w-[400px] bg-white border-l border-stone-200 flex flex-col shrink-0"></section>`;
            $('#ov-q').oninput = e => { this.q = e.target.value.toLowerCase(); this.renderGrid(); };
            $('#ov-custom').onclick = () => this.customItem();
        }
        this.renderCats();
        this.renderGrid();
        this.renderCart();
    },

    renderCats() {
        const cats = [{ id: 'all', name: 'Semua', color: '#78716c' }, ...POS.boot.categories];
        $('#ov-cats').innerHTML = cats.map(c => `<button data-c="${c.id}" class="mx-2 py-3 px-1 rounded-xl text-[11px] font-semibold leading-tight ${String(this.cat) === String(c.id) ? 'text-white' : 'text-stone-600 hover:bg-stone-100'}" style="${String(this.cat) === String(c.id) ? `background:${esc(c.color || '#f97316')}` : ''}">
            <span class="block w-3 h-3 rounded-full mx-auto mb-1" style="background:${esc(c.color || '#a8a29e')}"></span>${esc(c.name)}</button>`).join('');
        $$('#ov-cats [data-c]').forEach(b => b.onclick = () => { this.cat = b.dataset.c; this.renderCats(); this.renderGrid(); });
    },

    renderGrid() {
        const tid = POS.boot.tenant.id;
        const list = POS.boot.menus.filter(m => (this.cat === 'all' || String(m.category_id) === String(this.cat)) && (!this.q || m.name.toLowerCase().includes(this.q) || String(m.sku || '').toLowerCase().includes(this.q)));
        $('#ov-grid').innerHTML = list.map(m => {
            const cat = POS.idx.cat[m.category_id] || {};
            const img = m.image_id ? `<img src="/api/f/${tid}/${m.image_id}" class="w-full h-full object-cover" loading="lazy" onerror="this.remove()">` : `<span class="text-3xl font-extrabold text-white/90">${esc(m.name[0])}</span>`;
            return `<button data-m="${m.id}" class="menu-tile relative bg-white rounded-2xl p-2 text-left border border-stone-200 hover:border-brand-500 transition ${m.sold_out ? 'opacity-50' : ''}">
                <div class="rounded-xl h-20 grid place-items-center overflow-hidden" style="background:${esc(m.color || cat.color || '#d6d3d1')}">${img}</div>
                <div class="mt-2 text-sm font-semibold leading-tight line-clamp-2 h-9">${esc(m.name)}</div>
                <div class="flex items-center justify-between mt-1"><span class="text-brand-600 font-bold text-sm">${rp(this.priceOf(m))}</span>${m.modifier_group_ids.length ? '<i class="fas fa-sliders text-stone-300 text-xs"></i>' : ''}</div>
                ${m.sold_out ? '<span class="absolute top-3 left-3 badge bg-red-500 text-white">HABIS</span>' : ''}</button>`;
        }).join('') || '<div class="col-span-full text-center text-stone-400 py-16">Menu tidak ditemukan</div>';
        $$('#ov-grid [data-m]').forEach(b => b.onclick = () => this.pick(POS.idx.menu[b.dataset.m]));
    },

    canEdit() {
        if (!POS.can('order')) { toast('Anda tidak punya izin input pesanan', 'error'); return false; }
        if (POS.can('pay') && !POS.shift) { Shift.openDialog(); return false; }
        return true;
    },

    pick(m) {
        if (!this.canEdit()) return;
        if (m.sold_out) return toast(`${m.name} sedang habis`, 'error');
        const groups = m.modifier_group_ids.map(id => POS.idx.group[id]).filter(Boolean);
        if (!groups.length) return this.addItem(m, [], 1, '');
        this.modifierDialog(m, groups);
    },

    modifierDialog(m, groups, opts = {}) {
        const sel = {};
        groups.forEach(g => { sel[g.id] = g.min_select > 0 && g.max_select === 1 ? [g.options[0].id] : []; });
        let qty = 1;
        const base = this.priceOf(m);
        const unit = () => base + groups.reduce((s, g) => s + sel[g.id].reduce((x, id) => x + (g.options.find(o => o.id === id) || {}).price || 0, 0), 0);
        const draw = () => {
            $('#pos-modal-body').innerHTML = groups.map(g => `<div class="mb-4"><div class="flex justify-between items-center mb-2"><b class="text-sm">${esc(g.name)}</b><span class="badge ${g.min_select ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500'}">${g.min_select ? 'Wajib' : 'Opsional'} · maks ${g.max_select}</span></div>
                <div class="grid grid-cols-2 gap-2">${g.options.map(o => { const on = sel[g.id].includes(o.id); return `<button data-g="${g.id}" data-o="${esc(o.id)}" class="px-3 py-3 rounded-xl border-2 text-sm text-left flex justify-between gap-2 ${on ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-stone-200'}"><span>${esc(o.name)}</span><span class="text-stone-500">${o.price ? '+' + rp(o.price).replace('Rp ', '') : ''}</span></button>`; }).join('')}</div></div>`).join('') +
                `<label class="label">Catatan item</label><input id="md-note" class="input" placeholder="mis. tanpa bawang" value="${esc(this._note || '')}">`;
            $('#md-total').textContent = rp(unit() * qty);
            $('#md-qty').textContent = qty;
            $$('#pos-modal-body [data-g]').forEach(b => b.onclick = () => {
                const g = groups.find(x => x.id === Number(b.dataset.g)), id = b.dataset.o, s = sel[g.id];
                this._note = $('#md-note').value;
                if (g.max_select === 1) sel[g.id] = s.includes(id) && g.min_select === 0 ? [] : [id];
                else if (s.includes(id)) s.splice(s.indexOf(id), 1);
                else if (s.length < g.max_select) s.push(id);
                else toast(`${g.name} maksimal ${g.max_select}`);
                draw();
            });
        };
        this._note = '';
        POS.modal({
            title: `${esc(m.name)} <span class="text-sm font-normal text-stone-500">${rp(base)}</span>`, size: 'max-w-xl',
            body: '',
            foot: `<div class="flex items-center border border-stone-200 rounded-xl"><button id="md-minus" class="w-11 h-11 text-lg">−</button><b id="md-qty" class="w-8 text-center">1</b><button id="md-plus" class="w-11 h-11 text-lg">+</button></div>
                <button id="md-add" class="btn-primary flex-1 py-3">Tambah · <span id="md-total"></span></button>`
        });
        draw();
        $('#md-minus').onclick = () => { qty = Math.max(1, qty - 1); this._note = $('#md-note').value; draw(); };
        $('#md-plus').onclick = () => { qty++; this._note = $('#md-note').value; draw(); };
        $('#md-add').onclick = () => {
            for (const g of groups) if (sel[g.id].length < g.min_select) return toast(`Pilih ${g.name}`, 'error');
            const mods = groups.flatMap(g => sel[g.id].map(id => { const o = g.options.find(x => x.id === id); return { group: g.name, group_id: g.id, option_id: o.id, name: o.name, price: o.price }; }));
            const note = $('#md-note').value.trim();
            POS.closeModal();
            this.addItem(m, mods, qty, note);
        };
    },

    async addItem(m, mods, qty, note) {
        try {
            const o = await this.ensureOrder();
            const base = this.priceOf(m);
            const price = Pricing.unitPrice(base, mods);
            // Gabungkan dengan item baru yang identik
            const same = o.items.find(i => i.status === 'new' && i.menu_id === m.id && JSON.stringify(i.mods.map(x => x.option_id)) === JSON.stringify(mods.map(x => x.option_id)) && i.note === note && !i.discount);
            if (same) await POS.exec('order.update_item', o.id, { item_id: same.id, qty: same.qty + qty });
            else await POS.exec('order.add_items', o.id, { items: [{ id: uuid(), menu_id: m.id, name: m.name, category_id: m.category_id, station: m.station || (POS.idx.cat[m.category_id] || {}).station || 'Dapur', base_price: base, price, mods, qty, note, taxable: !!m.taxable }] });
        } catch (e) { errorDialog(e); }
    },

    async customItem() {
        if (!this.canEdit()) return;
        const r = await SwalBase.fire({
            title: 'Item custom', html: '<input id="ci-name" class="input mb-2" placeholder="Nama item" maxlength="60"><input id="ci-price" type="number" min="0" class="input" placeholder="Harga">',
            showCancelButton: true, confirmButtonText: 'Tambah', focusConfirm: false,
            preConfirm: () => { const name = $('#ci-name').value.trim(), price = Number($('#ci-price').value); if (!name || !(price >= 0)) { Swal.showValidationMessage('Isi nama & harga'); return false; } return { name, price }; }
        });
        if (!r.isConfirmed) return;
        try {
            const o = await this.ensureOrder();
            await POS.exec('order.add_items', o.id, { items: [{ id: uuid(), menu_id: null, name: r.value.name, price: r.value.price, base_price: r.value.price, mods: [], qty: 1, station: 'Dapur' }] });
        } catch (e) { errorDialog(e); }
    },

    // ---------------------------------------------------------------- keranjang
    renderCart() {
        const o = this.order;
        const d = this.draft;
        const ch = this.channel();
        const isDine = ch.type === 'dine_in';
        const tableName = o ? o.table_name : d.table_id ? (POS.idx.table[d.table_id] || {}).name : null;
        const guests = o ? o.guests : d.guests;
        const custName = o ? o.customer_name : d.customer_name;
        const items = o ? o.items : [];
        const t = o ? o.totals || Money.calc(o, POS.outlet) : Money.calc({ type: ch.type, items: [] }, POS.outlet);
        const locked = o && o.items.some(i => i.status !== 'void');
        const statusTag = i => i.status === 'sent' ? `<span class="text-emerald-600"><i class="fas fa-check-double mr-1"></i>Terkirim ${esc(i.station || '')}</span>` : i.status === 'held' ? '<span class="text-sky-600"><i class="fas fa-pause mr-1"></i>Ditahan</span>' : i.status === 'void' ? `<span class="text-red-500">Void: ${esc(i.void_reason || '')}</span>` : '<span class="text-brand-600"><i class="fas fa-circle text-[6px] mr-1 align-middle"></i>Baru</span>';
        $('#ov-cart').innerHTML = `
            <div class="p-3 border-b border-stone-200 space-y-2">
                <div class="flex gap-1 overflow-x-auto no-scrollbar bg-stone-100 p-1 rounded-xl text-xs font-semibold">${POS.boot.channels.map(c => `<button data-ch="${c.code}" ${locked && c.code !== ch.code ? 'disabled' : ''} class="flex-1 whitespace-nowrap px-2 py-1.5 rounded-lg ${c.code === ch.code ? 'bg-white shadow-sm text-brand-600' : 'text-stone-500 disabled:opacity-40'}">${esc(c.name)}</button>`).join('')}</div>
                <div class="flex gap-2 text-sm">
                    ${isDine ? `<button id="ct-table" class="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-left"><i class="fas fa-chair text-stone-400 mr-2"></i>${tableName ? 'Meja <b>' + esc(tableName) + '</b>' : '<span class="text-stone-400">Pilih meja</span>'}</button>
                    <div class="flex items-center border border-stone-200 rounded-xl"><button id="ct-gm" class="w-9 h-10 text-stone-500">−</button><span class="text-sm w-10 text-center"><i class="fas fa-user text-stone-400 text-xs"></i> <b>${guests}</b></span><button id="ct-gp" class="w-9 h-10 text-stone-500">+</button></div>`
                    : `<button id="ct-cust" class="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-left truncate"><i class="fas fa-user text-stone-400 mr-2"></i>${custName ? esc(custName) : '<span class="text-stone-400">Nama pemesan / no. antrean</span>'}</button>`}
                </div>
                ${isDine ? `<button id="ct-cust" class="w-full px-3 py-2 rounded-xl border border-stone-200 text-left text-sm truncate"><i class="fas fa-user text-stone-400 mr-2"></i>${custName ? esc(custName) : '<span class="text-stone-400">Pelanggan (opsional)</span>'}</button>` : ''}
            </div>
            <div class="flex items-center justify-between px-3 pt-2 text-xs text-stone-500">
                <span>${o ? `Order <b class="text-stone-700">${esc(o.order_no)}</b>${o.offline ? ' <i class="fas fa-wifi text-stone-300" title="dibuat offline"></i>' : ''}` : 'Order baru'}</span>
                <span class="flex gap-3">${o ? '<button id="ct-more" class="text-stone-600"><i class="fas fa-ellipsis"></i> Lainnya</button>' : ''}<button id="ct-new" class="text-brand-600"><i class="fas fa-plus mr-1"></i>Baru</button></span>
            </div>
            <div id="ct-items" class="flex-1 overflow-y-auto thin-scroll px-3 py-2 space-y-2">
                ${items.length ? items.map(i => `<div data-i="${esc(i.id)}" class="rounded-xl border p-2.5 cursor-pointer ${i.status === 'void' ? 'border-stone-100 bg-stone-50 opacity-60' : i.status === 'sent' ? 'border-stone-200 bg-stone-50' : 'border-brand-100 bg-brand-50/40'}">
                    <div class="flex gap-2"><div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm ${i.status === 'void' ? 'line-through' : ''}">${i.qty}× ${esc(i.name)}</div>
                        ${i.mods.length ? `<div class="text-xs text-stone-500">${esc(i.mods.map(x => x.name).join(', '))}</div>` : ''}
                        ${i.note ? `<div class="text-xs text-amber-700"><i class="fas fa-note-sticky mr-1"></i>${esc(i.note)}</div>` : ''}
                        <div class="text-[10px] mt-1 font-semibold">${statusTag(i)}</div></div>
                        <div class="text-right"><div class="font-bold text-sm ${i.status === 'void' ? 'line-through' : ''}">${rp(i.price * i.qty)}</div>${i.discount ? `<div class="text-xs text-red-500">-${rp(i.discount)}</div>` : ''}
                        ${i.status === 'new' ? `<div class="flex items-center gap-1 mt-1 justify-end"><button data-minus="${esc(i.id)}" class="w-7 h-7 rounded-lg bg-white border border-stone-200 text-xs">${i.qty === 1 ? '<i class="fas fa-trash text-red-500"></i>' : '−'}</button><button data-plus="${esc(i.id)}" class="w-7 h-7 rounded-lg bg-white border border-stone-200 text-xs">+</button></div>` : ''}</div></div></div>`).join('')
                : `<div class="h-full grid place-items-center text-stone-400 text-sm text-center"><div><i class="fas fa-basket-shopping text-4xl mb-2"></i><div>Pilih menu untuk mulai</div>${tableName ? `<div class="mt-1">Meja ${esc(tableName)}</div>` : ''}</div></div>`}
            </div>
            <div class="border-t border-stone-200 p-3 space-y-1 text-sm">
                <div class="flex justify-between"><span class="text-stone-500">Subtotal</span><span>${rp(t.subtotal)}</span></div>
                <div class="flex justify-between"><button id="ct-disc" class="text-brand-600 font-medium" ${o ? '' : 'disabled'}><i class="fas fa-tag mr-1"></i>${o && o.discount ? esc(o.discount.name) : 'Diskon'}</button><span class="text-red-500">${t.order_discount ? '-' + rp(t.order_discount) : rp(0)}</span></div>
                ${t.service ? `<div class="flex justify-between"><span class="text-stone-500">Service ${POS.outlet.service_rate}%</span><span>${rp(t.service)}</span></div>` : ''}
                ${t.tax ? `<div class="flex justify-between"><span class="text-stone-500">${esc(POS.outlet.tax_label)} ${POS.outlet.tax_rate}%${POS.outlet.tax_inclusive ? ' (termasuk)' : ''}</span><span>${rp(t.tax)}</span></div>` : ''}
                <div class="flex justify-between text-lg font-extrabold pt-1"><span>Total</span><span>${rp(t.total)}</span></div>
                <div class="grid grid-cols-5 gap-2 pt-2">
                    <button id="ct-send" class="col-span-2 btn border-2 border-brand-500 text-brand-600 py-3" ${o && o.items.some(i => i.status === 'new') ? '' : 'disabled'}><i class="fas fa-paper-plane"></i>Kirim</button>
                    ${POS.can('pay') ? `<button id="ct-pay" class="col-span-3 btn-primary py-3" ${o && o.items.some(i => i.status !== 'void') ? '' : 'disabled'}><i class="fas fa-wallet"></i>Bayar ${rp(t.total)}</button>`
                : `<button id="ct-save" class="col-span-3 btn-light py-3" ${o ? '' : 'disabled'}><i class="fas fa-check"></i>Selesai</button>`}
                </div>
            </div>`;
        this.bindCart();
    },

    bindCart() {
        const o = this.order;
        $$('#ov-cart [data-ch]').forEach(b => b.onclick = async () => {
            if (!o) { this.draft.channel = b.dataset.ch; if (POS.idx.channel[b.dataset.ch].type !== 'dine_in') this.draft.table_id = null; this.render(); return; }
            try { await POS.exec('order.set', o.id, { channel: b.dataset.ch, type: POS.idx.channel[b.dataset.ch].type }); this.renderGrid(); } catch (e) { errorDialog(e); }
        });
        const tb = $('#ct-table'); if (tb) tb.onclick = () => TablesView.pickTable(async t => {
            if (!o) { this.draft.table_id = t.id; this.renderCart(); return; }
            if (o.table_id && o.table_id !== t.id) return TablesView.move(o, t);
            try { await POS.exec('order.set', o.id, { table_id: t.id, table_name: t.name }); } catch (e) { errorDialog(e); }
        });
        const gm = $('#ct-gm'), gp = $('#ct-gp');
        const setGuests = async n => { n = Math.max(1, n); if (!o) { this.draft.guests = n; this.renderCart(); } else await POS.exec('order.set', o.id, { guests: n }); };
        if (gm) gm.onclick = () => setGuests((o ? o.guests : this.draft.guests) - 1);
        if (gp) gp.onclick = () => setGuests((o ? o.guests : this.draft.guests) + 1);
        const cu = $('#ct-cust'); if (cu) cu.onclick = () => this.customerDialog();
        $('#ct-new').onclick = () => this.newOrder();
        const more = $('#ct-more'); if (more) more.onclick = () => this.moreMenu(o);
        $('#ct-disc').onclick = () => o && this.discountDialog(o);
        $('#ct-send').onclick = () => this.send(o);
        const pay = $('#ct-pay'); if (pay) pay.onclick = () => Payment.open(o);
        const save = $('#ct-save'); if (save) save.onclick = async () => { if (o.items.some(i => i.status === 'new')) await this.send(o); this.newOrder(); POS.setView('tables'); };
        $$('#ct-items [data-minus]').forEach(b => b.onclick = e => { e.stopPropagation(); const it = o.items.find(i => i.id === b.dataset.minus); POS.exec(it.qty === 1 ? 'order.remove_item' : 'order.update_item', o.id, { item_id: it.id, qty: it.qty - 1 }); });
        $$('#ct-items [data-plus]').forEach(b => b.onclick = e => { e.stopPropagation(); const it = o.items.find(i => i.id === b.dataset.plus); POS.exec('order.update_item', o.id, { item_id: it.id, qty: it.qty + 1 }); });
        $$('#ct-items [data-i]').forEach(b => b.onclick = () => this.itemDialog(o, o.items.find(i => i.id === b.dataset.i)));
    },

    async send(o, silent) {
        if (!o) return;
        const sentItems = [];
        try {
            await POS.exec('order.send', o.id, {}, { onSent: (next, ids) => sentItems.push(...next.items.filter(i => ids.includes(i.id))) });
        } catch (e) { return errorDialog(e); }
        if (Printer.settings.kitchen === 'own' && sentItems.length) {
            const cur = POS.orders.get(o.id) || o;
            const byStation = {};
            for (const it of sentItems) (byStation[it.station || 'Dapur'] ||= []).push(it);
            for (const [station, list] of Object.entries(byStation)) {
                Printer.print({ label: 'Dapur', lines: Receipt.kitchen({ station, label: cur.table_name ? 'Meja ' + cur.table_name : cur.order_no + (cur.customer_name ? ' · ' + cur.customer_name : ''), ticket_no: cur.order_no, created_at: Date.now(), items: list.map(i => ({ name: i.name, qty: i.qty, mods: i.mods.map(m => m.name), note: i.note })) }) }).catch(() => { });
            }
        }
        if (!silent) toast(`Terkirim ke ${[...new Set(sentItems.map(i => i.station || 'Dapur'))].join(', ')} · ${sentItems.length} item`, 'success');
    },

    itemDialog(o, it) {
        if (!it || it.status === 'void') return;
        const isNew = it.status === 'new' || it.status === 'held';
        POS.modal({
            title: `${it.qty}× ${esc(it.name)}`,
            body: `<div class="text-sm text-stone-500 mb-3">${esc(it.mods.map(m => m.name).join(', ') || 'Tanpa modifier')} · ${rp(it.price)} / porsi</div>
                ${isNew ? `<label class="label">Catatan</label><input id="it-note" class="input mb-3" value="${esc(it.note)}" placeholder="mis. tanpa es, dipisah">
                <div class="grid grid-cols-2 gap-2"><button id="it-hold" class="btn-light"><i class="fas ${it.status === 'held' ? 'fa-play' : 'fa-pause'}"></i>${it.status === 'held' ? 'Lepas tahan' : 'Tahan (kirim nanti)'}</button><button id="it-disc" class="btn-light"><i class="fas fa-tag"></i>Diskon item</button></div>`
                : `<div class="p-3 rounded-xl bg-stone-50 text-sm"><i class="fas fa-check-double text-emerald-600 mr-1"></i>Sudah dikirim ke ${esc(it.station)} ${fmtTime(it.sent_at)}. Perubahan harus melalui <b>void</b>.</div>`}`,
            foot: isNew ? `<button id="it-del" class="btn-danger"><i class="fas fa-trash"></i>Hapus</button><button id="it-save" class="btn-primary flex-1">Simpan</button>`
                : `<button id="it-void" class="btn-danger flex-1"><i class="fas fa-ban"></i>Void item</button>`
        });
        if (isNew) {
            $('#it-save').onclick = async () => { await POS.exec('order.update_item', o.id, { item_id: it.id, note: $('#it-note').value.trim() }); POS.closeModal(); };
            $('#it-del').onclick = async () => { await POS.exec('order.remove_item', o.id, { item_id: it.id }); POS.closeModal(); };
            $('#it-hold').onclick = async () => { await POS.exec('order.update_item', o.id, { item_id: it.id, held: it.status !== 'held' }); POS.closeModal(); };
            $('#it-disc').onclick = async () => {
                const v = await promptDialog('Diskon untuk ' + it.name, { input: 'number', label: `Nominal (maks. ${rp(it.price * it.qty)})`, value: it.discount || '' });
                if (v === null) return;
                const amount = Math.min(Number(v) || 0, it.price * it.qty);
                const limit = POS.boot.settings.discount_limit_pct;
                let approval;
                if (amount > it.price * it.qty * limit / 100 && !POS.can('discount')) {
                    const ap = await POS.askApproval('discount', 'Diskon item di atas ' + limit + '%');
                    if (!ap) return;
                    approval = { staff_id: ap.staff_id, pin: ap.pin };
                }
                await POS.exec('order.update_item', o.id, { item_id: it.id, discount: amount, ...(approval ? { approval } : {}) });
                POS.closeModal();
            };
        } else {
            $('#it-void').onclick = () => this.voidDialog(o, it);
        }
    },

    async voidDialog(o, it) {
        const r = await SwalBase.fire({
            title: 'Void ' + it.name,
            html: `${it.qty > 1 ? `<label class="label text-left">Jumlah</label><input id="vd-qty" type="number" min="1" max="${it.qty}" value="${it.qty}" class="input mb-3">` : ''}
                <label class="label text-left">Alasan</label><select id="vd-reason" class="input">${['Salah input', 'Pelanggan batal', 'Menu habis', 'Terlalu lama', 'Komplain rasa', 'Lainnya'].map(x => `<option>${x}</option>`).join('')}</select>`,
            showCancelButton: true, confirmButtonText: 'Void', confirmButtonColor: '#ef4444', focusConfirm: false,
            preConfirm: () => ({ qty: Number(($('#vd-qty') || { value: it.qty }).value), reason: $('#vd-reason').value })
        });
        if (!r.isConfirmed) return;
        const ap = await POS.askApproval('void', 'Void item yang sudah dikirim');
        if (!ap) return;
        try {
            await POS.exec('order.void_item', o.id, { item_id: it.id, qty: r.value.qty, reason: r.value.reason, ...(ap.staff_id ? { approval: { staff_id: ap.staff_id, pin: ap.pin } } : {}) });
            POS.closeModal();
            toast('Item di-void', 'success');
        } catch (e) { errorDialog(e); }
    },

    discountDialog(o) {
        const limit = POS.boot.settings.discount_limit_pct;
        const manualPromos = POS.boot.promos.filter(p => !p.auto_apply);
        POS.modal({
            title: 'Diskon order',
            body: `${manualPromos.length ? `<label class="label">Promo</label><div class="grid grid-cols-2 gap-2 mb-4">${manualPromos.map(p => `<button data-promo="${p.id}" class="p-3 rounded-xl border border-stone-200 text-left hover:border-brand-500"><b class="text-sm">${esc(p.name)}</b><div class="text-brand-600 font-bold">${p.type === 'percent' ? p.value + '%' : rp(p.value)}</div></button>`).join('')}</div>` : ''}
                <label class="label">Diskon cepat</label><div class="grid grid-cols-4 gap-2 mb-4">${[5, 10, 15, 20].map(v => `<button data-pct="${v}" class="btn-light py-3">${v}%</button>`).join('')}</div>
                <label class="label">Diskon manual</label><div class="flex gap-2"><select id="dc-type" class="input !w-32"><option value="percent">%</option><option value="amount">Rp</option></select><input id="dc-val" type="number" min="0" class="input" placeholder="Nilai"></div>
                <p class="text-xs text-stone-500 mt-2">Diskon di atas ${limit}% atau nominal membutuhkan persetujuan manager.</p>`,
            foot: `${o.discount ? '<button id="dc-clear" class="btn-danger">Hapus diskon</button>' : ''}<button id="dc-apply" class="btn-primary flex-1">Terapkan</button>`
        });
        const apply = async discount => {
            let approval;
            const needs = !discount.promo_id && (discount.type === 'amount' || discount.value > limit);
            if (needs && !POS.can('discount')) { const ap = await POS.askApproval('discount', 'Persetujuan diskon'); if (!ap) return; approval = { staff_id: ap.staff_id, pin: ap.pin }; }
            try { await POS.exec('order.discount', o.id, { discount, ...(approval ? { approval } : {}) }); POS.closeModal(); } catch (e) { errorDialog(e); }
        };
        $$('[data-promo]').forEach(b => b.onclick = () => { const p = manualPromos.find(x => x.id === Number(b.dataset.promo)); apply({ type: p.type, value: p.value, name: p.name, promo_id: p.id }); });
        $$('[data-pct]').forEach(b => b.onclick = () => apply({ type: 'percent', value: Number(b.dataset.pct), name: `Diskon ${b.dataset.pct}%` }));
        $('#dc-apply').onclick = () => { const v = Number($('#dc-val').value); if (!(v > 0)) return toast('Isi nilai diskon'); const type = $('#dc-type').value; apply({ type, value: v, name: type === 'percent' ? `Diskon ${v}%` : 'Diskon' }); };
        const clr = $('#dc-clear'); if (clr) clr.onclick = async () => { await POS.exec('order.discount', o.id, { discount: null }); POS.closeModal(); };
    },

    async customerDialog() {
        const o = this.order;
        const setCust = async (name, id = null) => {
            if (!o) { this.draft.customer_name = name; this.draft.customer_id = id; this.renderCart(); }
            else await POS.exec('order.set', o.id, { customer_name: name, customer_id: id });
            POS.closeModal();
        };
        POS.modal({
            title: 'Pelanggan',
            body: `<div class="flex gap-2 mb-3"><input id="cs-q" class="input" placeholder="${POS.online ? 'Cari nama / no. HP pelanggan…' : 'Nama pemesan'}" value="${esc(o ? o.customer_name : this.draft.customer_name)}"><button id="cs-use" class="btn-light whitespace-nowrap">Pakai nama</button></div>
                <div id="cs-list" class="space-y-2"></div>
                ${POS.online ? '<button id="cs-new" class="btn-outline w-full mt-3"><i class="fas fa-user-plus"></i>Daftarkan pelanggan baru (poin)</button>' : '<p class="text-xs text-stone-500">Offline: hanya nama pemesan. Pencarian member tersedia saat online.</p>'}`
        });
        $('#cs-use').onclick = () => setCust($('#cs-q').value.trim());
        const search = debounce(async () => {
            if (!POS.online) return;
            const q = $('#cs-q').value.trim();
            if (q.length < 2) { $('#cs-list').innerHTML = ''; return; }
            try {
                const r = await API.get('/t/customers?q=' + encodeURIComponent(q));
                $('#cs-list').innerHTML = r.items.map(c => `<button data-c="${c.id}" class="w-full p-3 rounded-xl border border-stone-200 text-left flex justify-between"><span><b>${esc(c.name)}</b><div class="text-xs text-stone-500">${esc(c.phone)}</div></span><span class="text-sm text-amber-600"><i class="fas fa-star"></i> ${c.points}</span></button>`).join('') || '<p class="text-sm text-stone-400">Tidak ditemukan</p>';
                $$('#cs-list [data-c]').forEach(b => b.onclick = () => { const c = r.items.find(x => x.id === Number(b.dataset.c)); setCust(c.name, c.id); });
            } catch { }
        }, 300);
        $('#cs-q').oninput = search;
        const nw = $('#cs-new');
        if (nw) nw.onclick = async () => {
            const r = await SwalBase.fire({ title: 'Pelanggan baru', html: '<input id="nc-name" class="input mb-2" placeholder="Nama"><input id="nc-phone" class="input" placeholder="No. HP" inputmode="tel">', showCancelButton: true, confirmButtonText: 'Simpan', preConfirm: () => { const name = $('#nc-name').value.trim(); if (!name) { Swal.showValidationMessage('Nama wajib'); return false; } return { name, phone: $('#nc-phone').value.trim() }; } });
            if (!r.isConfirmed) return;
            try { const c = (await API.post('/t/customers', r.value)).item; await setCust(c.name, c.id); toast('Pelanggan terdaftar', 'success'); } catch (e) { errorDialog(e); }
        };
    },

    moreMenu(o) {
        const btn = (id, icon, label, show = true, cls = 'btn-light') => show ? `<button id="${id}" class="${cls} justify-start py-3"><i class="fas ${icon} w-5"></i>${label}</button>` : '';
        POS.modal({
            title: 'Order ' + esc(o.order_no),
            body: `<div class="grid grid-cols-2 gap-2">
                ${btn('mo-bill', 'fa-file-invoice', 'Cetak pre-bill')}
                ${btn('mo-note', 'fa-note-sticky', 'Catatan order')}
                ${btn('mo-move', 'fa-right-left', 'Pindah meja', o.type === 'dine_in' && POS.can('table'))}
                ${btn('mo-merge', 'fa-object-group', 'Gabung bill', POS.can('table'))}
                ${btn('mo-split', 'fa-scissors', 'Split bill', POS.can('table'))}
                ${btn('mo-void', 'fa-ban', 'Batalkan order', true, 'btn-danger')}
            </div>${!POS.online ? '<p class="text-xs text-amber-700 mt-3"><i class="fas fa-wifi mr-1"></i>Pindah/gabung/split hanya bisa saat online.</p>' : ''}`
        });
        $('#mo-bill').onclick = () => { POS.closeModal(); Payment.printBill(o); };
        $('#mo-note').onclick = async () => { const v = await promptDialog('Catatan order', { value: o.note }); if (v !== null) await POS.exec('order.set', o.id, { note: v }); POS.closeModal(); };
        const mv = $('#mo-move'); if (mv) mv.onclick = () => { POS.closeModal(); TablesView.pickTable(t => TablesView.move(o, t)); };
        const mg = $('#mo-merge'); if (mg) mg.onclick = () => { POS.closeModal(); TablesView.merge(o); };
        const sp = $('#mo-split'); if (sp) sp.onclick = () => { POS.closeModal(); TablesView.split(o); };
        $('#mo-void').onclick = async () => {
            const reason = await promptDialog('Batalkan order ' + o.order_no, { label: 'Alasan (wajib)', validate: v => !v.trim() && 'Alasan wajib diisi', confirm: 'Batalkan' });
            if (!reason) return;
            const hasSent = o.items.some(i => i.status === 'sent');
            let ap = {};
            if (hasSent) { ap = await POS.askApproval('void', 'Batalkan order yang sudah dikirim'); if (!ap) return; }
            else if (!POS.can('void') && !POS.can('order')) return;
            try {
                await POS.exec('order.void', o.id, { reason, ...(ap.staff_id ? { approval: { staff_id: ap.staff_id, pin: ap.pin } } : {}) });
                POS.closeModal(); this.newOrder(); toast('Order dibatalkan');
            } catch (e) { errorDialog(e); }
        };
    },

    soldOutDialog() {
        const draw = () => {
            $('#pos-modal-body').innerHTML = `<input id="so-q" class="input mb-3" placeholder="Cari menu…"><div class="space-y-1" id="so-list">${POS.boot.menus.map(m => `<label class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-stone-50" data-n="${esc(m.name.toLowerCase())}"><input type="checkbox" data-m="${m.id}" ${m.sold_out ? 'checked' : ''} class="accent-red-500 w-5 h-5"><span class="flex-1">${esc(m.name)}</span>${m.sold_out ? '<span class="badge bg-red-50 text-red-600">Habis</span>' : ''}</label>`).join('')}</div>`;
            $('#so-q').oninput = e => $$('#so-list [data-n]').forEach(l => l.classList.toggle('hidden', !l.dataset.n.includes(e.target.value.toLowerCase())));
            $$('#so-list [data-m]').forEach(cb => cb.onchange = async () => {
                const m = POS.idx.menu[cb.dataset.m];
                m.sold_out = cb.checked;
                await POS.exec('menu.availability', null, { menu_id: m.id, sold_out: cb.checked });
                toast(`${m.name} ${cb.checked ? 'ditandai habis' : 'tersedia lagi'}`);
                draw();
                this.renderGrid();
            });
        };
        POS.modal({ title: 'Menu habis hari ini', body: '' });
        draw();
    }
};
