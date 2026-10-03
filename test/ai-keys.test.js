// Round robin & failover API key Gemini — memakai D1 tiruan (node:sqlite) dan respons Google tiruan.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generate, testKey, encryptKey } from '../src/ai-keys.js';

/** D1 tiruan secukupnya: prepare().bind().first/all/run + batch */
function fakeD1() {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../migrations/0003_ai_keys.sql', import.meta.url), 'utf8'));
    const stmt = (sql, args = []) => ({
        bind: (...a) => stmt(sql, a),
        first: async () => db.prepare(sql).get(...args) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...args) }),
        run: async () => db.prepare(sql).run(...args)
    });
    return { db, prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); } };
}

const SECRET = 'rahasia-uji-yang-cukup-panjang-123456';
let env, calls, behave;
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'siap' }] } }] }), { status: 200 });
const err = (status, body) => new Response(JSON.stringify({ error: body }), { status });
const perMinute = () => err(429, { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '33s' }] });
const perDay = () => err(429, { message: 'quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] });
const invalid = () => err(400, { message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] });

async function addKey(label, key) {
    await env.CORE.prepare('INSERT INTO ai_keys (label, key_enc, key_hint, created_at) VALUES (?, ?, ?, ?)').bind(label, await encryptKey(env, key), key.slice(-4), Date.now()).run();
}
const row = id => env.CORE.db.prepare('SELECT * FROM ai_keys WHERE id = ?').get(id);
const body = { contents: [{ role: 'user', parts: [{ text: 'halo' }] }] };

beforeEach(async () => {
    env = { CORE: fakeD1(), JWT_SECRET: SECRET };
    calls = [];
    behave = {};
    globalThis.fetch = async (url, opts) => {
        const key = opts.headers['x-goog-api-key'];
        calls.push(key);
        const b = behave[key];
        if (b === 'network') throw new TypeError('fetch failed');
        return b ? b() : ok();
    };
    for (const k of ['KEY-A', 'KEY-B', 'KEY-C']) await addKey(k, k + '-xxxxxxxxxxxxxxxxxxxx');
});
const K = s => `KEY-${s}-xxxxxxxxxxxxxxxxxxxx`;

test('bergiliran merata: A,B,C,A,B,C', async () => {
    for (let i = 0; i < 6; i++) await generate(env, body);
    assert.deepEqual(calls, [K('A'), K('B'), K('C'), K('A'), K('B'), K('C')]);
    assert.equal(row(1).uses, 2);
});

test('limit per menit → pindah ke kunci berikutnya, kunci diistirahatkan ±33 detik', async () => {
    behave[K('A')] = perMinute;
    const r = await generate(env, body);
    assert.ok(r.candidates);
    assert.deepEqual(calls, [K('A'), K('B')]);
    const cd = row(1).cooldown_until - Date.now();
    assert.ok(cd > 25000 && cd <= 33000, 'cooldown ' + cd);
    assert.equal(row(1).fails, 1);
    calls = [];
    for (let i = 0; i < 4; i++) await generate(env, body);
    assert.ok(!calls.includes(K('A')), 'kunci A dilewati selama istirahat');
});

test('kuota harian habis → istirahat sampai reset harian', async () => {
    behave[K('A')] = perDay;
    await generate(env, body);
    const cd = row(1).cooldown_until - Date.now();
    assert.ok(cd > 60000 && cd <= 24 * 3600000, 'cooldown ' + cd);
    assert.match(row(1).last_error, /harian/);
});

test('kunci ditolak Google → istirahat 6 jam, permintaan tetap terjawab', async () => {
    behave[K('A')] = invalid;
    await generate(env, body);
    const cd = row(1).cooldown_until - Date.now();
    assert.ok(cd > 5.9 * 3600000 && cd <= 6 * 3600000);
    assert.match(row(1).last_error, /ditolak Google/);
});

test('gangguan jaringan → coba kunci lain tanpa mengistirahatkan', async () => {
    behave[K('A')] = 'network';
    await generate(env, body);
    assert.deepEqual(calls, [K('A'), K('B')]);
    assert.equal(row(1).cooldown_until, null);
});

test('model salah (404) → berhenti, tidak membakar kunci lain', async () => {
    for (const k of ['A', 'B', 'C']) behave[K(k)] = () => err(404, { message: 'model not found' });
    await assert.rejects(generate(env, body), e => e.code === 'ai_unavailable');
    assert.equal(calls.length, 1);
});

test('semua kunci kena limit → error kuota (bukan error server)', async () => {
    for (const k of ['A', 'B', 'C']) behave[K(k)] = perMinute;
    await assert.rejects(generate(env, body), e => e.status === 429 && e.code === 'ai_quota');
    assert.equal(calls.length, 3);
});

test('semua kunci sedang istirahat → tetap mencoba yang paling cepat pulih', async () => {
    const now = Date.now();
    env.CORE.db.prepare('UPDATE ai_keys SET cooldown_until = ? WHERE id = ?').run(now + 90000, 1);
    env.CORE.db.prepare('UPDATE ai_keys SET cooldown_until = ? WHERE id = ?').run(now + 30000, 2);
    env.CORE.db.prepare('UPDATE ai_keys SET cooldown_until = ? WHERE id = ?').run(now + 60000, 3);
    await generate(env, body);
    assert.deepEqual(calls, [K('B')]);
    assert.equal(row(2).cooldown_until, null, 'berhasil → pulih');
});

test('kunci nonaktif dilewati; secret Worker ikut bergiliran', async () => {
    env.CORE.db.prepare('UPDATE ai_keys SET is_active = 0 WHERE id IN (1, 2)').run();
    env.GEMINI_API_KEY = 'ENV-KEY-xxxxxxxxxxxxxxxxxxxxx';
    for (let i = 0; i < 4; i++) await generate(env, body);
    assert.deepEqual([...new Set(calls)].sort(), [K('C'), 'ENV-KEY-xxxxxxxxxxxxxxxxxxxxx'].sort());
});

test('tidak ada kunci → nonaktif', async () => {
    env.CORE.db.exec('DELETE FROM ai_keys');
    await assert.rejects(generate(env, body), e => e.code === 'ai_disabled');
});

test('JWT_SECRET berganti → kunci tidak bisa dibuka, ditandai, tidak crash', async () => {
    env.JWT_SECRET = 'secret-lain-yang-berbeda-sama-sekali-xx';
    await assert.rejects(generate(env, body), e => e.code === 'ai_disabled');
    assert.match(row(1).last_error, /JWT_SECRET/);
});

test('30 pertanyaan bersamaan terbagi rata ke 3 kunci', async () => {
    await Promise.all(Array.from({ length: 30 }, () => generate(env, body)));
    const count = k => calls.filter(c => c === K(k)).length;
    assert.deepEqual([count('A'), count('B'), count('C')], [10, 10, 10]);
});

test('uji kunci: berhasil / ditolak / kena limit', async () => {
    assert.equal((await testKey(env, K('A'))).ok, true);
    behave[K('B')] = invalid;
    const bad = await testKey(env, K('B'));
    assert.equal(bad.ok, false); assert.match(bad.error, /ditolak Google/);
    behave[K('C')] = perMinute;
    const lim = await testKey(env, K('C'));
    assert.equal(lim.ok, false); assert.ok(lim.cooldown > 0);
});
