// Klien API + penyimpanan sesi (user back office, perangkat outlet, staff)
class ApiError extends Error {
    constructor(status, code, message, data) { super(message); this.status = status; this.code = code; this.data = data; }
    get network() { return this.status === 0; }
}

const Store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage penuh/diblokir */ } }
};

const Auth = {
    get user() { return Store.get('rp_user'); },
    set user(v) { Store.set('rp_user', v); },
    get device() { return Store.get('rp_device'); },
    set device(v) { Store.set('rp_device', v); },
    get staff() { const s = Store.get('rp_staff'); return s && s.exp > Date.now() ? s : null; },
    set staff(v) { Store.set('rp_staff', v); },
    saveUser(res) {
        Auth.user = { access_token: res.access_token, refresh_token: res.refresh_token, exp: Date.now() + res.expires_in * 1000, user: res.user, tenant: res.tenant };
    },
    logoutUser() {
        const u = Auth.user;
        if (u && u.refresh_token) fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: u.refresh_token }) }).catch(() => { });
        Auth.user = null;
    }
};

const API = {
    mode: 'user', // 'user' | 'device'
    onAuthLost: null,
    _refreshing: null,

    async userToken() {
        const u = Auth.user;
        if (!u) throw new ApiError(401, 'unauthorized', 'Silakan login');
        if (u.exp - Date.now() > 60000) return u.access_token;
        if (!this._refreshing) {
            this._refreshing = (async () => {
                const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: u.refresh_token }) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { Auth.user = null; throw new ApiError(401, data.code || 'refresh_invalid', data.error || 'Sesi berakhir'); }
                Auth.saveUser(data);
                return data.access_token;
            })().finally(() => { this._refreshing = null; });
        }
        return this._refreshing;
    },

    async deviceToken(force = false) {
        const d = Auth.device;
        if (!d) throw new ApiError(401, 'no_device', 'Perangkat belum dipasangkan');
        if (!force && d.access_token && d.exp - Date.now() > 5 * 60000) return d.access_token;
        if (!this._refreshing) {
            this._refreshing = (async () => {
                try {
                    const res = await fetch('/api/auth/device-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: d.device.id, secret: d.device.secret }) });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new ApiError(res.status, data.code || 'device_invalid', data.error || 'Perangkat tidak valid');
                    Auth.device = { ...d, access_token: data.access_token, exp: Date.now() + data.expires_in * 1000, license: data.license, tenant: data.tenant, device: { ...d.device, ...data.device, secret: d.device.secret } };
                    return data.access_token;
                } catch (e) {
                    if (e instanceof ApiError) throw e;
                    if (d.access_token) return d.access_token; // offline: pakai token lama
                    throw new ApiError(0, 'network', 'Tidak ada koneksi internet');
                }
            })().finally(() => { this._refreshing = null; });
        }
        return this._refreshing;
    },

    async token() { return this.mode === 'device' ? this.deviceToken() : this.userToken(); },

    async req(method, path, body, opts = {}) {
        const headers = { 'content-type': 'application/json' };
        if (!opts.public) headers.authorization = 'Bearer ' + (await this.token());
        if (this.mode === 'device' && Auth.staff && !opts.noStaff) headers['x-staff-token'] = Auth.staff.staff_token;
        let res;
        try {
            res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: opts.signal });
        } catch (e) {
            throw new ApiError(0, 'network', 'Tidak ada koneksi internet');
        }
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.blob();
        if (res.status === 401 && !opts.retried && ['token_expired', 'invalid_token'].includes(data.code)) {
            if (this.mode === 'device') await this.deviceToken(true); else { const u = Auth.user; if (u) { u.exp = 0; Auth.user = u; } }
            return this.req(method, path, body, { ...opts, retried: true });
        }
        if (!res.ok) {
            const err = new ApiError(res.status, data.code || 'error', data.error || `Kesalahan ${res.status}`, data);
            if (res.status === 401 && this.onAuthLost && ['refresh_invalid', 'device_revoked', 'device_invalid', 'unauthorized', 'staff_invalid'].includes(err.code)) this.onAuthLost(err);
            throw err;
        }
        return data;
    },
    get(p, o) { return this.req('GET', p, undefined, o); },
    post(p, b, o) { return this.req('POST', p, b ?? {}, o); },
    put(p, b, o) { return this.req('PUT', p, b, o); },
    patch(p, b, o) { return this.req('PATCH', p, b, o); },
    del(p, o) { return this.req('DELETE', p, undefined, o); },

    async publicPost(path, body) {
        let res;
        try { res = await fetch('/api' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
        catch { throw new ApiError(0, 'network', 'Tidak ada koneksi internet'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, data.code || 'error', data.error || `Kesalahan ${res.status}`, data);
        return data;
    }
};

/** Status lisensi untuk ditampilkan */
function licenseText(l) {
    if (!l) return '';
    const s = l.state || l.s;
    const until = l.until || l.u;
    const map = { trial: 'Trial', active: 'Aktif', grace: 'Masa tenggang', expired: 'Kedaluwarsa', suspended: 'Ditangguhkan' };
    const plan = { basic: 'Basic', pro: 'Pro' }[l.plan || l.p];
    return `${plan && s !== 'trial' ? 'Paket ' + plan + ' · ' : ''}${map[s] || s}${until ? ' s/d ' + fmtDate(until) : ''}`;
}
