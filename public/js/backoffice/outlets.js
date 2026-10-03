// Outlet (pengaturan pajak, struk, jam tutup hari), area & meja, perangkat (pairing/cabut)
BO.page('outlets', {
    get title() { return BO.has('tables') ? 'Outlet & Meja' : 'Outlet'; },
    async render(view) {
        const lic = BO.me.tenant.license;
        const active = BO.outlets.filter(o => o.is_active).length;
        view.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 mb-4"><div class="text-sm text-stone-500">${active} dari ${lic.max_outlets} outlet aktif (${esc(licenseText(lic))})</div>
            ${BO.isOwner ? `<button id="o-add" class="btn-primary ml-auto" ${active >= lic.max_outlets ? 'disabled title="Kuota paket penuh"' : ''}><i class="fas fa-plus"></i>Outlet baru</button>` : ''}</div>
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">${BO.outlets.map(o => `<div class="card p-4 ${o.is_active ? '' : 'opacity-60'}">
                <div class="flex items-start gap-3"><div class="w-11 h-11 rounded-xl grid place-items-center text-white font-bold" style="background:${outletColor(o.id)}">${esc(o.code.slice(0, 3))}</div>
                <div class="flex-1 min-w-0"><b>${esc(o.name)}</b><div class="text-xs text-stone-500 truncate">${esc(o.address || 'Alamat belum diisi')}</div></div>
                ${o.is_active ? '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>' : '<span class="badge bg-stone-100">Nonaktif</span>'}</div>
                <div class="grid grid-cols-3 gap-2 mt-4 text-xs text-center">
                    <div class="bg-stone-50 rounded-lg p-2"><div class="text-stone-400">${esc(o.tax_label)}</div><b>${o.tax_rate}%${o.tax_inclusive ? ' (incl)' : ''}</b></div>
                    <div class="bg-stone-50 rounded-lg p-2"><div class="text-stone-400">Service</div><b>${o.service_rate}%</b></div>
                    <div class="bg-stone-50 rounded-lg p-2"><div class="text-stone-400">Tutup hari</div><b>${String(o.day_cutoff_hour).padStart(2, '0')}:00</b></div>
                </div>
                <div class="flex gap-2 mt-4"><button class="btn-light flex-1" data-edit="${o.id}"><i class="fas fa-gear"></i>Pengaturan</button>${BO.has('tables') ? `<button class="btn-light flex-1" data-tables="${o.id}"><i class="fas fa-chair"></i>Area & Meja</button>` : ''}</div>
            </div>`).join('')}</div>
            <div id="o-tables"></div>`;
        const add = $('#o-add');
        if (add) add.onclick = () => this.edit();
        $$('[data-edit]').forEach(b => b.onclick = () => this.edit(BO.outlets.find(o => o.id === Number(b.dataset.edit))));
        $$('[data-tables]').forEach(b => b.onclick = () => this.tables(Number(b.dataset.tables)));
        if (BO.outlets.length && BO.has('tables')) this.tables(this.tablesOutlet || BO.outlets[0].id);
    },

    edit(o) {
        o = o || { name: '', code: '', address: '', phone: '', tz_offset_min: 420, day_cutoff_hour: 4, tax_rate: 10, tax_label: 'PBJT', service_rate: 0, tax_on_service: 1, tax_inclusive: 0, cash_rounding: 100, receipt_header: BO.me.tenant.name, receipt_footer: 'Terima kasih', is_active: 1 };
        BO.form({
            title: o.id ? 'Pengaturan ' + o.name : 'Outlet Baru', size: 'max-w-2xl',
            fields: [
                { type: 'section', label: 'Informasi' },
                { name: 'name', label: 'Nama outlet', required: true, value: o.name, maxlength: 60, col: 1 },
                { name: 'code', label: 'Kode', value: o.code, maxlength: 10, col: 1, placeholder: 'mis. JKT-SDM', help: 'Huruf/angka/strip' },
                { name: 'address', label: 'Alamat', value: o.address, maxlength: 200 },
                { name: 'phone', label: 'Telepon', value: o.phone, maxlength: 30, col: 1 },
                { name: 'tz_offset_min', label: 'Zona waktu', type: 'select', value: o.tz_offset_min, col: 1, options: [{ value: 420, label: 'WIB (UTC+7)' }, { value: 480, label: 'WITA (UTC+8)' }, { value: 540, label: 'WIT (UTC+9)' }] },
                { name: 'day_cutoff_hour', label: 'Jam pergantian hari bisnis', type: 'select', value: o.day_cutoff_hour, col: 1, options: [0, 1, 2, 3, 4, 5, 6].map(h => ({ value: h, label: String(h).padStart(2, '0') + ':00' })), help: 'Transaksi sebelum jam ini masuk hari sebelumnya' },
                { type: 'section', label: 'Pajak & service' },
                { name: 'tax_label', label: 'Nama pajak', value: o.tax_label, maxlength: 20, col: 1, help: 'mis. PBJT / PB1' },
                { name: 'tax_rate', label: 'Tarif pajak (%)', type: 'number', step: '0.01', min: 0, max: 20, value: o.tax_rate, col: 1 },
                { name: 'service_rate', label: 'Service charge dine-in (%)', type: 'number', step: '0.01', min: 0, max: 20, value: o.service_rate, col: 1 },
                { name: 'cash_rounding', label: 'Pembulatan tunai', type: 'select', value: o.cash_rounding, col: 1, options: [{ value: 0, label: 'Tanpa pembulatan' }, { value: 100, label: 'Rp 100' }, { value: 500, label: 'Rp 500' }, { value: 1000, label: 'Rp 1.000' }] },
                { name: 'tax_on_service', label: 'Pajak dihitung termasuk service charge', type: 'checkbox', value: o.tax_on_service, col: 1 },
                { name: 'tax_inclusive', label: 'Harga menu sudah termasuk pajak', type: 'checkbox', value: o.tax_inclusive, col: 1 },
                { type: 'section', label: 'Struk' },
                { name: 'receipt_header', label: 'Header struk', type: 'textarea', rows: 2, value: o.receipt_header, col: 1 },
                { name: 'receipt_footer', label: 'Footer struk', type: 'textarea', rows: 2, value: o.receipt_footer, col: 1, help: 'mis. password Wi-Fi, sosial media' },
                ...(BO.isOwner ? [{ name: 'is_active', label: 'Outlet aktif', type: 'checkbox', value: o.is_active }] : [])
            ],
            onSubmit: async d => {
                d.tz_offset_min = Number(d.tz_offset_min); d.day_cutoff_hour = Number(d.day_cutoff_hour); d.cash_rounding = Number(d.cash_rounding);
                if (!d.code) delete d.code;
                if (o.id) await API.patch('/t/outlets/' + o.id, d); else await API.post('/t/outlets', d);
                BO.meta = await API.get('/t/meta');
                toast('Outlet tersimpan', 'success');
                BO.refresh();
            }
        });
    },

    async tables(outletId) {
        this.tablesOutlet = outletId;
        const box = $('#o-tables');
        const [areas, tables] = await Promise.all([API.get('/t/areas?outlet=' + outletId), API.get('/t/tables?outlet=' + outletId)]);
        const act = tables.items.filter(t => t.is_active);
        box.innerHTML = `<div class="card p-4">
            <div class="flex flex-wrap items-center gap-2 mb-4"><h3 class="font-bold">Area & Meja — ${esc(BO.outletName(outletId))}</h3>
            <div class="ml-auto flex gap-2"><button id="a-add" class="btn-light"><i class="fas fa-plus"></i>Area</button><button id="t-bulk" class="btn-light"><i class="fas fa-layer-group"></i>Tambah banyak meja</button><button id="t-add" class="btn-primary"><i class="fas fa-plus"></i>Meja</button></div></div>
            ${areas.items.map(a => `<div class="mb-4"><div class="flex items-center gap-2 mb-2"><b class="text-sm">${esc(a.name)}</b><button class="text-xs text-stone-400 hover:text-brand-600" data-area="${a.id}"><i class="fas fa-pen"></i></button></div>
                <div class="flex flex-wrap gap-2">${act.filter(t => t.area_id === a.id).map(t => `<button data-t="${t.id}" class="w-20 h-16 rounded-xl border-2 border-stone-200 hover:border-brand-500 text-center"><div class="font-bold">${esc(t.name)}</div><div class="text-[11px] text-stone-400"><i class="fas fa-user"></i> ${t.capacity}</div></button>`).join('') || '<span class="text-xs text-stone-400">Belum ada meja</span>'}</div></div>`).join('')}
            ${act.filter(t => !areas.items.some(a => a.id === t.area_id)).length ? `<div><b class="text-sm">Tanpa area</b><div class="flex flex-wrap gap-2 mt-2">${act.filter(t => !areas.items.some(a => a.id === t.area_id)).map(t => `<button data-t="${t.id}" class="w-20 h-16 rounded-xl border-2 border-stone-200 hover:border-brand-500"><b>${esc(t.name)}</b></button>`).join('')}</div></div>` : ''}
        </div>`;
        const areaOpts = areas.items.map(a => ({ value: a.id, label: a.name }));
        const editTable = t => {
            t = t || { name: '', capacity: 4, area_id: areas.items[0] && areas.items[0].id, sort: act.length + 1 };
            BO.form({
                title: t.id ? 'Ubah Meja' : 'Meja Baru',
                fields: [
                    { name: 'name', label: 'Nama/nomor meja', required: true, value: t.name, maxlength: 20, col: 1 },
                    { name: 'capacity', label: 'Kapasitas', type: 'number', min: 1, value: t.capacity, col: 1 },
                    { name: 'area_id', label: 'Area', type: 'select', value: t.area_id, options: areaOpts, col: 1 },
                    { name: 'sort', label: 'Urutan', type: 'number', value: t.sort, col: 1 }
                ],
                extraButtons: t.id ? '<button type="button" id="t-del" class="btn-danger mr-auto"><i class="fas fa-trash"></i></button>' : '',
                onSubmit: async d => {
                    d.area_id = Number(d.area_id) || null;
                    if (t.id) await API.patch('/t/tables/' + t.id, d); else await API.post('/t/tables', { ...d, outlet_id: outletId });
                    this.tables(outletId);
                }
            });
            const del = $('#t-del');
            if (del) del.onclick = async () => { if (await confirmDialog('Hapus meja ' + t.name + '?', '', 'Hapus', true)) { await API.del('/t/tables/' + t.id); closeModal('bo-modal'); this.tables(outletId); } };
        };
        $('#t-add').onclick = () => editTable();
        $$('[data-t]', box).forEach(b => b.onclick = () => editTable(act.find(t => t.id === Number(b.dataset.t))));
        $('#a-add').onclick = () => BO.form({
            title: 'Area Baru', fields: [{ name: 'name', label: 'Nama area', required: true, maxlength: 40, placeholder: 'mis. Outdoor, Lantai 2, VIP' }],
            onSubmit: async d => { await API.post('/t/areas', { ...d, outlet_id: outletId, sort: areas.items.length }); this.tables(outletId); }
        });
        $$('[data-area]', box).forEach(b => b.onclick = () => {
            const a = areas.items.find(x => x.id === Number(b.dataset.area));
            BO.form({
                title: 'Ubah Area', fields: [{ name: 'name', label: 'Nama area', required: true, value: a.name, maxlength: 40 }, { name: 'sort', label: 'Urutan', type: 'number', value: a.sort }],
                extraButtons: '<button type="button" id="a-del" class="btn-danger mr-auto"><i class="fas fa-trash"></i></button>',
                onSubmit: async d => { await API.patch('/t/areas/' + a.id, d); this.tables(outletId); }
            });
            $('#a-del').onclick = async () => { try { await API.del('/t/areas/' + a.id); closeModal('bo-modal'); this.tables(outletId); } catch (e) { errorDialog(e); } };
        });
        $('#t-bulk').onclick = () => BO.form({
            title: 'Tambah Banyak Meja',
            fields: [
                { name: 'prefix', label: 'Awalan', value: 'A', maxlength: 5, col: 1 }, { name: 'start', label: 'Mulai nomor', type: 'number', value: 1, min: 0, col: 1 },
                { name: 'count', label: 'Jumlah meja', type: 'number', value: 10, min: 1, max: 100, col: 1 }, { name: 'capacity', label: 'Kapasitas', type: 'number', value: 4, min: 1, col: 1 },
                { name: 'area_id', label: 'Area', type: 'select', options: areaOpts }
            ],
            onSubmit: async d => {
                for (let i = 0; i < d.count; i++) await API.post('/t/tables', { outlet_id: outletId, area_id: Number(d.area_id) || null, name: d.prefix + (d.start + i), capacity: d.capacity, sort: act.length + i + 1 });
                this.tables(outletId);
            }
        });
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

BO.page('devices', {
    title: 'Perangkat',
    async render(view) {
        const d = await API.get('/t/devices');
        view.innerHTML = `
            <div class="flex flex-wrap items-center gap-2 mb-4"><p class="text-sm text-stone-500 flex-1">Tablet kasir & layar dapur dipasangkan dengan <b>kode 6 digit</b>. Buka aplikasi di tablet → "Perangkat Outlet" → masukkan kode.</p>
            <button id="dv-pair" class="btn-primary"><i class="fas fa-link"></i>Pasangkan perangkat</button></div>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Perangkat</th><th>Jenis</th><th>Outlet</th><th>Kode</th><th>Terakhir aktif</th><th>Status</th><th></th></tr></thead><tbody>
            ${d.devices.map(x => `<tr class="${x.revoked_at ? 'opacity-50' : ''}"><td><b>${esc(x.name)}</b></td><td>${x.type === 'kds' ? '<i class="fas fa-fire-burner mr-1"></i>Layar dapur' : '<i class="fas fa-cash-register mr-1"></i>Kasir'}</td>
                <td>${esc(BO.outletName(x.outlet_id))}</td><td class="font-mono">${esc(x.code)}</td><td>${timeAgo(x.last_seen_at)}</td>
                <td>${x.revoked_at ? '<span class="badge bg-red-50 text-red-600">Dicabut</span>' : '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>'}</td>
                <td class="text-right">${x.revoked_at ? '' : `<button class="btn-light !py-1.5" data-rn="${x.id}"><i class="fas fa-pen"></i></button> <button class="btn-danger !py-1.5" data-rv="${x.id}">Cabut</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-stone-400 py-8">Belum ada perangkat</td></tr>'}</tbody></table></div></div>`;
        $('#dv-pair').onclick = () => BO.form({
            title: 'Pasangkan Perangkat', submitText: 'Buat kode',
            fields: [
                { name: 'outlet_id', label: 'Outlet', type: 'select', options: BO.outlets.filter(o => o.is_active).map(o => ({ value: o.id, label: o.name })) },
                { name: 'type', label: 'Jenis perangkat', type: 'select', options: [{ value: 'pos', label: 'Kasir / Waiter (POS)' }, ...(BO.has('kds') ? [{ value: 'kds', label: 'Layar dapur (KDS)' }] : [])], col: 1 },
                { name: 'name', label: 'Nama perangkat', required: true, value: 'Kasir-01', maxlength: 40, col: 1 }
            ],
            onSubmit: async f => {
                const r = await API.post('/t/pair-codes', { ...f, outlet_id: Number(f.outlet_id) });
                setTimeout(() => SwalBase.fire({ title: 'Kode pairing', html: `<div class="text-5xl font-extrabold tracking-[0.3em] my-4 text-brand-600">${r.code}</div><p class="text-sm">Masukkan di tablet: buka <b>${location.origin}</b> → <b>Perangkat Outlet</b>.<br>Berlaku sampai ${fmtTime(r.expires_at)} (15 menit), sekali pakai.</p>`, confirmButtonText: 'Selesai' }).then(() => BO.refresh()), 100);
            }
        });
        $$('[data-rv]').forEach(b => b.onclick = async () => {
            if (!(await confirmDialog('Cabut akses perangkat ini?', 'Perangkat langsung keluar dan harus dipasangkan ulang. Transaksi offline yang belum tersinkron di perangkat tersebut tidak akan terkirim.', 'Cabut', true))) return;
            await API.post(`/t/devices/${b.dataset.rv}/revoke`);
            toast('Akses perangkat dicabut'); BO.refresh();
        });
        $$('[data-rn]').forEach(b => b.onclick = async () => {
            const dv = d.devices.find(x => x.id === b.dataset.rn);
            const name = await promptDialog('Nama perangkat', { value: dv.name });
            if (name) { await API.patch('/t/devices/' + dv.id, { name }); BO.refresh(); }
        });
    }
});
