// Printer thermal: Web Serial (Bluetooth Classic/USB), Web Bluetooth (BLE), RawBT, atau print browser.
// Antrean cetak dengan retry: job tidak hilang jika printer mati/kertas habis.
const BLE_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb'];

const Printer = {
    settings: Object.assign({ driver: 'browser', width: 58, drawer: true, kitchen: 'none', copies: 1 }, Store.get('rp_printer') || {}),
    port: null,
    ble: null,
    queue: [],
    busy: false,
    status: 'idle', // idle | printing | error
    listeners: [],

    save(patch) { Object.assign(this.settings, patch); Store.set('rp_printer', this.settings); this.emit(); },
    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(f => f(this)); },

    support() {
        return { serial: 'serial' in navigator, bluetooth: 'bluetooth' in navigator, android: /Android/i.test(navigator.userAgent) };
    },

    driverName() {
        return { browser: 'Print browser', serial: 'Bluetooth/USB (Web Serial)', bluetooth: 'Bluetooth BLE', rawbt: 'Aplikasi RawBT' }[this.settings.driver] || this.settings.driver;
    },

    // ---------- koneksi ----------
    async connectSerial() {
        const port = await navigator.serial.requestPort();
        await this.openSerial(port);
        this.save({ driver: 'serial' });
    },
    async openSerial(port) {
        if (this.port && this.port !== port) { try { await this.port.close(); } catch { } }
        if (!port.readable && !port.writable) await port.open({ baudRate: 9600 });
        this.port = port;
    },
    async reconnectSerial() {
        if (this.port && this.port.writable) return true;
        if (!('serial' in navigator)) return false;
        const ports = await navigator.serial.getPorts();
        if (!ports.length) return false;
        try { await this.openSerial(ports[0]); return true; } catch { return false; }
    },
    async connectBluetooth() {
        const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
        await this.openBle(device);
        this.save({ driver: 'bluetooth' });
    },
    async openBle(device) {
        const server = await device.gatt.connect();
        for (const svc of await server.getPrimaryServices()) {
            for (const c of await svc.getCharacteristics()) {
                if (c.properties.write || c.properties.writeWithoutResponse) { this.ble = { device, char: c }; return; }
            }
        }
        throw new Error('Printer BLE tidak punya karakteristik tulis');
    },

    // ---------- kirim byte ----------
    async writeBytes(bytes) {
        const d = this.settings.driver;
        if (d === 'serial') {
            if (!(await this.reconnectSerial())) throw new Error('Printer belum tersambung. Buka Pengaturan → Printer.');
            const w = this.port.writable.getWriter();
            try { await w.write(bytes); } finally { w.releaseLock(); }
            return;
        }
        if (d === 'bluetooth') {
            if (!this.ble || !this.ble.device.gatt.connected) {
                if (this.ble) await this.openBle(this.ble.device); else throw new Error('Printer BLE belum tersambung. Buka Pengaturan → Printer.');
            }
            for (let i = 0; i < bytes.length; i += 180) {
                const chunk = bytes.slice(i, i + 180);
                if (this.ble.char.properties.writeWithoutResponse) await this.ble.char.writeValueWithoutResponse(chunk);
                else await this.ble.char.writeValue(chunk);
            }
            return;
        }
        if (d === 'rawbt') {
            let s = '';
            for (const b of bytes) s += String.fromCharCode(b);
            location.href = `intent:base64,${btoa(s)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
            return;
        }
        throw new Error('Driver tidak dikenal');
    },

    printHtml(lines) {
        let area = document.getElementById('print-area');
        if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
        area.className = this.settings.width === 58 ? 'w58' : '';
        area.innerHTML = Receipt.toHtml(lines);
        window.print();
    },

    // ---------- antrean ----------
    /** job: {label, lines, drawer} */
    print(job) {
        if (this.settings.driver === 'browser') { this.printHtml(job.lines); return Promise.resolve(); }
        return new Promise((resolve, reject) => {
            this.queue.push({ ...job, tries: 0, resolve, reject });
            this.run();
        });
    },
    async run() {
        if (this.busy) return;
        this.busy = true;
        while (this.queue.length) {
            const job = this.queue[0];
            this.status = 'printing'; this.emit();
            try {
                const bytes = job.lines.length ? Receipt.toEscPos(job.lines, this.settings.width, { drawer: job.drawer && this.settings.drawer }) : new EscPos().drawer().bytes();
                for (let i = 0; i < (job.copies || 1); i++) await this.writeBytes(bytes);
                this.queue.shift();
                job.resolve();
            } catch (e) {
                job.tries++;
                job.error = e.message;
                this.status = 'error'; this.lastError = e.message; this.emit();
                if (job.tries >= 3) { this.queue.shift(); job.reject(e); this.failed = [...(this.failed || []), job].slice(-20); continue; }
                await new Promise(r => setTimeout(r, 2000 * job.tries));
            }
        }
        this.busy = false;
        if (this.status !== 'error') this.status = 'idle';
        this.emit();
    },
    retryFailed() {
        const jobs = this.failed || [];
        this.failed = [];
        for (const j of jobs) this.print({ label: j.label, lines: j.lines, drawer: false }).catch(() => { });
    },
    async test() {
        return this.print({ label: 'Tes', lines: [{ t: 'text', s: 'RasaPOS', align: 'center', bold: true, big: true }, { t: 'text', s: 'Tes printer berhasil', align: 'center' }, { t: 'text', s: fmtDateTime(Date.now()), align: 'center' }, { t: 'hr' }] });
    }
};
