import { bad, forbidden, notFound, HttpError, readJson, json, unauthorized } from '../lib/http.js';
import { pick } from '../lib/validate.js';
import { hashSecret, verifySecret, randomToken } from '../lib/crypto.js';
import { signJwt } from '../lib/jwt.js';
import { businessDate } from '../lib/time.js';
import { parseJson, requirePerm, requireOutlet, outletInScope, scopeOutlets, isOwner, staffPerms, actorName, can, features, requireFeature } from './base.js';
import { DEFAULT_CHANNELS, DEFAULT_PAYMENT_METHODS, DEFAULT_SETTINGS, ROLE_PERMS, ALL_STAFF_PERMS } from './schema.js';

const PIN_ITER = 10000;
const now = () => Date.now();

// ---------------------------------------------------------------- util
export function audit(t, outletId, action, ref, a, data) {
    t.db.exec('INSERT INTO audit_logs (outlet_id, action, ref, actor, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        outletId || null, action, ref || null, actorName(a), data ? JSON.stringify(data) : null, now());
}

export function getOutlet(t, id) {
    const o = t.db.one('SELECT * FROM outlets WHERE id = ?', Number(id));
    if (!o) throw notFound('Outlet tidak ditemukan');
    o.tax_on_service = !!o.tax_on_service;
    o.tax_inclusive = !!o.tax_inclusive;
    return o;
}

export const channels = t => t.db.getMeta('channels', DEFAULT_CHANNELS);
export const paymentMethods = t => t.db.getMeta('payment_methods', DEFAULT_PAYMENT_METHODS);
export const settings = t => ({ ...DEFAULT_SETTINGS, ...t.db.getMeta('settings', {}) });

function hasCol(t, table, col) {
    return t.db.all(`PRAGMA table_info(${table})`).some(c => c.name === col);
}

// ---------------------------------------------------------------- inisialisasi tenant
export function initTenant(t, body) {
    const existing = t.db.getMeta('tenant_id');
    if (existing) {
        // Penyimpanan ini sudah milik tenant lain: jangan pernah dipakai ulang
        if (Number(existing) !== Number(body.tenant_id)) throw new HttpError(409, 'Penyimpanan tenant bentrok', 'tenant_conflict');
        return { ok: true, already: true };
    }
    t.ctx.storage.transactionSync(() => {
        t.db.setMeta('tenant_id', body.tenant_id);
        t.db.setMeta('tenant_name', body.business_name);
        t.db.setMeta('channels', DEFAULT_CHANNELS);
        t.db.setMeta('payment_methods', DEFAULT_PAYMENT_METHODS);
        t.db.setMeta('settings', DEFAULT_SETTINGS);
        const o = t.db.insert('outlets', { code: 'OUT1', name: body.outlet_name || 'Outlet Utama', phone: body.phone || '', receipt_header: body.business_name, created_at: now() });
        const area = t.db.insert('areas', { outlet_id: o.id, name: 'Indoor', sort: 0 });
        for (let i = 1; i <= 6; i++) t.db.insert('tables', { outlet_id: o.id, area_id: area.id, name: 'A' + i, capacity: 4, sort: i });
        for (const [i, c] of [['Makanan', 'Dapur', '#f97316'], ['Minuman', 'Bar', '#0ea5e9']].entries()) {
            t.db.insert('categories', { name: c[0], station: c[1], color: c[2], sort: i });
        }
    });
    return { ok: true };
}

// ---------------------------------------------------------------- CRUD generik
const RESOURCES = {
    categories: {
        perm: 'master', order: 'sort, name',
        spec: {
            name: { type: 'str', required: true, max: 60, label: 'Nama kategori' },
            color: { type: 'str', max: 20, default: '#f97316' },
            station: { type: 'str', max: 30, default: 'Dapur' },
            sort: { type: 'int', default: 0 },
            is_active: { type: 'bool', default: 1 }
        }
    },
    'modifier-groups': {
        table: 'modifier_groups', perm: 'master', order: 'name', json: ['options'],
        spec: {
            name: { type: 'str', required: true, max: 60, label: 'Nama grup' },
            min_select: { type: 'int', min: 0, max: 20, default: 0 },
            max_select: { type: 'int', min: 1, max: 20, default: 1 },
            options: { type: 'json', array: true, default: '[]' },
            is_active: { type: 'bool', default: 1 }
        },
        clean(d) {
            if (d.options !== undefined) {
                const opts = JSON.parse(d.options).filter(o => o && String(o.name || '').trim()).slice(0, 40).map(o => ({
                    id: String(o.id || randomToken(6)), name: String(o.name).trim().slice(0, 60), price: Math.round(Number(o.price) || 0),
                    recipe: Array.isArray(o.recipe) ? o.recipe.filter(r => r.ingredient_id && Number(r.qty) > 0).map(r => ({ ingredient_id: Number(r.ingredient_id), qty: Number(r.qty) })) : []
                }));
                if (!opts.length) throw bad('Minimal satu pilihan');
                d.options = JSON.stringify(opts);
            }
            if (d.min_select !== undefined && d.max_select !== undefined && d.min_select > d.max_select) throw bad('Minimal pilihan tidak boleh melebihi maksimal');
            return d;
        }
    },
    menus: {
        perm: 'master', order: 'sort, name', json: ['modifier_group_ids', 'recipe'],
        spec: {
            category_id: { type: 'idnull', default: null },
            name: { type: 'str', required: true, max: 80, label: 'Nama menu' },
            sku: { type: 'str', max: 40, default: '' },
            description: { type: 'str', max: 300, default: '' },
            price: { type: 'int', min: 0, max: 100000000, required: true, label: 'Harga' },
            station: { type: 'str', max: 30, default: null },
            taxable: { type: 'bool', default: 1 },
            image_id: { type: 'str', max: 60, default: null },
            color: { type: 'str', max: 20, default: null },
            modifier_group_ids: { type: 'json', array: true, default: '[]' },
            recipe: { type: 'json', array: true, default: '[]' },
            is_active: { type: 'bool', default: 1 },
            sort: { type: 'int', default: 0 }
        },
        clean(d) {
            if (d.recipe !== undefined) d.recipe = JSON.stringify(JSON.parse(d.recipe).filter(r => r.ingredient_id && Number(r.qty) > 0).map(r => ({ ingredient_id: Number(r.ingredient_id), qty: Number(r.qty) })));
            if (d.modifier_group_ids !== undefined) d.modifier_group_ids = JSON.stringify(JSON.parse(d.modifier_group_ids).map(Number).filter(Boolean));
            if (d.station === '') d.station = null;
            d.updated_at = now();
            return d;
        }
    },
    promos: {
        feature: 'marketing',
        perm: 'master', order: 'name', json: ['days', 'outlet_ids', 'channels'],
        spec: {
            name: { type: 'str', required: true, max: 60, label: 'Nama promo' },
            type: { type: 'str', enum: ['percent', 'amount'], default: 'percent' },
            value: { type: 'int', min: 1, required: true, label: 'Nilai' },
            min_subtotal: { type: 'int', min: 0, default: 0 },
            days: { type: 'json', array: true, default: '[]' },
            start_time: { type: 'str', max: 5, default: '', pattern: /^(\d{2}:\d{2})?$/ },
            end_time: { type: 'str', max: 5, default: '', pattern: /^(\d{2}:\d{2})?$/ },
            start_date: { type: 'str', max: 10, default: '' },
            end_date: { type: 'str', max: 10, default: '' },
            outlet_ids: { type: 'json', array: true, default: '[]' },
            channels: { type: 'json', array: true, default: '[]' },
            auto_apply: { type: 'bool', default: 1 },
            is_active: { type: 'bool', default: 1 }
        },
        clean(d) { if (d.type === 'percent' && d.value > 100) throw bad('Diskon persen maksimal 100'); return d; }
    },
    customers: {
        feature: 'marketing',
        perm: 'order', order: 'name',
        spec: {
            name: { type: 'str', required: true, max: 80, label: 'Nama pelanggan' },
            phone: { type: 'str', max: 30, default: '' },
            email: { type: 'str', max: 120, default: '' },
            note: { type: 'str', max: 200, default: '' }
        },
        extra: () => ({ created_at: now() })
    },
    suppliers: {
        feature: 'inventory',
        perm: 'inventory', order: 'name',
        spec: { name: { type: 'str', required: true, max: 80, label: 'Nama supplier' }, phone: { type: 'str', max: 30, default: '' }, note: { type: 'str', max: 200, default: '' }, is_active: { type: 'bool', default: 1 } }
    },
    ingredients: {
        feature: 'inventory',
        perm: 'inventory', order: 'name',
        spec: {
            name: { type: 'str', required: true, max: 80, label: 'Nama bahan' },
            unit: { type: 'str', max: 12, default: 'gr' },
            cost: { type: 'num', min: 0, default: 0 },
            min_stock: { type: 'num', min: 0, default: 0 },
            is_active: { type: 'bool', default: 1 }
        }
    },
    areas: {
        feature: 'tables',
        perm: 'outlet', outletScoped: true, order: 'sort, name',
        spec: { outlet_id: { type: 'int', required: true, label: 'Outlet' }, name: { type: 'str', required: true, max: 40, label: 'Nama area' }, sort: { type: 'int', default: 0 } }
    },
    tables: {
        feature: 'tables',
        perm: 'outlet', outletScoped: true, order: 'sort, name',
        spec: {
            outlet_id: { type: 'int', required: true, label: 'Outlet' }, area_id: { type: 'idnull', default: null },
            name: { type: 'str', required: true, max: 20, label: 'Nama meja' }, capacity: { type: 'int', min: 1, max: 100, default: 4 },
            sort: { type: 'int', default: 0 }, is_active: { type: 'bool', default: 1 }
        }
    }
};

function registerCrud(router, name, res) {
    const table = res.table || name;
    const jsonCols = res.json || [];
    const load = (t, id) => {
        const row = t.db.one(`SELECT * FROM ${table} WHERE id = ?`, Number(id));
        if (!row) throw notFound();
        return row;
    };
    const checkWrite = (a, row, t) => {
        if (res.feature) requireFeature(t, res.feature);
        requirePerm(a, res.perm === 'order' ? 'order' : res.perm);
        if (res.outletScoped) requireOutlet(a, row.outlet_id);
    };

    router.on('GET', '/' + name, (t, req, a, p, url) => {
        let rows;
        if (res.outletScoped) {
            const outlet = Number(url.searchParams.get('outlet'));
            requireOutlet(a, outlet);
            rows = t.db.all(`SELECT * FROM ${table} WHERE outlet_id = ? ORDER BY ${res.order}`, outlet);
        } else if (name === 'customers') {
            const q = (url.searchParams.get('q') || '').trim();
            rows = q ? t.db.all('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 50', `%${q}%`, `%${q}%`)
                : t.db.all('SELECT * FROM customers ORDER BY last_visit_at DESC NULLS LAST, name LIMIT 500');
        } else {
            rows = t.db.all(`SELECT * FROM ${table} ORDER BY ${res.order}`);
        }
        return { items: rows.map(r => parseJson(r, jsonCols)) };
    });

    router.on('POST', '/' + name, async (t, req, a) => {
        let d = pick(await readJson(req), res.spec);
        checkWrite(a, d, t);
        if (res.clean) d = res.clean(d, t);
        if (res.extra) Object.assign(d, res.extra());
        const row = t.db.insert(table, d);
        return json({ item: parseJson(row, jsonCols) }, 201);
    });

    router.on('PATCH', '/' + name + '/:id', async (t, req, a, p) => {
        const row = load(t, p.id);
        checkWrite(a, row, t);
        let d = pick(await readJson(req), res.spec, { partial: true });
        if (res.outletScoped && d.outlet_id !== undefined && Number(d.outlet_id) !== row.outlet_id) throw bad('Outlet tidak bisa diubah');
        if (res.clean) d = res.clean(d, t);
        const out = t.db.update(table, row.id, d);
        return { item: parseJson(out, jsonCols) };
    });

    router.on('DELETE', '/' + name + '/:id', (t, req, a, p) => {
        const row = load(t, p.id);
        checkWrite(a, row, t);
        if (name === 'areas') {
            if (t.db.val('SELECT COUNT(*) FROM tables WHERE area_id = ? AND is_active = 1', row.id)) throw bad('Pindahkan/hapus meja di area ini dulu');
            t.db.exec('DELETE FROM areas WHERE id = ?', row.id);
        } else if (name === 'customers' || name === 'promos') {
            t.db.exec(`DELETE FROM ${table} WHERE id = ?`, row.id);
        } else if (hasCol(t, table, 'is_active')) {
            t.db.exec(`UPDATE ${table} SET is_active = 0 WHERE id = ?`, row.id);
        } else {
            t.db.exec(`DELETE FROM ${table} WHERE id = ?`, row.id);
        }
        return { ok: true };
    });
}

// ---------------------------------------------------------------- bootstrap perangkat
function menuData(t, outletId) {
    const o = outletId ? getOutlet(t, outletId) : null;
    const today = o ? businessDate(now(), o.tz_offset_min, o.day_cutoff_hour) : null;
    const om = outletId ? Object.fromEntries(t.db.all('SELECT * FROM outlet_menus WHERE outlet_id = ?', outletId).map(r => [r.menu_id, r])) : {};
    const cp = {};
    for (const r of t.db.all('SELECT * FROM channel_prices')) (cp[r.menu_id] ||= {})[r.channel] = r.price;
    const menus = t.db.all('SELECT * FROM menus WHERE is_active = 1 ORDER BY sort, name').map(m => {
        parseJson(m, ['modifier_group_ids', 'recipe']);
        const o = om[m.id];
        m.outlet_price = o && o.price !== null ? o.price : null;
        m.available = o ? !!o.is_available : true;
        m.sold_out = !!(o && o.sold_out_date && o.sold_out_date === today);
        m.channel_prices = cp[m.id] || {};
        delete m.recipe;
        return m;
    }).filter(m => m.available);
    return { menus, today };
}

export function activePromos(t, outletId) {
    if (!features(t).marketing) return [];
    return t.db.all('SELECT * FROM promos WHERE is_active = 1').map(p => parseJson(p, ['days', 'outlet_ids', 'channels']))
        .filter(p => !p.outlet_ids.length || p.outlet_ids.map(Number).includes(Number(outletId)));
}

function bootstrap(t, a, outletId) {
    requireOutlet(a, outletId);
    const outlet = getOutlet(t, outletId);
    const { menus, today } = menuData(t, outletId);
    const staff = t.db.all('SELECT id, name, role, pin_hash, permissions, outlet_ids, locked_until FROM staff WHERE is_active = 1 ORDER BY name')
        .map(s => parseJson(s, ['outlet_ids']))
        .filter(s => s.outlet_ids.map(Number).includes(Number(outletId)))
        .map(s => ({ id: s.id, name: s.name, role: s.role, pin_hash: s.pin_hash, perms: staffPerms(s) }));
    const openOrders = t.db.all("SELECT data FROM orders WHERE outlet_id = ? AND status = 'open' ORDER BY opened_at", outletId).map(r => JSON.parse(r.data));
    const openShift = a.kind === 'device' ? t.db.one("SELECT * FROM shifts WHERE device_id = ? AND status = 'open' ORDER BY opened_at DESC", a.device_id) : null;
    return {
        server_time: now(),
        business_date: today,
        tenant: { id: t.db.getMeta('tenant_id'), name: t.db.getMeta('tenant_name') },
        license: a.lic,
        outlet,
        channels: channels(t).filter(c => c.active),
        payment_methods: paymentMethods(t).filter(m => m.active),
        settings: settings(t),
        categories: t.db.all('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort, name'),
        modifier_groups: t.db.all('SELECT id, name, min_select, max_select, options FROM modifier_groups WHERE is_active = 1').map(g => {
            parseJson(g, ['options']);
            g.options = g.options.map(({ recipe, ...o }) => o);
            return g;
        }),
        menus,
        areas: t.db.all('SELECT * FROM areas WHERE outlet_id = ? ORDER BY sort, name', outletId),
        tables: t.db.all('SELECT * FROM tables WHERE outlet_id = ? AND is_active = 1 ORDER BY sort, name', outletId),
        staff,
        promos: activePromos(t, outletId),
        open_orders: openOrders,
        open_shift: openShift,
        features: features(t),
        devices_online: t.devicesOnline(outletId)
    };
}

// ---------------------------------------------------------------- staff
export async function verifyStaffPin(t, staffId, pin, outletId) {
    const s = t.db.one('SELECT * FROM staff WHERE id = ? AND is_active = 1', Number(staffId));
    if (!s) throw unauthorized('Staff tidak ditemukan', 'staff_invalid');
    parseJson(s, ['outlet_ids']);
    if (outletId && !s.outlet_ids.map(Number).includes(Number(outletId))) throw forbidden('Staff tidak terdaftar di outlet ini');
    if (s.locked_until && s.locked_until > now()) throw new HttpError(429, 'PIN terkunci sementara karena terlalu banyak salah. Coba lagi beberapa menit lagi.', 'pin_locked');
    const ok = await verifySecret(String(pin || ''), s.pin_hash);
    if (!ok) {
        const failed = s.failed + 1;
        t.db.exec('UPDATE staff SET failed = ?, locked_until = ? WHERE id = ?', failed >= 5 ? 0 : failed, failed >= 5 ? now() + 5 * 60000 : null, s.id);
        throw unauthorized(failed >= 5 ? 'PIN salah 5 kali. Dikunci 5 menit.' : 'PIN salah', 'pin_invalid');
    }
    if (s.failed || s.locked_until) t.db.exec('UPDATE staff SET failed = 0, locked_until = NULL WHERE id = ?', s.id);
    return { ...s, perms: staffPerms(s) };
}

const staffSpec = {
    name: { type: 'str', required: true, max: 60, label: 'Nama staff' },
    role: { type: 'str', enum: ['manager', 'cashier', 'waiter', 'kitchen'], default: 'cashier' },
    outlet_ids: { type: 'raw', default: [] },
    permissions: { type: 'raw', default: null },
    is_active: { type: 'bool', default: 1 }
};

async function cleanStaff(t, a, d, pin) {
    if (d.outlet_ids !== undefined) {
        const ids = (Array.isArray(d.outlet_ids) ? d.outlet_ids : []).map(Number).filter(Boolean);
        if (!ids.length) throw bad('Pilih minimal satu outlet');
        for (const id of ids) requireOutlet(a, id);
        d.outlet_ids = JSON.stringify(ids);
    }
    if (d.permissions !== undefined) {
        d.permissions = Array.isArray(d.permissions) && d.permissions.length ? JSON.stringify(d.permissions.filter(p => ALL_STAFF_PERMS.includes(p))) : null;
    }
    if (pin !== undefined && pin !== null && pin !== '') {
        if (!/^\d{4,6}$/.test(String(pin))) throw bad('PIN harus 4–6 digit angka');
        if (d.role === 'manager' && String(pin).length < 6) throw bad('PIN manager wajib 6 digit');
        d.pin_hash = await hashSecret(String(pin), PIN_ITER);
        d.failed = 0; d.locked_until = null;
    }
    return d;
}

// ---------------------------------------------------------------- export
export function exportAll(t) {
    const tables = t.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT IN ('files', 'ops', 'sqlite_sequence')").map(r => r.name);
    const out = { exported_at: new Date().toISOString(), tenant_id: t.db.getMeta('tenant_id'), tables: {} };
    for (const name of tables) out.tables[name] = t.db.all(`SELECT * FROM ${name}`);
    for (const s of out.tables.staff || []) delete s.pin_hash;
    return out;
}

// ---------------------------------------------------------------- router
export function registerMaster(router) {
    for (const [name, res] of Object.entries(RESOURCES)) registerCrud(router, name, res);

    // Internal (dipanggil Worker)
    router.on('GET', '/internal/outlet/:id', (t, req, a, p) => ({ outlet: getOutlet(t, p.id) }), { internal: true });
    router.on('POST', '/internal/revoke-device', async (t, req) => {
        const { device_id } = await req.json();
        t.db.exec('INSERT OR REPLACE INTO revoked_devices (device_id, revoked_at) VALUES (?, ?)', device_id, now());
        for (const ws of t.ctx.getWebSockets()) {
            const att = ws.deserializeAttachment();
            if (att && att.device_id === device_id) { try { ws.close(4001, 'revoked'); } catch { } }
        }
        return { ok: true };
    }, { internal: true });
    router.on('POST', '/internal/tenant-name', async (t, req) => {
        const { name } = await req.json();
        t.db.setMeta('tenant_name', name);
        return { ok: true };
    }, { internal: true });

    router.on('POST', '/internal/features', async (t, req) => {
        const before = features(t);
        t.db.setMeta('features', globalThis.Features.sanitize((await req.json()).features));
        const after = features(t);
        // Selama inventori nonaktif penjualan tidak memotong stok → ingatkan stock opname saat diaktifkan lagi
        if (before.inventory && !after.inventory) t.db.setMeta('inventory_paused_at', now());
        if (!before.inventory && after.inventory) {
            const from = t.db.getMeta('inventory_paused_at');
            if (from) {
                const prev = t.db.getMeta('inventory_gap');
                t.db.setMeta('inventory_gap', { from: prev ? prev.from : from, to: now() });
                t.db.exec("DELETE FROM meta WHERE key = 'inventory_paused_at'");
            }
        }
        return { features: after };
    }, { internal: true });

    // Meta back office
    router.on('GET', '/meta', (t, req, a) => {
        const scope = scopeOutlets(a);
        const outlets = t.db.all('SELECT * FROM outlets ORDER BY id').filter(o => scope === null || scope.includes(o.id));
        return {
            tenant: { id: t.db.getMeta('tenant_id'), name: t.db.getMeta('tenant_name') },
            outlets, channels: channels(t), payment_methods: paymentMethods(t), settings: settings(t),
            categories: t.db.all('SELECT * FROM categories ORDER BY sort, name'),
            role_perms: ROLE_PERMS, license: a.lic, features: features(t),
            me: { kind: a.kind, role: a.role, name: a.name, outlet_ids: a.outlet_ids }
        };
    });

    router.on('GET', '/bootstrap', (t, req, a, p, url) => bootstrap(t, a, Number(url.searchParams.get('outlet') || a.outlet_id)));

    // Login staff dengan PIN di perangkat outlet
    router.on('POST', '/staff-login', async (t, req, a) => {
        if (a.kind !== 'device') throw forbidden('Login PIN hanya dari perangkat outlet');
        const { staff_id, pin } = await readJson(req);
        const s = await verifyStaffPin(t, staff_id, pin, a.outlet_id);
        const perms = s.perms;
        const token = await signJwt({ typ: 'staff', sub: s.id, tid: t.db.getMeta('tenant_id'), did: a.device_id, name: s.name, role: s.role, perms }, t.env.JWT_SECRET, 16 * 3600);
        return { staff_token: token, staff: { id: s.id, name: s.name, role: s.role, perms } };
    });

    // Outlet
    router.on('GET', '/outlets', (t, req, a) => {
        const scope = scopeOutlets(a);
        return { items: t.db.all('SELECT * FROM outlets ORDER BY id').filter(o => scope === null || scope.includes(o.id)) };
    });
    const outletSpec = {
        name: { type: 'str', required: true, max: 60, label: 'Nama outlet' },
        code: { type: 'str', max: 10, pattern: /^[A-Za-z0-9-]*$/, label: 'Kode outlet' },
        address: { type: 'str', max: 200, default: '' },
        phone: { type: 'str', max: 30, default: '' },
        tz_offset_min: { type: 'int', min: 420, max: 540, default: 420 },
        day_cutoff_hour: { type: 'int', min: 0, max: 8, default: 4 },
        tax_rate: { type: 'num', min: 0, max: 20, default: 10 },
        tax_label: { type: 'str', max: 20, default: 'PBJT' },
        service_rate: { type: 'num', min: 0, max: 20, default: 0 },
        tax_on_service: { type: 'bool', default: 1 },
        tax_inclusive: { type: 'bool', default: 0 },
        cash_rounding: { type: 'int', min: 0, max: 1000, default: 100 },
        receipt_header: { type: 'str', max: 300, default: '' },
        receipt_footer: { type: 'str', max: 300, default: 'Terima kasih' },
        is_active: { type: 'bool', default: 1 }
    };
    const checkOutletQuota = (t, a, excludeId) => {
        const max = a.lic ? a.lic.mo : 1;
        const active = t.db.val('SELECT COUNT(*) FROM outlets WHERE is_active = 1 AND id != ?', excludeId || 0);
        if (active >= max) throw new HttpError(402, `Paket Anda maksimal ${max} outlet aktif. Tambah paket untuk membuka outlet baru.`, 'outlet_quota');
    };
    router.on('POST', '/outlets', async (t, req, a) => {
        requirePerm(a, 'master', 'Hanya pemilik yang dapat menambah outlet');
        const d = pick(await readJson(req), outletSpec);
        if (d.is_active) checkOutletQuota(t, a);
        d.code = (d.code || 'OUT' + (t.db.val('SELECT COUNT(*) FROM outlets') + 1)).toUpperCase();
        d.created_at = now();
        if (!d.receipt_header) d.receipt_header = t.db.getMeta('tenant_name');
        const o = t.db.insert('outlets', d);
        t.db.insert('areas', { outlet_id: o.id, name: 'Indoor', sort: 0 });
        return json({ item: o }, 201);
    });
    router.on('PATCH', '/outlets/:id', async (t, req, a, p) => {
        const o = getOutlet(t, p.id);
        requirePerm(a, 'outlet');
        requireOutlet(a, o.id);
        const d = pick(await readJson(req), outletSpec, { partial: true });
        if (d.code) d.code = d.code.toUpperCase();
        if (d.is_active === 1 && !o.is_active) checkOutletQuota(t, a, o.id);
        return { item: t.db.update('outlets', o.id, d) };
    });

    // Staff
    router.on('GET', '/staff', (t, req, a, p, url) => {
        requirePerm(a, 'outlet');
        const outlet = Number(url.searchParams.get('outlet') || 0);
        const scope = scopeOutlets(a);
        const rows = t.db.all('SELECT id, name, role, outlet_ids, permissions, is_active, locked_until, created_at FROM staff ORDER BY is_active DESC, name').map(s => parseJson(s, ['outlet_ids', 'permissions']));
        return {
            items: rows.filter(s => (!outlet || s.outlet_ids.includes(outlet)) && (scope === null || s.outlet_ids.some(id => scope.includes(id))))
                .map(s => ({ ...s, effective_perms: staffPerms(s) }))
        };
    });
    router.on('POST', '/staff', async (t, req, a) => {
        requirePerm(a, 'outlet');
        const body = await readJson(req);
        if (!body.pin) throw bad('PIN wajib diisi');
        const d = await cleanStaff(t, a, pick(body, staffSpec), body.pin);
        d.created_at = now();
        const s = t.db.insert('staff', d);
        delete s.pin_hash;
        return json({ item: parseJson(s, ['outlet_ids', 'permissions']) }, 201);
    });
    router.on('PATCH', '/staff/:id', async (t, req, a, p) => {
        requirePerm(a, 'outlet');
        const s = t.db.one('SELECT * FROM staff WHERE id = ?', Number(p.id));
        if (!s) throw notFound('Staff tidak ditemukan');
        if (!JSON.parse(s.outlet_ids).every(id => outletInScope(a, id))) throw forbidden();
        const body = await readJson(req);
        // PIN lama mungkin < 6 digit: wajib PIN baru saat dinaikkan menjadi manager
        if (body.role === 'manager' && s.role !== 'manager' && !body.pin) throw bad('Masukkan PIN 6 digit baru untuk peran manager');
        const d = await cleanStaff(t, a, { role: body.role || s.role, ...pick(body, staffSpec, { partial: true }) }, body.pin);
        const out = t.db.update('staff', s.id, d);
        delete out.pin_hash;
        return { item: parseJson(out, ['outlet_ids', 'permissions']) };
    });

    // Harga & ketersediaan per outlet
    router.on('GET', '/outlet-menus', (t, req, a, p, url) => {
        const outlet = Number(url.searchParams.get('outlet'));
        requireOutlet(a, outlet);
        return { items: t.db.all('SELECT * FROM outlet_menus WHERE outlet_id = ?', outlet) };
    });
    router.on('PUT', '/outlet-menus', async (t, req, a) => {
        requirePerm(a, 'outlet');
        const { outlet_id, items } = await readJson(req);
        requireOutlet(a, outlet_id);
        if (!Array.isArray(items)) throw bad('Data tidak valid');
        t.ctx.storage.transactionSync(() => {
            for (const it of items.slice(0, 2000)) {
                const price = it.price === null || it.price === '' || it.price === undefined ? null : Math.max(0, Math.round(Number(it.price)));
                const avail = it.is_available === false || it.is_available === 0 ? 0 : 1;
                if (price === null && avail === 1) t.db.exec('DELETE FROM outlet_menus WHERE outlet_id = ? AND menu_id = ? AND sold_out_date IS NULL', outlet_id, Number(it.menu_id));
                t.db.exec(`INSERT INTO outlet_menus (outlet_id, menu_id, price, is_available) VALUES (?, ?, ?, ?)
                    ON CONFLICT(outlet_id, menu_id) DO UPDATE SET price = excluded.price, is_available = excluded.is_available`, outlet_id, Number(it.menu_id), price, avail);
            }
            t.db.exec('DELETE FROM outlet_menus WHERE outlet_id = ? AND price IS NULL AND is_available = 1 AND sold_out_date IS NULL', outlet_id);
        });
        return { ok: true };
    });

    // Harga per channel
    router.on('GET', '/channel-prices', (t, req, a) => ({ items: t.db.all('SELECT * FROM channel_prices') }));
    router.on('PUT', '/channel-prices', async (t, req, a) => {
        requirePerm(a, 'master');
        const { channel, items } = await readJson(req);
        if (!channels(t).some(c => c.code === channel)) throw bad('Channel tidak dikenal');
        t.ctx.storage.transactionSync(() => {
            for (const it of (items || []).slice(0, 2000)) {
                if (it.price === null || it.price === '' || it.price === undefined) t.db.exec('DELETE FROM channel_prices WHERE channel = ? AND menu_id = ?', channel, Number(it.menu_id));
                else t.db.exec('INSERT OR REPLACE INTO channel_prices (channel, menu_id, price) VALUES (?, ?, ?)', channel, Number(it.menu_id), Math.max(0, Math.round(Number(it.price))));
            }
        });
        return { ok: true };
    });

    // Pengaturan tenant: channel, metode bayar, loyalti, dll.
    router.on('GET', '/settings', t => ({ channels: channels(t), payment_methods: paymentMethods(t), settings: settings(t) }));
    router.on('PUT', '/settings', async (t, req, a) => {
        requirePerm(a, 'master');
        const body = await readJson(req);
        if (Array.isArray(body.channels)) {
            const codes = new Set();
            const list = body.channels.map(c => {
                const code = String(c.code || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
                if (!code || codes.has(code)) throw bad('Kode channel kosong/duplikat');
                codes.add(code);
                return { code, name: String(c.name || code).slice(0, 30), type: ['dine_in', 'take_away', 'delivery', 'online'].includes(c.type) ? c.type : 'online', markup_pct: Math.max(0, Math.min(100, Number(c.markup_pct) || 0)), commission_pct: Math.max(0, Math.min(100, Number(c.commission_pct) || 0)), active: !!c.active };
            });
            if (!list.some(c => c.active)) throw bad('Minimal satu channel aktif');
            t.db.setMeta('channels', list);
        }
        if (Array.isArray(body.payment_methods)) {
            const codes = new Set();
            const list = body.payment_methods.map(m => {
                const code = String(m.code || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
                if (!code || codes.has(code)) throw bad('Kode metode bayar kosong/duplikat');
                codes.add(code);
                return { code, name: String(m.name || code).slice(0, 30), type: m.type === 'cash' ? 'cash' : 'noncash', active: !!m.active };
            });
            if (!list.some(m => m.active)) throw bad('Minimal satu metode bayar aktif');
            t.db.setMeta('payment_methods', list);
        }
        if (body.settings && typeof body.settings === 'object') {
            const cur = settings(t);
            const s = body.settings;
            const next = {
                ...cur,
                loyalty: s.loyalty ? { enabled: !!s.loyalty.enabled, amount_per_point: Math.max(1000, Math.round(Number(s.loyalty.amount_per_point) || 10000)) } : cur.loyalty,
                discount_limit_pct: s.discount_limit_pct !== undefined ? Math.max(0, Math.min(100, Number(s.discount_limit_pct) || 0)) : cur.discount_limit_pct,
                stations: Array.isArray(s.stations) && s.stations.length ? s.stations.map(x => String(x).trim().slice(0, 20)).filter(Boolean).slice(0, 10) : cur.stations
            };
            t.db.setMeta('settings', next);
        }
        return { channels: channels(t), payment_methods: paymentMethods(t), settings: settings(t) };
    });

    // Foto menu (disimpan di SQLite, maks. 300 KB)
    router.on('POST', '/files', async (t, req, a) => {
        requirePerm(a, 'master');
        const { mime, data } = await readJson(req, 600_000);
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime)) throw bad('Format gambar harus WebP/JPEG/PNG');
        const bin = Uint8Array.from(atob(String(data || '')), c => c.charCodeAt(0));
        if (!bin.length || bin.length > 300_000) throw bad('Ukuran gambar maksimal 300 KB');
        const id = randomToken(12);
        t.db.exec('INSERT INTO files (id, mime, data, created_at) VALUES (?, ?, ?, ?)', id, mime, bin, now());
        return json({ id, url: `/api/f/${t.db.getMeta('tenant_id')}/${id}` }, 201);
    });
    router.on('GET', '/files/:id', (t, req, a, p) => {
        const f = t.db.one('SELECT mime, data FROM files WHERE id = ?', p.id);
        if (!f) throw notFound('File tidak ditemukan');
        return new Response(f.data, { headers: { 'content-type': f.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
    }, { public: true });

    // Ekspor seluruh data tenant (backup)
    router.on('GET', '/export', (t, req, a) => {
        if (!isOwner(a)) throw forbidden('Hanya pemilik yang dapat mengekspor data');
        return new Response(JSON.stringify(exportAll(t)), {
            headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="rasapos-backup-${new Date().toISOString().slice(0, 10)}.json"` }
        });
    });

    // Audit log
    router.on('GET', '/audit', (t, req, a, p, url) => {
        requirePerm(a, 'reports');
        const scope = scopeOutlets(a);
        const from = Number(url.searchParams.get('from_ms') || now() - 7 * 86400000);
        const to = Number(url.searchParams.get('to_ms') || now());
        const outlet = Number(url.searchParams.get('outlet') || 0);
        const rows = t.db.all('SELECT * FROM audit_logs WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 1000', from, to)
            .filter(r => (!outlet || r.outlet_id === outlet) && (scope === null || r.outlet_id === null || scope.includes(r.outlet_id)))
            .map(r => parseJson(r, ['data']));
        return { items: rows };
    });
}
