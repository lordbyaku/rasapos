// Superadmin: daftar tenant, status lisensi, perpanjang langganan, paket outlet, trial, suspend, reset password
const STATE_TONE = { trial: 'bg-sky-50 text-sky-700', active: 'bg-emerald-50 text-emerald-700', grace: 'bg-amber-50 text-amber-700', expired: 'bg-red-50 text-red-600', suspended: 'bg-stone-200 text-stone-600' };
const STATE_LABEL = { trial: 'Trial', active: 'Aktif', grace: 'Masa tenggang', expired: 'Kedaluwarsa', suspended: 'Ditangguhkan' };

const Admin = {
    data: null,
    async start() {
        const u = Auth.user;
        if (!u) { location.href = '/'; return; }
        API.mode = 'user';
        API.onAuthLost = () => { Auth.user = null; location.href = '/'; };
        $('#a-user').textContent = u.user.email;
        if (!u.tenant) $('#a-bo').classList.add('hidden');
        $('#a-logout').onclick = () => { Auth.logoutUser(); location.href = '/'; };
        $$('#a-drawer [data-close]').forEach(b => b.onclick = () => $('#a-drawer').classList.add('hidden'));
        $$('.a-tab').forEach(b => b.onclick = () => this.tab(b.dataset.tab));
        $('#a-q').oninput = () => this.renderRows();
        $('#a-state').onchange = () => this.renderRows();
        try { await this.load(); } catch (e) {
            document.querySelector('#tab-tenants').innerHTML = `<div class="card p-8 text-center text-red-600">${esc(e.status === 403 ? 'Akun ini bukan superadmin. Tambahkan email ke variabel SUPERADMIN_EMAILS.' : e.message)}</div>`;
        }
    },
    tab(name) {
        $$('.a-tab').forEach(b => {
            const on = b.dataset.tab === name;
            b.classList.toggle('border-brand-500', on); b.classList.toggle('text-brand-600', on);
            b.classList.toggle('border-transparent', !on); b.classList.toggle('text-stone-500', !on);
        });
        $('#tab-tenants').classList.toggle('hidden', name !== 'tenants');
        $('#tab-ai').classList.toggle('hidden', name !== 'ai');
        if (name === 'ai') AdminAI.load().catch(errorDialog);
    },
    async load() {
        this.data = await API.get('/admin/overview');
        const s = this.data.summary;
        const card = (l, v, tone = '') => `<div class="card p-4"><div class="text-xs text-stone-500">${l}</div><div class="text-2xl font-extrabold ${tone}">${v}</div></div>`;
        $('#a-summary').innerHTML = card('Tenant', s.tenants) + card('Trial', s.trial, 'text-sky-600') + card('Aktif', s.active, 'text-emerald-600') + card('Tenggang', s.grace, 'text-amber-600') + card('Kedaluwarsa', s.expired, 'text-red-600') + card('Trx 30 hari', s.trx_30d.toLocaleString('id-ID')) + card('Omzet 30 hari', rp(s.sales_30d));
        this.renderRows();
    },
    offFeatures(t) {
        const off = Features.LIST.filter(f => !t.features[f.key]);
        return off.length ? `<div class="text-[11px] text-amber-700"><i class="fas fa-toggle-off mr-1"></i>Nonaktif: ${off.map(f => esc(f.label)).join(', ')}</div>` : '';
    },
    renderRows() {
        const q = $('#a-q').value.toLowerCase(), st = $('#a-state').value;
        const rows = this.data.tenants.filter(t => (!st || t.license.state === st) && (!q || t.name.toLowerCase().includes(q) || (t.owner && t.owner.email.toLowerCase().includes(q))));
        $('#a-rows').innerHTML = rows.map(t => `<tr class="cursor-pointer hover:bg-stone-50" data-t="${t.id}">
            <td class="text-stone-400">${t.id}</td><td><b>${esc(t.name)}</b><div class="text-xs text-stone-400">${esc(t.phone || '')} · daftar ${fmtDate(t.created_at)}</div>${this.offFeatures(t)}</td>
            <td>${t.owner ? `${esc(t.owner.name)}<div class="text-xs text-stone-400">${esc(t.owner.email)}</div>` : '-'}</td>
            <td><span class="badge ${STATE_TONE[t.license.state]}">${STATE_LABEL[t.license.state]}</span></td><td>${fmtDate(t.license.until)}</td>
            <td class="text-right">${t.outlet_packs}</td><td class="text-right">${t.outlets}/${t.license.max_outlets}</td><td class="text-right">${t.devices}</td>
            <td class="text-right">${t.trx_30d.toLocaleString('id-ID')}</td><td class="text-right">${rp(t.sales_30d)}</td><td><i class="fas fa-chevron-right text-stone-300"></i></td></tr>`).join('') || '<tr><td colspan="11" class="text-center text-stone-400 py-8">Tidak ada tenant</td></tr>';
        $$('#a-rows [data-t]').forEach(tr => tr.onclick = () => this.open(Number(tr.dataset.t)));
    },
    async open(id) {
        const d = await API.get('/admin/tenants/' + id);
        const t = d.tenant;
        $('#a-d-title').textContent = `#${t.id} ${t.name}`;
        $('#a-d-body').innerHTML = `
            <div class="grid grid-cols-2 gap-y-1.5"><span class="text-stone-500">Status</span><span><span class="badge ${STATE_TONE[t.license.state]}">${STATE_LABEL[t.license.state]}</span></span>
                <span class="text-stone-500">Trial sampai</span><b>${fmtDate(t.trial_ends_at)}</b><span class="text-stone-500">Aktif sampai</span><b>${t.paid_until ? fmtDate(t.paid_until) : '-'}</b>
                <span class="text-stone-500">Paket</span><b>${t.outlet_packs} paket (maks. ${t.license.max_outlets} outlet)</b></div>
            <div class="grid grid-cols-2 gap-2 mt-4">
                <button data-a="extend" class="btn-primary"><i class="fas fa-calendar-plus"></i>Perpanjang langganan</button>
                <button data-a="packs" class="btn-light"><i class="fas fa-layer-group"></i>Ubah jumlah paket</button>
                <button data-a="extend_trial" class="btn-light"><i class="fas fa-hourglass-half"></i>Perpanjang trial</button>
                ${t.status === 'suspended' ? '<button data-a="unsuspend" class="btn-success"><i class="fas fa-play"></i>Aktifkan kembali</button>' : '<button data-a="suspend" class="btn-danger"><i class="fas fa-ban"></i>Tangguhkan</button>'}
            </div>
            <h4 class="font-bold mt-6 mb-1">Fitur</h4>
            <p class="text-xs text-stone-500 mb-2">Matikan fitur yang tidak dibutuhkan usaha ini. Berlaku langsung di kasir, dapur & back office (perangkat menyesuaikan saat memuat ulang data).</p>
            <div class="space-y-2">${Features.LIST.map(f => `<label class="flex items-start gap-3 p-3 rounded-xl border ${t.features[f.key] ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200'} cursor-pointer">
                <i class="fas ${f.icon} w-5 mt-0.5 text-center ${t.features[f.key] ? 'text-emerald-600' : 'text-stone-400'}"></i>
                <span class="flex-1"><b>${esc(f.label)}</b><span class="block text-xs text-stone-500">${esc(f.desc)}</span></span>
                <input type="checkbox" data-feat="${f.key}" class="mt-1 w-5 h-5 accent-orange-500" ${t.features[f.key] ? 'checked' : ''}></label>`).join('')}</div>
            <h4 class="font-bold mt-6 mb-2">Akun</h4>${d.users.map(u => `<div class="flex items-center justify-between py-2 border-b border-stone-100"><div><b>${esc(u.name)}</b> <span class="badge bg-stone-100">${ROLE_LABEL[u.role]}</span><div class="text-xs text-stone-500">${esc(u.email)} · login ${timeAgo(u.last_login_at)}</div></div><button data-rp="${u.id}" class="btn-light !py-1.5 text-xs"><i class="fas fa-key"></i>Reset</button></div>`).join('')}
            <h4 class="font-bold mt-6 mb-2">Perangkat (${d.devices.filter(x => !x.revoked_at).length} aktif)</h4>${d.devices.map(x => `<div class="text-xs py-1 ${x.revoked_at ? 'line-through text-stone-400' : ''}">${esc(x.name)} · ${x.type} · outlet #${x.outlet_id} · ${timeAgo(x.last_seen_at)}</div>`).join('') || '<p class="text-stone-400 text-xs">-</p>'}
            <div class="flex items-center mt-6 mb-2"><h4 class="font-bold flex-1">Statistik harian</h4><button id="a-stats" class="btn-light !py-1.5 text-xs"><i class="fas fa-arrows-rotate"></i>Perbarui statistik</button></div>${d.stats.map(s => `<div class="flex justify-between text-xs py-1 border-b border-stone-100"><span>${fmtDay(s.date)}</span><span>${s.trx} trx · ${rp(s.sales)}</span></div>`).join('') || '<p class="text-stone-400 text-xs">Belum ada (diisi otomatis setiap malam)</p>'}
            <h4 class="font-bold mt-6 mb-2">Riwayat langganan</h4>${d.logs.map(l => `<div class="text-xs py-1"><span class="text-stone-400">${fmtDateTime(l.created_at)}</span> ${esc(l.detail || l.action)}</div>`).join('')}`;
        $('#a-drawer').classList.remove('hidden');
        const act = async (action, extra = {}) => {
            try { await API.post(`/admin/tenants/${id}/subscription`, { action, ...extra }); toast('Tersimpan', 'success'); await this.load(); this.open(id); } catch (e) { errorDialog(e); }
        };
        $$('#a-d-body [data-a]').forEach(b => b.onclick = async () => {
            const a = b.dataset.a;
            if (a === 'extend') {
                const r = await SwalBase.fire({ title: 'Perpanjang langganan', html: `<label class="label text-left">Lama (bulan)</label><input id="ex-m" type="number" min="1" max="36" value="1" class="input mb-3"><label class="label text-left">Jumlah paket (× 5 outlet)</label><input id="ex-p" type="number" min="1" value="${Math.max(1, t.outlet_packs)}" class="input">`, showCancelButton: true, confirmButtonText: 'Perpanjang', preConfirm: () => ({ months: Number($('#ex-m').value), packs: Number($('#ex-p').value) }) });
                if (r.isConfirmed) act('extend', r.value);
            }
            if (a === 'packs') { const v = await promptDialog('Jumlah paket', { input: 'number', value: t.outlet_packs, label: '1 paket = 5 outlet' }); if (v !== null) act('packs', { packs: Number(v) }); }
            if (a === 'extend_trial') { const v = await promptDialog('Tambah hari trial', { input: 'number', value: 7 }); if (v !== null) act('extend_trial', { days: Number(v) }); }
            if (a === 'suspend') { const v = await promptDialog('Alasan penangguhan', { validate: x => !x.trim() && 'Wajib diisi' }); if (v) act('suspend', { reason: v }); }
            if (a === 'unsuspend') act('unsuspend');
        });
        $$('#a-d-body [data-feat]').forEach(cb => cb.onchange = async () => {
            const f = Features.LIST.find(x => x.key === cb.dataset.feat);
            if (!cb.checked && !(await confirmDialog(`Nonaktifkan ${f.label}?`, f.desc, 'Nonaktifkan', true))) { cb.checked = true; return; }
            try {
                await API.put(`/admin/tenants/${id}/features`, { features: { [f.key]: cb.checked } });
                toast(`${f.label} ${cb.checked ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
                await this.load(); this.open(id);
            } catch (e) { cb.checked = !cb.checked; errorDialog(e); }
        });
        $('#a-stats').onclick = async () => { try { await API.post(`/admin/tenants/${id}/refresh-stats`); await this.load(); this.open(id); toast('Statistik diperbarui', 'success'); } catch (e) { errorDialog(e); } };
        $$('#a-d-body [data-rp]').forEach(b => b.onclick = async () => {
            if (!(await confirmDialog('Reset password akun ini?'))) return;
            const r = await API.post(`/admin/users/${b.dataset.rp}/reset-password`);
            SwalBase.fire({ icon: 'success', title: 'Password sementara', html: `<div class="text-2xl font-mono font-bold">${esc(r.temp_password)}</div>` });
        });
    }
};
Admin.start();
