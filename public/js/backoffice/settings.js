// Pengaturan: usaha, channel, metode bayar, aturan, langganan, backup, akun
BO.page('settings', {
    title: 'Pengaturan',
    async render(view) {
        const [s, lic] = await Promise.all([API.get('/t/settings'), API.get('/t/license').catch(() => null)]);
        const owner = BO.isOwner;
        const ro = owner ? '' : 'disabled';
        view.innerHTML = `<div class="grid xl:grid-cols-2 gap-4">
            <div class="card p-5 space-y-3">
                <h3 class="font-bold"><i class="fas fa-building text-brand-500 mr-2"></i>Usaha</h3>
                <div><label class="label">Nama usaha / brand</label><input id="st-name" class="input" value="${esc(BO.me.tenant.name)}" ${ro}></div>
                ${owner ? '<button id="st-name-save" class="btn-primary">Simpan</button>' : ''}
            </div>

            <div class="card p-5 space-y-3">
                <h3 class="font-bold"><i class="fas fa-id-card text-brand-500 mr-2"></i>Langganan</h3>
                ${lic ? `<div class="grid grid-cols-2 gap-2 text-sm"><span class="text-stone-500">Status</span><b>${esc(licenseText(lic.license))}</b>
                    <span class="text-stone-500">Paket</span><b>${lic.tenant.outlet_packs || 0} paket × ${lic.outlets_per_pack} outlet</b>
                    <span class="text-stone-500">Maks. outlet aktif</span><b>${lic.license.max_outlets}</b>
                    <span class="text-stone-500">Trial sampai</span><b>${fmtDate(lic.tenant.trial_ends_at)}</b>
                    ${lic.tenant.paid_until ? `<span class="text-stone-500">Aktif sampai</span><b>${fmtDate(lic.tenant.paid_until)}</b>` : ''}</div>
                    <p class="text-xs text-stone-500">Perpanjangan & penambahan paket dilakukan oleh admin RasaPOS. Hubungi admin dengan menyebut ID usaha <b>#${lic.tenant.id}</b>.</p>
                    <details class="text-xs"><summary class="cursor-pointer text-stone-500">Riwayat langganan</summary><div class="mt-2 space-y-1">${lic.logs.map(l => `<div><span class="text-stone-400">${fmtDate(l.created_at)}</span> ${esc(l.detail || l.action)}</div>`).join('')}</div></details>` : '<p class="text-sm text-stone-500">Hanya pemilik yang dapat melihat detail langganan.</p>'}
            </div>

            <div class="card p-5 xl:col-span-2">
                <div class="flex items-center mb-3"><h3 class="font-bold flex-1"><i class="fas fa-motorcycle text-brand-500 mr-2"></i>Channel Penjualan</h3>${owner ? '<button id="ch-add" class="btn-light !py-1.5 text-xs"><i class="fas fa-plus"></i>Channel</button>' : ''}</div>
                <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Kode</th><th>Nama</th><th>Tipe</th><th>Markup harga %</th><th>Komisi %</th><th>Aktif</th></tr></thead><tbody id="ch-rows"></tbody></table></div>
            </div>

            <div class="card p-5">
                <div class="flex items-center mb-3"><h3 class="font-bold flex-1"><i class="fas fa-wallet text-brand-500 mr-2"></i>Metode Pembayaran</h3>${owner ? '<button id="pm-add" class="btn-light !py-1.5 text-xs"><i class="fas fa-plus"></i>Metode</button>' : ''}</div>
                <table class="tbl"><thead><tr><th>Kode</th><th>Nama</th><th>Jenis</th><th>Aktif</th></tr></thead><tbody id="pm-rows"></tbody></table>
            </div>

            <div class="card p-5 space-y-3">
                <h3 class="font-bold"><i class="fas fa-sliders text-brand-500 mr-2"></i>Aturan Kasir</h3>
                <div><label class="label">Batas diskon manual tanpa persetujuan manager (%)</label><input id="st-disc" type="number" min="0" max="100" class="input" value="${s.settings.discount_limit_pct}" ${ro}></div>
                <div><label class="label">Stasiun produksi (pisahkan dengan koma)</label><input id="st-stations" class="input" value="${esc(s.settings.stations.join(', '))}" ${ro}><p class="text-[11px] text-stone-400 mt-1">Tiket dapur dipecah per stasiun, mis. Dapur, Bar, Pastry</p></div>
                <label class="flex items-center gap-2 text-sm"><input id="st-loy" type="checkbox" class="accent-orange-500 w-4 h-4" ${s.settings.loyalty.enabled ? 'checked' : ''} ${ro}>Aktifkan poin pelanggan</label>
                <div><label class="label">1 poin setiap belanja (Rp)</label><input id="st-loy-amt" type="number" min="1000" class="input" value="${s.settings.loyalty.amount_per_point}" ${ro}></div>
            </div>
            ${owner ? '<div class="xl:col-span-2 flex justify-end"><button id="st-save" class="btn-primary"><i class="fas fa-floppy-disk"></i>Simpan channel, pembayaran & aturan</button></div>' : ''}

            <div class="card p-5 space-y-3">
                <h3 class="font-bold"><i class="fas fa-database text-brand-500 mr-2"></i>Backup Data</h3>
                <p class="text-sm text-stone-500">Unduh seluruh data usaha (menu, transaksi, stok, dll.) dalam format JSON. Simpan di tempat aman.</p>
                ${owner ? '<button id="st-export" class="btn-outline"><i class="fas fa-download"></i>Unduh backup</button>' : '<p class="text-xs text-stone-400">Hanya pemilik.</p>'}
            </div>

            <div class="card p-5 space-y-3">
                <h3 class="font-bold"><i class="fas fa-user-lock text-brand-500 mr-2"></i>Akun Saya</h3>
                <div class="text-sm"><b>${esc(BO.me.user.name)}</b> · ${esc(BO.me.user.email)}</div>
                <button id="st-pass" class="btn-outline"><i class="fas fa-key"></i>Ganti password</button>
            </div>
        </div>`;

        let channels = s.channels.map(c => ({ ...c }));
        let methods = s.payment_methods.map(m => ({ ...m }));
        const drawCh = () => {
            $('#ch-rows').innerHTML = channels.map((c, i) => `<tr><td class="font-mono text-xs">${esc(c.code)}</td><td><input class="input !py-1.5" data-ch="${i}" data-k="name" value="${esc(c.name)}" ${ro}></td>
                <td><select class="input !py-1.5" data-ch="${i}" data-k="type" ${ro}>${[['dine_in', 'Dine-in'], ['take_away', 'Take away'], ['delivery', 'Delivery'], ['online', 'Online (ojol)']].map(t => `<option value="${t[0]}" ${c.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></td>
                <td><input type="number" min="0" max="100" class="input !py-1.5 !w-24" data-ch="${i}" data-k="markup_pct" value="${c.markup_pct}" ${ro}></td>
                <td><input type="number" min="0" max="100" class="input !py-1.5 !w-24" data-ch="${i}" data-k="commission_pct" value="${c.commission_pct}" ${ro}></td>
                <td><input type="checkbox" class="accent-orange-500 w-5 h-5" data-ch="${i}" data-k="active" ${c.active ? 'checked' : ''} ${ro}></td></tr>`).join('');
            $$('[data-ch]').forEach(el => el.onchange = () => { const c = channels[el.dataset.ch]; c[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; });
        };
        const drawPm = () => {
            $('#pm-rows').innerHTML = methods.map((m, i) => `<tr><td class="font-mono text-xs">${esc(m.code)}</td><td><input class="input !py-1.5" data-pm="${i}" data-k="name" value="${esc(m.name)}" ${ro}></td>
                <td><select class="input !py-1.5" data-pm="${i}" data-k="type" ${ro}><option value="cash" ${m.type === 'cash' ? 'selected' : ''}>Tunai</option><option value="noncash" ${m.type !== 'cash' ? 'selected' : ''}>Non-tunai</option></select></td>
                <td><input type="checkbox" class="accent-orange-500 w-5 h-5" data-pm="${i}" data-k="active" ${m.active ? 'checked' : ''} ${ro}></td></tr>`).join('');
            $$('[data-pm]').forEach(el => el.onchange = () => { const m = methods[el.dataset.pm]; m[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
        };
        drawCh(); drawPm();

        if (!owner) { $('#st-pass').onclick = () => this.changePassword(); return; }
        $('#st-name-save').onclick = async () => {
            try { await API.patch('/t/tenant', { name: $('#st-name').value }); BO.me.tenant.name = $('#st-name').value; $('#tenant-name').textContent = BO.me.tenant.name; toast('Tersimpan', 'success'); } catch (e) { errorDialog(e); }
        };
        $('#ch-add').onclick = async () => {
            const name = await promptDialog('Nama channel baru', { placeholder: 'mis. Maxim Food' });
            if (!name) return;
            channels.push({ code: name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'ch' + channels.length, name, type: 'online', markup_pct: 0, commission_pct: 0, active: true });
            drawCh();
        };
        $('#pm-add').onclick = async () => {
            const name = await promptDialog('Nama metode pembayaran', { placeholder: 'mis. DANA, EDC Mandiri' });
            if (!name) return;
            methods.push({ code: name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'pm' + methods.length, name, type: 'noncash', active: true });
            drawPm();
        };
        $('#st-save').onclick = async () => {
            try {
                const res = await API.put('/t/settings', {
                    channels, payment_methods: methods,
                    settings: { discount_limit_pct: Number($('#st-disc').value), stations: $('#st-stations').value.split(',').map(x => x.trim()).filter(Boolean), loyalty: { enabled: $('#st-loy').checked, amount_per_point: Number($('#st-loy-amt').value) } }
                });
                Object.assign(BO.meta, res);
                toast('Pengaturan tersimpan', 'success');
            } catch (e) { errorDialog(e); }
        };
        $('#st-export').onclick = async () => {
            try { const blob = await API.get('/t/export'); downloadBlob(`rasapos-backup-${localDate()}.json`, blob instanceof Blob ? blob : new Blob([JSON.stringify(blob)], { type: 'application/json' })); } catch (e) { errorDialog(e); }
        };
        $('#st-pass').onclick = () => this.changePassword();
    },
    changePassword() {
        BO.form({
            title: 'Ganti Password',
            fields: [{ name: 'old_password', label: 'Password lama', type: 'password', required: true }, { name: 'new_password', label: 'Password baru (min. 8)', type: 'password', required: true }],
            onSubmit: async d => { await API.post('/auth/change-password', d); toast('Password diganti', 'success'); }
        });
    }
});
