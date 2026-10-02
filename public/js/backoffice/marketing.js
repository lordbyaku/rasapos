// Promo otomatis (jadwal, hari, minimal belanja, channel, outlet) & pelanggan (poin loyalti)
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

BO.page('marketing', {
    title: 'Promo & Pelanggan',
    tab: 'promos',
    async render(view) {
        view.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-4"><div id="mk-tabs"></div><div id="mk-actions" class="ml-auto flex gap-2"></div></div><div id="mk-body"></div>`;
        BO.tabs($('#mk-tabs'), [['promos', 'Promo'], ['customers', 'Pelanggan']], this.tab, t => { this.tab = t; this.load(); });
        await this.load();
    },
    async load() {
        $('#mk-actions').innerHTML = '';
        return this.tab === 'promos' ? this.promos($('#mk-body')) : this.customers($('#mk-body'));
    },

    async promos(body) {
        const d = await API.get('/t/promos');
        if (BO.isOwner) { $('#mk-actions').innerHTML = '<button id="pr-add" class="btn-primary"><i class="fas fa-plus"></i>Promo</button>'; $('#pr-add').onclick = () => this.editPromo(); }
        const desc = p => [
            p.days.length ? p.days.map(x => DAY_NAMES[x]).join(', ') : 'Setiap hari',
            p.start_time || p.end_time ? `${p.start_time || '00:00'}–${p.end_time || '23:59'}` : '',
            p.min_subtotal ? `min. ${rp(p.min_subtotal)}` : '',
            p.channels.length ? p.channels.map(c => BO.channelName(c)).join('/') : '',
            p.outlet_ids.length ? p.outlet_ids.map(id => BO.outletName(id)).join(', ') : 'Semua outlet',
            p.start_date || p.end_date ? `${p.start_date || '…'} s/d ${p.end_date || '…'}` : ''
        ].filter(Boolean).join(' · ');
        body.innerHTML = `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Promo "otomatis" langsung diterapkan kasir saat syarat terpenuhi (diskon terbesar dipilih). Promo manual dapat dipilih kasir dari daftar.</p>
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">${d.items.map(p => `<div class="card p-4 ${p.is_active ? '' : 'opacity-50'}">
                <div class="flex items-start justify-between gap-2"><div><b>${esc(p.name)}</b><div class="text-2xl font-extrabold text-brand-600">${p.type === 'percent' ? p.value + '%' : rp(p.value)}</div></div>
                <div class="text-right">${p.auto_apply ? '<span class="badge bg-emerald-50 text-emerald-700">Otomatis</span>' : '<span class="badge bg-stone-100">Manual</span>'}${BO.isOwner ? `<button class="btn-light !py-1.5 ml-1" data-p="${p.id}"><i class="fas fa-pen"></i></button>` : ''}</div></div>
                <div class="text-xs text-stone-500 mt-2">${esc(desc(p))}</div></div>`).join('') || BO.empty('fa-tags', 'Belum ada promo')}</div>`;
        $$('[data-p]').forEach(b => b.onclick = () => this.editPromo(d.items.find(p => p.id === Number(b.dataset.p))));
    },
    editPromo(p) {
        p = p || { name: '', type: 'percent', value: 10, min_subtotal: 0, days: [], start_time: '', end_time: '', start_date: '', end_date: '', outlet_ids: [], channels: [], auto_apply: 1, is_active: 1 };
        BO.form({
            title: p.id ? 'Ubah Promo' : 'Promo Baru', size: 'max-w-2xl',
            fields: [
                { name: 'name', label: 'Nama promo', required: true, value: p.name, maxlength: 60, placeholder: 'mis. Happy Hour Kopi' },
                { name: 'type', label: 'Jenis', type: 'select', value: p.type, col: 1, options: [{ value: 'percent', label: 'Persen (%)' }, { value: 'amount', label: 'Nominal (Rp)' }] },
                { name: 'value', label: 'Nilai', type: 'number', min: 1, required: true, value: p.value, col: 1 },
                { name: 'min_subtotal', label: 'Minimal belanja', type: 'money', value: p.min_subtotal, col: 1 },
                { name: 'auto_apply', label: 'Terapkan otomatis', type: 'checkbox', value: p.auto_apply, col: 1 },
                { name: 'days', label: 'Hari berlaku (kosong = setiap hari)', type: 'checks', numeric: true, value: p.days, options: DAY_NAMES.map((n, i) => ({ value: i, label: n })) },
                { name: 'start_time', label: 'Jam mulai', type: 'time', value: p.start_time, col: 1 }, { name: 'end_time', label: 'Jam selesai', type: 'time', value: p.end_time, col: 1 },
                { name: 'start_date', label: 'Tanggal mulai', type: 'date', value: p.start_date, col: 1 }, { name: 'end_date', label: 'Tanggal selesai', type: 'date', value: p.end_date, col: 1 },
                { name: 'outlet_ids', label: 'Outlet (kosong = semua)', type: 'checks', numeric: true, value: p.outlet_ids, options: BO.outlets.map(o => ({ value: o.id, label: o.name })) },
                { name: 'channels', label: 'Channel (kosong = semua)', type: 'checks', value: p.channels, options: BO.meta.channels.map(c => ({ value: c.code, label: c.name })) },
                { name: 'is_active', label: 'Aktif', type: 'checkbox', value: p.is_active }
            ],
            extraButtons: p.id ? '<button type="button" id="pr-del" class="btn-danger mr-auto"><i class="fas fa-trash"></i></button>' : '',
            onSubmit: async d => { if (p.id) await API.patch('/t/promos/' + p.id, d); else await API.post('/t/promos', d); this.load(); }
        });
        const del = $('#pr-del');
        if (del) del.onclick = async () => { if (await confirmDialog('Hapus promo ini?', '', 'Hapus', true)) { await API.del('/t/promos/' + p.id); closeModal('bo-modal'); this.load(); } };
    },

    async customers(body) {
        $('#mk-actions').innerHTML = '<button id="cu-csv" class="btn-outline"><i class="fas fa-file-csv"></i>Export</button><button id="cu-add" class="btn-primary"><i class="fas fa-plus"></i>Pelanggan</button>';
        const loy = BO.meta.settings.loyalty;
        body.innerHTML = `<div class="flex gap-2 mb-3"><div class="relative flex-1"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i><input id="cu-q" placeholder="Cari nama / no. HP…" class="input pl-9"></div></div>
            <p class="text-sm text-stone-500 mb-3"><i class="fas fa-star text-amber-400 mr-1"></i>Program poin: ${loy.enabled ? `<b>aktif</b> — 1 poin setiap ${rp(loy.amount_per_point)}` : '<b>nonaktif</b> (atur di Pengaturan)'}</p>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Nama</th><th>No. HP</th><th class="text-right">Kunjungan</th><th class="text-right">Total belanja</th><th class="text-right">Poin</th><th>Terakhir datang</th><th></th></tr></thead><tbody id="cu-rows"></tbody></table></div></div>`;
        let items = [];
        const draw = async () => {
            const q = $('#cu-q').value.trim();
            items = (await API.get('/t/customers' + (q ? '?q=' + encodeURIComponent(q) : ''))).items;
            $('#cu-rows').innerHTML = items.map(c => `<tr><td><b>${esc(c.name)}</b>${c.note ? `<div class="text-xs text-stone-400">${esc(c.note)}</div>` : ''}</td><td>${esc(c.phone)}</td><td class="text-right">${c.visits}</td><td class="text-right">${rp(c.total_spent)}</td><td class="text-right font-semibold">${c.points}</td><td>${timeAgo(c.last_visit_at)}</td>
                <td class="text-right"><button class="btn-light !py-1.5" data-c="${c.id}"><i class="fas fa-pen"></i></button></td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-stone-400 py-8">Belum ada pelanggan</td></tr>';
            $$('[data-c]').forEach(b => b.onclick = () => edit(items.find(c => c.id === Number(b.dataset.c))));
        };
        const edit = c => {
            c = c || { name: '', phone: '', email: '', note: '' };
            BO.form({
                title: c.id ? 'Ubah Pelanggan' : 'Pelanggan Baru',
                fields: [{ name: 'name', label: 'Nama', required: true, value: c.name, maxlength: 80 }, { name: 'phone', label: 'No. HP', value: c.phone, col: 1 }, { name: 'email', label: 'Email', type: 'email', value: c.email, col: 1 }, { name: 'note', label: 'Catatan', type: 'textarea', value: c.note, rows: 2 }],
                extraButtons: c.id ? '<button type="button" id="cu-del" class="btn-danger mr-auto"><i class="fas fa-trash"></i></button>' : '',
                onSubmit: async f => { if (c.id) await API.patch('/t/customers/' + c.id, f); else await API.post('/t/customers', f); draw(); }
            });
            const del = $('#cu-del');
            if (del) del.onclick = async () => { if (await confirmDialog('Hapus pelanggan ' + c.name + '?', '', 'Hapus', true)) { await API.del('/t/customers/' + c.id); closeModal('bo-modal'); draw(); } };
        };
        $('#cu-add').onclick = () => edit();
        $('#cu-q').oninput = debounce(draw, 350);
        $('#cu-csv').onclick = () => downloadCSV('pelanggan.csv', items, [{ label: 'Nama', key: 'name' }, { label: 'No HP', key: 'phone' }, { label: 'Email', key: 'email' }, { label: 'Kunjungan', key: 'visits' }, { label: 'Total belanja', key: 'total_spent' }, { label: 'Poin', key: 'points' }]);
        await draw();
    }
});
