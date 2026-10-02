import { HttpError, forbidden, bad } from '../lib/http.js';
import { ROLE_PERMS } from './schema.js';

/** Pembungkus SQLite Durable Object. */
export class DB {
    constructor(sql) { this.sql = sql; }
    exec(q, ...p) { return this.sql.exec(q, ...p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v))); }
    all(q, ...p) { return this.exec(q, ...p).toArray(); }
    one(q, ...p) { return this.all(q, ...p)[0] || null; }
    val(q, ...p) { const r = this.one(q, ...p); return r ? Object.values(r)[0] : null; }
    insert(table, obj) {
        const keys = Object.keys(obj);
        return this.one(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING *`, ...keys.map(k => obj[k]));
    }
    update(table, id, obj, idCol = 'id') {
        const keys = Object.keys(obj);
        if (!keys.length) return this.one(`SELECT * FROM ${table} WHERE ${idCol} = ?`, id);
        return this.one(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(',')} WHERE ${idCol} = ? RETURNING *`, ...keys.map(k => obj[k]), id);
    }
    getMeta(key, fallback = null) {
        const v = this.val('SELECT value FROM meta WHERE key = ?', key);
        return v === null ? fallback : JSON.parse(v);
    }
    setMeta(key, value) { this.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, JSON.stringify(value)); }
    counter(key) {
        return this.val('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value', key);
    }
}

/** Ubah kolom JSON pada baris menjadi objek. */
export function parseJson(row, cols) {
    if (!row) return row;
    for (const c of cols) if (typeof row[c] === 'string') { try { row[c] = JSON.parse(row[c]); } catch { /* biarkan */ } }
    return row;
}

/** Peran user back office */
export const isOwner = a => a.kind === 'system' || (a.kind === 'user' && a.role === 'owner');

/** Apakah konteks boleh mengakses outlet ini */
export function outletInScope(a, outletId) {
    if (a.kind === 'system' || isOwner(a)) return true;
    if (a.kind === 'user') return a.outlet_ids === null || a.outlet_ids.map(Number).includes(Number(outletId));
    return Number(a.outlet_id) === Number(outletId);
}

export function requireOutlet(a, outletId) {
    if (!outletId) throw bad('Outlet wajib dipilih');
    if (!outletInScope(a, outletId)) throw forbidden('Anda tidak punya akses ke outlet ini');
}

/** Daftar outlet yang boleh diakses (null = semua) */
export const scopeOutlets = a => (a.kind === 'system' || isOwner(a) || (a.kind === 'user' && a.outlet_ids === null) ? null : a.kind === 'user' ? a.outlet_ids.map(Number) : [Number(a.outlet_id)]);

/** Hak akses staff (gabungan default peran + kustom) */
export function staffPerms(staff) {
    if (!staff) return [];
    if (Array.isArray(staff.permissions) && staff.permissions.length) return staff.permissions;
    if (typeof staff.permissions === 'string' && staff.permissions) { try { const p = JSON.parse(staff.permissions); if (p.length) return p; } catch { } }
    return ROLE_PERMS[staff.role] || [];
}

/**
 * Cek izin. Perm back office: master (owner), outlet (owner/manajer), reports, inventory.
 * Perm POS: order, pay, void, discount, refund, shift, cash, reprint, table, soldout, close_day, kds.
 */
export function can(a, perm) {
    if (a.kind === 'system') return true;
    if (a.kind === 'user') {
        if (a.role === 'owner') return true;
        return perm !== 'master';
    }
    if (a.kind === 'device') {
        if (a.device_type === 'kds' && perm === 'kds') return true;
        if (!a.staff) return false;
        return (a.staff.perms || []).includes(perm);
    }
    return false;
}

export function requirePerm(a, perm, msg) {
    if (!can(a, perm)) throw forbidden(msg || 'Anda tidak punya izin untuk tindakan ini');
}

export const actorName = a => a.kind === 'user' ? a.name : a.kind === 'device' ? (a.staff ? a.staff.name : a.device_name) : 'sistem';

export function licenseWritable(a) {
    return !a.lic || a.lic.w === 1;
}

export function requireWritable(a) {
    if (!licenseWritable(a)) throw new HttpError(402, 'Masa langganan habis. Hubungi admin untuk memperpanjang.', 'license_expired');
}
