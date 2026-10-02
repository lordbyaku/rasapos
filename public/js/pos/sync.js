// Outbox: antrean operasi di IndexedDB, dikirim berurutan ke /api/t/ops (idempotent).
// Operasi yang tertunda > 30 detik ditandai offline (server memakai harga & waktu perangkat).
const Sync = {
    pending: 0,
    flushing: false,
    again: false,
    online: navigator.onLine,
    lastError: null,
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(f => f(this)); },
    setOnline(v) { if (this.online !== v) { this.online = v; this.emit(); } },

    async init() {
        this.pending = await IDB.count('outbox');
        window.addEventListener('online', () => { this.setOnline(true); this.flush(); });
        window.addEventListener('offline', () => this.setOnline(false));
        setInterval(() => { if (this.pending) this.flush(); }, 15000);
        this.emit();
    },

    async enqueue(op) {
        await IDB.put('outbox', op);
        this.pending = await IDB.count('outbox');
        this.emit();
        this.flush();
    },

    async ops() { return (await IDB.all('outbox')).sort((a, b) => a.seq - b.seq); },
    async opsFor(orderId) { return (await this.ops()).filter(o => o.order_id === orderId); },

    flush() {
        if (this.flushing) { this.again = true; return this._p; }
        this.flushing = true;
        const run = async () => {
            try {
                for (let guard = 0; guard < 20; guard++) {
                    this.again = false;
                    const ops = (await this.ops()).slice(0, 50);
                    if (!ops.length) break;
                    const now = Date.now();
                    let res;
                    try {
                        res = await API.post('/t/ops', { ops: ops.map(o => ({ op_id: o.op_id, type: o.type, order_id: o.order_id, payload: o.payload, at: o.at, staff_id: o.staff_id, offline: !!o.offline || now - o.at > 30000 })) });
                    } catch (e) {
                        this.lastError = e.message;
                        if (e.network) this.setOnline(false);
                        break;
                    }
                    this.setOnline(true);
                    this.lastError = null;
                    let blocked = false;
                    for (const r of res.results) {
                        const op = ops.find(o => o.op_id === r.op_id);
                        if (!op) continue;
                        if (r.ok || r.duplicate) { await IDB.del('outbox', op.seq); POS.onOpSynced(op, r); continue; }
                        // Ditolak karena sesi/izin/lisensi: simpan & coba lagi nanti (data tidak boleh hilang)
                        if ([401, 402, 403, 429].includes(r.status)) { blocked = true; op.error = r.error; await IDB.put('outbox', op); this.lastError = r.error; continue; }
                        // Melanggar aturan bisnis (mis. order sudah dibayar di perangkat lain): buang & beri tahu
                        await IDB.del('outbox', op.seq);
                        POS.onOpFailed(op, r);
                    }
                    if (blocked || (!this.again && ops.length < 50)) break;
                }
            } finally {
                this.flushing = false;
                this.pending = await IDB.count('outbox');
                this.emit();
            }
        };
        // Web Locks: hanya satu tab yang mengirim outbox
        this._p = navigator.locks ? navigator.locks.request('rasapos-outbox', run) : run();
        return this._p;
    },

    /** Nomor order unik per perangkat: <kode><YYMMDD>-<urut> */
    async nextOrderNo(code, bd) {
        const key = 'seq:' + bd;
        const n = ((await IDB.get('kv', key)) || 0) + 1;
        await IDB.set('kv', key, n);
        return `${code}${bd.slice(2).replace(/-/g, '')}-${String(n).padStart(4, '0')}`;
    }
};
