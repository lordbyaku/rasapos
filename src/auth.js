import { Router, json, readJson, bad, unauthorized, forbidden, HttpError } from './lib/http.js';
import { hashSecret, verifySecret, randomToken, randomDigits, sha256 } from './lib/crypto.js';
import { signJwt, verifyJwt } from './lib/jwt.js';
import { pick, isEmail } from './lib/validate.js';
import { licenseOf, licClaim } from './license.js';
import { tenantStub, callDO } from './do-client.js';

const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 30 * 86400;
const DEVICE_TTL = 12 * 3600;
const DAY = 86400000;

export const isSuperadmin = (env, email) =>
    String(env.SUPERADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase());

/** Rate limit sederhana berbasis D1 (jendela tetap). */
export async function rateLimit(env, key, max, windowSec) {
    const now = Date.now();
    const row = await env.CORE.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(key).first();
    if (!row || now - row.window_start > windowSec * 1000) {
        await env.CORE.prepare('INSERT OR REPLACE INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
        return;
    }
    if (row.count >= max) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', 'rate_limited');
    await env.CORE.prepare('UPDATE login_attempts SET count = count + 1 WHERE key = ?').bind(key).run();
}

const clearRate = (env, key) => env.CORE.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
const clientIp = req => req.headers.get('cf-connecting-ip') || 'local';

export async function getTenant(env, id) {
    return env.CORE.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
}

const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenant_id: u.tenant_id, outlet_ids: u.outlet_ids ? JSON.parse(u.outlet_ids) : null });

async function issueUserTokens(env, user, tenant) {
    const lic = tenant ? licenseOf(tenant, env) : null;
    const access = await signJwt({
        typ: 'user', sub: user.id, tid: user.tenant_id, dk: tenant ? tenant.do_key : null, role: user.role, name: user.name,
        oids: user.outlet_ids ? JSON.parse(user.outlet_ids) : null,
        sa: isSuperadmin(env, user.email) ? 1 : 0, lic: lic ? licClaim(lic) : null
    }, env.JWT_SECRET, ACCESS_TTL);
    const refresh = randomToken(32);
    await env.CORE.prepare('INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(await sha256(refresh), user.id, Date.now() + REFRESH_TTL * 1000).run();
    return {
        access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL,
        user: { ...publicUser(user), superadmin: isSuperadmin(env, user.email) },
        tenant: tenant ? { id: tenant.id, name: tenant.name, license: lic } : null
    };
}

export async function issueDeviceToken(env, device, tenant) {
    const lic = licenseOf(tenant, env);
    const token = await signJwt({
        typ: 'device', sub: device.id, tid: device.tenant_id, dk: tenant.do_key, oid: device.outlet_id,
        dtype: device.type, code: device.code, name: device.name, lic: licClaim(lic)
    }, env.JWT_SECRET, DEVICE_TTL);
    return { access_token: token, expires_in: DEVICE_TTL, license: lic };
}

async function sendResetEmail(env, email, link) {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
        console.log(`[reset-password] ${email}: ${link}`);
        return false;
    }
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            from: env.MAIL_FROM, to: [email], subject: `Reset password ${env.APP_NAME || 'RasaPOS'}`,
            html: `<p>Klik tautan berikut untuk membuat password baru (berlaku 1 jam):</p><p><a href="${link}">${link}</a></p><p>Abaikan email ini jika Anda tidak meminta reset password.</p>`
        })
    });
    if (!res.ok) console.error('Gagal kirim email reset:', res.status, await res.text());
    return res.ok;
}

const iterations = env => Number(env.PBKDF2_ITERATIONS || 60000);

export const authRouter = new Router()
    .on('POST', '/register', async (req, env) => {
        const body = await readJson(req);
        const data = pick(body, {
            business_name: { type: 'str', required: true, max: 80, label: 'Nama usaha' },
            owner_name: { type: 'str', required: true, max: 80, label: 'Nama pemilik' },
            email: { type: 'str', required: true, max: 120, label: 'Email' },
            phone: { type: 'str', max: 30, default: '' },
            password: { type: 'str', required: true, min: 8, max: 100, label: 'Password' },
            outlet_name: { type: 'str', max: 80, default: 'Outlet Utama' }
        });
        if (!isEmail(data.email)) throw bad('Format email tidak valid');
        await rateLimit(env, 'register:' + clientIp(req), 10, 3600);
        const exists = await env.CORE.prepare('SELECT id FROM users WHERE email = ?').bind(data.email).first();
        if (exists) throw bad('Email sudah terdaftar. Silakan login.', 'email_taken');

        const now = Date.now();
        const trialEnd = now + Number(env.TRIAL_DAYS || 14) * DAY;
        // Kunci penyimpanan acak: data tenant tidak pernah tertukar walau ID D1 terulang
        const t = await env.CORE.prepare('INSERT INTO tenants (name, phone, status, trial_ends_at, outlet_packs, created_at, do_key) VALUES (?, ?, \'trial\', ?, 0, ?, ?) RETURNING *')
            .bind(data.business_name, data.phone, trialEnd, now, 'tenant:' + randomToken(18)).first();
        const hash = await hashSecret(data.password, iterations(env));
        const user = await env.CORE.prepare('INSERT INTO users (email, password_hash, name, tenant_id, role, created_at, last_login_at) VALUES (?, ?, ?, ?, \'owner\', ?, ?) RETURNING *')
            .bind(data.email.toLowerCase(), hash, data.owner_name, t.id, now, now).first();
        await env.CORE.prepare('UPDATE tenants SET owner_user_id = ? WHERE id = ?').bind(user.id, t.id).run();
        await env.CORE.prepare('INSERT INTO subscription_logs (tenant_id, action, detail, created_at) VALUES (?, \'register\', ?, ?)')
            .bind(t.id, `Trial sampai ${new Date(trialEnd).toISOString().slice(0, 10)}`, now).run();

        await callDO(tenantStub(env, t.do_key), 'POST', '/internal/init', { tenant_id: t.id, business_name: data.business_name, outlet_name: data.outlet_name, phone: data.phone }, { kind: 'system', tid: t.id, dk: t.do_key });
        return json(await issueUserTokens(env, user, t), 201);
    })

    .on('POST', '/login', async (req, env) => {
        const body = await readJson(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!email || !password) throw bad('Email dan password wajib diisi');
        const key = 'login:' + email;
        await rateLimit(env, key, 8, 900);
        const user = await env.CORE.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        if (!user || !(await verifySecret(password, user.password_hash))) throw unauthorized('Email atau password salah', 'invalid_login');
        if (!user.is_active) throw forbidden('Akun dinonaktifkan. Hubungi pemilik usaha.');
        await clearRate(env, key);
        await env.CORE.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
        const tenant = user.tenant_id ? await getTenant(env, user.tenant_id) : null;
        return json(await issueUserTokens(env, user, tenant));
    })

    .on('POST', '/refresh', async (req, env) => {
        const { refresh_token } = await readJson(req);
        if (!refresh_token) throw unauthorized();
        const h = await sha256(refresh_token);
        const row = await env.CORE.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').bind(h).first();
        if (!row || row.revoked_at || row.expires_at < Date.now()) throw unauthorized('Sesi berakhir, silakan login kembali', 'refresh_invalid');
        const user = await env.CORE.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
        if (!user || !user.is_active) throw unauthorized();
        await env.CORE.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?').bind(Date.now(), h).run();
        const tenant = user.tenant_id ? await getTenant(env, user.tenant_id) : null;
        return json(await issueUserTokens(env, user, tenant));
    })

    .on('POST', '/logout', async (req, env) => {
        const { refresh_token } = await readJson(req);
        if (refresh_token) await env.CORE.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?').bind(Date.now(), await sha256(refresh_token)).run();
        return json({ ok: true });
    })

    .on('POST', '/forgot', async (req, env) => {
        const { email } = await readJson(req);
        await rateLimit(env, 'forgot:' + clientIp(req), 5, 3600);
        const user = email ? await env.CORE.prepare('SELECT id, email FROM users WHERE email = ? AND is_active = 1').bind(String(email).trim().toLowerCase()).first() : null;
        if (user) {
            const token = randomToken(32);
            await env.CORE.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), user.id, Date.now() + 3600000).run();
            await sendResetEmail(env, user.email, `${env.APP_URL || ''}/#reset=${token}`);
        }
        return json({ ok: true, message: 'Jika email terdaftar, tautan reset sudah dikirim.' });
    })

    .on('POST', '/reset', async (req, env) => {
        const { token, password } = await readJson(req);
        if (!token || String(password || '').length < 8) throw bad('Password minimal 8 karakter');
        const h = await sha256(token);
        const row = await env.CORE.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(h).first();
        if (!row || row.used_at || row.expires_at < Date.now()) throw bad('Tautan reset tidak valid atau kedaluwarsa', 'reset_invalid');
        const hash = await hashSecret(password, iterations(env));
        await env.CORE.batch([
            env.CORE.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, row.user_id),
            env.CORE.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(Date.now(), h),
            env.CORE.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), row.user_id)
        ]);
        return json({ ok: true });
    })

    .on('GET', '/me', async (req, env) => {
        const auth = await verifyJwt(bearer(req), env.JWT_SECRET, 'user');
        const user = await env.CORE.prepare('SELECT * FROM users WHERE id = ?').bind(auth.sub).first();
        if (!user || !user.is_active) throw unauthorized();
        const tenant = user.tenant_id ? await getTenant(env, user.tenant_id) : null;
        return json({
            user: { ...publicUser(user), superadmin: isSuperadmin(env, user.email) },
            tenant: tenant ? { id: tenant.id, name: tenant.name, status: tenant.status, outlet_packs: tenant.outlet_packs, trial_ends_at: tenant.trial_ends_at, paid_until: tenant.paid_until, license: licenseOf(tenant, env) } : null
        });
    })

    .on('POST', '/change-password', async (req, env) => {
        const auth = await verifyJwt(bearer(req), env.JWT_SECRET, 'user');
        const { old_password, new_password } = await readJson(req);
        if (String(new_password || '').length < 8) throw bad('Password baru minimal 8 karakter');
        const user = await env.CORE.prepare('SELECT * FROM users WHERE id = ?').bind(auth.sub).first();
        if (!user || !(await verifySecret(String(old_password || ''), user.password_hash))) throw bad('Password lama salah');
        await env.CORE.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashSecret(new_password, iterations(env)), user.id).run();
        return json({ ok: true });
    })

    // Pairing perangkat outlet dengan kode 6 digit dari back office
    .on('POST', '/pair', async (req, env) => {
        const { code } = await readJson(req);
        await rateLimit(env, 'pair:' + clientIp(req), 10, 900);
        const c = String(code || '').replace(/\D/g, '');
        const row = c.length === 6 ? await env.CORE.prepare('SELECT * FROM pair_codes WHERE code = ?').bind(c).first() : null;
        if (!row || row.used_at || row.expires_at < Date.now()) throw bad('Kode pairing salah atau sudah kedaluwarsa', 'pair_invalid');
        const tenant = await getTenant(env, row.tenant_id);
        const count = await env.CORE.prepare('SELECT COUNT(*) AS n FROM devices WHERE tenant_id = ? AND outlet_id = ?').bind(row.tenant_id, row.outlet_id).first();
        const n = count.n;
        const devCode = String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : '');
        const secret = randomToken(32);
        const device = {
            id: 'dev_' + randomToken(9), tenant_id: row.tenant_id, outlet_id: row.outlet_id, name: row.name, type: row.type, code: devCode
        };
        await env.CORE.batch([
            env.CORE.prepare('INSERT INTO devices (id, tenant_id, outlet_id, name, type, code, secret_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(device.id, device.tenant_id, device.outlet_id, device.name, device.type, device.code, await sha256(secret), Date.now(), Date.now()),
            env.CORE.prepare('UPDATE pair_codes SET used_at = ? WHERE code = ?').bind(Date.now(), c)
        ]);
        const tok = await issueDeviceToken(env, device, tenant);
        return json({ device: { ...device, secret }, tenant: { id: tenant.id, name: tenant.name }, ...tok }, 201);
    })

    .on('POST', '/device-token', async (req, env) => {
        const { device_id, secret } = await readJson(req);
        const device = device_id ? await env.CORE.prepare('SELECT * FROM devices WHERE id = ?').bind(device_id).first() : null;
        if (!device || device.secret_hash !== (await sha256(String(secret || '')))) throw unauthorized('Perangkat tidak dikenal', 'device_invalid');
        if (device.revoked_at) throw unauthorized('Perangkat ini sudah dicabut aksesnya oleh pemilik', 'device_revoked');
        const tenant = await getTenant(env, device.tenant_id);
        await env.CORE.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(Date.now(), device.id).run();
        return json({ device: { id: device.id, name: device.name, type: device.type, code: device.code, outlet_id: device.outlet_id, tenant_id: device.tenant_id }, tenant: { id: tenant.id, name: tenant.name }, ...(await issueDeviceToken(env, device, tenant)) });
    });

export function bearer(req) {
    const h = req.headers.get('authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
}
