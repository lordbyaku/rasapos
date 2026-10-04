// Back Office: kerangka aplikasi, router, form modal generik, filter outlet & tanggal, realtime
const BO = {
    pages: {},
    meta: null,
    me: null,
    listeners: {},
    rt: null,
    range: Store.get('bo_range') || { preset: 'today' },
    outletIds: Store.get('bo_outlets') || [],

    get isOwner() { return this.me && this.me.user.role === 'owner'; },
    get outlets() { return this.meta ? this.meta.outlets : []; },
    outletName(id) { const o = this.outlets.find(x => x.id === Number(id)); return o ? o.name : '-'; },
    channelName(code) { const c = this.meta && this.meta.channels.find(x => x.code === code); return c ? c.name : code; },

    page(name, def) { this.pages[name] = def; },
    /** Fitur tenant aktif? (diatur superadmin) */
    has(key) { return !this.meta || !this.meta.features || this.meta.features[key] !== false; },
    featureOff(view, label) {
        view.innerHTML = `<div class="card p-10 text-center max-w-lg mx-auto"><i class="fas fa-toggle-off text-4xl text-stone-300"></i><h3 class="font-bold mt-3">Fitur ${esc(label)} tidak aktif</h3><p class="text-sm text-stone-500 mt-1">Fitur ini dinonaktifkan untuk usaha Anda. Hubungi admin RasaPOS jika ingin memakainya.</p></div>`;
    },

    // ---------------------------------------------------------------- start
    async start() {
        if (!Auth.user) { location.href = '/'; return; }
        API.mode = 'user';
        API.onAuthLost = () => { Auth.user = null; location.href = '/'; };
        try {
            this.me = await API.get('/auth/me');
            if (!this.me.tenant) { location.href = this.me.user.superadmin ? '/admin.html' : '/'; return; }
            this.meta = await API.get('/t/meta');
        } catch (e) {
            if (e.status === 401) { Auth.user = null; location.href = '/'; return; }
            document.getElementById('view').innerHTML = `<div class="card p-8 text-center"><i class="fas fa-wifi text-4xl text-stone-300"></i><p class="mt-3">${esc(e.message)}</p><button class="btn-primary mt-4" onclick="location.reload()">Coba lagi</button></div>`;
            return;
        }
        this.outletIds = this.outletIds.filter(id => this.outlets.some(o => o.id === id));
        this.renderShell();
        this.connectRealtime();
        window.addEventListener('hashchange', () => this.route());
        this.route();
        Pwa.init();
    },

    renderShell() {
        const u = this.me.user, t = this.me.tenant;
        $('#tenant-name').textContent = t.name;
        $('#user-role').textContent = `${u.name} · ${ROLE_LABEL[u.role] || u.role}`;
        $('#user-avatar').textContent = u.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
        const nav = [
            ['UTAMA'], ['dashboard', 'fa-chart-line', 'Dashboard'], ['transactions', 'fa-receipt', 'Transaksi'], ['reports', 'fa-file-lines', 'Laporan'],
            ['KATALOG'], ['menu', 'fa-utensils', 'Menu & Harga'], ['marketing', 'fa-tags', 'Promo & Pelanggan'], ['inventory', 'fa-boxes-stacked', 'Inventori'],
            ['OUTLET'], ['outlets', 'fa-store', this.has('tables') ? 'Outlet & Meja' : 'Outlet'], ['devices', 'fa-tablet-screen-button', 'Perangkat'], ['staff', 'fa-users', 'Staff & Akses'],
            ['LAINNYA'], ['settings', 'fa-gear', 'Pengaturan'], ['tutorial', 'fa-graduation-cap', 'Panduan & Training', '/tutorial.html']
        ].filter(n => !this.PAGE_FEATURE[n[0]] || this.has(this.PAGE_FEATURE[n[0]][0]));
        if (u.superadmin) nav.push(['admin', 'fa-user-shield', 'Superadmin', '/admin.html']);
        $('#nav').innerHTML = nav.map(n => n.length === 1
            ? `<div class="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-stone-500">${n[0]}</div>`
            : `<a href="${n[3] || '#' + n[0]}" data-page="${n[0]}" class="nav-item"><i class="fas ${n[1]} w-4"></i>${n[2]}</a>`).join('');
        const lic = t.license;
        $('#license-box').innerHTML = `<div class="text-stone-400">Langganan</div><div class="text-white font-semibold">${esc(licenseText(lic))}</div><div class="text-stone-500">${this.outlets.filter(o => o.is_active).length}/${lic.max_outlets} outlet aktif</div>`;
        const banner = $('#license-banner');
        const daysLeft = Math.ceil((lic.until - Date.now()) / 86400000);
        if (lic.state === 'expired' || lic.state === 'suspended') {
            banner.className = 'bg-red-600 text-white text-sm px-4 py-2';
            banner.innerHTML = `<i class="fas fa-triangle-exclamation mr-2"></i>Langganan ${lic.state === 'suspended' ? 'ditangguhkan' : 'berakhir'}. Kasir tidak dapat membuat transaksi baru. Hubungi admin untuk memperpanjang.`;
        } else if (lic.state === 'grace' || (lic.state === 'trial' && daysLeft <= 5) || (lic.state === 'active' && daysLeft <= 7)) {
            banner.className = 'bg-amber-500 text-white text-sm px-4 py-2';
            banner.innerHTML = `<i class="fas fa-clock mr-2"></i>${lic.state === 'grace' ? 'Masa tenggang' : lic.state === 'trial' ? 'Trial' : 'Langganan'} berakhir ${lic.state === 'grace' ? fmtDate(lic.grace_until) : 'dalam ' + Math.max(0, daysLeft) + ' hari'}. Perpanjang agar kasir tetap berjalan.`;
        }
        $('#btn-logout').onclick = async () => { if (await confirmDialog('Keluar dari Back Office?')) { Auth.logoutUser(); location.href = '/'; } };
        $('#btn-menu').onclick = () => this.toggleSidebar(true);
        $('#sidebar-backdrop').onclick = () => this.toggleSidebar(false);
        $$('#bo-modal [data-close]').forEach(b => b.onclick = () => closeModal('bo-modal'));
        $$('#bo-drawer [data-close]').forEach(b => b.onclick = () => $('#bo-drawer').classList.add('hidden'));
        $('#bo-drawer').addEventListener('click', e => { if (e.target.id === 'bo-drawer') $('#bo-drawer').classList.add('hidden'); });
    },

    toggleSidebar(open) {
        $('#sidebar').classList.toggle('-translate-x-full', !open);
        $('#sidebar-backdrop').classList.toggle('hidden', !open);
    },

    // ---------------------------------------------------------------- router
    PAGE_FEATURE: { marketing: ['marketing', 'Promo & Pelanggan'], inventory: ['inventory', 'Inventori'] },

    async route() {
        const name = (location.hash.slice(1) || 'dashboard').split('/')[0];
        const page = this.pages[name] || this.pages.dashboard;
        this.listeners = {};
        $$('#nav [data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === name));
        this.toggleSidebar(false);
        $('#page-title').textContent = page.title;
        $('#header-tools').innerHTML = '';
        const view = $('#view');
        view.innerHTML = '<div class="py-20 text-center text-stone-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        const pf = this.PAGE_FEATURE[name];
        if (pf && !this.has(pf[0])) return this.featureOff(view, pf[1]);
        try { await page.render(view); }
        catch (e) { view.innerHTML = `<div class="card p-8 text-center text-red-600">${esc(e.message)}</div>`; console.error(e); }
    },
    refresh() { this.route(); },

    // ---------------------------------------------------------------- realtime
    connectRealtime() {
        this.rt = new Realtime(async () => wsUrl({ token: await API.userToken() }));
        this.rt.onStatus(s => {
            const el = $('#rt-status');
            el.className = 'badge ' + (s === 'online' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500');
            el.innerHTML = `<i class="fas fa-circle text-[7px] mr-1 ${s === 'online' ? 'blink' : ''}"></i>${s === 'online' ? 'Live' : s === 'connecting' ? 'Menyambung…' : 'Offline'}`;
        });
        this.rt.on('*', msg => (this.listeners[msg.type] || []).forEach(f => f(msg.data)));
        this.rt.connect();
        window.addEventListener('online', () => this.rt.reconnectNow());
    },
    on(type, fn) { (this.listeners[type] ||= []).push(fn); },

    // ---------------------------------------------------------------- filter
    rangeDates() {
        const today = localDate();
        const p = this.range.preset;
        if (p === 'today') return { from: today, to: today };
        if (p === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
        if (p === '7d') return { from: addDays(today, -6), to: today };
        if (p === '30d') return { from: addDays(today, -29), to: today };
        if (p === 'month') return { from: today.slice(0, 8) + '01', to: today };
        if (p === 'lastmonth') { const d = new Date(); d.setDate(0); const end = localDate(d.getTime()); return { from: end.slice(0, 8) + '01', to: end }; }
        return { from: this.range.from || today, to: this.range.to || today };
    },
    rangeLabel() { const r = this.rangeDates(); return r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)}`; },

    /** Kontrol tanggal + outlet di header. opts: {outlet:'multi'|'single'|false, date:true, onChange} */
    filters(opts) {
        const tools = $('#header-tools');
        const presets = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7d', '7 hari'], ['30d', '30 hari'], ['month', 'Bulan ini'], ['lastmonth', 'Bulan lalu'], ['custom', 'Pilih tanggal…']];
        let html = '';
        if (opts.outlet) {
            html += `<div class="relative"><button id="f-outlet" class="btn-outline !py-2"><i class="fas fa-store text-brand-500"></i><span id="f-outlet-label"></span><i class="fas fa-chevron-down text-xs text-stone-400"></i></button>
                <div id="f-outlet-dd" class="hidden absolute top-11 left-0 z-30 w-64 card shadow-xl p-2"></div></div>`;
        }
        if (opts.date) {
            html += `<select id="f-range" class="input !w-auto !py-2">${presets.map(p => `<option value="${p[0]}" ${this.range.preset === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
                <span id="f-custom" class="${this.range.preset === 'custom' ? 'flex' : 'hidden'} items-center gap-1"><input type="date" id="f-from" class="input !w-auto !py-2" value="${this.rangeDates().from}"><span>–</span><input type="date" id="f-to" class="input !w-auto !py-2" value="${this.rangeDates().to}"></span>`;
        }
        tools.innerHTML = html;
        const fire = () => opts.onChange && opts.onChange();
        if (opts.date) {
            $('#f-range').onchange = e => {
                this.range = { ...this.rangeDates(), preset: e.target.value };
                Store.set('bo_range', this.range);
                $('#f-custom').classList.toggle('hidden', e.target.value !== 'custom');
                $('#f-custom').classList.toggle('flex', e.target.value === 'custom');
                fire();
            };
            const onDate = () => { this.range = { preset: 'custom', from: $('#f-from').value, to: $('#f-to').value < $('#f-from').value ? $('#f-from').value : $('#f-to').value }; Store.set('bo_range', this.range); fire(); };
            $('#f-from').onchange = onDate; $('#f-to').onchange = onDate;
        }
        if (opts.outlet) {
            const multi = opts.outlet === 'multi';
            if (!multi && this.outletIds.length !== 1) this.outletIds = [this.outlets[0] && this.outlets[0].id].filter(Boolean);
            const renderDD = () => {
                const ids = this.outletIds;
                $('#f-outlet-label').textContent = !ids.length || ids.length === this.outlets.length ? (multi ? `Semua Outlet (${this.outlets.length})` : this.outletName(ids[0])) : ids.length === 1 ? this.outletName(ids[0]) : `${ids.length} outlet`;
                $('#f-outlet-dd').innerHTML = (multi ? `<label class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-stone-50 font-semibold"><input type="checkbox" data-all ${!ids.length ? 'checked' : ''} class="accent-orange-500 w-4 h-4">Semua outlet</label><div class="border-t border-stone-100 my-1"></div>` : '') +
                    this.outlets.map(o => `<label class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-stone-50"><input type="${multi ? 'checkbox' : 'radio'}" name="f-o" value="${o.id}" ${ids.includes(o.id) ? 'checked' : ''} class="accent-orange-500 w-4 h-4"><span class="flex-1">${esc(o.name)}</span>${o.is_active ? '' : '<span class="badge bg-stone-100 text-stone-400">nonaktif</span>'}</label>`).join('');
                $$('#f-outlet-dd input').forEach(inp => inp.onchange = () => {
                    if (inp.dataset.all !== undefined) this.outletIds = [];
                    else if (multi) this.outletIds = $$('#f-outlet-dd input[name=f-o]:checked').map(x => Number(x.value));
                    else { this.outletIds = [Number(inp.value)]; $('#f-outlet-dd').classList.add('hidden'); }
                    if (multi && this.outletIds.length === this.outlets.length) this.outletIds = [];
                    Store.set('bo_outlets', this.outletIds);
                    renderDD(); fire();
                });
            };
            renderDD();
            $('#f-outlet').onclick = e => { e.stopPropagation(); $('#f-outlet-dd').classList.toggle('hidden'); };
            document.addEventListener('click', e => { const dd = $('#f-outlet-dd'); if (dd && !dd.contains(e.target)) dd.classList.add('hidden'); });
        }
    },
    /** Query string outlet+tanggal */
    qs(extra = {}) {
        const r = this.rangeDates();
        const p = { from: r.from, to: r.to, ...extra };
        if (this.outletIds.length) p.outlets = this.outletIds.join(',');
        return new URLSearchParams(p).toString();
    },
    singleOutlet() { return this.outletIds[0] || (this.outlets[0] && this.outlets[0].id); },

    // ---------------------------------------------------------------- form modal generik
    /**
     * fields: [{name, label, type, options, value, required, help, placeholder, min, max, step, col}]
     * type: text|email|password|number|money|textarea|select|checkbox|checks|color|time|date|html|section
     */
    /** Modal isi bebas (tanpa form field generik) */
    modal({ title, body, size = 'max-w-lg' }) {
        $('#bo-modal-title').textContent = title;
        $('#bo-modal-box').className = `bg-white rounded-2xl w-full ${size} max-h-[92vh] flex flex-col overflow-hidden`;
        const form = $('#bo-modal-form');
        form.innerHTML = body;
        form.onsubmit = e => e.preventDefault();
        $('#bo-modal-foot').innerHTML = '<button type="button" data-close class="btn-light">Tutup</button>';
        $$('#bo-modal-foot [data-close]').forEach(b => b.onclick = () => closeModal('bo-modal'));
        openModal('bo-modal');
        return form;
    },

    form({ title, fields, submitText = 'Simpan', size = 'max-w-lg', onSubmit, extraButtons = '' }) {
        $('#bo-modal-title').textContent = title;
        $('#bo-modal-box').className = `bg-white rounded-2xl w-full ${size} max-h-[92vh] flex flex-col overflow-hidden`;
        const form = $('#bo-modal-form');
        form.innerHTML = `<div class="grid grid-cols-2 gap-3">${fields.map(f => this.fieldHtml(f)).join('')}</div><button type="submit" class="hidden"></button>`;
        $('#bo-modal-foot').innerHTML = `${extraButtons}<button type="button" data-close class="btn-light">Batal</button><button type="button" id="bo-modal-submit" class="btn-primary">${esc(submitText)}</button>`;
        $$('#bo-modal-foot [data-close]').forEach(b => b.onclick = () => closeModal('bo-modal'));
        const submit = async () => {
            if (!form.reportValidity()) return;
            const btn = $('#bo-modal-submit');
            btn.disabled = true;
            try {
                await onSubmit(this.readForm(fields), form);
                closeModal('bo-modal');
            } catch (e) { errorDialog(e); } finally { btn.disabled = false; }
        };
        $('#bo-modal-submit').onclick = submit;
        form.onsubmit = e => { e.preventDefault(); submit(); };
        openModal('bo-modal');
        const first = form.querySelector('input:not([type=checkbox]),select,textarea');
        if (first) setTimeout(() => first.focus(), 50);
        return form;
    },
    fieldHtml(f) {
        const col = f.col === 1 ? 'col-span-2 sm:col-span-1' : 'col-span-2';
        const v = f.value ?? '';
        const req = f.required ? 'required' : '';
        const help = f.help ? `<p class="text-[11px] text-stone-400 mt-1">${f.help}</p>` : '';
        const lab = f.label ? `<label class="label">${esc(f.label)}${f.required ? ' *' : ''}</label>` : '';
        const attrs = `name="${f.name}" ${req} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.pattern ? `pattern="${f.pattern}"` : ''}`;
        switch (f.type) {
            case 'section': return `<div class="col-span-2 pt-2 text-xs font-bold uppercase tracking-wider text-stone-400">${esc(f.label)}</div>`;
            case 'html': return `<div class="${col}">${f.html}</div>`;
            case 'textarea': return `<div class="${col}">${lab}<textarea ${attrs} rows="${f.rows || 3}" class="input">${esc(v)}</textarea>${help}</div>`;
            case 'select': return `<div class="${col}">${lab}<select ${attrs} class="input">${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}</div>`;
            case 'checkbox': return `<div class="${col}"><label class="flex items-start gap-2 text-sm py-1"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''} class="mt-0.5 accent-orange-500 w-4 h-4"><span>${esc(f.label)}${help}</span></label></div>`;
            case 'checks': return `<div class="${col}">${lab}<div class="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto thin-scroll border border-stone-200 rounded-xl p-2">${f.options.map(o => `<label class="flex items-center gap-2 text-sm py-1"><input type="checkbox" data-checks="${f.name}" value="${esc(o.value)}" ${(v || []).map(String).includes(String(o.value)) ? 'checked' : ''} class="accent-orange-500 w-4 h-4">${esc(o.label)}</label>`).join('') || '<span class="text-xs text-stone-400">Belum ada pilihan</span>'}</div>${help}</div>`;
            case 'money': return `<div class="${col}">${lab}<div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">Rp</span><input type="number" step="1" min="0" ${attrs} value="${esc(v)}" class="input pl-9"></div>${help}</div>`;
            default: return `<div class="${col}">${lab}<input type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} ${attrs} value="${esc(v)}" class="input ${f.type === 'color' ? 'h-11 p-1' : ''}">${help}</div>`;
        }
    },
    readForm(fields) {
        const form = $('#bo-modal-form');
        const out = {};
        for (const f of fields) {
            if (!f.name || f.type === 'section' || f.type === 'html') continue;
            if (f.type === 'checkbox') { out[f.name] = form.elements[f.name].checked; continue; }
            if (f.type === 'checks') {
                out[f.name] = $$(`[data-checks="${f.name}"]:checked`, form).map(x => (f.numeric ? Number(x.value) : x.value));
                continue;
            }
            const el = form.elements[f.name];
            if (!el) continue;
            const raw = el.value;
            out[f.name] = ['number', 'money'].includes(f.type) ? (raw === '' ? (f.nullable ? null : 0) : Number(raw)) : raw;
        }
        return out;
    },

    drawer(title, body, foot = '') {
        $('#bo-drawer-title').textContent = title;
        $('#bo-drawer-body').innerHTML = body;
        $('#bo-drawer-foot').innerHTML = foot;
        $('#bo-drawer-foot').classList.toggle('hidden', !foot);
        $('#bo-drawer').classList.remove('hidden');
    },

    /** Tab sederhana di dalam halaman */
    tabs(el, tabs, active, onChange) {
        el.innerHTML = `<div class="inline-flex flex-wrap bg-stone-200/70 rounded-xl p-1 gap-1">${tabs.map(t => `<button data-tab="${t[0]}" class="tab ${t[0] === active ? 'active' : ''}">${t[1]}</button>`).join('')}</div>`;
        $$('[data-tab]', el).forEach(b => b.onclick = () => { $$('[data-tab]', el).forEach(x => x.classList.toggle('active', x === b)); onChange(b.dataset.tab); });
    },

    empty(icon, text, action = '') {
        return `<div class="card p-10 text-center text-stone-500"><i class="fas ${icon} text-4xl text-stone-300"></i><p class="mt-3">${text}</p>${action}</div>`;
    },

    kpi(label, value, sub = '', icon = '', tone = '') {
        return `<div class="card p-4"><div class="flex items-center justify-between text-sm text-stone-500">${esc(label)}${icon ? `<i class="fas ${icon} text-brand-500"></i>` : ''}</div>
            <div class="text-2xl font-extrabold mt-1 whitespace-nowrap">${value}</div>${sub ? `<div class="text-xs mt-1 ${tone}">${sub}</div>` : ''}</div>`;
    }
};

const OUTLET_COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899', '#6366f1', '#84cc16'];
const outletColor = id => OUTLET_COLORS[(BO.outlets.findIndex(o => o.id === id) + OUTLET_COLORS.length) % OUTLET_COLORS.length];
const delta = (cur, prev) => {
    if (!prev) return cur ? '<span class="text-emerald-600"><i class="fas fa-arrow-up"></i> baru</span>' : '<span class="text-stone-400">—</span>';
    const p = ((cur - prev) / Math.abs(prev)) * 100;
    return `<span class="${p >= 0 ? 'text-emerald-600' : 'text-red-500'}"><i class="fas fa-arrow-${p >= 0 ? 'up' : 'down'}"></i> ${Math.abs(p).toFixed(1)}% vs periode sebelumnya</span>`;
};
