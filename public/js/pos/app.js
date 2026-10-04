// Aplikasi kasir: boot (cache offline), login PIN, operasi order lokal + outbox, realtime, header, pengaturan perangkat
const POS = {
    boot: null,
    staff: null,
    shift: null,
    orders: new Map(),      // order terbuka (id → order)
    currentId: null,        // order yang sedang diedit di layar kasir
    view: 'order',
    rt: null,
    idx: {},

    get outlet() { return this.boot.outlet; },
    get device() { return Auth.device.device; },
    can(p) { return !!(this.staff && this.staff.perms.includes(p)); },
    /** Fitur tenant aktif? (diatur superadmin; data lama tanpa `features` = semua aktif) */
    has(key) { return !this.boot || !this.boot.features || this.boot.features[key] !== false; },
    get online() { return Sync.online && navigator.onLine; },

    // ---------------------------------------------------------------- start
    async start() {
        if (!Auth.device || Auth.device.device.type !== 'pos') { location.href = Auth.device ? '/kds.html' : '/#perangkat'; return; }
        API.mode = 'device';
        API.onAuthLost = err => this.onAuthLost(err);
        await IDB.open();
        await Sync.init();
        Sync.onChange(() => this.renderHeader());
        Printer.onChange(() => this.renderHeader());

        const cached = await IDB.get('kv', 'bootstrap');
        if (cached) this.applyBoot(cached);
        try {
            await this.refreshBoot();
        } catch (e) {
            if (e.code === 'device_revoked' || e.code === 'device_invalid') return this.onAuthLost(e);
            if (!cached) { $('#boot-msg').innerHTML = `${esc(e.message)}<br><button class="btn-primary mt-3" onclick="location.reload()">Coba lagi</button>`; return; }
            Sync.setOnline(false);
            toast('Mode offline: memakai data tersimpan', 'info', 4000);
        }
        await this.loadLocalOrders();
        $('#screen-boot').classList.add('hidden');
        this.bindStatic();
        Pwa.init({ canApply: () => !this.currentDraftHasItems() && !Sync.pending && $('#pos-modal').classList.contains('hidden'), onUpdate: () => toast('Versi baru tersedia — diterapkan saat kasir senggang') });
        WakeLock.enable();
        if (Printer.settings.driver === 'serial') Printer.reconnectSerial();
        this.connectRealtime();
        setInterval(() => { if (this.online) this.refreshBoot().catch(() => { }); }, 10 * 60000);
        setInterval(() => this.renderHeader(), 30000);

        const s = Auth.staff;
        if (s && this.boot.staff.some(x => x.id === s.staff.id)) { this.staff = s.staff; this.enterMain(); }
        else this.showLock();
    },

    applyBoot(b) {
        this.boot = b;
        this.idx = {
            menu: Object.fromEntries(b.menus.map(m => [m.id, m])),
            cat: Object.fromEntries(b.categories.map(c => [c.id, c])),
            group: Object.fromEntries(b.modifier_groups.map(g => [g.id, g])),
            table: Object.fromEntries(b.tables.map(t => [t.id, t])),
            staff: Object.fromEntries(b.staff.map(s => [s.id, s])),
            channel: Object.fromEntries(b.channels.map(c => [c.code, c])),
            method: Object.fromEntries(b.payment_methods.map(m => [m.code, m]))
        };
        if (b.open_shift !== undefined && !this._shiftLocal) this.shift = b.open_shift;
        const tablesTab = $('#nav-views [data-v="tables"]');
        if (tablesTab) tablesTab.classList.toggle('hidden', !this.has('tables'));
        if (this.view === 'tables' && !this.has('tables')) this.view = 'order';
    },

    async refreshBoot() {
        const b = await API.get('/t/bootstrap?outlet=' + Auth.device.device.outlet_id);
        Sync.setOnline(true);
        await IDB.set('kv', 'bootstrap', b);
        this.applyBoot(b);
        await this.mergeServerOrders(b.open_orders);
        if (this.staff) this.renderAll();
        return b;
    },

    // ---------------------------------------------------------------- order lokal
    async loadLocalOrders() {
        const all = (await IDB.all('orders')).filter(o => o.outlet_id === this.outlet.id);
        for (const o of all) if (o.status === 'open') this.orders.set(o.id, o);
        // Bersihkan riwayat lama (simpan 300 terakhir)
        const closed = all.filter(o => o.status !== 'open').sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0));
        for (const o of closed.slice(300)) await IDB.del('orders', o.id);
    },

    async mergeServerOrders(list) {
        const serverIds = new Set(list.map(o => o.id));
        for (const o of list) await this.acceptServerOrder(o, false);
        // Order lokal yang tidak ada di server & tanpa operasi tertunda = sudah ditutup di perangkat lain
        const pending = new Set((await Sync.ops()).map(o => o.order_id));
        for (const [id, o] of this.orders) {
            if (!serverIds.has(id) && !pending.has(id)) {
                this.orders.delete(id);
                try { const r = await API.get('/t/orders/' + id); await IDB.put('orders', r.order); } catch { await IDB.del('orders', id); }
                if (this.currentId === id) this.currentId = null;
            }
        }
    },

    /** Terima versi server lalu terapkan ulang operasi lokal yang belum terkirim. */
    async acceptServerOrder(o, render = true) {
        if (!o || o.outlet_id !== this.outlet.id) return;
        let cur = o;
        for (const op of await Sync.opsFor(o.id)) {
            try { cur = OrderOps.apply(cur, op, this.ctxFor(op)); } catch { /* operasi akan ditolak server juga */ }
        }
        delete cur._sent; delete cur._voided;
        await this.saveOrder(cur, render);
    },

    async saveOrder(o, render = true) {
        if (o.status === 'open') this.orders.set(o.id, o);
        else { this.orders.delete(o.id); if (this.currentId === o.id && !this._keepCurrent) this.currentId = null; }
        await IDB.put('orders', o);
        if (render) this.renderAll();
    },

    ctxFor(op) {
        return { outlet: this.outlet, at: op.at, staff_id: op.staff_id, device_id: this.device.id, offline: !!op.offline };
    },

    /** Jalankan operasi: terapkan lokal → simpan → antrekan ke server. */
    async exec(type, orderId, payload = {}, opts = {}) {
        const sessionOnline = this.online && Auth.staff && Auth.staff.staff_token;
        const op = { op_id: uuid(), type, order_id: orderId, payload, at: Date.now(), staff_id: this.staff.id, offline: !sessionOnline };
        if (payload.approval && payload.approval.pin) {
            // PIN manager tidak pernah disimpan terbuka di antrean: dienkripsi untuk server (diverifikasi saat sinkron)
            const proof = await this.sealApproval(payload.approval, op.op_id);
            if (proof) payload.approval = { staff_id: payload.approval.staff_id, proof };
            else if (op.offline) throw new Error('Persetujuan offline belum tersedia di tablet ini. Sambungkan internet lalu muat ulang data.');
            payload.approved_by = payload.approval.staff_id;
        }
        let next = null;
        if (type.startsWith('order.')) {
            const cur = this.orders.get(orderId) || null;
            next = OrderOps.apply(cur, op, this.ctxFor(op));
            if (next._sent && opts.onSent) opts.onSent(next, next._sent);
            delete next._sent; delete next._voided;
            this._keepCurrent = opts.keepCurrent;
            await this.saveOrder(next, opts.render !== false);
            this._keepCurrent = false;
        }
        await Sync.enqueue(op);
        return next;
    },

    /** Operasi yang wajib online (pindah/gabung/split meja, refund). */
    async execOnline(type, orderId, payload) {
        if (!this.online) throw new Error('Tindakan ini butuh koneksi internet');
        await Sync.flush();
        if (Sync.pending) throw new Error('Tunggu sinkronisasi selesai, lalu coba lagi');
        const res = await API.post('/t/ops', { ops: [{ op_id: uuid(), type, order_id: orderId, payload, at: Date.now() }] });
        const r = res.results[0];
        if (!r.ok) throw new Error(r.error);
        for (const o of [r.order, r.merged, r.created].filter(Boolean)) await this.saveOrder(o, false);
        this.renderAll();
        return r;
    },

    onOpSynced(op, r) {
        if (r.order) this.acceptServerOrder(r.order);
        if (r.created) this.acceptServerOrder(r.created);
        if (op.type.startsWith('shift.') && r.shift) { this.shift = r.shift.status === 'open' ? r.shift : null; this._shiftLocal = false; this.renderHeader(); }
    },

    async onOpFailed(op, r) {
        SwalBase.fire({ icon: 'warning', title: 'Tidak tersinkron', html: `${esc(r.error || 'Operasi ditolak server')}<div class="text-xs text-stone-500 mt-2">${esc(op.type)} · ${fmtTime(op.at)}</div>` });
        if (op.type.startsWith('order.')) {
            try { const res = await API.get('/t/orders/' + op.order_id); await this.acceptServerOrder(res.order); }
            catch (e) { if (e.status === 404) { this.orders.delete(op.order_id); await IDB.del('orders', op.order_id); if (this.currentId === op.order_id) this.currentId = null; this.renderAll(); } }
        }
        if (op.type === 'shift.open') { this.shift = null; this.renderHeader(); }
    },

    currentDraftHasItems() {
        const o = this.currentId && this.orders.get(this.currentId);
        return !!(o && o.items.some(i => i.status === 'new'));
    },

    // ---------------------------------------------------------------- realtime
    connectRealtime() {
        this.rt = new Realtime(async () => wsUrl({ token: await API.deviceToken() }));
        this.rt.onStatus(s => { if (s === 'online') Sync.setOnline(true); this.renderHeader(); });
        this.rt.on('open', async ({ reconnected }) => {
            Sync.flush();
            if (reconnected) { try { await this.refreshBoot(); } catch { } }
        });
        this.rt.on('order.updated', o => this.acceptServerOrder(o));
        this.rt.on('table.updated', t => { const tb = this.idx.table[t.id]; if (tb) { tb.dirty = t.dirty; this.renderAll(); } });
        this.rt.on('menu.availability', m => { const mn = this.idx.menu[m.menu_id]; if (mn) { mn.sold_out = m.sold_out; this.renderAll(); } });
        this.rt.on('ticket.updated', tk => { if (tk.status === 'ready') { this.beep(); toast(`🔔 ${tk.label} — ${tk.station} siap diantar`, 'success', 5000); } });
        this.rt.on('ticket.new', tk => { if (Printer.settings.kitchen === 'all') Printer.print({ label: 'Tiket ' + tk.ticket_no, lines: Receipt.kitchen(tk) }).catch(() => { }); });
        this.rt.on('shift.updated', s => { if (s.device_id === this.device.id) { this.shift = s.status === 'open' ? s : null; this.renderHeader(); } });
        this.rt.on('revoked', () => this.onAuthLost({ code: 'device_revoked', message: 'Akses perangkat dicabut' }));
        this.rt.connect();
        window.addEventListener('online', () => this.rt.reconnectNow());
    },

    beep() {
        try {
            const ctx = this._ac || (this._ac = new AudioContext());
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
            g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            o.start(); o.stop(ctx.currentTime + 0.5);
        } catch { }
    },

    async onAuthLost(err) {
        if (err.code === 'staff_invalid') { Auth.staff = null; this.staff = null; this.showLock(); toast('Sesi staff berakhir, silakan masukkan PIN'); return; }
        if (err.code === 'device_revoked' || err.code === 'device_invalid') {
            if (this._revoked) return;
            this._revoked = true;
            await SwalBase.fire({ icon: 'error', title: 'Perangkat tidak terdaftar', text: 'Akses perangkat ini dicabut oleh pemilik. Pasangkan ulang dengan kode baru.', allowOutsideClick: false });
            Auth.device = null; Auth.staff = null;
            await IDB.clear('outbox'); await IDB.clear('orders'); await IDB.clear('kv');
            location.href = '/#perangkat';
        }
    },

    // ---------------------------------------------------------------- PIN
    /** Enkripsi {staff, PIN, op} dengan kunci publik tenant → hanya server yang bisa membuka & memverifikasi. */
    async sealApproval(ap, opId) {
        const k = this.boot && this.boot.approval_key;
        if (!k || !crypto.subtle) return null;
        if (!this._akey || this._akey.kid !== k.kid) {
            this._akey = { kid: k.kid, key: await crypto.subtle.importKey('jwk', { kty: k.jwk.kty, n: k.jwk.n, e: k.jwk.e, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']) };
        }
        const data = new TextEncoder().encode(JSON.stringify({ s: ap.staff_id, p: String(ap.pin), o: opId }));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, this._akey.key, data));
        let s = '';
        ct.forEach(b => { s += String.fromCharCode(b); });
        return k.kid + '.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    /** true/false = PIN benar/salah; null = staff belum punya verifier offline (perlu login online sekali). */
    async verifyPinLocal(staff, pin) {
        if (!staff.pin_check) return null;
        const [alg, iter, salt, hash] = String(staff.pin_check).split('$');
        if (alg !== 'pbkdf2') return false;
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
        const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: Number(iter) }, key, 256));
        let s = '';
        bits.forEach(b => { s += String.fromCharCode(b); });
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === hash;
    },

    showLock() {
        this.staff = null;
        Auth.staff = null;
        $('#screen-main').classList.add('hidden');
        const lock = $('#screen-lock');
        lock.classList.remove('hidden'); lock.classList.add('flex');
        $('#lock-outlet').textContent = this.outlet.name;
        $('#lock-device').textContent = `${this.device.name} · ${this.boot.tenant.name}`;
        const net = $('#lock-net');
        net.className = 'badge ' + (this.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300');
        net.innerHTML = this.online ? '<i class="fas fa-wifi mr-1"></i>Online' : `<i class="fas fa-plug-circle-xmark mr-1"></i>Offline${Sync.pending ? ' · ' + Sync.pending + ' tertunda' : ''}`;
        const staffList = this.boot.staff.filter(s => s.perms.some(p => p !== 'kds'));
        let selected = null, pin = '';
        $('#lock-staff').innerHTML = staffList.map(s => `<button data-s="${s.id}" class="p-4 rounded-2xl bg-stone-800 hover:bg-stone-700 text-left">
            <div class="w-10 h-10 rounded-full bg-brand-500 grid place-items-center font-bold">${esc(s.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase())}</div>
            <div class="mt-2 font-semibold">${esc(s.name)}</div><div class="text-xs text-stone-400">${ROLE_LABEL[s.role]}</div></button>`).join('')
            || '<p class="text-stone-400 col-span-3">Belum ada staff untuk outlet ini. Tambahkan di Back Office → Staff.</p>';
        const dots = () => { $('#lock-dots').innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="w-4 h-4 rounded-full ${i < pin.length ? 'bg-brand-500' : 'bg-stone-700'}"></span>`).join(''); };
        const select = id => {
            selected = staffList.find(s => s.id === Number(id));
            pin = ''; dots();
            $('#lock-who').innerHTML = `PIN untuk <b class="text-white">${esc(selected.name)}</b>`;
            $('#lock-err').textContent = '';
            $$('#lock-staff [data-s]').forEach(b => b.classList.toggle('ring-2', b.dataset.s === String(id)));
            $$('#lock-staff [data-s]').forEach(b => b.classList.toggle('ring-brand-500', b.dataset.s === String(id)));
        };
        $$('#lock-staff [data-s]').forEach(b => b.onclick = () => select(b.dataset.s));
        const submit = async () => {
            if (!selected || pin.length < 4) return;
            const p = pin; pin = ''; dots();
            $('#lock-err').textContent = '';
            try { await this.login(selected, p); }
            catch (e) { $('#lock-err').textContent = e.message; }
        };
        $('#lock-pad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map(k => `<button data-k="${k}" class="rounded-2xl ${k === '✓' ? 'bg-brand-500 hover:bg-brand-600' : 'bg-stone-800 hover:bg-stone-700'} text-2xl font-semibold">${k === '✓' ? '<i class="fas fa-check"></i>' : k}</button>`).join('');
        $$('#lock-pad [data-k]').forEach(b => b.onclick = () => {
            const k = b.dataset.k;
            if (!selected) { $('#lock-err').textContent = 'Pilih nama Anda dulu'; return; }
            if (k === 'C') pin = ''; else if (k === '✓') return submit(); else if (pin.length < 6) pin += k;
            dots();
            if (pin.length === 6) submit();
        });
        dots();
        $('#lock-settings').onclick = () => this.openSettings(true);
        if (staffList.length === 1) select(staffList[0].id);
    },

    async login(staff, pin) {
        let session;
        if (this.online) {
            try {
                const r = await API.post('/t/staff-login', { staff_id: staff.id, pin }, { noStaff: true });
                session = { staff: r.staff, staff_token: r.staff_token, exp: Date.now() + 16 * 3600000 };
            } catch (e) {
                if (!e.network) throw e;
                Sync.setOnline(false);
            }
        }
        if (!session) {
            const v = await this.verifyPinLocal(staff, pin);
            if (v === null) throw new Error(`${staff.name} belum bisa login offline. Sambungkan internet untuk login pertama kali.`);
            if (!v) throw new Error('PIN salah');
            session = { staff: { id: staff.id, name: staff.name, role: staff.role, perms: staff.perms }, staff_token: null, exp: Date.now() + 16 * 3600000 };
            toast('Login offline — transaksi akan disinkronkan saat online', 'info', 4000);
        }
        Auth.staff = session;
        this.staff = session.staff;
        this.enterMain();
    },

    enterMain() {
        $('#screen-lock').classList.add('hidden'); $('#screen-lock').classList.remove('flex');
        const main = $('#screen-main');
        main.classList.remove('hidden'); main.classList.add('flex');
        this.setView(this.can('pay') || this.can('order') ? this.view : 'orders');
        this.renderHeader();
        if (this.can('shift') && !this.shift) setTimeout(() => Shift.openDialog(), 200);
        Sync.flush();
    },

    // ---------------------------------------------------------------- UI umum
    bindStatic() {
        $$('#nav-views [data-v]').forEach(b => b.onclick = () => this.setView(b.dataset.v));
        $('#hdr-user').onclick = e => { e.stopPropagation(); this.renderUserMenu(); $('#user-menu').classList.toggle('hidden'); };
        document.addEventListener('click', e => { if (!e.target.closest('#user-menu')) $('#user-menu').classList.add('hidden'); });
        $('#hdr-net').onclick = () => this.openSync();
        $('#hdr-printer').onclick = () => this.openSettings();
        $('#hdr-shift').onclick = () => Shift.panel();
        $$('#pos-modal [data-close]').forEach(b => b.onclick = () => this.closeModal());
    },

    setView(v) {
        if (v === 'tables' && !this.has('tables')) v = 'orders';
        this.view = v;
        $$('#nav-views [data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === v));
        for (const x of ['order', 'tables', 'orders']) $('#view-' + x).classList.toggle('hidden', x !== v);
        $('#view-' + v).classList.toggle('flex', v === 'order');
        this.renderAll();
    },

    renderAll() {
        if (!this.staff) return;
        // setTimeout (bukan requestAnimationFrame) agar tetap berjalan saat tab/layar tidak aktif
        clearTimeout(this._raf);
        this._raf = setTimeout(() => {
            $('#open-count').textContent = this.orders.size;
            if (this.view === 'order') OrderView.render();
            if (this.view === 'tables') TablesView.render();
            if (this.view === 'orders') OrdersView.render();
            this.renderHeader();
        });
    },

    renderHeader() {
        if (!this.boot || !this.staff) return;
        $('#hdr-outlet').textContent = this.outlet.name;
        $('#hdr-device').textContent = `${this.boot.tenant.name} · ${this.device.name}`;
        $('#hdr-avatar').textContent = this.staff.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
        $('#hdr-name').textContent = this.staff.name;
        $('#hdr-role').textContent = ROLE_LABEL[this.staff.role];
        const net = $('#hdr-net');
        const on = this.online;
        net.className = 'badge cursor-pointer ' + (on ? (Sync.pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700') : 'bg-red-50 text-red-600');
        net.innerHTML = on ? `<i class="fas fa-circle text-[7px] mr-1"></i>${Sync.pending ? 'Sinkron ' + Sync.pending : 'Online'}` : `<i class="fas fa-plug-circle-xmark mr-1"></i>Offline${Sync.pending ? ' · ' + Sync.pending + ' tertunda' : ''}`;
        const pr = $('#hdr-printer');
        const showPr = Printer.status === 'error' || Printer.queue.length || (Printer.failed && Printer.failed.length);
        pr.classList.toggle('hidden', !showPr);
        if (showPr) { pr.className = 'badge ' + (Printer.status === 'error' ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-600'); pr.querySelector('span').textContent = Printer.status === 'error' ? 'Printer error' : 'Mencetak…'; }
        const sh = $('#hdr-shift');
        sh.classList.toggle('hidden', !this.can('shift'));
        sh.innerHTML = this.shift ? `<i class="fas fa-clock mr-1"></i>Shift ${fmtTime(this.shift.opened_at)}` : '<i class="fas fa-lock-open mr-1"></i>Buka shift';
        const banner = $('#banner');
        const lic = Auth.device.license;
        if (Auth.staff && !Auth.staff.staff_token && on) {
            banner.className = 'bg-amber-500 text-white text-sm px-4 py-1.5 cursor-pointer';
            banner.innerHTML = '<i class="fas fa-key mr-2"></i>Internet sudah kembali. Ketuk di sini & masukkan PIN lagi agar transaksi offline tersinkron.';
            banner.onclick = () => this.showLock();
        } else if (lic && (lic.state === 'expired' || lic.state === 'suspended')) {
            banner.className = 'bg-red-600 text-white text-sm px-4 py-1.5';
            banner.innerHTML = '<i class="fas fa-triangle-exclamation mr-2"></i>Langganan berakhir — transaksi baru tidak dapat dibuat. Hubungi pemilik usaha.';
            banner.onclick = null;
        } else { banner.className = 'hidden'; banner.onclick = null; }
    },

    renderUserMenu() {
        const item = (icon, label, act, show = true) => show ? `<button data-act="${act}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-100 text-left"><i class="fas ${icon} w-4 text-stone-500"></i>${label}</button>` : '';
        $('#user-menu').innerHTML =
            item('fa-cash-register', 'Shift & kas', 'shift', this.can('shift') || this.can('cash')) +
            item('fa-clock-rotate-left', 'Riwayat transaksi', 'history') +
            item('fa-ban', 'Menu habis hari ini', 'soldout', this.can('soldout')) +
            item('fa-calendar-check', 'Tutup hari', 'closeday', this.can('close_day')) +
            item('fa-arrows-rotate', 'Sinkronisasi', 'sync') +
            item('fa-gear', 'Pengaturan perangkat', 'settings') +
            item('fa-graduation-cap', 'Panduan & training', 'tutorial') +
            '<div class="border-t border-stone-100 my-1"></div>' +
            item('fa-lock', 'Kunci / ganti staff', 'lock');
        $$('#user-menu [data-act]').forEach(b => b.onclick = () => {
            $('#user-menu').classList.add('hidden');
            const a = b.dataset.act;
            if (a === 'shift') Shift.panel();
            if (a === 'history') { this.setView('orders'); OrdersView.tab = 'history'; OrdersView.render(); }
            if (a === 'soldout') OrderView.soldOutDialog();
            if (a === 'closeday') Shift.closeDay();
            if (a === 'sync') this.openSync();
            if (a === 'settings') this.openSettings();
            if (a === 'lock') this.lock();
            if (a === 'tutorial') window.open('/tutorial.html', '_blank');
        });
    },

    async lock() {
        if (this.currentDraftHasItems() && !(await confirmDialog('Ada item baru yang belum dikirim/dibayar', 'Item tetap tersimpan di order terbuka. Kunci layar?', 'Kunci'))) return;
        this.currentId = null;
        Sync.flush();
        this.showLock();
    },

    // ---------------------------------------------------------------- modal
    modal({ title, body, foot = '', size = 'max-w-lg', onClose }) {
        $('#pos-modal-title').innerHTML = title;
        $('#pos-modal-box').className = `bg-white rounded-2xl w-full ${size} max-h-[94vh] flex flex-col overflow-hidden`;
        $('#pos-modal-body').innerHTML = body;
        $('#pos-modal-foot').innerHTML = foot;
        $('#pos-modal-foot').classList.toggle('hidden', !foot);
        this._onClose = onClose;
        openModal('pos-modal');
        return $('#pos-modal-body');
    },
    closeModal() { closeModal('pos-modal'); if (this._onClose) { const f = this._onClose; this._onClose = null; f(); } Pwa.tryApply(); },

    /** Minta persetujuan manager (PIN). Mengembalikan {staff_id, pin, name} atau null. */
    async askApproval(perm, title) {
        if (this.can(perm)) return {};
        const managers = this.boot.staff.filter(s => s.perms.includes(perm));
        if (!managers.length) { errorDialog(new Error('Belum ada staff yang berwenang menyetujui tindakan ini')); return null; }
        const r = await SwalBase.fire({
            title: title || 'Persetujuan manager',
            html: `<select id="ap-staff" class="input mb-3">${managers.map(m => `<option value="${m.id}">${esc(m.name)} (${ROLE_LABEL[m.role]})</option>`).join('')}</select><input id="ap-pin" type="password" inputmode="numeric" maxlength="6" class="input text-center text-2xl tracking-widest" placeholder="PIN manager">`,
            showCancelButton: true, confirmButtonText: 'Setujui', focusConfirm: false,
            didOpen: () => setTimeout(() => $('#ap-pin').focus(), 50),
            preConfirm: async () => {
                const id = Number($('#ap-staff').value), pin = $('#ap-pin').value;
                const m = managers.find(x => x.id === id);
                const v = await this.verifyPinLocal(m, pin);
                if (v === false) { Swal.showValidationMessage('PIN salah'); return false; }
                // Verifier belum ada: saat online server yang memverifikasi; saat offline tidak bisa
                if (v === null && !(this.online && Auth.staff && Auth.staff.staff_token)) { Swal.showValidationMessage(`${m.name} belum bisa menyetujui offline. Sambungkan internet.`); return false; }
                return { staff_id: id, pin, name: m.name };
            }
        });
        return r.isConfirmed ? r.value : null;
    },

    // ---------------------------------------------------------------- sinkron & pengaturan
    async openSync() {
        const ops = await Sync.ops();
        const label = { 'order.open': 'Buka order', 'order.add_items': 'Tambah item', 'order.send': 'Kirim dapur', 'order.pay': 'Pembayaran', 'order.void_item': 'Void item', 'order.void': 'Batal order', 'order.update_item': 'Ubah item', 'order.remove_item': 'Hapus item', 'order.set': 'Ubah order', 'order.discount': 'Diskon', 'order.print_bill': 'Cetak bill', 'shift.open': 'Buka shift', 'shift.close': 'Tutup shift', 'shift.cash': 'Kas', 'table.clean': 'Meja bersih', 'menu.availability': 'Menu habis' };
        this.modal({
            title: '<i class="fas fa-arrows-rotate mr-2 text-brand-500"></i>Sinkronisasi',
            body: `<div class="grid grid-cols-2 gap-2 text-sm mb-4"><span class="text-stone-500">Koneksi</span><b class="${this.online ? 'text-emerald-600' : 'text-red-600'}">${this.online ? 'Online' : 'Offline'}</b>
                <span class="text-stone-500">Realtime</span><b>${this.rt ? this.rt.status : '-'}</b><span class="text-stone-500">Operasi tertunda</span><b>${ops.length}</b>
                ${Sync.lastError ? `<span class="text-stone-500">Error terakhir</span><b class="text-red-600">${esc(Sync.lastError)}</b>` : ''}</div>
                ${ops.length ? `<div class="max-h-72 overflow-y-auto thin-scroll border border-stone-200 rounded-xl divide-y divide-stone-100 text-sm">${ops.map(o => `<div class="px-3 py-2 flex justify-between gap-2"><span>${esc(label[o.type] || o.type)} <span class="text-stone-400 text-xs">${esc((this.orders.get(o.order_id) || {}).order_no || '')}</span>${o.error ? `<div class="text-xs text-red-500">${esc(o.error)}</div>` : ''}</span><span class="text-stone-400 text-xs whitespace-nowrap">${fmtTime(o.at)}</span></div>`).join('')}</div>`
                    : '<div class="text-center text-stone-400 py-6"><i class="fas fa-circle-check text-3xl text-emerald-500"></i><p class="mt-2">Semua data sudah tersinkron</p></div>'}
                <p class="text-xs text-stone-500 mt-3"><i class="fas fa-circle-info mr-1"></i>Saat offline, transaksi tetap tersimpan di tablet ini dan dikirim otomatis saat internet kembali. Jangan hapus data browser / uninstall aplikasi selama masih ada data tertunda.</p>`,
            foot: `<button id="sy-now" class="btn-primary flex-1"><i class="fas fa-arrows-rotate"></i>Sinkron sekarang</button><button id="sy-reload" class="btn-light">Muat ulang data</button>`
        });
        $('#sy-now').onclick = async () => { this.rt && this.rt.reconnectNow(); await Sync.flush(); this.openSync(); };
        $('#sy-reload').onclick = async () => { try { await this.refreshBoot(); toast('Data menu & meja diperbarui', 'success'); } catch (e) { errorDialog(e); } };
    },

    openSettings(fromLock) {
        const s = Printer.settings, sup = Printer.support();
        this.modal({
            title: '<i class="fas fa-gear mr-2 text-brand-500"></i>Pengaturan Perangkat', size: 'max-w-xl',
            body: `<div class="space-y-4 text-sm">
                <div class="grid grid-cols-2 gap-2"><span class="text-stone-500">Perangkat</span><b>${esc(this.device.name)} (kode ${esc(this.device.code)})</b><span class="text-stone-500">Outlet</span><b>${esc(this.outlet.name)}</b><span class="text-stone-500">Versi aplikasi</span><b>${esc(Pwa.version || '-')}</b></div>
                <div class="border-t border-stone-100 pt-4"><b><i class="fas fa-print mr-1"></i>Printer struk</b>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <label class="label col-span-2">Cara cetak</label>
                        ${[['serial', 'Bluetooth / USB (Web Serial)', sup.serial], ['bluetooth', 'Bluetooth BLE', sup.bluetooth], ['rawbt', 'Aplikasi RawBT (Android)', sup.android], ['browser', 'Print browser', true]].map(d => `<label class="flex items-center gap-2 p-3 rounded-xl border ${s.driver === d[0] ? 'border-brand-500 bg-brand-50' : 'border-stone-200'} ${d[2] ? '' : 'opacity-40'}"><input type="radio" name="drv" value="${d[0]}" ${s.driver === d[0] ? 'checked' : ''} ${d[2] ? '' : 'disabled'} class="accent-orange-500">${d[1]}</label>`).join('')}
                    </div>
                    ${!sup.serial ? '<p class="text-xs text-amber-700 mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>Web Serial tidak tersedia di browser ini. Gunakan Google Chrome ≥ 138 di Android, atau RawBT.</p>' : ''}
                    <div class="flex flex-wrap gap-2 mt-3">
                        <button id="pr-connect-serial" class="btn-outline" ${sup.serial ? '' : 'disabled'}><i class="fas fa-link"></i>Pilih printer (Serial)</button>
                        <button id="pr-connect-ble" class="btn-outline" ${sup.bluetooth ? '' : 'disabled'}><i class="fab fa-bluetooth-b"></i>Pilih printer BLE</button>
                        <button id="pr-test" class="btn-light"><i class="fas fa-receipt"></i>Tes cetak</button>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-3">
                        <div><label class="label">Lebar kertas</label><select id="pr-width" class="input"><option value="58" ${s.width === 58 ? 'selected' : ''}>58 mm</option><option value="80" ${s.width === 80 ? 'selected' : ''}>80 mm</option></select></div>
                        <div><label class="label">Tiket dapur</label><select id="pr-kitchen" class="input">
                            <option value="none" ${s.kitchen === 'none' ? 'selected' : ''}>${this.has('kds') ? 'Tidak dicetak (pakai KDS)' : 'Tidak dicetak'}</option>
                            <option value="own" ${s.kitchen === 'own' ? 'selected' : ''}>Cetak saat kirim dari perangkat ini</option>
                            <option value="all" ${s.kitchen === 'all' ? 'selected' : ''}>Cetak semua tiket outlet (printer dapur)</option></select></div>
                        <label class="flex items-center gap-2"><input type="checkbox" id="pr-auto" ${s.auto !== false ? 'checked' : ''} class="accent-orange-500 w-4 h-4">Cetak struk otomatis setelah bayar (printer thermal)</label>
                        <label class="flex items-center gap-2"><input type="checkbox" id="pr-drawer" ${s.drawer ? 'checked' : ''} class="accent-orange-500 w-4 h-4">Buka laci kas (tunai)</label>
                    </div>
                    ${Printer.failed && Printer.failed.length ? `<div class="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-xs">${Printer.failed.length} cetakan gagal (${esc(Printer.lastError || '')}). <button id="pr-retry" class="underline font-semibold">Cetak ulang</button></div>` : ''}
                </div>
                <div class="border-t border-stone-100 pt-4"><b><i class="fas fa-tablet-screen-button mr-1"></i>Perangkat</b>
                    <p class="text-xs text-stone-500 mt-1">Melepas pasangan menghapus data lokal perangkat ini. Hanya bisa jika tidak ada transaksi tertunda.</p>
                    <button id="dv-unpair" class="btn-danger mt-2"><i class="fas fa-link-slash"></i>Lepas pasangan perangkat</button></div>
            </div>`,
            foot: '<button data-ok class="btn-primary flex-1">Selesai</button>'
        });
        const save = () => Printer.save({ driver: ($('input[name=drv]:checked') || {}).value || 'browser', width: Number($('#pr-width').value), kitchen: $('#pr-kitchen').value, auto: $('#pr-auto').checked, drawer: $('#pr-drawer').checked });
        $$('#pos-modal-body input, #pos-modal-body select').forEach(el => el.onchange = save);
        $('#pr-connect-serial').onclick = async () => { try { await Printer.connectSerial(); toast('Printer tersambung', 'success'); this.openSettings(fromLock); } catch (e) { if (e.name !== 'NotFoundError') errorDialog(e); } };
        $('#pr-connect-ble').onclick = async () => { try { await Printer.connectBluetooth(); toast('Printer BLE tersambung', 'success'); this.openSettings(fromLock); } catch (e) { if (e.name !== 'NotFoundError') errorDialog(e); } };
        $('#pr-test').onclick = () => { save(); Printer.test().then(() => toast('Tes cetak terkirim', 'success')).catch(e => errorDialog(e)); };
        const rt = $('#pr-retry'); if (rt) rt.onclick = () => { Printer.retryFailed(); this.closeModal(); };
        $('#pos-modal-foot [data-ok]').onclick = () => { save(); this.closeModal(); };
        $('#dv-unpair').onclick = async () => {
            if (await IDB.count('outbox')) return errorDialog(new Error('Masih ada transaksi yang belum tersinkron. Sambungkan internet terlebih dahulu.'));
            const managers = this.boot.staff.filter(s => s.role === 'manager');
            if (managers.length) {
                const r = await SwalBase.fire({ title: 'PIN manager', input: 'password', inputAttributes: { inputmode: 'numeric', maxlength: 6 }, showCancelButton: true, preConfirm: async v => { for (const m of managers) if (await this.verifyPinLocal(m, v)) return true; Swal.showValidationMessage(managers.some(m => m.pin_check) ? 'PIN salah' : 'PIN manager belum tersedia di tablet ini. Minta manager login sekali saat online.'); return false; } });
                if (!r.isConfirmed) return;
            } else if (!(await confirmDialog('Lepas pasangan perangkat ini?', '', 'Lepas', true))) return;
            Auth.device = null; Auth.staff = null;
            await IDB.clear('orders'); await IDB.clear('kv');
            location.href = '/';
        };
    }
};
