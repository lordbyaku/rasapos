// Pemantauan: catat error server (5xx) ke D1, ringkasan untuk panel superadmin, email harian bila ada error.
import { json } from './lib/http.js';
import { mailEnabled, sendMail } from './auth.js';
import { aiEnabled } from './ai-keys.js';

const HOUR = 3600000;

/** Catat satu error. Dibatasi 300/jam agar badai error tidak menghabiskan kuota tulis D1. */
export async function logError(env, request, status, message, tenantId) {
    try {
        const url = new URL(request.url);
        const recent = await env.CORE.prepare('SELECT COUNT(*) AS n FROM error_events WHERE at > ?').bind(Date.now() - HOUR).first();
        if (recent && recent.n >= 300) return;
        await env.CORE.prepare('INSERT INTO error_events (at, method, path, status, message, tenant_id) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(Date.now(), request.method, url.pathname.replace(/\/f\/\d+\/[\w-]+$/, '/f/:id').slice(0, 120), status, String(message || '').slice(0, 300), tenantId || null).run();
    } catch (e) {
        console.error('logError gagal', e);
    }
}

/** GET /api/admin/system — kesehatan sistem untuk superadmin */
export async function systemStatus(env) {
    const now = Date.now();
    const [day, week, last, byPath] = await Promise.all([
        env.CORE.prepare('SELECT COUNT(*) AS n FROM error_events WHERE at > ?').bind(now - 24 * HOUR).first(),
        env.CORE.prepare('SELECT COUNT(*) AS n FROM error_events WHERE at > ?').bind(now - 7 * 24 * HOUR).first(),
        env.CORE.prepare('SELECT * FROM error_events ORDER BY at DESC LIMIT 50').all(),
        env.CORE.prepare('SELECT method, path, COUNT(*) AS n, MAX(at) AS last FROM error_events WHERE at > ? GROUP BY method, path ORDER BY n DESC LIMIT 10').bind(now - 7 * 24 * HOUR).all()
    ]);
    return json({
        errors: { day: day.n, week: week.n, recent: last.results, top: byPath.results },
        services: {
            email: mailEnabled(env) ? (env.EMAIL ? 'Cloudflare Email' : 'Resend') : null,
            backup: !!env.BACKUP,
            ai: await aiEnabled(env),
            app_url: env.APP_URL || null
        }
    });
}

/** Cron harian: bersihkan log lama & kirim ringkasan error ke superadmin (bila email aktif). */
export async function dailyMaintenance(env) {
    const now = Date.now();
    await env.CORE.batch([
        env.CORE.prepare('DELETE FROM error_events WHERE at < ?').bind(now - 30 * 24 * HOUR),
        env.CORE.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(now - 2 * 24 * HOUR),
        env.CORE.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(now - 24 * HOUR)
    ]);
    const top = (await env.CORE.prepare('SELECT method, path, status, COUNT(*) AS n, MAX(message) AS msg FROM error_events WHERE at > ? GROUP BY method, path, status ORDER BY n DESC LIMIT 15').bind(now - 24 * HOUR).all()).results;
    if (!top.length || !mailEnabled(env)) return { errors: top.length, mailed: false };
    const total = top.reduce((s, r) => s + r.n, 0);
    const to = String(env.SUPERADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = top.map(r => `<tr><td>${r.n}×</td><td>${esc(r.method)} ${esc(r.path)}</td><td>${r.status}</td><td>${esc(r.msg || '')}</td></tr>`).join('');
    for (const addr of to) {
        await sendMail(env, addr, `[${env.APP_NAME || 'RasaPOS'}] ${total} error server dalam 24 jam`,
            `<p>${total} error server tercatat dalam 24 jam terakhir.</p><table border="1" cellpadding="4" cellspacing="0">${rows}</table><p>Detail: ${esc(env.APP_URL || '')}/admin.html → Sistem</p>`,
            `${total} error server dalam 24 jam terakhir.\n` + top.map(r => `${r.n}x ${r.method} ${r.path} ${r.status} ${r.msg || ''}`).join('\n'));
    }
    return { errors: top.length, mailed: true };
}
