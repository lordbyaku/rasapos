// Superadmin → Sistem: error server terbaru, layanan yang aktif (email, backup, AI)
const AdminSystem = {
    async load() {
        const d = await API.get('/admin/system');
        const svc = (label, ok, note) => `<div class="card p-4 flex items-start gap-3"><i class="fas ${ok ? 'fa-circle-check text-emerald-500' : 'fa-triangle-exclamation text-amber-500'} mt-0.5"></i><div><b>${label}</b><div class="text-xs text-stone-500">${note}</div></div></div>`;
        const s = d.services, e = d.errors;
        $('#tab-system').innerHTML = `
            <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div class="card p-4"><div class="text-xs text-stone-500">Error server 24 jam</div><div class="text-2xl font-extrabold ${e.day ? 'text-red-600' : 'text-emerald-600'}">${e.day}</div><div class="text-xs text-stone-500">${e.week} dalam 7 hari</div></div>
                ${svc('Email (reset password)', !!s.email, s.email ? 'Aktif via ' + esc(s.email) : 'Belum aktif — "Lupa password" mengarahkan ke admin. Lihat README → Email.')}
                ${svc('Backup harian (R2)', s.backup, s.backup ? 'Aktif, 03:30 WIB, disimpan 35 hari' : 'Belum aktif — aktifkan R2. Lihat README → Backup.')}
                ${svc('Asisten AI', s.ai, s.ai ? 'Ada API key aktif' : 'Belum ada API key (tab Asisten AI)')}
            </div>
            <div class="grid lg:grid-cols-2 gap-4 mt-4">
                <div class="card p-4"><h3 class="font-bold mb-2">Paling sering error (7 hari)</h3>
                    ${e.top.length ? `<table class="tbl text-sm"><tbody>${e.top.map(r => `<tr><td class="font-mono text-xs">${esc(r.method)} ${esc(r.path)}</td><td class="text-right">${r.n}×</td><td class="text-xs text-stone-500">${timeAgo(r.last)}</td></tr>`).join('')}</tbody></table>` : '<p class="text-sm text-stone-400">Tidak ada error 👍</p>'}</div>
                <div class="card p-4"><div class="flex items-center mb-2"><h3 class="font-bold flex-1">Error terbaru</h3><button id="sys-maint" class="btn-light !py-1.5 text-xs" title="Bersihkan log lama & kirim ringkasan email sekarang"><i class="fas fa-broom"></i>Jalankan perawatan</button></div>
                    <div class="max-h-96 overflow-y-auto thin-scroll text-xs divide-y divide-stone-100">${e.recent.map(r => `<div class="py-1.5"><span class="text-stone-400">${fmtDateTime(r.at)}</span> <b>${r.status}</b> <span class="font-mono">${esc(r.method)} ${esc(r.path)}</span>${r.tenant_id ? ` <span class="badge bg-stone-100">tenant #${r.tenant_id}</span>` : ''}<div class="text-stone-600 break-all">${esc(r.message || '')}</div></div>`).join('') || '<p class="text-stone-400 py-2">Belum ada</p>'}</div></div>
            </div>
            <p class="text-xs text-stone-500 mt-3">Ringkasan error dikirim otomatis ke email superadmin setiap pagi (08:00 WIB) bila ada error & email aktif. Log disimpan 30 hari.</p>`;
        $('#sys-maint').onclick = async () => {
            try { const r = await API.post('/admin/system/maintenance'); toast(r.mailed ? 'Ringkasan dikirim ke email superadmin' : 'Perawatan selesai', 'success'); this.load(); } catch (err) { errorDialog(err); }
        };
    }
};
