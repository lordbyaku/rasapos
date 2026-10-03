// Entry point Worker: aset statis + API.
import '../public/js/shared/money.js';
import '../public/js/shared/order-ops.js';
import '../public/js/shared/pricing.js';
import { json, errorResponse, unauthorized, forbidden, notFound, HttpError } from './lib/http.js';
import { verifyJwt } from './lib/jwt.js';
import { authRouter, bearer } from './auth.js';
import { adminRouter } from './admin.js';
import { coreTenantRouter } from './core-tenant.js';
import { forwardToDO, doKeyOf } from './do-client.js';

export { TenantDO } from './tenant/tenant-do.js';

/** Bangun konteks auth dari token user/perangkat (+ token staff opsional). */
async function authContext(env, token, staffToken) {
    if (!token) throw unauthorized();
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (payload.typ === 'user') {
        if (!payload.tid) throw forbidden('Akun ini tidak terhubung ke usaha mana pun');
        return { kind: 'user', tid: payload.tid, dk: payload.dk || 'tenant:' + payload.tid, user_id: payload.sub, role: payload.role, name: payload.name, outlet_ids: payload.oids ?? null, sa: !!payload.sa, lic: payload.lic };
    }
    if (payload.typ === 'device') {
        const ctx = { kind: 'device', tid: payload.tid, dk: payload.dk || 'tenant:' + payload.tid, device_id: payload.sub, device_type: payload.dtype, device_code: payload.code, device_name: payload.name, outlet_id: payload.oid, outlet_ids: [payload.oid], lic: payload.lic, staff: null };
        if (staffToken) {
            const s = await verifyJwt(staffToken, env.JWT_SECRET, 'staff');
            if (s.tid !== ctx.tid || s.did !== ctx.device_id) throw unauthorized('Sesi staff tidak cocok dengan perangkat', 'staff_invalid');
            ctx.staff = { id: s.sub, name: s.name, role: s.role, perms: s.perms };
        }
        return ctx;
    }
    throw unauthorized('Jenis token salah', 'invalid_token');
}

async function handleApi(request, env, url) {
    const path = url.pathname.replace(/^\/api/, '');

    if (path === '/health') return json({ ok: true, app: env.APP_NAME, time: Date.now() });

    if (path.startsWith('/auth/')) {
        const m = authRouter.match(request.method, path.slice(5));
        if (!m) throw notFound('Endpoint tidak ditemukan');
        return m.handler(request, env, m.params);
    }

    if (path.startsWith('/admin/')) {
        const a = await authContext(env, bearer(request));
        if (!a.sa) throw forbidden('Khusus superadmin');
        const m = adminRouter.match(request.method, path.slice(6));
        if (!m) throw notFound('Endpoint tidak ditemukan');
        return m.handler(request, env, a, m.params);
    }

    // File publik (foto menu) — id acak, tanpa auth agar bisa dipakai di <img>
    const file = path.match(/^\/f\/(\d+)\/([\w-]+)$/);
    if (file && request.method === 'GET') {
        return forwardToDO(env, request, `/files/${file[2]}`, { kind: 'public', tid: Number(file[1]), dk: await doKeyOf(env, file[1]) });
    }

    // Realtime: token lewat query (browser tidak bisa set header WebSocket)
    if (path === '/ws') {
        if (request.headers.get('upgrade') !== 'websocket') throw new HttpError(426, 'Butuh WebSocket', 'upgrade_required');
        const a = await authContext(env, url.searchParams.get('token'), url.searchParams.get('staff'));
        return forwardToDO(env, request, '/ws', a);
    }

    if (path.startsWith('/t/')) {
        const a = await authContext(env, bearer(request), request.headers.get('x-staff-token'));
        const sub = path.slice(2);
        const core = coreTenantRouter.match(request.method, sub);
        if (core) {
            if (a.kind !== 'user') throw forbidden('Hanya untuk akun pemilik/manajer');
            return core.handler(request, env, a, core.params);
        }
        return forwardToDO(env, request, sub, a);
    }

    throw notFound('Endpoint tidak ditemukan');
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/') return env.ASSETS.fetch(new Request(url.origin + '/index.html', request));
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
        try {
            return await handleApi(request, env, url);
        } catch (e) {
            return errorResponse(e);
        }
    }
};
