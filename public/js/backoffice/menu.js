// Menu & harga: menu master, kategori, grup modifier, override per outlet, harga per channel
BO.page('menu', {
    title: 'Menu & Harga',
    tab: 'menus',
    async render(view) {
        view.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-4"><div id="m-tabs"></div><div id="m-actions" class="ml-auto flex gap-2"></div></div><div id="m-body"></div>`;
        BO.tabs($('#m-tabs'), [['menus', 'Menu'], ['categories', 'Kategori'], ['groups', 'Grup Modifier / Varian'], ['outlet', 'Harga per Outlet'], ['channel', 'Harga per Channel']], this.tab, t => { this.tab = t; this.load(); });
        await this.load();
    },
    async fetchAll() {
        const [menus, cats, groups, ings] = await Promise.all([API.get('/t/menus'), API.get('/t/categories'), API.get('/t/modifier-groups'), API.get('/t/ingredients').catch(() => ({ items: [] }))]);
        this.menus = menus.items; this.cats = cats.items; this.groups = groups.items; this.ings = ings.items.filter(i => i.is_active);
    },
    async load() {
        $('#m-actions').innerHTML = '';
        $('#m-body').innerHTML = '<div class="py-16 text-center text-stone-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        await this.fetchAll();
        this['tab_' + this.tab]($('#m-body'));
    },
    catName(id) { const c = this.cats.find(x => x.id === id); return c ? c.name : '-'; },
    readonly() { return !BO.isOwner ? '<div class="mb-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm"><i class="fas fa-lock mr-1"></i>Menu master hanya bisa diubah pemilik. Anda dapat mengatur harga & ketersediaan per outlet.</div>' : ''; },

    // ---------------------------------------------------------------- MENU
    tab_menus(el) {
        if (BO.isOwner) {
            $('#m-actions').innerHTML = '<button id="m-add" class="btn-primary"><i class="fas fa-plus"></i>Menu baru</button>';
            $('#m-add').onclick = () => this.editMenu();
        }
        const active = this.menus.filter(m => m.is_active);
        el.innerHTML = this.readonly() + `
            <div class="flex gap-2 mb-3"><div class="relative flex-1"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i><input id="m-q" placeholder="Cari menu…" class="input pl-9"></div>
            <select id="m-cat" class="input !w-auto"><option value="">Semua kategori</option>${this.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="m-inactive" class="accent-orange-500">Tampilkan nonaktif</label></div>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Menu</th><th>Kategori</th><th>Stasiun</th><th class="text-right">Harga</th><th>Modifier</th><th>Resep</th><th></th></tr></thead><tbody id="m-rows"></tbody></table></div></div>`;
        const draw = () => {
            const q = $('#m-q').value.toLowerCase(), cat = Number($('#m-cat').value), inact = $('#m-inactive').checked;
            const rows = this.menus.filter(m => (inact || m.is_active) && (!cat || m.category_id === cat) && m.name.toLowerCase().includes(q));
            $('#m-rows').innerHTML = rows.map(m => `<tr class="${m.is_active ? '' : 'opacity-50'}">
                <td><div class="flex items-center gap-3">${m.image_id ? `<img src="/api/f/${BO.me.tenant.id}/${m.image_id}" class="w-10 h-10 rounded-lg object-cover">` : `<div class="w-10 h-10 rounded-lg grid place-items-center text-white font-bold" style="background:${esc(m.color || (this.cats.find(c => c.id === m.category_id) || {}).color || '#a8a29e')}">${esc(m.name[0])}</div>`}
                <div><b>${esc(m.name)}</b>${m.sku ? `<div class="text-xs text-stone-400">${esc(m.sku)}</div>` : ''}</div></div></td>
                <td>${esc(this.catName(m.category_id))}</td><td>${esc(m.station || '(kategori)')}</td><td class="text-right font-semibold whitespace-nowrap">${rp(m.price)}</td>
                <td class="text-xs text-stone-500">${esc(m.modifier_group_ids.map(id => (this.groups.find(g => g.id === id) || {}).name).filter(Boolean).join(', ') || '-')}</td>
                <td>${m.recipe.length && BO.has('inventory') ? `<span class="badge bg-emerald-50 text-emerald-700">${m.recipe.length} bahan</span>` : '<span class="text-xs text-stone-400">-</span>'}</td>
                <td class="text-right">${BO.isOwner ? `<button class="btn-light !py-1.5" data-edit="${m.id}"><i class="fas fa-pen"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-stone-400 py-8">Belum ada menu</td></tr>';
            $$('[data-edit]').forEach(b => b.onclick = () => this.editMenu(this.menus.find(m => m.id === Number(b.dataset.edit))));
        };
        $('#m-q').oninput = draw; $('#m-cat').onchange = draw; $('#m-inactive').onchange = draw;
        draw();
        if (!active.length && BO.isOwner) toast('Mulai dengan menambah menu pertama Anda');
    },

    recipeEditor(lines) {
        const opts = this.ings.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('');
        const row = l => `<div class="flex gap-2 recipe-row"><select class="input flex-1" data-ing><option value="">— bahan —</option>${opts}</select><input type="number" step="any" min="0" class="input !w-28" data-qty placeholder="jumlah" value="${l ? l.qty : ''}"><button type="button" class="btn-light" data-del><i class="fas fa-xmark"></i></button></div>`;
        return {
            html: `<label class="label">Resep (pemakaian bahan per porsi)</label><div id="recipe-rows" class="space-y-2">${(lines || []).map(row).join('')}</div>
                <button type="button" id="recipe-add" class="btn-light mt-2 !py-1.5 text-xs" ${this.ings.length ? '' : 'disabled'}><i class="fas fa-plus"></i>Tambah bahan</button>
                ${this.ings.length ? '' : '<p class="text-[11px] text-stone-400 mt-1">Tambahkan bahan baku di menu Inventori untuk memakai resep.</p>'}`,
            bind: () => {
                $$('#recipe-rows .recipe-row').forEach((r, i) => { r.querySelector('[data-ing]').value = lines[i].ingredient_id; });
                const wire = () => $$('#recipe-rows [data-del]').forEach(b => b.onclick = () => b.closest('.recipe-row').remove());
                $('#recipe-add').onclick = () => { $('#recipe-rows').insertAdjacentHTML('beforeend', row(null)); wire(); };
                wire();
            },
            read: () => $$('#recipe-rows .recipe-row').map(r => ({ ingredient_id: Number(r.querySelector('[data-ing]').value), qty: Number(r.querySelector('[data-qty]').value) })).filter(x => x.ingredient_id && x.qty > 0)
        };
    },

    editMenu(m) {
        m = m || { name: '', price: 0, category_id: this.cats[0] && this.cats[0].id, taxable: 1, is_active: 1, modifier_group_ids: [], recipe: [], station: '', sku: '', image_id: null, sort: 0 };
        const stations = BO.meta.settings.stations || ['Dapur', 'Bar'];
        const recipe = this.recipeEditor(m.recipe);
        let imageId = m.image_id;
        const photo = `<label class="label">Foto (opsional)</label><div class="flex items-center gap-3"><div id="ph-prev" class="w-20 h-20 rounded-xl bg-stone-100 grid place-items-center overflow-hidden">${imageId ? `<img src="/api/f/${BO.me.tenant.id}/${imageId}" class="w-full h-full object-cover">` : '<i class="fas fa-image text-stone-300 text-2xl"></i>'}</div>
            <div class="space-y-1"><input type="file" id="ph-file" accept="image/*" class="text-xs"><button type="button" id="ph-del" class="text-xs text-red-500 ${imageId ? '' : 'hidden'}">Hapus foto</button><p class="text-[11px] text-stone-400">Dikompres otomatis (WebP, maks. 600px)</p></div></div>`;
        BO.form({
            title: m.id ? 'Ubah Menu' : 'Menu Baru', size: 'max-w-2xl',
            fields: [
                { name: 'name', label: 'Nama menu', required: true, value: m.name, maxlength: 80, col: 1 },
                { name: 'category_id', label: 'Kategori', type: 'select', value: m.category_id, options: this.cats.filter(c => c.is_active).map(c => ({ value: c.id, label: c.name })), col: 1 },
                { name: 'price', label: 'Harga dasar', type: 'money', required: true, value: m.price, col: 1 },
                { name: 'sku', label: 'SKU / kode', value: m.sku, maxlength: 40, col: 1 },
                { name: 'station', label: 'Stasiun produksi', type: 'select', value: m.station || '', options: [{ value: '', label: '(ikut kategori)' }, ...stations.map(s => ({ value: s, label: s }))], col: 1 },
                { name: 'sort', label: 'Urutan', type: 'number', value: m.sort, col: 1 },
                { name: 'description', label: 'Deskripsi', type: 'textarea', value: m.description || '', rows: 2 },
                { name: 'modifier_group_ids', label: 'Grup modifier / varian', type: 'checks', numeric: true, value: m.modifier_group_ids, options: this.groups.filter(g => g.is_active).map(g => ({ value: g.id, label: g.name })) },
                { type: 'html', html: photo },
                // Inventori nonaktif: editor resep disembunyikan, resep lama tetap tersimpan
                { type: 'html', html: BO.has('inventory') ? recipe.html : `<div class="hidden">${recipe.html}</div>` },
                { name: 'taxable', label: 'Kena pajak', type: 'checkbox', value: m.taxable, col: 1 },
                { name: 'is_active', label: 'Aktif dijual', type: 'checkbox', value: m.is_active, col: 1 }
            ],
            extraButtons: m.id ? '<button type="button" id="m-del" class="btn-danger mr-auto"><i class="fas fa-trash"></i></button>' : '',
            onSubmit: async d => {
                const body = { ...d, category_id: Number(d.category_id) || null, recipe: recipe.read(), image_id: imageId };
                if (m.id) await API.patch('/t/menus/' + m.id, body); else await API.post('/t/menus', body);
                toast('Menu tersimpan', 'success');
                this.load();
            }
        });
        recipe.bind();
        $('#ph-file').onchange = async e => {
            const f = e.target.files[0];
            if (!f) return;
            try {
                const img = await compressImage(f);
                if (img.size > 300000) throw new Error('Gambar masih terlalu besar setelah dikompres');
                const res = await API.post('/t/files', { mime: img.mime, data: img.data });
                imageId = res.id;
                $('#ph-prev').innerHTML = `<img src="${res.url}" class="w-full h-full object-cover">`;
                $('#ph-del').classList.remove('hidden');
            } catch (err) { errorDialog(err, 'Gagal unggah foto'); }
        };
        $('#ph-del').onclick = () => { imageId = null; $('#ph-prev').innerHTML = '<i class="fas fa-image text-stone-300 text-2xl"></i>'; $('#ph-del').classList.add('hidden'); };
        const del = $('#m-del');
        if (del) del.onclick = async () => {
            if (!(await confirmDialog('Nonaktifkan menu ini?', 'Menu tidak akan tampil di kasir. Riwayat penjualan tetap tersimpan.', 'Nonaktifkan', true))) return;
            await API.del('/t/menus/' + m.id);
            closeModal('bo-modal'); toast('Menu dinonaktifkan'); this.load();
        };
    },

    // ---------------------------------------------------------------- KATEGORI
    tab_categories(el) {
        if (BO.isOwner) { $('#m-actions').innerHTML = '<button id="m-add" class="btn-primary"><i class="fas fa-plus"></i>Kategori</button>'; $('#m-add').onclick = () => this.editCat(); }
        el.innerHTML = this.readonly() + `<div class="card overflow-hidden"><table class="tbl"><thead><tr><th>Kategori</th><th>Stasiun</th><th>Urutan</th><th>Jumlah menu</th><th>Status</th><th></th></tr></thead><tbody>${this.cats.map(c => `<tr>
            <td><span class="inline-block w-3 h-3 rounded-full mr-2 align-middle" style="background:${esc(c.color)}"></span><b>${esc(c.name)}</b></td><td>${esc(c.station)}</td><td>${c.sort}</td>
            <td>${this.menus.filter(m => m.category_id === c.id && m.is_active).length}</td><td>${c.is_active ? '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>' : '<span class="badge bg-stone-100">Nonaktif</span>'}</td>
            <td class="text-right">${BO.isOwner ? `<button class="btn-light !py-1.5" data-c="${c.id}"><i class="fas fa-pen"></i></button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
        $$('[data-c]').forEach(b => b.onclick = () => this.editCat(this.cats.find(c => c.id === Number(b.dataset.c))));
    },
    editCat(c) {
        c = c || { name: '', color: '#f97316', station: 'Dapur', sort: this.cats.length, is_active: 1 };
        const stations = BO.meta.settings.stations || ['Dapur', 'Bar'];
        BO.form({
            title: c.id ? 'Ubah Kategori' : 'Kategori Baru',
            fields: [
                { name: 'name', label: 'Nama kategori', required: true, value: c.name, maxlength: 60 },
                { name: 'station', label: 'Stasiun produksi default', type: 'select', value: c.station, options: stations.map(s => ({ value: s, label: s })), col: 1, help: 'Menentukan tiket dapur/bar' },
                { name: 'color', label: 'Warna', type: 'color', value: c.color, col: 1 },
                { name: 'sort', label: 'Urutan', type: 'number', value: c.sort, col: 1 },
                { name: 'is_active', label: 'Aktif', type: 'checkbox', value: c.is_active, col: 1 }
            ],
            onSubmit: async d => {
                if (c.id) await API.patch('/t/categories/' + c.id, d); else await API.post('/t/categories', d);
                BO.meta = await API.get('/t/meta');
                this.load();
            }
        });
    },

    // ---------------------------------------------------------------- GRUP MODIFIER
    tab_groups(el) {
        if (BO.isOwner) { $('#m-actions').innerHTML = '<button id="m-add" class="btn-primary"><i class="fas fa-plus"></i>Grup</button>'; $('#m-add').onclick = () => this.editGroup(); }
        el.innerHTML = this.readonly() + `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Varian (mis. Ukuran: Regular/Large) = grup dengan minimal 1 & maksimal 1 pilihan. Modifier (mis. Topping) = grup opsional dengan maksimal beberapa pilihan.</p>
            <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">${this.groups.map(g => `<div class="card p-4 ${g.is_active ? '' : 'opacity-50'}">
                <div class="flex items-start justify-between"><div><b>${esc(g.name)}</b><div class="text-xs text-stone-500">${g.min_select > 0 ? 'Wajib' : 'Opsional'} · pilih ${g.min_select}–${g.max_select}</div></div>${BO.isOwner ? `<button class="btn-light !py-1.5" data-g="${g.id}"><i class="fas fa-pen"></i></button>` : ''}</div>
                <div class="flex flex-wrap gap-1 mt-3">${g.options.map(o => `<span class="badge bg-stone-100 text-stone-700">${esc(o.name)}${o.price ? ' +' + rp(o.price).replace('Rp ', '') : ''}${o.recipe && o.recipe.length ? ' <i class="fas fa-flask ml-1 text-emerald-600"></i>' : ''}</span>`).join('')}</div>
                <div class="text-xs text-stone-400 mt-2">Dipakai ${this.menus.filter(m => m.modifier_group_ids.includes(g.id)).length} menu</div></div>`).join('') || BO.empty('fa-sliders', 'Belum ada grup modifier')}</div>`;
        $$('[data-g]').forEach(b => b.onclick = () => this.editGroup(this.groups.find(g => g.id === Number(b.dataset.g))));
    },
    editGroup(g) {
        g = g || { name: '', min_select: 0, max_select: 1, options: [{ name: '', price: 0 }], is_active: 1 };
        const ingOpts = `<option value="">— bahan (opsional) —</option>` + this.ings.map(i => `<option value="${i.id}">${esc(i.name)} (${esc(i.unit)})</option>`).join('');
        const row = o => `<div class="grid grid-cols-12 gap-2 opt-row" data-id="${esc(o.id || '')}"><input class="input col-span-4" data-name placeholder="Nama pilihan" value="${esc(o.name)}"><input type="number" min="0" class="input col-span-3" data-price placeholder="+harga" value="${o.price || 0}">
            <select class="input col-span-3" data-ing>${ingOpts}</select><input type="number" step="any" min="0" class="input col-span-1 !px-1" data-qty placeholder="qty" value="${o.recipe && o.recipe[0] ? o.recipe[0].qty : ''}"><button type="button" class="btn-light col-span-1 !px-0" data-del><i class="fas fa-xmark"></i></button></div>`;
        BO.form({
            title: g.id ? 'Ubah Grup Modifier' : 'Grup Modifier Baru', size: 'max-w-2xl',
            fields: [
                { name: 'name', label: 'Nama grup', required: true, value: g.name, maxlength: 60, placeholder: 'mis. Ukuran, Level Pedas, Topping' },
                { name: 'min_select', label: 'Minimal pilih', type: 'number', min: 0, max: 20, value: g.min_select, col: 1, help: '0 = opsional, 1 = wajib' },
                { name: 'max_select', label: 'Maksimal pilih', type: 'number', min: 1, max: 20, value: g.max_select, col: 1 },
                { type: 'html', html: `<label class="label">Pilihan (harga tambahan & pemakaian bahan opsional)</label><div id="opt-rows" class="space-y-2">${g.options.map(row).join('')}</div><button type="button" id="opt-add" class="btn-light mt-2 !py-1.5 text-xs"><i class="fas fa-plus"></i>Tambah pilihan</button>` },
                { name: 'is_active', label: 'Aktif', type: 'checkbox', value: g.is_active }
            ],
            onSubmit: async d => {
                d.options = $$('#opt-rows .opt-row').map(r => {
                    const ing = Number(r.querySelector('[data-ing]').value), qty = Number(r.querySelector('[data-qty]').value);
                    return { id: r.dataset.id || undefined, name: r.querySelector('[data-name]').value, price: Number(r.querySelector('[data-price]').value) || 0, recipe: ing && qty > 0 ? [{ ingredient_id: ing, qty }] : [] };
                }).filter(o => o.name.trim());
                if (g.id) await API.patch('/t/modifier-groups/' + g.id, d); else await API.post('/t/modifier-groups', d);
                this.load();
            }
        });
        $$('#opt-rows .opt-row').forEach((r, i) => { const o = g.options[i]; if (o.recipe && o.recipe[0]) r.querySelector('[data-ing]').value = o.recipe[0].ingredient_id; });
        const wire = () => $$('#opt-rows [data-del]').forEach(b => b.onclick = () => b.closest('.opt-row').remove());
        $('#opt-add').onclick = () => { $('#opt-rows').insertAdjacentHTML('beforeend', row({ name: '', price: 0 })); wire(); };
        wire();
    },

    // ---------------------------------------------------------------- HARGA PER OUTLET
    async tab_outlet(el) {
        const outletId = this.outletSel || BO.singleOutlet();
        this.outletSel = outletId;
        const om = (await API.get('/t/outlet-menus?outlet=' + outletId)).items;
        const map = Object.fromEntries(om.map(r => [r.menu_id, r]));
        $('#m-actions').innerHTML = '<button id="m-save" class="btn-primary"><i class="fas fa-floppy-disk"></i>Simpan perubahan</button>';
        el.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-3"><label class="text-sm">Outlet</label><select id="om-outlet" class="input !w-auto">${BO.outlets.map(o => `<option value="${o.id}" ${o.id === outletId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
            <span class="text-sm text-stone-500">Kosongkan harga untuk memakai harga dasar. Matikan "Dijual" jika menu tidak tersedia di outlet ini.</span></div>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Menu</th><th>Kategori</th><th class="text-right">Harga dasar</th><th>Harga outlet</th><th>Dijual</th></tr></thead><tbody>
            ${this.menus.filter(m => m.is_active).map(m => { const r = map[m.id] || {}; return `<tr data-m="${m.id}"><td><b>${esc(m.name)}</b></td><td>${esc(this.catName(m.category_id))}</td><td class="text-right text-stone-500">${rp(m.price)}</td>
                <td><input type="number" min="0" class="input !w-36 !py-1.5" data-price placeholder="${m.price}" value="${r.price ?? ''}"></td>
                <td><input type="checkbox" data-av class="accent-orange-500 w-5 h-5" ${r.is_available === 0 ? '' : 'checked'}></td></tr>`; }).join('')}</tbody></table></div></div>`;
        $('#om-outlet').onchange = e => { this.outletSel = Number(e.target.value); this.tab_outlet(el); };
        $('#m-save').onclick = async () => {
            const items = $$('tr[data-m]', el).map(tr => ({ menu_id: Number(tr.dataset.m), price: tr.querySelector('[data-price]').value === '' ? null : Number(tr.querySelector('[data-price]').value), is_available: tr.querySelector('[data-av]').checked }));
            try { await API.put('/t/outlet-menus', { outlet_id: outletId, items }); toast('Harga outlet tersimpan', 'success'); } catch (e) { errorDialog(e); }
        };
    },

    // ---------------------------------------------------------------- HARGA PER CHANNEL
    async tab_channel(el) {
        const chans = BO.meta.channels.filter(c => c.code !== 'dine_in' && c.code !== 'take_away');
        if (!chans.length) { el.innerHTML = BO.empty('fa-motorcycle', 'Belum ada channel online/delivery. Atur di Pengaturan → Channel.'); return; }
        const code = this.channelSel && chans.some(c => c.code === this.channelSel) ? this.channelSel : chans[0].code;
        this.channelSel = code;
        const ch = chans.find(c => c.code === code);
        const cp = (await API.get('/t/channel-prices')).items.filter(r => r.channel === code);
        const map = Object.fromEntries(cp.map(r => [r.menu_id, r.price]));
        if (BO.isOwner) $('#m-actions').innerHTML = '<button id="m-save" class="btn-primary"><i class="fas fa-floppy-disk"></i>Simpan</button>';
        el.innerHTML = this.readonly() + `<div class="flex flex-wrap items-center gap-2 mb-3"><label class="text-sm">Channel</label><select id="cp-ch" class="input !w-auto">${chans.map(c => `<option value="${c.code}" ${c.code === code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
            <span class="text-sm text-stone-500">Markup otomatis <b>${ch.markup_pct}%</b>, komisi <b>${ch.commission_pct}%</b>. Isi harga khusus untuk menimpa markup.</span></div>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Menu</th><th class="text-right">Harga dasar</th><th class="text-right">Harga markup</th><th>Harga khusus</th></tr></thead><tbody>
            ${this.menus.filter(m => m.is_active).map(m => `<tr data-m="${m.id}"><td><b>${esc(m.name)}</b></td><td class="text-right text-stone-500">${rp(m.price)}</td><td class="text-right">${rp(Pricing.basePrice(m, null, ch, null))}</td>
                <td><input type="number" min="0" class="input !w-36 !py-1.5" data-price value="${map[m.id] ?? ''}" ${BO.isOwner ? '' : 'disabled'}></td></tr>`).join('')}</tbody></table></div></div>`;
        $('#cp-ch').onchange = e => { this.channelSel = e.target.value; this.tab_channel(el); };
        const save = $('#m-save');
        if (save) save.onclick = async () => {
            const items = $$('tr[data-m]', el).map(tr => ({ menu_id: Number(tr.dataset.m), price: tr.querySelector('[data-price]').value === '' ? null : Number(tr.querySelector('[data-price]').value) }));
            try { await API.put('/t/channel-prices', { channel: code, items }); toast('Harga channel tersimpan', 'success'); } catch (e) { errorDialog(e); }
        };
    }
});
