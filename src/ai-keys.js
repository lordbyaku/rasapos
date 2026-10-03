// API key Gemini milik superadmin: maks. 5 kunci terenkripsi di D1, dipakai bergiliran (round robin).
// Kunci yang kena limit / ditolak Google diistirahatkan (cooldown) dan permintaan dilempar ke kunci berikutnya.
// Secret Worker GEMINI_API_KEY (bila ada) ikut dipakai sebagai salah satu kunci.
import { HttpError } from './lib/http.js';
import { encryptText, decryptText } from './lib/crypto.js';

export const MAX_KEYS = 5;
const PURPOSE = 'ai-keys';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ENV_KEY_ID = 0;

const DEFAULTS = { ai_model: 'gemini-3.5-flash-lite', ai_tenant_daily: '60', ai_daily_limit: '900' };

export async function getSettings(env) {
    const rows = (await env.CORE.prepare("SELECT k, v FROM app_settings WHERE k IN ('ai_model', 'ai_tenant_daily', 'ai_daily_limit')").all()).results;
    const db = Object.fromEntries(rows.map(r => [r.k, r.v]));
    const pick = (k, envName) => db[k] || env[envName] || DEFAULTS[k];
    return {
        model: pick('ai_model', 'GEMINI_MODEL'),
        tenant_daily: Number(pick('ai_tenant_daily', 'AI_TENANT_DAILY')),
        daily_limit: Number(pick('ai_daily_limit', 'AI_DAILY_LIMIT'))
    };
}

export async function saveSettings(env, s) {
    const stmt = env.CORE.prepare('INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
    await env.CORE.batch(Object.entries(s).map(([k, v]) => stmt.bind(k, String(v))));
}

export const encryptKey = (env, key) => encryptText(key, env.JWT_SECRET, PURPOSE);
export const hintOf = key => '…' + key.slice(-4);

/** Ada kunci yang bisa dipakai? (untuk status tombol AI di halaman panduan) */
export async function aiEnabled(env) {
    if (env.GEMINI_API_KEY) return true;
    const r = await env.CORE.prepare('SELECT 1 FROM ai_keys WHERE is_active = 1 LIMIT 1').first();
    return !!r;
}

async function usableKeys(env) {
    const now = Date.now();
    const rows = (await env.CORE.prepare('SELECT id, label, key_enc, cooldown_until FROM ai_keys WHERE is_active = 1 ORDER BY id').all()).results;
    const keys = [];
    for (const r of rows) {
        try { keys.push({ id: r.id, label: r.label, key: await decryptText(r.key_enc, env.JWT_SECRET, PURPOSE), cooldown: r.cooldown_until || 0 }); }
        catch { await mark(env, r.id, { error: 'Tidak bisa dibuka — JWT_SECRET berubah? Hapus lalu masukkan ulang kunci ini.', cooldown: now + 86400000 }); }
    }
    if (env.GEMINI_API_KEY) keys.push({ id: ENV_KEY_ID, label: 'Secret Worker', key: env.GEMINI_API_KEY, cooldown: 0 });
    const ready = keys.filter(k => k.cooldown <= now);
    // Semua kunci sedang istirahat → tetap coba yang paling cepat pulih
    return ready.length ? ready : keys.sort((a, b) => a.cooldown - b.cooldown).slice(0, 1);
}

async function mark(env, id, { ok, error, cooldown }) {
    if (id === ENV_KEY_ID) return;
    const now = Date.now();
    if (ok) {
        await env.CORE.prepare('UPDATE ai_keys SET uses = uses + 1, last_used_at = ?, last_ok_at = ?, cooldown_until = NULL WHERE id = ?').bind(now, now, id).run();
    } else {
        await env.CORE.prepare('UPDATE ai_keys SET uses = uses + 1, fails = fails + 1, last_used_at = ?, last_error = ?, last_error_at = ?, cooldown_until = ? WHERE id = ?')
            .bind(now, String(error).slice(0, 300), now, cooldown || null, id).run();
    }
}

/** Kuota harian Gemini direset tengah malam waktu Pasifik (≈ 07:00–08:00 UTC). */
function nextDailyReset() {
    const d = new Date();
    d.setUTCHours(8, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
}

/** Klasifikasi error Gemini → { fatal (salah konfigurasi, jangan coba kunci lain), cooldown (ms), message } */
function classify(status, data) {
    const err = (data && data.error) || {};
    const details = err.details || [];
    const reason = details.map(d => d.reason).find(Boolean) || '';
    const msg = err.message || `HTTP ${status}`;
    if (status === 429) {
        const daily = details.some(d => (d.violations || []).some(v => /PerDay/i.test(v.quotaId || '')));
        const retry = details.map(d => d.retryDelay).find(Boolean);
        const wait = retry ? Math.min(600, parseFloat(retry) || 60) * 1000 : 60000;
        return { cooldown: daily ? nextDailyReset() - Date.now() : wait, message: daily ? 'Kuota harian kunci ini habis' : 'Kena batas per menit' };
    }
    if (reason === 'API_KEY_INVALID' || status === 401 || status === 403) return { cooldown: 6 * 3600000, message: 'Kunci ditolak Google: ' + msg };
    if (status === 404) return { fatal: true, message: 'Model tidak ditemukan: ' + msg };
    if (status === 400) return { fatal: true, message: 'Permintaan ditolak Gemini: ' + msg };
    return { cooldown: 0, message: 'Gemini error: ' + msg };
}

async function post(key, model, body, timeout = 25000) {
    try {
        const res = await fetch(API + encodeURIComponent(model) + ':generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeout)
        });
        return { status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { status: 0, data: { error: { message: e && e.name === 'TimeoutError' ? 'waktu habis' : 'gagal terhubung' } } };
    }
}

/** Panggil Gemini dengan kunci giliran berikutnya; pindah ke kunci lain bila gagal. */
export async function generate(env, body) {
    const { model } = await getSettings(env);
    const keys = await usableKeys(env);
    if (!keys.length) throw new HttpError(503, 'Asisten AI belum diaktifkan', 'ai_disabled');

    const rr = await env.CORE.prepare("INSERT INTO app_settings (k, v) VALUES ('ai_rr', '0') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1 RETURNING v").first();
    const start = Number(rr.v) % keys.length;
    let quota = true;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[(start + i) % keys.length];
        const r = await post(k.key, model, body);
        if (r.status === 200) {
            await mark(env, k.id, { ok: true });
            return r.data;
        }
        const c = r.status === 0 ? { cooldown: 0, message: 'Gemini ' + r.data.error.message } : classify(r.status, r.data);
        console.error('gemini key', k.id, r.status, c.message);
        await mark(env, k.id, { error: c.message, cooldown: c.cooldown ? Date.now() + c.cooldown : null });
        if (c.fatal) throw new HttpError(503, 'Asisten AI sedang bermasalah', 'ai_unavailable');
        if (r.status !== 429) quota = false;
    }
    throw quota ? new HttpError(429, 'Kuota asisten AI gratis sedang habis', 'ai_quota') : new HttpError(503, 'Asisten AI sedang bermasalah', 'ai_unavailable');
}

/** Uji satu kunci (panel superadmin). */
export async function testKey(env, key) {
    const { model } = await getSettings(env);
    const t = Date.now();
    const r = await post(key, model, { contents: [{ role: 'user', parts: [{ text: 'Balas satu kata: siap' }] }], generationConfig: { maxOutputTokens: 256 } }, 15000);
    if (r.status === 200) return { ok: true, model, ms: Date.now() - t };
    const c = r.status === 0 ? { message: r.data.error.message } : classify(r.status, r.data);
    return { ok: false, model, status: r.status, error: c.message, cooldown: c.cooldown || 0 };
}

export { decryptText, PURPOSE as KEY_PURPOSE };
