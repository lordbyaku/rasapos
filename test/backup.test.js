// Backup streaming: data besar (> beberapa bagian multipart) → R2 tiruan → dipulihkan ke penyimpanan baru, isi sama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { backupToR2, restoreFromStream, exportStream } from '../src/tenant/backup.js';

/** Tiruan penyimpanan Durable Object di atas node:sqlite */
function fakeTenant(tenantId) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
        CREATE TABLE orders (id TEXT PRIMARY KEY, outlet_id INTEGER, data TEXT);
        CREATE TABLE sales_daily (outlet_id INTEGER, business_date TEXT, total INTEGER, PRIMARY KEY (outlet_id, business_date)) WITHOUT ROWID;
        CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, pin_hash TEXT, pin_check TEXT);
        CREATE TABLE files (id TEXT PRIMARY KEY, mime TEXT, data BLOB, created_at INTEGER) WITHOUT ROWID;
        CREATE TABLE ops (op_id TEXT PRIMARY KEY) WITHOUT ROWID;`);
    const sql = {
        exec(q, ...p) {
            const st = db.prepare(q);
            const isRead = /^\s*(SELECT|PRAGMA|WITH)/i.test(q) || /RETURNING/i.test(q);
            const rows = isRead ? st.all(...p) : (st.run(...p), []);
            return { toArray: () => rows };
        }
    };
    const t = {
        sqlite: db,
        db: {
            all: (q, ...p) => sql.exec(q, ...p).toArray(),
            exec: (q, ...p) => sql.exec(q, ...p),
            val: (q, ...p) => { const r = sql.exec(q, ...p).toArray()[0]; return r ? Object.values(r)[0] : null; },
            getMeta: k => { const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; }
        },
        ctx: { storage: { transactionSync: fn => fn() } }
    };
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('tenant_id', JSON.stringify(tenantId));
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', '2');
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('approval_key', JSON.stringify({ kid: 'k1', priv: 'rahasia' }));
    return t;
}

/** Tiruan bucket R2 multipart */
function fakeBucket() {
    const objects = new Map();
    return {
        objects,
        async createMultipartUpload(key) {
            const parts = [];
            return {
                async uploadPart(n, body) { parts.push({ n, body }); return { partNumber: n }; },
                async complete(list) { assert.equal(list.length, parts.length); objects.set(key, parts.map(p => p.body)); },
                async abort() { }
            };
        }
    };
}

test('backup besar (multipart) lalu dipulihkan utuh ke penyimpanan baru', async () => {
    const src = fakeTenant(7);
    const big = 'x'.repeat(1000);
    const ins = src.sqlite.prepare('INSERT INTO orders (id, outlet_id, data) VALUES (?, ?, ?)');
    for (let i = 0; i < 30000; i++) ins.run('o' + String(i).padStart(6, '0'), 1 + (i % 10), JSON.stringify({ n: i, pad: big }));
    for (let d = 1; d <= 300; d++) src.sqlite.prepare('INSERT INTO sales_daily VALUES (?, ?, ?)').run(1 + (d % 10), '2026-' + String(d).padStart(3, '0'), d * 1000);
    src.sqlite.prepare('INSERT INTO staff (name, pin_hash, pin_check) VALUES (?, ?, ?)').run('Mgr', 'pbkdf2$1$a$b', 'pbkdf2$2$c$d');
    src.sqlite.prepare('INSERT INTO files VALUES (?, ?, ?, ?)').run('f1', 'image/png', new Uint8Array([1, 2, 3, 250]), 5);

    const bucket = fakeBucket();
    const res = await backupToR2(src, bucket, 'tenant-7/x.ndjson');
    const parts = bucket.objects.get('tenant-7/x.ndjson');
    assert.ok(parts.length >= 3, `harus multipart, dapat ${parts.length} bagian`);
    for (const p of parts.slice(0, -1)) assert.ok(p.length >= 5 * 1024 * 1024, 'setiap bagian (kecuali terakhir) ≥ 5 MiB');
    assert.equal(res.rows, 30000 + 300 + 1 + 3 + 1);

    // pulihkan ke tenant yang sama (penyimpanan baru) dari aliran byte yang dipotong acak
    const dst = fakeTenant(7);
    dst.sqlite.prepare('INSERT INTO orders VALUES (?, ?, ?)').run('lama', 1, '{}');
    dst.sqlite.prepare('INSERT INTO ops VALUES (?)').run('op-lama');
    const bytes = new TextEncoder().encode(parts.join(''));
    const stream = new ReadableStream({
        start(c) { for (let i = 0; i < bytes.length; i += 65537) c.enqueue(bytes.subarray(i, i + 65537)); c.close(); }
    });
    const counts = await restoreFromStream(dst, stream, () => assert.fail('bukan v1'));
    assert.equal(counts.orders, 30000); assert.equal(counts.sales_daily, 300); assert.equal(counts.files, 1);
    assert.equal(dst.db.val('SELECT COUNT(*) FROM orders'), 30000, 'data lama diganti');
    assert.equal(dst.db.val("SELECT COUNT(*) FROM orders WHERE id = 'lama'"), 0);
    assert.equal(dst.db.val('SELECT COUNT(*) FROM ops'), 0, 'catatan operasi lama dihapus');
    assert.equal(JSON.parse(dst.db.val("SELECT data FROM orders WHERE id = 'o029999'")).n, 29999);
    assert.equal(dst.db.val('SELECT pin_check FROM staff'), 'pbkdf2$2$c$d', 'rahasia ikut dipulihkan');
    assert.deepEqual([...new Uint8Array(dst.db.val("SELECT data FROM files WHERE id = 'f1'"))], [1, 2, 3, 250]);
});

test('backup tenant lain ditolak; ekspor pemilik tanpa rahasia & JSON valid', async () => {
    const src = fakeTenant(7);
    src.sqlite.prepare('INSERT INTO staff (name, pin_hash, pin_check) VALUES (?, ?, ?)').run('Mgr', 'h', 'c');
    const bucket = fakeBucket();
    await backupToR2(src, bucket, 'k');
    const other = fakeTenant(8);
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(bucket.objects.get('k').join(''))); c.close(); } });
    await assert.rejects(restoreFromStream(other, stream, () => { }), /tenant lain/);

    const text = await new Response(exportStream(src)).text();
    const exp = JSON.parse(text);
    assert.equal(exp.tables.staff[0].pin_hash, undefined);
    assert.equal(exp.tables.staff[0].pin_check, undefined);
    assert.ok(!exp.tables.meta.some(m => m.key === 'approval_key'), 'kunci privat persetujuan tidak ikut diekspor');
});
