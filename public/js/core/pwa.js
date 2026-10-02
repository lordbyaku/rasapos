// Service worker & update aplikasi. Update hanya diterapkan saat aman (mis. keranjang kosong, outbox kosong).
const Pwa = {
    version: null,
    updateReady: false,
    canApply: () => true,
    onUpdate: null,
    async init(opts = {}) {
        if (opts.canApply) this.canApply = opts.canApply;
        if (opts.onUpdate) this.onUpdate = opts.onUpdate;
        // Di localhost SW dimatikan agar development tidak tertahan cache (aktifkan: localStorage.rp_dev_sw = 1)
        const devHost = ['localhost', '127.0.0.1'].includes(location.hostname) && !localStorage.getItem('rp_dev_sw');
        if ('serviceWorker' in navigator && !devHost) {
            try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn('SW gagal', e); }
        }
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
        this.version = (await this.fetchVersion()) || null;
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
        setInterval(() => this.check(), 30 * 60000);
    },
    async fetchVersion() {
        try { const r = await fetch('/version.json', { cache: 'no-store' }); return (await r.json()).version; } catch { return null; }
    },
    async check() {
        if (!navigator.onLine) return;
        const v = await this.fetchVersion();
        if (!v || !this.version || v === this.version) { if (v && !this.version) this.version = v; return; }
        this.updateReady = true;
        if (this.onUpdate) this.onUpdate(v);
        this.tryApply();
    },
    tryApply() {
        if (this.updateReady && this.canApply()) {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ action: 'SKIP_WAITING' });
            setTimeout(() => location.reload(), 300);
        }
    }
};

/** Jaga layar tetap menyala (kasir & dapur) */
const WakeLock = {
    lock: null,
    async enable() {
        if (!('wakeLock' in navigator)) return false;
        try {
            this.lock = await navigator.wakeLock.request('screen');
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible' && (!this.lock || this.lock.released)) {
                    try { this.lock = await navigator.wakeLock.request('screen'); } catch { }
                }
            });
            return true;
        } catch { return false; }
    }
};
