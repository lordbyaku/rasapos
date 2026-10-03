// Superadmin → Asisten AI: API key Gemini (maks. 5, bergiliran), model, batas harian, status tiap kunci
const AdminAI = {
    data: null,
    async load() {
        this.data = await API.get('/admin/ai');
        this.render();
    },
    status(k) {
        const now = Date.now();
        if (!k.is_active) return ['bg-stone-200 text-stone-600', 'Nonaktif'];
        if (k.cooldown_until && k.cooldown_until > now) return ['bg-amber-50 text-amber-700', 'Istirahat s/d ' + fmtTime(k.cooldown_until)];
        if (k.last_error && (!k.last_ok_at || k.last_error_at > k.last_ok_at)) return ['bg-red-50 text-red-600', 'Error terakhir'];
        if (k.last_ok_at) return ['bg-emerald-50 text-emerald-700', 'Siap'];
        return ['bg-sky-50 text-sky-700', 'Belum dipakai'];
    },
    render() {
        const d = this.data, s = d.settings;
        const active = d.keys.filter(k => k.is_active).length + (d.env_key ? 1 : 0);
        $('#tab-ai').innerHTML = `
            <div class="grid md:grid-cols-3 gap-3">
                <div class="card p-4"><div class="text-xs text-stone-500">Status asisten</div><div class="text-xl font-extrabold ${active ? 'text-emerald-600' : 'text-stone-400'}">${active ? 'Aktif' : 'Nonaktif'}</div><div class="text-xs text-stone-500">${active} kunci dipakai bergiliran</div></div>
                <div class="card p-4"><div class="text-xs text-stone-500">Pertanyaan AI (24 jam)</div><div class="text-xl font-extrabold">${d.usage.count.toLocaleString('id-ID')} <span class="text-sm font-medium text-stone-400">/ ${s.daily_limit.toLocaleString('id-ID')}</span></div><div class="text-xs text-stone-500">${d.usage.since ? 'sejak ' + fmtDateTime(d.usage.since) : 'belum ada'}</div></div>
                <div class="card p-4"><div class="text-xs text-stone-500">Model</div><div class="text-lg font-bold font-mono truncate">${esc(s.model)}</div><div class="text-xs text-stone-500">maks. ${s.tenant_daily} pertanyaan/usaha/24 jam</div></div>
            </div>

            <div class="card mt-4">
                <div class="p-4 border-b border-stone-100 flex flex-wrap items-center gap-2">
                    <div class="flex-1 min-w-[200px]"><h3 class="font-bold">API key Gemini <span class="text-stone-400 font-medium">(${d.keys.length}/${d.max})</span></h3>
                    <p class="text-xs text-stone-500">Dipakai bergiliran (round robin). Kunci yang kena limit atau ditolak otomatis diistirahatkan dan dilewati.</p></div>
                    <button id="ai-add" class="btn-primary" ${d.keys.length >= d.max ? 'disabled' : ''}><i class="fas fa-plus"></i>Tambah API key</button>
                </div>
                <div class="divide-y divide-stone-100">
                ${d.keys.map(k => { const [tone, label] = this.status(k); return `
                    <div class="p-4 flex flex-wrap items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-stone-100 grid place-items-center text-stone-500"><i class="fas fa-key"></i></div>
                        <div class="flex-1 min-w-[220px]">
                            <div class="flex items-center gap-2"><b>${esc(k.label)}</b><span class="font-mono text-xs text-stone-400">${esc(k.key_hint)}</span><span class="badge ${tone}">${label}</span></div>
                            <div class="text-xs text-stone-500 mt-0.5">${k.uses.toLocaleString('id-ID')} panggilan · ${k.fails.toLocaleString('id-ID')} gagal · terakhir ${k.last_used_at ? timeAgo(k.last_used_at) : '-'}</div>
                            ${k.last_error && (!k.last_ok_at || k.last_error_at > k.last_ok_at) ? `<div class="text-xs text-red-600 mt-0.5 break-all">${esc(k.last_error)}</div>` : ''}
                        </div>
                        <div class="flex gap-1.5">
                            <button data-test="${k.id}" class="btn-light !py-1.5 text-xs"><i class="fas fa-vial"></i>Uji</button>
                            ${k.cooldown_until && k.cooldown_until > Date.now() ? `<button data-reset="${k.id}" class="btn-light !py-1.5 text-xs" title="Pakai lagi sekarang"><i class="fas fa-play"></i>Pulihkan</button>` : ''}
                            <button data-toggle="${k.id}" data-on="${k.is_active}" class="btn-light !py-1.5 text-xs">${k.is_active ? '<i class="fas fa-pause"></i>Nonaktifkan' : '<i class="fas fa-play"></i>Aktifkan'}</button>
                            <button data-rename="${k.id}" class="btn-light !py-1.5 text-xs" title="Ganti nama"><i class="fas fa-pen"></i></button>
                            <button data-del="${k.id}" class="btn-danger !py-1.5 text-xs" title="Hapus"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`; }).join('')}
                ${d.env_key ? `<div class="p-4 flex items-center gap-3 text-sm"><div class="w-10 h-10 rounded-xl bg-stone-100 grid place-items-center text-stone-500"><i class="fas fa-lock"></i></div><div><b>Secret Worker</b> <span class="badge bg-emerald-50 text-emerald-700">Ikut bergiliran</span><div class="text-xs text-stone-500">GEMINI_API_KEY dari <code>wrangler secret</code> — dikelola lewat terminal, tidak bisa diubah di sini.</div></div></div>` : ''}
                ${!d.keys.length && !d.env_key ? `<div class="p-8 text-center text-stone-400 text-sm"><i class="fas fa-key text-3xl text-stone-300"></i><p class="mt-2">Belum ada API key. Asisten panduan memakai pencarian biasa (tanpa AI).</p></div>` : ''}
                </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-4 mt-4">
                <form id="ai-settings" class="card p-4 space-y-3">
                    <h3 class="font-bold">Pengaturan</h3>
                    <div><label class="label">Model Gemini</label><input name="model" class="input font-mono" value="${esc(s.model)}" list="ai-models" required>
                        <datalist id="ai-models"><option value="gemini-3.5-flash-lite"><option value="gemini-3.1-flash-lite"><option value="gemini-3.5-flash"><option value="gemini-3.6-flash"><option value="gemini-3.7-flash"><option value="gemini-3.8-flash"></datalist>
                        <p class="text-[11px] text-stone-500 mt-1">Varian <b>flash-lite</b> paling hemat kuota gratis. Tekan <b>Uji</b> pada kunci setelah mengganti model.</p></div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="label">Maks. per usaha / 24 jam</label><input name="tenant_daily" type="number" min="0" class="input" value="${s.tenant_daily}"></div>
                        <div><label class="label">Maks. semua usaha / 24 jam</label><input name="daily_limit" type="number" min="0" class="input" value="${s.daily_limit}"></div>
                    </div>
                    <div class="flex justify-end"><button class="btn-primary"><i class="fas fa-floppy-disk"></i>Simpan</button></div>
                </form>
                <div class="card p-4 text-sm text-stone-600 space-y-2">
                    <h3 class="font-bold text-stone-900">Cara mendapatkan API key gratis</h3>
                    <ol class="list-decimal ml-5 space-y-1">
                        <li>Buka <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="text-brand-600 font-semibold hover:underline">aistudio.google.com/apikey</a> dan login dengan akun Google.</li>
                        <li>Klik <b>Create API key</b>, salin kuncinya, lalu tekan <b>Tambah API key</b> di sini.</li>
                    </ol>
                    <div class="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs"><i class="fas fa-triangle-exclamation mr-1"></i><b>Penting:</b> kuota gratis dihitung <b>per project Google</b>, bukan per kunci. Beberapa kunci dari project yang sama berbagi kuota yang sama — manfaatnya hanya cadangan. Di tier gratis, Google boleh memakai isi pertanyaan untuk meningkatkan produknya.</div>
                    <p class="text-xs text-stone-500">Kunci disimpan terenkripsi dan tidak pernah ditampilkan lagi (hanya 4 karakter terakhir).</p>
                </div>
            </div>`;

        $('#ai-add').onclick = () => this.add();
        $('#ai-settings').onsubmit = async e => {
            e.preventDefault();
            const f = new FormData(e.target);
            try { await API.put('/admin/ai/settings', { model: f.get('model'), tenant_daily: Number(f.get('tenant_daily')), daily_limit: Number(f.get('daily_limit')) }); toast('Pengaturan disimpan', 'success'); await this.load(); } catch (err) { errorDialog(err); }
        };
        $$('#tab-ai [data-test]').forEach(b => b.onclick = () => this.test(Number(b.dataset.test), b));
        $$('#tab-ai [data-reset]').forEach(b => b.onclick = () => this.patch(b.dataset.reset, { reset: true }, 'Kunci dipakai lagi'));
        $$('#tab-ai [data-toggle]').forEach(b => b.onclick = () => this.patch(b.dataset.toggle, { is_active: b.dataset.on !== '1' }, 'Tersimpan'));
        $$('#tab-ai [data-rename]').forEach(b => b.onclick = async () => {
            const k = this.data.keys.find(x => x.id === Number(b.dataset.rename));
            const v = await promptDialog('Nama kunci', { value: k.label });
            if (v !== null) this.patch(k.id, { label: v }, 'Tersimpan');
        });
        $$('#tab-ai [data-del]').forEach(b => b.onclick = async () => {
            if (!(await confirmDialog('Hapus API key ini?', 'Kunci tidak bisa dikembalikan; Anda harus memasukkannya ulang.', 'Hapus', true))) return;
            try { await API.del('/admin/ai/keys/' + b.dataset.del); toast('Dihapus', 'success'); await this.load(); } catch (e) { errorDialog(e); }
        });
    },
    async patch(id, body, msg) {
        try { await API.patch('/admin/ai/keys/' + id, body); toast(msg, 'success'); await this.load(); } catch (e) { errorDialog(e); }
    },
    async add() {
        const r = await SwalBase.fire({
            title: 'Tambah API key Gemini',
            html: `<label class="label text-left">Nama (mis. akun Google pemiliknya)</label><input id="ak-label" class="input mb-3" maxlength="60" placeholder="Kunci ${this.data.keys.length + 1}">
                   <label class="label text-left">API key</label><input id="ak-key" type="password" class="input font-mono" autocomplete="off" placeholder="AIza…">
                   <p class="text-[11px] text-stone-500 text-left mt-2">Kunci langsung diuji ke Google sebelum disimpan.</p>`,
            showCancelButton: true, confirmButtonText: 'Uji & simpan', showLoaderOnConfirm: true,
            preConfirm: async () => {
                const key = $('#ak-key').value.trim();
                if (!key) { Swal.showValidationMessage('API key wajib diisi'); return false; }
                try { return await API.post('/admin/ai/keys', { label: $('#ak-label').value, key }); }
                catch (e) { Swal.showValidationMessage(e.message); return false; }
            },
            allowOutsideClick: () => !Swal.isLoading()
        });
        if (!r.isConfirmed) return;
        const t = r.value.test;
        if (t.ok) toast(`Kunci tersimpan & berfungsi (${t.ms} ms)`, 'success');
        else infoDialog('Kunci tersimpan dengan catatan', `<p class="text-sm">${esc(t.error)}</p><p class="text-xs text-stone-500 mt-2">Kunci tetap dipakai dan akan dicoba lagi otomatis.</p>`, 'warning');
        await this.load();
    },
    async test(id, btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>Menguji';
        try {
            const t = await API.post(`/admin/ai/keys/${id}/test`);
            if (t.ok) toast(`Berfungsi — ${t.model}, ${t.ms} ms`, 'success');
            else infoDialog('Uji gagal', `<p class="text-sm">${esc(t.error)}</p>`, 'error');
        } catch (e) { errorDialog(e); }
        await this.load();
    }
};
