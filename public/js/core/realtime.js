// Koneksi WebSocket ke server tenant dengan reconnect otomatis
class Realtime {
    constructor(urlFn) {
        this.urlFn = urlFn;
        this.handlers = {};
        this.statusHandlers = [];
        this.status = 'offline';
        this.retry = 0;
        this.ws = null;
        this.stopped = false;
    }
    on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
    onStatus(fn) { this.statusHandlers.push(fn); return this; }
    setStatus(s) {
        if (this.status === s) return;
        this.status = s;
        this.statusHandlers.forEach(f => f(s));
    }
    async connect() {
        this.stopped = false;
        if (!navigator.onLine) { this.setStatus('offline'); return this.schedule(); }
        let url;
        try { url = await this.urlFn(); } catch (e) { this.setStatus('offline'); return this.schedule(); }
        try { this.ws = new WebSocket(url); } catch { return this.schedule(); }
        this.setStatus('connecting');
        this.ws.onopen = () => {
            const reconnected = this.retry > 0 || this._wasOpen;
            this.retry = 0;
            this._wasOpen = true;
            this.setStatus('online');
            clearInterval(this.ping);
            this.ping = setInterval(() => { try { this.ws.send('ping'); } catch { } }, 25000);
            (this.handlers['open'] || []).forEach(f => f({ reconnected }));
        };
        this.ws.onmessage = ev => {
            if (ev.data === 'pong') return;
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            (this.handlers[msg.type] || []).forEach(f => f(msg.data, msg));
            (this.handlers['*'] || []).forEach(f => f(msg));
        };
        this.ws.onclose = ev => {
            clearInterval(this.ping);
            this.setStatus('offline');
            if (ev.code === 4001) { (this.handlers['revoked'] || []).forEach(f => f()); return; }
            if (!this.stopped) this.schedule();
        };
        this.ws.onerror = () => { try { this.ws.close(); } catch { } };
    }
    schedule() {
        clearTimeout(this.timer);
        const delay = Math.min(30000, 1000 * Math.pow(2, this.retry++)) + Math.random() * 1000;
        this.timer = setTimeout(() => this.connect(), delay);
    }
    stop() { this.stopped = true; clearTimeout(this.timer); clearInterval(this.ping); try { this.ws && this.ws.close(); } catch { } }
    reconnectNow() { clearTimeout(this.timer); this.retry = 0; if (this.status !== 'online') this.connect(); }
}

function wsUrl(params) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/ws?${new URLSearchParams(params)}`;
}
