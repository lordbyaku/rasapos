// Endpoint back office yang datanya ada di D1 inti: perangkat, kode pairing, akun manajer, lisensi.
import { Router, json, readJson, bad, forbidden, notFound } from './lib/http.js';
import { hashSecret, randomDigits, randomToken } from './lib/crypto.js';
import { pick, isEmail } from './lib/validate.js';
import { licenseOf, tenantFeatures } from './license.js';
import { getTenant } from './auth.js';
import { tenantStub, callDO } from './do-client.js';
import '../public/js/shared/features.js';

const ownerOnly = a => { if (a.role !== 'owner') throw forbidden('Hanya pemilik usaha yang dapat melakukan ini'); };
const inScope = (a, outletId) => a.outlet_ids === null || a.outlet_ids.includes(Number(outletId));

export const coreTenantRouter = new Router()
    .on('GET', '/devices', async (req, env, a) => {
        const { results } = await env.CORE.prepare('SELECT id, outlet_id, name, type, code, created_at, revoked_at, last_seen_at FROM devices WHERE tenant_id = ? ORDER BY created_at DESC').bind(a.tid).all();
        return json({ devices: results.filter(d => inScope(a, d.outlet_id)) });
    })
    .on('POST', '/pair-codes', async (req, env, a) => {
        const d = pick(await readJson(req), {
            outlet_id: { type: 'int', required: true, label: 'Outlet' },
            type: { type: 'str', enum: ['pos', 'kds'], default: 'pos' },
            name: { type: 'str', required: true, max: 40, label: 'Nama perangkat' }
        });
        if (!inScope(a, d.outlet_id)) throw forbidden();
        if (d.type === 'kds') {
            const t = await getTenant(env, a.tid);
            if (!tenantFeatures(t, env).kds) throw forbidden('Fitur Layar Dapur (KDS) tidak aktif untuk usaha ini. Hubungi admin RasaPOS.', 'feature_disabled');
        }
        // Pastikan outlet milik tenant & aktif
        await callDO(tenantStub(env, a.dk), 'GET', `/internal/outlet/${d.outlet_id}`, null, { kind: 'system', tid: a.tid, dk: a.dk });
        let code;
        for (let i = 0; i < 5; i++) {
            code = randomDigits(6);
            const exists = await env.CORE.prepare('SELECT code FROM pair_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?').bind(code, Date.now()).first();
            if (!exists) break;
        }
        const expires = Date.now() + 15 * 60000;
        await env.CORE.prepare('INSERT OR REPLACE INTO pair_codes (code, tenant_id, outlet_id, type, name, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(code, a.tid, d.outlet_id, d.type, d.name, a.user_id, expires).run();
        return json({ code, expires_at: expires }, 201);
    })
    .on('PATCH', '/devices/:id', async (req, env, a, p) => {
        const d = pick(await readJson(req), { name: { type: 'str', required: true, max: 40, label: 'Nama' } });
        const dev = await env.CORE.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').bind(p.id, a.tid).first();
        if (!dev || !inScope(a, dev.outlet_id)) throw notFound('Perangkat tidak ditemukan');
        await env.CORE.prepare('UPDATE devices SET name = ? WHERE id = ?').bind(d.name, p.id).run();
        return json({ ok: true });
    })
    .on('POST', '/devices/:id/revoke', async (req, env, a, p) => {
        const dev = await env.CORE.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?').bind(p.id, a.tid).first();
        if (!dev || !inScope(a, dev.outlet_id)) throw notFound('Perangkat tidak ditemukan');
        await env.CORE.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').bind(Date.now(), p.id).run();
        await callDO(tenantStub(env, a.dk), 'POST', '/internal/revoke-device', { device_id: p.id }, { kind: 'system', tid: a.tid, dk: a.dk });
        return json({ ok: true });
    })

    // Akun manajer (login email) — hanya owner
    .on('GET', '/users', async (req, env, a) => {
        ownerOnly(a);
        const { results } = await env.CORE.prepare('SELECT id, email, name, role, outlet_ids, is_active, created_at, last_login_at FROM users WHERE tenant_id = ? ORDER BY role DESC, name').bind(a.tid).all();
        return json({ users: results.map(u => ({ ...u, outlet_ids: u.outlet_ids ? JSON.parse(u.outlet_ids) : null })) });
    })
    .on('POST', '/users', async (req, env, a) => {
        ownerOnly(a);
        const d = pick(await readJson(req), {
            name: { type: 'str', required: true, max: 80, label: 'Nama' },
            email: { type: 'str', required: true, max: 120, label: 'Email' },
            outlet_ids: { type: 'raw', default: null }
        });
        if (!isEmail(d.email)) throw bad('Format email tidak valid');
        const exists = await env.CORE.prepare('SELECT id FROM users WHERE email = ?').bind(d.email).first();
        if (exists) throw bad('Email sudah dipakai akun lain');
        const outletIds = Array.isArray(d.outlet_ids) && d.outlet_ids.length ? JSON.stringify(d.outlet_ids.map(Number)) : null;
        const tempPassword = randomToken(6);
        await env.CORE.prepare('INSERT INTO users (email, password_hash, name, tenant_id, role, outlet_ids, created_at) VALUES (?, ?, ?, ?, \'manager\', ?, ?)')
            .bind(d.email.toLowerCase(), await hashSecret(tempPassword, Number(env.PBKDF2_ITERATIONS || 60000)), d.name, a.tid, outletIds, Date.now()).run();
        return json({ ok: true, temp_password: tempPassword }, 201);
    })
    .on('PATCH', '/users/:id', async (req, env, a, p) => {
        ownerOnly(a);
        const body = await readJson(req);
        const u = await env.CORE.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').bind(p.id, a.tid).first();
        if (!u || u.role === 'owner') throw notFound('Akun tidak ditemukan');
        const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) || u.name : u.name;
        const outletIds = body.outlet_ids !== undefined ? (Array.isArray(body.outlet_ids) && body.outlet_ids.length ? JSON.stringify(body.outlet_ids.map(Number)) : null) : u.outlet_ids;
        const active = body.is_active !== undefined ? (body.is_active ? 1 : 0) : u.is_active;
        await env.CORE.prepare('UPDATE users SET name = ?, outlet_ids = ?, is_active = ? WHERE id = ?').bind(name, outletIds, active, u.id).run();
        if (!active) await env.CORE.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), u.id).run();
        return json({ ok: true });
    })
    .on('POST', '/users/:id/reset-password', async (req, env, a, p) => {
        ownerOnly(a);
        const u = await env.CORE.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').bind(p.id, a.tid).first();
        if (!u || u.role === 'owner') throw notFound('Akun tidak ditemukan');
        const tempPassword = randomToken(6);
        await env.CORE.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashSecret(tempPassword, Number(env.PBKDF2_ITERATIONS || 60000)), u.id).run();
        return json({ ok: true, temp_password: tempPassword });
    })

    .on('GET', '/license', async (req, env, a) => {
        const t = await getTenant(env, a.tid);
        const { results } = await env.CORE.prepare('SELECT action, detail, created_at FROM subscription_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20').bind(a.tid).all();
        return json({
            tenant: { id: t.id, name: t.name, status: t.status, trial_ends_at: t.trial_ends_at, paid_until: t.paid_until, outlet_packs: t.outlet_packs },
            license: licenseOf(t, env), outlets_per_pack: Number(env.OUTLETS_PER_PACK || 5), logs: results
        });
    })
    .on('PATCH', '/tenant', async (req, env, a) => {
        ownerOnly(a);
        const d = pick(await readJson(req), { name: { type: 'str', required: true, max: 80, label: 'Nama usaha' }, phone: { type: 'str', max: 30, default: '' } });
        await env.CORE.prepare('UPDATE tenants SET name = ?, phone = ? WHERE id = ?').bind(d.name, d.phone, a.tid).run();
        await callDO(tenantStub(env, a.dk), 'POST', '/internal/tenant-name', { name: d.name }, { kind: 'system', tid: a.tid, dk: a.dk });
        return json({ ok: true });
    });
