// Panel superadmin: kelola tenant, paket & masa aktif (pengganti WEB APP MANAGEMENT).
import { Router, json, readJson, bad, notFound, HttpError } from './lib/http.js';
import { hashSecret, randomToken } from './lib/crypto.js';
import { licenseOf } from './license.js';
import { addDays } from './lib/time.js';
import { tenantStub, callDO, doKeyOf } from './do-client.js';
import '../public/js/shared/features.js';
import { MAX_KEYS, getSettings, saveSettings, encryptKey, hintOf, testKey, decryptText, KEY_PURPOSE } from './ai-keys.js';

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
            ...t, license: licenseOf(t, env), owner: o[t.id] || null, features: globalThis.Features.resolve(t.features),
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
        return json({ tenant: { ...t, license: licenseOf(t, env), features: globalThis.Features.resolve(t.features) }, users: users.results, devices: devices.results, logs: logs.results, stats: stats.results });
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
    .on('PUT', '/tenants/:id/features', async (req, env, a, p) => {
        const F = globalThis.Features;
        const t = await env.CORE.prepare('SELECT id, do_key, features FROM tenants WHERE id = ?').bind(p.id).first();
        if (!t) throw notFound();
        const body = await readJson(req, 10000);
        const before = F.resolve(t.features);
        const next = F.resolve({ ...before, ...F.sanitize(body.features) });
        const changes = F.LIST.filter(f => before[f.key] !== next[f.key]).map(f => `${f.label} ${next[f.key] ? 'aktif' : 'nonaktif'}`);
        if (!changes.length) return json({ features: next });
        // Simpan hanya yang dimatikan: fitur baru di masa depan otomatis aktif
        const stored = Object.fromEntries(F.KEYS.filter(k => !next[k]).map(k => [k, false]));
        // DO dulu (penegak aturan), baru D1 (cermin untuk panel)
        await callDO(tenantStub(env, t.do_key), 'POST', '/internal/features', { features: stored }, { kind: 'system', tid: t.id, dk: t.do_key });
        try {
            await env.CORE.batch([
                env.CORE.prepare('UPDATE tenants SET features = ? WHERE id = ?').bind(Object.keys(stored).length ? JSON.stringify(stored) : null, t.id),
                env.CORE.prepare('INSERT INTO subscription_logs (tenant_id, action, detail, by_user, created_at) VALUES (?, ?, ?, ?, ?)').bind(t.id, 'features', 'Fitur: ' + changes.join(', '), a.user_id, Date.now())
            ]);
        } catch (e) {
            // Sudah berlaku di tenant; hanya catatan panel yang gagal (diselaraskan ulang otomatis tiap malam)
            console.error('features D1', e);
            throw new HttpError(500, 'Fitur sudah berlaku di tenant, tetapi gagal dicatat di panel. Simpan ulang untuk menyelaraskan.', 'features_log_failed');
        }
        return json({ features: next });
    })
    .on('POST', '/tenants/:id/refresh-stats', async (req, env, a, p) => {
        const dk = await doKeyOf(env, p.id);
        await callDO(tenantStub(env, dk), 'POST', '/internal/push-stats', {}, { kind: 'system', tid: Number(p.id), dk });
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
    })
    // ---- Asisten AI: API key Gemini (round robin) & pengaturan ----
    .on('GET', '/ai', async (req, env) => {
        const keys = (await env.CORE.prepare('SELECT id, label, key_hint, is_active, uses, fails, last_used_at, last_ok_at, last_error, last_error_at, cooldown_until, created_at FROM ai_keys ORDER BY id').all()).results;
        const usage = await env.CORE.prepare("SELECT count, window_start FROM login_attempts WHERE key = 'ai:all'").first();
        const live = usage && Date.now() - usage.window_start < 86400000;
        return json({ keys, max: MAX_KEYS, env_key: !!env.GEMINI_API_KEY, settings: await getSettings(env), usage: { count: live ? usage.count : 0, since: live ? usage.window_start : null } });
    })
    .on('POST', '/ai/keys', async (req, env) => {
        const body = await readJson(req, 10000);
        const key = String(body.key || '').trim();
        const label = String(body.label || '').trim().slice(0, 60) || 'Kunci';
        // format lama "AIza…" & format baru "AQ.…"
        if (!/^[\w.-]{20,300}$/.test(key)) throw bad('Format API key tidak valid', 'key_invalid');
        const rows = (await env.CORE.prepare('SELECT key_enc FROM ai_keys').all()).results;
        if (rows.length >= MAX_KEYS) throw bad(`Maksimal ${MAX_KEYS} API key. Hapus salah satu dulu.`, 'key_limit');
        for (const r of rows) {
            const k = await decryptText(r.key_enc, env.JWT_SECRET, KEY_PURPOSE).catch(() => null);
            if (k === key) throw bad('API key ini sudah terdaftar', 'key_duplicate');
        }
        const test = await testKey(env, key);
        if (!test.ok && /ditolak Google/.test(test.error || '')) throw bad(test.error, 'key_rejected');
        const now = Date.now();
        const row = await env.CORE.prepare('INSERT INTO ai_keys (label, key_enc, key_hint, created_at, last_ok_at, last_error, last_error_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
            .bind(label, await encryptKey(env, key), hintOf(key), now, test.ok ? now : null, test.ok ? null : test.error, test.ok ? null : now).first();
        return json({ id: row.id, test }, 201);
    })
    .on('PATCH', '/ai/keys/:id', async (req, env, a, p) => {
        const body = await readJson(req, 10000);
        const k = await env.CORE.prepare('SELECT id FROM ai_keys WHERE id = ?').bind(p.id).first();
        if (!k) throw notFound();
        if (body.label !== undefined) await env.CORE.prepare('UPDATE ai_keys SET label = ? WHERE id = ?').bind(String(body.label).trim().slice(0, 60) || 'Kunci', k.id).run();
        if (body.is_active !== undefined) await env.CORE.prepare('UPDATE ai_keys SET is_active = ? WHERE id = ?').bind(body.is_active ? 1 : 0, k.id).run();
        if (body.reset) await env.CORE.prepare('UPDATE ai_keys SET cooldown_until = NULL, last_error = NULL, last_error_at = NULL WHERE id = ?').bind(k.id).run();
        return json({ ok: true });
    })
    .on('DELETE', '/ai/keys/:id', async (req, env, a, p) => {
        await env.CORE.prepare('DELETE FROM ai_keys WHERE id = ?').bind(p.id).run();
        return json({ ok: true });
    })
    .on('POST', '/ai/keys/:id/test', async (req, env, a, p) => {
        const k = await env.CORE.prepare('SELECT key_enc FROM ai_keys WHERE id = ?').bind(p.id).first();
        if (!k) throw notFound();
        const key = await decryptText(k.key_enc, env.JWT_SECRET, KEY_PURPOSE).catch(() => null);
        if (!key) throw bad('Kunci tidak bisa dibuka (JWT_SECRET berubah?). Hapus lalu masukkan ulang.', 'key_unreadable');
        const test = await testKey(env, key);
        const now = Date.now();
        if (test.ok) await env.CORE.prepare('UPDATE ai_keys SET last_ok_at = ?, last_error = NULL, cooldown_until = NULL WHERE id = ?').bind(now, p.id).run();
        else await env.CORE.prepare('UPDATE ai_keys SET last_error = ?, last_error_at = ?, cooldown_until = ? WHERE id = ?').bind(test.error, now, test.cooldown ? now + test.cooldown : null, p.id).run();
        return json(test);
    })
    .on('PUT', '/ai/settings', async (req, env) => {
        const body = await readJson(req, 10000);
        const model = String(body.model || '').trim();
        const tenantDaily = Math.round(Number(body.tenant_daily)), dailyLimit = Math.round(Number(body.daily_limit));
        if (!/^[\w.-]{3,80}$/.test(model)) throw bad('Nama model tidak valid');
        if (!(tenantDaily >= 0 && tenantDaily <= 100000) || !(dailyLimit >= 0 && dailyLimit <= 1000000)) throw bad('Batas harian tidak valid');
        await saveSettings(env, { ai_model: model, ai_tenant_daily: tenantDaily, ai_daily_limit: dailyLimit });
        return json({ settings: await getSettings(env) });
    });
