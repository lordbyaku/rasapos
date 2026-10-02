export class HttpError extends Error {
    constructor(status, message, code = 'error', extra = undefined) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

export const bad = (message, code = 'bad_request') => new HttpError(400, message, code);
export const unauthorized = (message = 'Silakan login kembali', code = 'unauthorized') => new HttpError(401, message, code);
export const forbidden = (message = 'Anda tidak punya akses untuk tindakan ini', code = 'forbidden') => new HttpError(403, message, code);
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, message, 'not_found');

export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
    });
}

export function errorResponse(e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code, ...(e.extra || {}) }, e.status);
    if (globalThis.OrderOps && e instanceof globalThis.OrderOps.OpError) return json({ error: e.message, code: e.code }, 409);
    console.error('Unhandled error:', e && e.stack ? e.stack : e);
    return json({ error: 'Terjadi kesalahan di server', code: 'server_error' }, 500);
}

export async function readJson(request, maxBytes = 2_000_000) {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > maxBytes) throw new HttpError(413, 'Data terlalu besar', 'too_large');
    try {
        const body = await request.json();
        if (body === null || typeof body !== 'object') throw new Error();
        return body;
    } catch {
        throw bad('Body harus JSON yang valid');
    }
}

/** Router kecil: route('GET', '/menus/:id', handler) */
export class Router {
    constructor() { this.routes = []; }
    on(method, pattern, handler, opts = {}) {
        const keys = [];
        const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
        this.routes.push({ method, re, keys, handler, opts });
        return this;
    }
    match(method, path) {
        for (const r of this.routes) {
            if (r.method !== method) continue;
            const m = path.match(r.re);
            if (m) {
                const params = {};
                r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
                return { handler: r.handler, params, opts: r.opts };
            }
        }
        return null;
    }
}
