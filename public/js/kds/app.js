// Kitchen Display: tiket per stasiun, timer, status Baru → Diproses → Siap, realtime + polling cadangan
const KDS = {
    tickets: new Map(),
    recent: [],
    station: Store.get('kds_station') || 'Semua',
    sound: Store.get('kds_sound') !== false,
    stations: ['Dapur', 'Bar'],

    async start() {
        const d = Auth.device;
        if (!d) { location.href = '/#perangkat'; return; }
        if (d.device.type !== 'kds') { location.href = '/pos.html'; return; }
        API.mode = 'device';
        Auth.staff = null;
        API.onAuthLost = async e => {
            if (!['device_revoked', 'device_invalid'].includes(e.code)) return;
            await SwalBase.fire({ icon: 'error', title: 'Perangkat tidak terdaftar', text: 'Akses perangkat ini dicabut. Pasangkan ulang.', allowOutsideClick: false });
            Auth.device = null; location.href = '/#perangkat';
        };
        try {
            const b = await API.get('/t/bootstrap?outlet=' + d.device.outlet_id);
            this.outlet = b.outlet;
            this.stations = b.settings.stations || this.stations;
            Store.set('kds_boot', { outlet: b.outlet, stations: this.stations });
        } catch (e) {
            const c = Store.get('kds_boot');
            if (!c) { $('#k-board').innerHTML = `<div class="m-auto text-center text-neutral-400">${esc(e.message)}<br><button class="btn-primary mt-3" onclick="location.reload()">Coba lagi</button></div>`; return; }
            this.outlet = c.outlet; this.stations = c.stations;
        }
        $('#k-outlet').textContent = `${this.outlet.name} · ${d.device.name}`;
        this.bind();
        await this.load();
        this.connect();
        setInterval(() => { $('#k-clock').textContent = fmtTime(Date.now()); this.render(); }, 15000);
        setInterval(() => { if (!this.rt || this.rt.status !== 'online') this.load().catch(() => { }); }, 30000);
        $('#k-clock').textContent = fmtTime(Date.now());
        Pwa.init();
    },

    bind() {
        $('#k-start').onclick = () => { $('#k-start').classList.add('hidden'); WakeLock.enable(); this.beep(true); };
        $('#k-sound').onclick = () => { this.sound = !this.sound; Store.set('kds_sound', this.sound); this.renderHeader(); };
        $('#k-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => { });
        $('#k-recall').onclick = () => this.showRecent();
        $('#k-menu').onclick = () => this.settings();
        $$('#k-modal [data-close]').forEach(b => b.onclick = () => closeModal('k-modal'));
    },

    async load() {
        const r = await API.get('/t/tickets');
        this.tickets = new Map(r.active.map(t => [t.id, t]));
        this.recent = r.recent;
        this.render();
    },

    connect() {
        this.rt = new Realtime(async () => wsUrl({ token: await API.deviceToken() }));
        this.rt.onStatus(() => this.renderHeader());
        this.rt.on('open', ({ reconnected }) => { if (reconnected) this.load(); });
        this.rt.on('ticket.new', t => {
            this.tickets.set(t.id, t);
            if (this.station === 'Semua' || t.station === this.station) this.beep();
            if (Printer.settings.kitchen === 'all' && (this.station === 'Semua' || t.station === this.station)) Printer.print({ label: 'Tiket', lines: Receipt.kitchen(t) }).catch(() => { });
            this.render();
        });
        this.rt.on('ticket.updated', t => {
            if (['new', 'progress'].includes(t.status)) this.tickets.set(t.id, t);
            else { this.tickets.delete(t.id); if (t.status !== 'void') this.recent = [t, ...this.recent.filter(x => x.id !== t.id)].slice(0, 30); }
            this.render();
        });
        this.rt.on('revoked', () => API.onAuthLost({ code: 'device_revoked' }));
        this.rt.connect();
        window.addEventListener('online', () => this.rt.reconnectNow());
    },

    beep(test) {
        if (!this.sound && !test) return;
        try {
            const ctx = this._ac || (this._ac = new AudioContext());
            [0, 0.18].forEach(off => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.frequency.value = 988; o.connect(g); g.connect(ctx.destination);
                g.gain.setValueAtTime(test ? 0.05 : 0.25, ctx.currentTime + off); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + off + 0.15);
                o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + 0.16);
            });
        } catch { }
    },

    renderHeader() {
        $('#k-stations').innerHTML = ['Semua', ...this.stations].map(s => `<button data-st="${esc(s)}" class="px-4 py-1.5 rounded-lg whitespace-nowrap ${this.station === s ? 'bg-brand-500 text-white' : 'text-neutral-400'}">${esc(s)}</button>`).join('');
        $$('#k-stations [data-st]').forEach(b => b.onclick = () => { this.station = b.dataset.st; Store.set('kds_station', this.station); this.render(); });
        const on = this.rt && this.rt.status === 'online';
        const net = $('#k-net');
        net.className = 'badge ' + (on ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300');
        net.innerHTML = on ? '<i class="fas fa-circle text-[7px] mr-1 blink"></i>Live' : '<i class="fas fa-plug-circle-xmark mr-1"></i>Offline';
        $('#k-sound').innerHTML = `<i class="fas ${this.sound ? 'fa-volume-high' : 'fa-volume-xmark text-red-400'}"></i>`;
        const done = this.recent.filter(t => t.started_at && t.done_at);
        const avg = done.length ? Math.round(done.reduce((s, t) => s + (t.done_at - t.created_at), 0) / done.length / 60000) : null;
        $('#k-avg').textContent = avg !== null ? `Rata-rata saji ${avg} mnt` : '';
    },

    render() {
        this.renderHeader();
        const list = [...this.tickets.values()].filter(t => this.station === 'Semua' || t.station === this.station).sort((a, b) => a.created_at - b.created_at);
        $('#k-new').textContent = list.filter(t => t.status === 'new').length;
        $('#k-prog').textContent = list.filter(t => t.status === 'progress').length;
        $('#k-board').innerHTML = list.map(t => {
            const mins = minutesSince(t.created_at);
            const col = mins >= 20 ? 'bg-red-600' : mins >= 10 ? 'bg-amber-500' : 'bg-emerald-600';
            const items = t.items.filter(i => !i.void);
            return `<div class="w-72 shrink-0 bg-neutral-900 rounded-2xl overflow-hidden border ${t.status === 'new' ? 'border-sky-500' : 'border-neutral-800'}">
                <div class="${col} px-3 py-2 flex items-center justify-between gap-2">
                    <div class="min-w-0"><div class="font-extrabold text-lg leading-tight truncate">${esc(t.label)}</div><div class="text-xs opacity-90">#${t.ticket_no} · ${esc(t.station)}</div></div>
                    <div class="text-right font-mono text-xl font-bold ${mins >= 20 ? 'blink' : ''}">${String(mins).padStart(2, '0')}m</div>
                </div>
                ${t.label.includes('(tambahan)') ? '<div class="bg-sky-500/20 text-sky-300 text-xs font-bold px-3 py-1"><i class="fas fa-plus mr-1"></i>PESANAN TAMBAHAN</div>' : ''}
                <div class="p-3 space-y-2">${items.map(i => `<button data-t="${t.id}" data-i="${esc(i.id)}" class="w-full text-left flex gap-2 ${i.done ? 'opacity-40 line-through' : ''}">
                    <span class="w-8 h-8 shrink-0 rounded-lg bg-neutral-800 grid place-items-center font-bold">${i.qty}</span>
                    <span><span class="font-semibold">${esc(i.name)}</span>${i.mods && i.mods.length ? `<div class="text-xs text-neutral-400">${esc(i.mods.join(' · '))}</div>` : ''}${i.note ? `<div class="text-xs text-amber-400 font-semibold"><i class="fas fa-note-sticky mr-1"></i>${esc(i.note)}</div>` : ''}</span></button>`).join('')}
                    ${t.items.some(i => i.void) ? `<div class="text-xs text-red-400"><i class="fas fa-ban mr-1"></i>Dibatalkan: ${esc(t.items.filter(i => i.void).map(i => i.name).join(', '))}</div>` : ''}</div>
                <div class="p-3 pt-0 flex gap-2">
                    ${t.status === 'new' ? `<button data-st-t="${t.id}" data-to="progress" class="flex-1 py-3 rounded-xl bg-sky-600 font-bold active:scale-95"><i class="fas fa-fire mr-1"></i>Mulai</button>` : ''}
                    <button data-st-t="${t.id}" data-to="ready" class="flex-1 py-3 rounded-xl bg-emerald-600 font-bold active:scale-95"><i class="fas fa-bell-concierge mr-1"></i>Siap</button>
                    <button data-print="${t.id}" class="w-12 rounded-xl bg-neutral-800"><i class="fas fa-print"></i></button>
                </div></div>`;
        }).join('') || '<div class="m-auto text-neutral-500 text-center"><i class="fas fa-mug-hot text-5xl"></i><p class="mt-3">Belum ada pesanan</p></div>';
        $$('#k-board [data-i]').forEach(b => b.onclick = () => this.toggleItem(Number(b.dataset.t), b.dataset.i));
        $$('#k-board [data-st-t]').forEach(b => b.onclick = () => this.setStatus(Number(b.dataset.stT), b.dataset.to));
        $$('#k-board [data-print]').forEach(b => b.onclick = () => { const t = this.tickets.get(Number(b.dataset.print)); Printer.print({ label: 'Tiket', lines: Receipt.kitchen(t) }).catch(e => errorDialog(e)); });
    },

    async patch(id, body) {
        try {
            const r = await API.patch('/t/tickets/' + id, body);
            const t = r.ticket;
            if (['new', 'progress'].includes(t.status)) this.tickets.set(t.id, t); else { this.tickets.delete(t.id); this.recent = [t, ...this.recent.filter(x => x.id !== t.id)].slice(0, 30); }
            this.render();
        } catch (e) { toast(e.message, 'error'); }
    },
    toggleItem(id, itemId) {
        const t = this.tickets.get(id);
        if (!t) return;
        const done = t.items.filter(i => (i.id === itemId ? !i.done : i.done)).map(i => i.id);
        t.items.forEach(i => { i.done = done.includes(i.id); });
        this.render();
        this.patch(id, { done_items: done, ...(t.status === 'new' ? { status: 'progress' } : {}) });
    },
    setStatus(id, status) { this.patch(id, { status }); },

    showRecent() {
        $('#k-modal-title').textContent = 'Riwayat tiket (3 jam terakhir)';
        $('#k-modal-body').innerHTML = this.recent.map(t => `<div class="flex items-center gap-3 p-3 rounded-xl bg-neutral-800 mb-2"><div class="flex-1"><b>${esc(t.label)}</b> <span class="text-xs text-neutral-400">#${t.ticket_no} · ${esc(t.station)} · siap ${fmtTime(t.done_at)}</span>
            <div class="text-xs text-neutral-400">${esc(t.items.filter(i => !i.void).map(i => i.qty + '× ' + i.name).join(', '))}</div></div><button data-recall="${t.id}" class="px-3 py-2 rounded-lg bg-sky-600 text-sm font-semibold">Panggil ulang</button></div>`).join('') || '<p class="text-neutral-500">Belum ada tiket selesai</p>';
        $$('[data-recall]').forEach(b => b.onclick = () => { closeModal('k-modal'); this.patch(Number(b.dataset.recall), { status: 'progress' }); });
        openModal('k-modal');
    },

    settings() {
        const s = Printer.settings, sup = Printer.support();
        $('#k-modal-title').textContent = 'Pengaturan layar dapur';
        $('#k-modal-body').innerHTML = `<div class="space-y-4 text-sm">
            <label class="flex items-center gap-2"><input type="checkbox" id="ks-print" ${s.kitchen === 'all' ? 'checked' : ''} class="accent-orange-500 w-5 h-5">Cetak otomatis setiap tiket baru (stasiun terpilih)</label>
            <div class="flex flex-wrap gap-2"><button id="ks-serial" class="btn bg-neutral-800" ${sup.serial ? '' : 'disabled'}><i class="fas fa-link"></i>Printer Serial/Bluetooth</button><button id="ks-ble" class="btn bg-neutral-800" ${sup.bluetooth ? '' : 'disabled'}><i class="fab fa-bluetooth-b"></i>Printer BLE</button><button id="ks-test" class="btn bg-neutral-800">Tes cetak</button></div>
            <p class="text-neutral-400">Driver: ${esc(Printer.driverName())} · lebar ${s.width} mm</p>
            <div class="border-t border-neutral-800 pt-4"><button id="ks-unpair" class="btn bg-red-600/20 text-red-300"><i class="fas fa-link-slash"></i>Lepas pasangan perangkat</button></div></div>`;
        $('#ks-print').onchange = e => Printer.save({ kitchen: e.target.checked ? 'all' : 'none' });
        $('#ks-serial').onclick = () => Printer.connectSerial().then(() => toast('Printer tersambung', 'success')).catch(e => e.name !== 'NotFoundError' && errorDialog(e));
        $('#ks-ble').onclick = () => Printer.connectBluetooth().then(() => toast('Printer tersambung', 'success')).catch(e => e.name !== 'NotFoundError' && errorDialog(e));
        $('#ks-test').onclick = () => Printer.test().catch(e => errorDialog(e));
        $('#ks-unpair').onclick = async () => { if (await confirmDialog('Lepas pasangan layar dapur ini?', '', 'Lepas', true)) { Auth.device = null; location.href = '/'; } };
        openModal('k-modal');
    }
};
KDS.start();
