import { HttpError } from './lib/http.js';

/** Stub Durable Object tenant. key = tenants.do_key (acak untuk tenant baru, 'tenant:<id>' untuk tenant lama). */
export const tenantStub = (env, key) => {
    if (!key || typeof key !== 'string') throw new HttpError(500, 'Kunci penyimpanan tenant tidak ada', 'no_do_key');
    return env.TENANT.get(env.TENANT.idFromName(key));
};

/** Ambil kunci DO dari D1 (dipakai bila konteks tidak membawa kunci, mis. panel admin & URL foto). */
export async function doKeyOf(env, tid) {
    const row = await env.CORE.prepare('SELECT do_key FROM tenants WHERE id = ?').bind(Number(tid)).first();
    if (!row || !row.do_key) throw new HttpError(404, 'Tenant tidak ditemukan', 'not_found');
    return row.do_key;
}

/** Teruskan request ke Durable Object tenant dengan konteks auth terverifikasi. */
export async function forwardToDO(env, request, path, authCtx) {
    const url = new URL(request.url);
    const target = new URL('https://tenant' + path + url.search);
    const headers = new Headers(request.headers);
    headers.set('x-rp-ctx', JSON.stringify(authCtx));
    headers.delete('authorization');
    // Body dibaca penuh (bukan stream): DO boleh menolak request tanpa membaca body,
    // dan stream yang tertinggal akan menggagalkan request berikutnya.
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > 2_000_000) throw new HttpError(413, 'Data terlalu besar', 'too_large');
    return tenantStub(env, authCtx.dk).fetch(new Request(target, { method: request.method, headers, body }));
}

/** Panggilan internal Worker → DO, mengembalikan JSON atau melempar HttpError. */
export async function callDO(stub, method, path, body, authCtx) {
    const res = await stub.fetch(new Request('https://tenant' + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-rp-ctx': JSON.stringify(authCtx) },
        body: body ? JSON.stringify(body) : undefined
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, data.error || 'Gagal memproses di server tenant', data.code || 'do_error');
    return data;
}
