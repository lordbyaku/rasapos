// Panel superadmin: kelola tenant, paket & masa aktif (pengganti WEB APP MANAGEMENT).
import { Router, json, readJson, bad, notFound } from './lib/http.js';
import { hashSecret, randomToken } from './lib/crypto.js';
import { licenseOf } from './license.js';
import { addDays } from './lib/time.js';
import { tenantStub, callDO } from './do-client.js';

const DAY = 86400000;

export const adminRouter = new Router()
    .on('GET', '/overview', async (req, env) => {
        const since = addDays(new Date().toISOString().slice(0, 10), -30);
        const [tenants, users, devices, stats] = await Promise.all([
            env.CORE.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all(),
            env.CORE.prepare('SELECT tenant_id, COUNT(*) AS n FROM users GROUP BY tenant_id').all(),
            env.CORE.prepare('SELECT tenant_id, COUNT(*) AS n, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active FROM devices GROUP BY tenant_id').all(),
            env.CORE.prepare('SELECT tenant_id, SUM(trx) AS trx, SUM(sales) AS sales, MAX(outlets) AS outlets, MAX(date) AS last_date FROM tenant_stats WHERE date >= ? GROUP BY tenant_id').bind(since).all()
        ]);
        const by = (rows, k = 'tenant_id') => Object.fromEntries(rows.results.map(r => [r[k], r]));
        const u = by(users), d = by(devices), s = by(stats);
        const owners = await env.CORE.prepare("SELECT tenant_id, email, name FROM users WHERE role = 'owner'").all();
        const o = by(owners);
        const list = tenants.results.map(t => ({
            ...t, license: licenseOf(t, env), owner: o[t.id] || null,
            users: u[t.id]?.n || 0, devices: d[t.id]?.active || 0,
            trx_30d: s[t.id]?.trx || 0, sales_30d: s[t.id]?.sales || 0, outlets: s[t.id]?.outlets || 0, last_stat: s[t.id]?.last_date || null
        }));
        const count = st => list.filter(t => t.license.state === st).length;
        return json({
            summary: { tenants: list.length, trial: count('trial'), active: count('active'), grace: count('grace'), expired: count('expired'), suspended: count('suspended'), trx_30d: list.reduce((a, t) => a + t.trx_30d, 0), sales_30d: list.reduce((a, t) => a + t.sales_30d, 0) },
            tenants: list
        });
    })
    .on('GET', '/tenants/:id', async (req, env, a, p) => {
        const t = await env.CORE.prepare('SELECT * FROM tenants WHERE id = ?').bind(p.id).first();
        if (!t) throw notFound();
        const [users, devices, logs, stats] = await Promise.all([
            env.CORE.prepare('SELECT id, email, name, role, is_active, last_login_at FROM users WHERE tenant_id = ?').bind(t.id).all(),
            env.CORE.prepare('SELECT id, outlet_id, name, type, code, revoked_at, last_seen_at FROM devices WHERE tenant_id = ?').bind(t.id).all(),
            env.CORE.prepare('SELECT * FROM subscription_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').bind(t.id).all(),
            env.CORE.prepare('SELECT * FROM tenant_stats WHERE tenant_id = ? ORDER BY date DESC LIMIT 30').bind(t.id).all()
        ]);
        return json({ tenant: { ...t, license: licenseOf(t, env) }, users: users.results, devices: devices.results, logs: logs.results, stats: stats.results });
    })
    .on('POST', '/tenants/:id/subscription', async (req, env, a, p) => {
        const body = await readJson(req);
        const t = await env.CORE.prepare('SELECT * FROM tenants WHERE id = ?').bind(p.id).first();
        if (!t) throw notFound();
        const now = Date.now();
        let { status, paid_until, outlet_packs, trial_ends_at } = t;
        const notes = [];
        if (body.action === 'extend') {
            const months = Math.round(Number(body.months || 1));
            if (months < 1 || months > 36) throw bad('Jumlah bulan 1–36');
            const from = Math.max(paid_until || 0, now);
            const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + months);
            paid_until = d.getTime(); status = 'active';
            if (body.packs) outlet_packs = Math.max(1, Math.round(Number(body.packs)));
            if (!outlet_packs) outlet_packs = 1;
            notes.push(`Perpanjang ${months} bulan s/d ${new Date(paid_until).toISOString().slice(0, 10)}, ${outlet_packs} paket`);
        } else if (body.action === 'packs') {
            outlet_packs = Math.max(0, Math.round(Number(body.packs)));
            notes.push(`Jumlah paket → ${outlet_packs}`);
        } else if (body.action === 'extend_trial') {
            const days = Math.round(Number(body.days || 7));
            trial_ends_at = Math.max(trial_ends_at, now) + days * DAY;
            notes.push(`Trial +${days} hari s/d ${new Date(trial_ends_at).toISOString().slice(0, 10)}`);
        } else if (body.action === 'suspend') {
            status = 'suspended'; notes.push('Suspend: ' + String(body.reason || '-').slice(0, 120));
        } else if (body.action === 'unsuspend') {
            status = paid_until && paid_until > now ? 'active' : 'trial'; notes.push('Aktifkan kembali');
        } else throw bad('Aksi tidak dikenal');

        await env.CORE.batch([
            env.CORE.prepare('UPDATE tenants SET status = ?, paid_until = ?, outlet_packs = ?, trial_ends_at = ? WHERE id = ?').bind(status, paid_until, outlet_packs, trial_ends_at, t.id),
            env.CORE.prepare('INSERT INTO subscription_logs (tenant_id, action, detail, by_user, created_at) VALUES (?, ?, ?, ?, ?)').bind(t.id, body.action, notes.join('; '), a.user_id, now)
        ]);
        const nt = await env.CORE.prepare('SELECT * FROM tenants WHERE id = ?').bind(t.id).first();
        return json({ tenant: { ...nt, license: licenseOf(nt, env) } });
    })
    .on('POST', '/tenants/:id/refresh-stats', async (req, env, a, p) => {
        await callDO(tenantStub(env, Number(p.id)), 'POST', '/internal/push-stats', {}, { kind: 'system', tid: Number(p.id) });
        return json({ ok: true });
    })
    .on('POST', '/users/:id/reset-password', async (req, env, a, p) => {
        const u = await env.CORE.prepare('SELECT id FROM users WHERE id = ?').bind(p.id).first();
        if (!u) throw notFound();
        const temp = randomToken(6);
        await env.CORE.batch([
            env.CORE.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashSecret(temp, Number(env.PBKDF2_ITERATIONS || 60000)), u.id),
            env.CORE.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), u.id)
        ]);
        return json({ ok: true, temp_password: temp });
    });
