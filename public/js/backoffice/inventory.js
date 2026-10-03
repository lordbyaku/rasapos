// Inventori: stok per outlet, bahan baku, mutasi (pembelian, waste, opname, transfer), riwayat, supplier
const MOVE_LABEL = { purchase: 'Pembelian', waste: 'Waste/rusak', opname: 'Stok opname', transfer: 'Transfer keluar', transfer_in: 'Transfer masuk', adjust: 'Penyesuaian', sale: 'Penjualan' };

BO.page('inventory', {
    title: 'Inventori',
    tab: 'stock',
    async render(view) {
        BO.filters({ outlet: 'single', date: false, onChange: () => this.load() });
        view.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-4"><div id="i-tabs"></div><div id="i-actions" class="ml-auto flex flex-wrap gap-2"></div></div><div id="i-body"></div>`;
        BO.tabs($('#i-tabs'), [['stock', 'Stok'], ['ingredients', 'Bahan Baku'], ['moves', 'Riwayat Mutasi'], ['suppliers', 'Supplier']], this.tab, t => { this.tab = t; this.load(); });
        await this.load();
    },
    async load() {
        $('#i-actions').innerHTML = '';
        const body = $('#i-body');
        body.innerHTML = '<div class="py-16 text-center text-stone-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        this.ings = (await API.get('/t/ingredients')).items;
        try { await this['tab_' + this.tab](body); } catch (e) { body.innerHTML = `<div class="card p-6 text-red-600">${esc(e.message)}</div>`; }
    },
    outlet() { return BO.singleOutlet(); },

    async tab_stock(body) {
        const d = await API.get('/t/stock?outlet=' + this.outlet());
        this.stock = d.items;
        $('#i-actions').innerHTML = `<button class="btn-primary" data-mv="purchase"><i class="fas fa-truck-ramp-box"></i>Pembelian</button><button class="btn-light" data-mv="opname"><i class="fas fa-clipboard-check"></i>Opname</button><button class="btn-light" data-mv="waste"><i class="fas fa-trash-can"></i>Waste</button>${BO.outlets.length > 1 ? '<button class="btn-light" data-mv="transfer"><i class="fas fa-right-left"></i>Transfer</button>' : ''}`;
        $$('[data-mv]').forEach(b => b.onclick = () => this.move(b.dataset.mv));
        const low = d.items.filter(i => i.low).length;
        const value = d.items.reduce((s, i) => s + Math.max(0, i.value), 0);
        const gap = d.gap ? `<div class="mb-4 p-4 rounded-xl bg-amber-50 text-amber-900 text-sm flex flex-wrap items-center gap-3"><i class="fas fa-triangle-exclamation text-amber-500 text-lg"></i>
            <div class="flex-1 min-w-[240px]"><b>Stok perlu dicek ulang.</b> Fitur inventori sempat nonaktif ${fmtDateTime(d.gap.from)} – ${fmtDateTime(d.gap.to)}; penjualan pada periode itu tidak memotong stok. Lakukan <b>Stock opname</b> di setiap outlet.</div>
            <button class="btn-light !py-1.5 text-xs" id="gap-ok"><i class="fas fa-check"></i>Sudah opname</button></div>` : '';
        body.innerHTML = gap + `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">${BO.kpi('Jenis bahan', d.items.length, '', 'fa-boxes-stacked')}${BO.kpi('Nilai stok', rp(value), 'berdasarkan harga rata-rata', 'fa-sack-dollar', 'text-stone-500')}${BO.kpi('Stok menipis', low, low ? 'perlu dibeli' : 'aman', 'fa-triangle-exclamation', low ? 'text-red-600' : 'text-emerald-600')}${BO.kpi('Stok minus', d.items.filter(i => i.qty < 0).length, 'cek resep / lakukan opname', 'fa-circle-minus', 'text-stone-500')}</div>
            ${d.items.length ? `<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Bahan</th><th class="text-right">Stok</th><th>Satuan</th><th class="text-right">Minimum</th><th class="text-right">Harga rata-rata</th><th class="text-right">Nilai</th><th>Status</th></tr></thead><tbody>
            ${d.items.map(i => `<tr><td><b>${esc(i.name)}</b></td><td class="text-right font-semibold ${i.qty < 0 ? 'text-red-600' : ''}">${num(i.qty)}</td><td>${esc(i.unit)}</td><td class="text-right text-stone-500">${num(i.min_stock)}</td>
                <td class="text-right">${rp(i.cost)}</td><td class="text-right">${rp(i.value)}</td><td>${i.qty < 0 ? '<span class="badge bg-red-50 text-red-600">Minus</span>' : i.low ? '<span class="badge bg-amber-50 text-amber-700">Menipis</span>' : '<span class="badge bg-emerald-50 text-emerald-700">Aman</span>'}</td></tr>`).join('')}</tbody></table></div></div>`
            : BO.empty('fa-boxes-stacked', 'Belum ada bahan baku. Tambahkan di tab "Bahan Baku", lalu atur resep di Menu.')}`;
        const gapOk = $('#gap-ok');
        if (gapOk) gapOk.onclick = async () => {
            if (!(await confirmDialog('Tandai stok sudah dicek ulang?', 'Pengingat ini hilang untuk semua outlet.'))) return;
            try { await API.post('/t/stock/gap/dismiss'); this.load(); } catch (e) { errorDialog(e); }
        };
    },

    move(type) {
        const ings = this.ings.filter(i => i.is_active);
        if (!ings.length) return errorDialog(new Error('Tambahkan bahan baku terlebih dahulu'));
        const stockMap = Object.fromEntries((this.stock || []).map(s => [s.id, s.qty]));
        const opts = ings.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('');
        const qtyLabel = type === 'opname' ? 'Stok fisik' : 'Jumlah';
        const row = () => `<div class="grid grid-cols-12 gap-2 mv-row"><select class="input col-span-6" data-ing>${opts}</select><input type="number" step="any" min="0" class="input col-span-3" data-qty placeholder="${qtyLabel}">
            ${type === 'purchase' ? '<input type="number" step="any" min="0" class="input col-span-2 !px-2" data-cost placeholder="Rp/unit">' : '<span class="col-span-2 text-xs text-stone-400 self-center" data-cur></span>'}<button type="button" class="btn-light col-span-1 !px-0" data-del><i class="fas fa-xmark"></i></button></div>`;
        const fields = [
            { type: 'html', html: `<div class="p-3 rounded-xl bg-stone-50 text-sm"><b>${MOVE_LABEL[type]}</b> · ${esc(BO.outletName(this.outlet()))}${type === 'opname' ? ' — masukkan jumlah stok hasil hitung fisik; selisih dicatat otomatis.' : ''}${type === 'purchase' ? ' — harga per satuan memperbarui harga rata-rata bahan.' : ''}</div>` }
        ];
        if (type === 'transfer') fields.push({ name: 'to_outlet_id', label: 'Outlet tujuan', type: 'select', options: BO.outlets.filter(o => o.id !== this.outlet()).map(o => ({ value: o.id, label: o.name })) });
        if (type === 'purchase') fields.push({ name: 'supplier_id', label: 'Supplier (opsional)', type: 'select', options: [{ value: '', label: '-' }] });
        fields.push({ type: 'html', html: `<label class="label">Bahan</label><div id="mv-rows" class="space-y-2">${row()}</div><button type="button" id="mv-add" class="btn-light mt-2 !py-1.5 text-xs"><i class="fas fa-plus"></i>Tambah baris</button>` });
        fields.push({ name: 'note', label: 'Catatan', maxlength: 200, placeholder: type === 'purchase' ? 'mis. no. nota' : '' });
        const form = BO.form({
            title: MOVE_LABEL[type], size: 'max-w-2xl', submitText: 'Simpan mutasi',
            fields,
            onSubmit: async d => {
                const items = $$('#mv-rows .mv-row').map(r => {
                    const it = { ingredient_id: Number(r.querySelector('[data-ing]').value) };
                    const q = r.querySelector('[data-qty]').value;
                    if (q === '') return null;
                    if (type === 'opname') it.actual = Number(q); else it.qty = Number(q);
                    const c = r.querySelector('[data-cost]');
                    if (c && c.value !== '') it.cost = Number(c.value);
                    return it;
                }).filter(Boolean);
                await API.post('/t/stock/moves', { type, outlet_id: this.outlet(), to_outlet_id: Number(d.to_outlet_id) || undefined, supplier_id: Number(d.supplier_id) || undefined, items, note: d.note });
                toast('Mutasi stok tersimpan', 'success');
                this.load();
            }
        });
        const wire = () => {
            $$('#mv-rows [data-del]').forEach(b => b.onclick = () => b.closest('.mv-row').remove());
            $$('#mv-rows .mv-row').forEach(r => {
                const cur = r.querySelector('[data-cur]');
                const sel = r.querySelector('[data-ing]');
                const upd = () => { if (cur) cur.textContent = 'stok: ' + num(stockMap[sel.value] || 0); };
                sel.onchange = upd; upd();
            });
        };
        $('#mv-add').onclick = () => { $('#mv-rows').insertAdjacentHTML('beforeend', row()); wire(); };
        wire();
        if (type === 'purchase') API.get('/t/suppliers').then(s => {
            const sel = form.elements.supplier_id;
            s.items.filter(x => x.is_active).forEach(x => sel.insertAdjacentHTML('beforeend', `<option value="${x.id}">${esc(x.name)}</option>`));
        }).catch(() => { });
    },

    async tab_ingredients(body) {
        $('#i-actions').innerHTML = '<button id="ing-add" class="btn-primary"><i class="fas fa-plus"></i>Bahan</button>';
        $('#ing-add').onclick = () => this.editIng();
        body.innerHTML = this.ings.length ? `<div class="card overflow-hidden"><table class="tbl"><thead><tr><th>Bahan</th><th>Satuan</th><th class="text-right">Harga rata-rata / satuan</th><th class="text-right">Stok minimum</th><th>Status</th><th></th></tr></thead><tbody>
            ${this.ings.map(i => `<tr class="${i.is_active ? '' : 'opacity-50'}"><td><b>${esc(i.name)}</b></td><td>${esc(i.unit)}</td><td class="text-right">${rp(i.cost)}</td><td class="text-right">${num(i.min_stock)}</td>
            <td>${i.is_active ? '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>' : '<span class="badge bg-stone-100">Nonaktif</span>'}</td><td class="text-right"><button class="btn-light !py-1.5" data-i="${i.id}"><i class="fas fa-pen"></i></button></td></tr>`).join('')}</tbody></table></div>`
            : BO.empty('fa-wheat-awn', 'Belum ada bahan baku');
        $$('[data-i]').forEach(b => b.onclick = () => this.editIng(this.ings.find(i => i.id === Number(b.dataset.i))));
    },
    editIng(i) {
        i = i || { name: '', unit: 'gr', cost: 0, min_stock: 0, is_active: 1 };
        BO.form({
            title: i.id ? 'Ubah Bahan' : 'Bahan Baru',
            fields: [
                { name: 'name', label: 'Nama bahan', required: true, value: i.name, maxlength: 80 },
                { name: 'unit', label: 'Satuan pakai', type: 'select', value: i.unit, col: 1, options: ['gr', 'kg', 'ml', 'liter', 'pcs', 'butir', 'lembar', 'porsi'].map(u => ({ value: u, label: u })) },
                { name: 'cost', label: 'Harga per satuan', type: 'number', step: 'any', min: 0, value: i.cost, col: 1, help: 'Diperbarui otomatis saat pembelian' },
                { name: 'min_stock', label: 'Stok minimum', type: 'number', step: 'any', min: 0, value: i.min_stock, col: 1 },
                { name: 'is_active', label: 'Aktif', type: 'checkbox', value: i.is_active, col: 1 }
            ],
            onSubmit: async d => { if (i.id) await API.patch('/t/ingredients/' + i.id, d); else await API.post('/t/ingredients', d); this.load(); }
        });
    },

    async tab_moves(body) {
        const d = await API.get(`/t/stock/moves?outlet=${this.outlet()}&from_ms=${Date.now() - 90 * 86400000}`);
        $('#i-actions').innerHTML = '<button id="mv-csv" class="btn-outline"><i class="fas fa-file-csv"></i>Export CSV</button>';
        $('#mv-csv').onclick = () => downloadCSV('mutasi-stok.csv', d.items.flatMap(m => m.items.map(i => ({ ...i, m }))), [
            { label: 'Waktu', value: r => fmtDateTime(r.m.created_at) }, { label: 'Jenis', value: r => MOVE_LABEL[r.m.type] || r.m.type }, { label: 'Ref', value: r => r.m.ref || '' },
            { label: 'Bahan', key: 'name' }, { label: 'Jumlah', key: 'qty' }, { label: 'Satuan', key: 'unit' }, { label: 'Oleh', value: r => r.m.by_name }, { label: 'Catatan', value: r => r.m.note }
        ]);
        body.innerHTML = d.items.length ? `<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Waktu</th><th>Jenis</th><th>Bahan</th><th class="text-right">Nilai</th><th>Oleh</th><th>Catatan</th></tr></thead><tbody>
            ${d.items.map(m => `<tr><td class="whitespace-nowrap text-stone-500">${fmtDateTime(m.created_at)}</td><td><span class="badge ${m.type === 'sale' ? 'bg-stone-100' : m.type === 'purchase' || m.type === 'transfer_in' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${MOVE_LABEL[m.type] || m.type}</span>${m.ref ? `<div class="text-[11px] text-stone-400">${esc(m.ref)}</div>` : ''}</td>
                <td class="text-xs">${m.items.map(i => `${esc(i.name)} <b class="${i.qty < 0 ? 'text-red-600' : 'text-emerald-600'}">${i.qty > 0 ? '+' : ''}${num(i.qty)}</b> ${esc(i.unit)}`).join('<br>')}</td>
                <td class="text-right">${rp(m.total_cost)}</td><td>${esc(m.by_name || '-')}</td><td class="text-xs text-stone-500">${esc(m.note || '')}</td></tr>`).join('')}</tbody></table></div></div>`
            : BO.empty('fa-clock-rotate-left', 'Belum ada mutasi stok 90 hari terakhir');
    },

    async tab_suppliers(body) {
        const d = await API.get('/t/suppliers');
        $('#i-actions').innerHTML = '<button id="sp-add" class="btn-primary"><i class="fas fa-plus"></i>Supplier</button>';
        const edit = s => {
            s = s || { name: '', phone: '', note: '', is_active: 1 };
            BO.form({
                title: s.id ? 'Ubah Supplier' : 'Supplier Baru',
                fields: [{ name: 'name', label: 'Nama', required: true, value: s.name, maxlength: 80 }, { name: 'phone', label: 'Telepon', value: s.phone, col: 1 }, { name: 'is_active', label: 'Aktif', type: 'checkbox', value: s.is_active, col: 1 }, { name: 'note', label: 'Catatan', type: 'textarea', value: s.note }],
                onSubmit: async f => { if (s.id) await API.patch('/t/suppliers/' + s.id, f); else await API.post('/t/suppliers', f); this.load(); }
            });
        };
        $('#sp-add').onclick = () => edit();
        body.innerHTML = d.items.length ? `<div class="card overflow-hidden"><table class="tbl"><thead><tr><th>Supplier</th><th>Telepon</th><th>Catatan</th><th></th></tr></thead><tbody>${d.items.map(s => `<tr class="${s.is_active ? '' : 'opacity-50'}"><td><b>${esc(s.name)}</b></td><td>${esc(s.phone)}</td><td class="text-xs text-stone-500">${esc(s.note)}</td><td class="text-right"><button class="btn-light !py-1.5" data-sp="${s.id}"><i class="fas fa-pen"></i></button></td></tr>`).join('')}</tbody></table></div>`
            : BO.empty('fa-truck', 'Belum ada supplier');
        $$('[data-sp]').forEach(b => b.onclick = () => edit(d.items.find(s => s.id === Number(b.dataset.sp))));
    }
});
