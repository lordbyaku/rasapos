import { HttpError } from './lib/http.js';

export const tenantStub = (env, tid) => env.TENANT.get(env.TENANT.idFromName('tenant:' + tid));

/** Teruskan request ke Durable Object tenant dengan konteks auth terverifikasi. */
export function forwardToDO(env, request, path, authCtx) {
    const url = new URL(request.url);
    const target = new URL('https://tenant' + path + url.search);
    const headers = new Headers(request.headers);
    headers.set('x-rp-ctx', JSON.stringify(authCtx));
    headers.delete('authorization');
    return tenantStub(env, authCtx.tid).fetch(new Request(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body }));
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
