// Backup, pemulihan & ekspor yang dialirkan (streaming) agar tidak terbatas memori Durable Object (128 MB).
// Format backup v2 (NDJSON): baris 1 = header {format:2,...}; lalu {"t":tabel,"r":baris} dan {"f":{berkas foto}}.
// Format v1 (satu objek JSON, backup lama) tetap bisa dipulihkan.
import { bad, forbidden } from '../lib/http.js';

const PAGE = 1000;
const SKIP = ['files', 'ops', 'sqlite_sequence'];

export const userTables = t => t.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' ").map(r => r.name).filter(n => !SKIP.includes(n));

/** Kolom kunci untuk paginasi keyset (tanpa OFFSET → baris dibaca tidak membengkak). */
function keyCols(t, table) {
    const info = t.db.all(`PRAGMA table_info(${table})`);
    const pk = info.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    return pk.length ? pk : ['rowid'];
}

/** Semua baris tabel per halaman, diurutkan kunci. */
function* rowsOf(t, table) {
    const keys = keyCols(t, table);
    const sel = keys[0] === 'rowid' ? 'rowid AS __rowid, *' : '*';
    const kname = k => (k === 'rowid' ? '__rowid' : k);
    let last = null;
    for (;;) {
        const where = last ? `WHERE (${keys.join(',')}) > (${keys.map(() => '?').join(',')})` : '';
        const rows = t.db.all(`SELECT ${sel} FROM ${table} ${where} ORDER BY ${keys.join(',')} LIMIT ${PAGE}`, ...(last || []));
        for (const r of rows) {
            last = keys.map(k => r[kname(k)]);
            delete r.__rowid;
            yield r;
        }
        if (rows.length < PAGE) return;
    }
}

function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** Bersihkan rahasia untuk ekspor pemilik (backup menyimpan semuanya). */
function scrub(table, r, secrets) {
    if (secrets) return r;
    if (table === 'staff') { delete r.pin_hash; delete r.pin_check; }
    if (table === 'meta' && r.key === 'approval_key') return null;
    return r;
}

/** Baris NDJSON backup (generator, dibaca bertahap). */
export function* backupLines(t, { secrets = true } = {}) {
    const tables = userTables(t);
    yield JSON.stringify({ format: 2, exported_at: new Date().toISOString(), tenant_id: t.db.getMeta('tenant_id'), schema_version: t.db.getMeta('schema_version'), tables, secrets });
    for (const table of tables) {
        for (const r of rowsOf(t, table)) {
            const x = scrub(table, r, secrets);
            if (x) yield JSON.stringify({ t: table, r: x });
        }
    }
    if (secrets) {
        for (const f of rowsOf(t, 'files')) yield JSON.stringify({ f: { id: f.id, mime: f.mime, created_at: f.created_at, data: bytesToB64(new Uint8Array(f.data)) } });
    }
}

/** Unggah backup ke R2 secara multipart (bagian ±8 MB). */
export async function backupToR2(t, bucket, key, meta = {}) {
    const up = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: 'application/x-ndjson' }, customMetadata: meta });
    const parts = [];
    let buf = [], size = 0, total = 0, lines = 0;
    const flush = async () => { const body = buf.join(''); parts.push(await up.uploadPart(parts.length + 1, body)); total += body.length; buf = []; size = 0; };
    try {
        for (const line of backupLines(t, { secrets: true })) {
            buf.push(line + '\n'); size += line.length + 1; lines++;
            if (size >= 8 * 1024 * 1024) await flush(); // ≥ 5 MiB per bagian (syarat R2)
        }
        if (size || !parts.length) await flush();
        await up.complete(parts);
    } catch (e) {
        await up.abort().catch(() => { });
        throw e;
    }
    return { key, size: total, rows: lines - 1 };
}

/** Ekspor pemilik: JSON valid yang dialirkan (tanpa rahasia & foto). */
export function exportStream(t) {
    const gen = (function* () {
        const tables = userTables(t);
        yield `{"format":1,"exported_at":${JSON.stringify(new Date().toISOString())},"tenant_id":${JSON.stringify(t.db.getMeta('tenant_id'))},"tables":{`;
        for (const [i, table] of tables.entries()) {
            yield `${i ? ',' : ''}${JSON.stringify(table)}:[`;
            let first = true;
            for (const r of rowsOf(t, table)) {
                const x = scrub(table, r, false);
                if (!x) continue;
                yield (first ? '' : ',') + JSON.stringify(x);
                first = false;
            }
            yield ']';
        }
        yield '}}';
    })();
    const enc = new TextEncoder();
    return new ReadableStream({
        pull(controller) {
            let chunk = '';
            while (chunk.length < 256 * 1024) {
                const n = gen.next();
                if (n.done) { if (chunk) controller.enqueue(enc.encode(chunk)); controller.close(); return; }
                chunk += n.value;
            }
            controller.enqueue(enc.encode(chunk));
        }
    });
}

/** Pulihkan dari aliran backup (v2 NDJSON atau v1 JSON). Mengembalikan jumlah baris per tabel. */
export async function restoreFromStream(t, stream, importV1) {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    let rest = '', header = null, v1 = null;
    const counts = {};
    const cols = {};
    let batch = [];
    const tables = userTables(t);
    const apply = () => {
        if (!batch.length) return;
        const items = batch;
        batch = [];
        t.ctx.storage.transactionSync(() => {
            for (const x of items) {
                if (x.f) {
                    t.db.exec('INSERT OR REPLACE INTO files (id, mime, data, created_at) VALUES (?, ?, ?, ?)', x.f.id, x.f.mime, b64ToBytes(x.f.data), x.f.created_at);
                    counts.files = (counts.files || 0) + 1;
                    continue;
                }
                const table = x.t;
                if (!tables.includes(table) || !x.r) continue;
                if (table === 'meta') {
                    if (x.r.key !== 'schema_version') t.db.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', x.r.key, x.r.value);
                } else {
                    const c = cols[table] ||= t.db.all(`PRAGMA table_info(${table})`).map(r => r.name);
                    const keys = Object.keys(x.r).filter(k => c.includes(k));
                    if (keys.length) t.db.exec(`INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => x.r[k]));
                }
                counts[table] = (counts[table] || 0) + 1;
            }
        });
    };
    const onHeader = h => {
        if (String(h.tenant_id) !== String(t.db.getMeta('tenant_id'))) throw forbidden('Backup ini milik tenant lain');
        // Kosongkan dulu (satu transaksi), lalu isi bertahap
        t.ctx.storage.transactionSync(() => {
            for (const table of tables) if (table !== 'meta' && (h.tables || []).includes(table)) t.db.exec(`DELETE FROM ${table}`);
            t.db.exec('DELETE FROM files');
            t.db.exec('DELETE FROM ops'); // operasi lama tidak boleh dianggap duplikat setelah data diganti
        });
    };
    for (;;) {
        const { value, done } = await reader.read();
        if (value) rest += value;
        if (v1 !== null) { if (done) break; continue; }
        let nl;
        while ((nl = rest.indexOf('\n')) >= 0) {
            const line = rest.slice(0, nl);
            rest = rest.slice(nl + 1);
            if (!line.trim()) continue;
            const x = JSON.parse(line);
            if (!header) {
                if (x.format !== 2) throw bad('Berkas backup tidak dikenali');
                header = x;
                onHeader(x);
                continue;
            }
            batch.push(x);
            if (batch.length >= 500) apply();
        }
        // Format lama v1: satu objek JSON tanpa baris baru
        if (!header && rest.startsWith('{"format":1')) { v1 = ''; if (done) break; continue; }
        if (done) break;
    }
    if (v1 !== null) return importV1(t, JSON.parse(rest));
    if (!header) throw bad('Berkas backup kosong atau rusak');
    if (rest.trim()) batch.push(JSON.parse(rest));
    apply();
    return counts;
}
