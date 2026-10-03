// Staff outlet (login PIN di tablet) & akun manajer (login email ke back office)
BO.page('staff', {
    title: 'Staff & Akses',
    tab: 'staff',
    async render(view) {
        view.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-4"><div id="s-tabs"></div><div id="s-actions" class="ml-auto"></div></div><div id="s-body"></div>`;
        const tabs = [['staff', 'Staff Outlet (PIN)']];
        if (BO.isOwner) tabs.push(['users', 'Akun Manajer (email)']);
        BO.tabs($('#s-tabs'), tabs, this.tab, t => { this.tab = t; this.load(); });
        await this.load();
    },
    async load() {
        const body = $('#s-body');
        if (this.tab === 'users' && BO.isOwner) return this.users(body);
        const d = await API.get('/t/staff');
        this.rolePerms = BO.meta.role_perms;
        $('#s-actions').innerHTML = '<button id="s-add" class="btn-primary"><i class="fas fa-plus"></i>Staff</button>';
        $('#s-add').onclick = () => this.edit();
        body.innerHTML = `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Staff login di tablet dengan memilih nama + PIN. Manager wajib PIN 6 digit dan dapat menyetujui void, diskon besar, dan refund.</p>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Nama</th><th>Peran</th><th>Outlet</th><th>Hak akses</th><th>Status</th><th></th></tr></thead><tbody>
            ${d.items.map(s => `<tr class="${s.is_active ? '' : 'opacity-50'}"><td><b>${esc(s.name)}</b></td><td>${ROLE_LABEL[s.role]}</td><td class="text-xs">${esc(s.outlet_ids.map(id => BO.outletName(id)).join(', '))}</td>
                <td class="text-xs text-stone-500 whitespace-normal max-w-xs">${s.permissions && s.permissions.length ? '<span class="badge bg-sky-50 text-sky-700 mr-1">kustom</span>' : ''}${esc(s.effective_perms.map(p => PERM_LABEL[p]).join(', '))}</td>
                <td>${!s.is_active ? '<span class="badge bg-stone-100">Nonaktif</span>' : s.locked_until && s.locked_until > Date.now() ? '<span class="badge bg-red-50 text-red-600">PIN terkunci</span>' : '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>'}</td>
                <td class="text-right"><button class="btn-light !py-1.5" data-s="${s.id}"><i class="fas fa-pen"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-stone-400 py-8">Belum ada staff. Tambahkan kasir agar bisa login di tablet.</td></tr>'}</tbody></table></div></div>`;
        $$('[data-s]').forEach(b => b.onclick = () => this.edit(d.items.find(s => s.id === Number(b.dataset.s))));
    },
    edit(s) {
        const isNew = !s;
        s = s || { name: '', role: 'cashier', outlet_ids: BO.outletIds.length ? [BO.outletIds[0]] : [BO.outlets[0].id], permissions: null, is_active: 1 };
        const allPerms = this.rolePerms.manager;
        const form = BO.form({
            title: isNew ? 'Staff Baru' : 'Ubah Staff', size: 'max-w-2xl',
            fields: [
                { name: 'name', label: 'Nama', required: true, value: s.name, maxlength: 60, col: 1 },
                { name: 'role', label: 'Peran', type: 'select', value: s.role, col: 1, options: ['cashier', 'waiter', 'manager', ...(BO.has('kds') || s.role === 'kitchen' ? ['kitchen'] : [])].map(r => ({ value: r, label: ROLE_LABEL[r] })) },
                { name: 'pin', label: isNew ? 'PIN (4–6 digit)' : 'PIN baru (kosongkan jika tidak diubah)', type: 'password', required: isNew, pattern: '\\d{4,6}', maxlength: 6, col: 1, placeholder: '••••', help: 'Manager wajib 6 digit' },
                { name: 'is_active', label: 'Aktif', type: 'checkbox', value: s.is_active, col: 1 },
                { name: 'outlet_ids', label: 'Bisa login di outlet', type: 'checks', numeric: true, value: s.outlet_ids, options: BO.outlets.map(o => ({ value: o.id, label: o.name })) },
                { name: 'custom', label: 'Atur hak akses manual (abaikan default peran)', type: 'checkbox', value: s.permissions && s.permissions.length },
                { name: 'permissions', label: 'Hak akses', type: 'checks', value: s.permissions && s.permissions.length ? s.permissions : this.rolePerms[s.role], options: allPerms.map(p => ({ value: p, label: PERM_LABEL[p] })) }
            ],
            onSubmit: async d => {
                const body = { name: d.name, role: d.role, outlet_ids: d.outlet_ids, is_active: d.is_active, permissions: d.custom ? d.permissions : [] };
                if (d.pin) body.pin = d.pin;
                if (isNew) await API.post('/t/staff', body); else await API.patch('/t/staff/' + s.id, body);
                toast('Staff tersimpan', 'success');
                this.load();
            }
        });
        const permBox = form.querySelector('[data-checks="permissions"]').closest('.col-span-2');
        const sync = () => {
            const custom = form.elements.custom.checked;
            permBox.classList.toggle('opacity-50', !custom);
            permBox.querySelectorAll('input').forEach(i => { i.disabled = !custom; });
            if (!custom) { const def = this.rolePerms[form.elements.role.value] || []; permBox.querySelectorAll('input').forEach(i => { i.checked = def.includes(i.value); }); }
        };
        form.elements.custom.onchange = sync;
        form.elements.role.onchange = sync;
        sync();
    },

    async users(body) {
        const d = await API.get('/t/users');
        $('#s-actions').innerHTML = '<button id="u-add" class="btn-primary"><i class="fas fa-plus"></i>Akun manajer</button>';
        body.innerHTML = `<p class="text-sm text-stone-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Manajer area/outlet login ke back office dengan email. Akses dibatasi ke outlet yang dipilih; menu master hanya bisa diubah pemilik.</p>
            <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl whitespace-nowrap"><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Outlet</th><th>Login terakhir</th><th>Status</th><th></th></tr></thead><tbody>
            ${d.users.map(u => `<tr class="${u.is_active ? '' : 'opacity-50'}"><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${ROLE_LABEL[u.role]}</td>
                <td class="text-xs">${u.outlet_ids ? esc(u.outlet_ids.map(id => BO.outletName(id)).join(', ')) : 'Semua outlet'}</td><td>${timeAgo(u.last_login_at)}</td>
                <td>${u.is_active ? '<span class="badge bg-emerald-50 text-emerald-700">Aktif</span>' : '<span class="badge bg-stone-100">Nonaktif</span>'}</td>
                <td class="text-right">${u.role === 'owner' ? '' : `<button class="btn-light !py-1.5" data-u="${u.id}"><i class="fas fa-pen"></i></button> <button class="btn-light !py-1.5" data-rp="${u.id}" title="Reset password"><i class="fas fa-key"></i></button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
        const showTemp = (email, pw) => SwalBase.fire({ icon: 'success', title: 'Password sementara', html: `Berikan ke <b>${esc(email)}</b>:<div class="text-2xl font-mono font-bold my-3">${esc(pw)}</div>Minta ganti password setelah login (menu Pengaturan → Akun saya).` });
        const outletOpts = BO.outlets.map(o => ({ value: o.id, label: o.name }));
        $('#u-add').onclick = () => BO.form({
            title: 'Akun Manajer Baru',
            fields: [
                { name: 'name', label: 'Nama', required: true, maxlength: 80, col: 1 }, { name: 'email', label: 'Email', type: 'email', required: true, col: 1 },
                { name: 'outlet_ids', label: 'Outlet yang dikelola (kosong = semua outlet)', type: 'checks', numeric: true, value: [], options: outletOpts }
            ],
            onSubmit: async f => { const r = await API.post('/t/users', f); this.load(); setTimeout(() => showTemp(f.email, r.temp_password), 100); }
        });
        $$('[data-u]').forEach(b => b.onclick = () => {
            const u = d.users.find(x => x.id === Number(b.dataset.u));
            BO.form({
                title: 'Ubah Akun ' + u.email,
                fields: [
                    { name: 'name', label: 'Nama', required: true, value: u.name, maxlength: 80 },
                    { name: 'outlet_ids', label: 'Outlet yang dikelola (kosong = semua outlet)', type: 'checks', numeric: true, value: u.outlet_ids || [], options: outletOpts },
                    { name: 'is_active', label: 'Aktif', type: 'checkbox', value: u.is_active }
                ],
                onSubmit: async f => { await API.patch('/t/users/' + u.id, f); this.load(); }
            });
        });
        $$('[data-rp]').forEach(b => b.onclick = async () => {
            const u = d.users.find(x => x.id === Number(b.dataset.rp));
            if (!(await confirmDialog('Reset password ' + u.email + '?'))) return;
            const r = await API.post(`/t/users/${u.id}/reset-password`);
            showTemp(u.email, r.temp_password);
        });
    }
});
