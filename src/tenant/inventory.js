import { bad, notFound, readJson, json } from '../lib/http.js';
import { requirePerm, requireOutlet, actorName, parseJson, requireFeature } from './base.js';
import { getOutlet, audit } from './master.js';

const now = () => Date.now();
const TYPES = ['purchase', 'waste', 'opname', 'transfer', 'adjust'];

function addStock(t, outletId, ingId, delta) {
    t.db.exec(`INSERT INTO stock (outlet_id, ingredient_id, qty) VALUES (?, ?, ?)
        ON CONFLICT(outlet_id, ingredient_id) DO UPDATE SET qty = qty + excluded.qty`, outletId, ingId, delta);
}

export function registerInventory(router) {
    router.on('GET', '/stock', (t, req, a, p, url) => {
        requireFeature(t, 'inventory');
        requirePerm(a, 'inventory');
        const outlet = Number(url.searchParams.get('outlet'));
        requireOutlet(a, outlet);
        const rows = t.db.all(`SELECT i.*, COALESCE(s.qty, 0) AS qty FROM ingredients i
            LEFT JOIN stock s ON s.ingredient_id = i.id AND s.outlet_id = ? WHERE i.is_active = 1 ORDER BY i.name`, outlet);
        return { items: rows.map(r => ({ ...r, low: r.min_stock > 0 && r.qty <= r.min_stock, value: Math.round(r.qty * r.cost) })), gap: t.db.getMeta('inventory_gap') };
    });

    // Tutup pengingat "stok tidak dipotong selama inventori nonaktif" (setelah stock opname)
    router.on('POST', '/stock/gap/dismiss', (t, req, a) => {
        requireFeature(t, 'inventory');
        requirePerm(a, 'inventory');
        t.db.exec("DELETE FROM meta WHERE key = 'inventory_gap'");
        return { ok: true };
    });

    router.on('GET', '/stock/moves', (t, req, a, p, url) => {
        requireFeature(t, 'inventory');
        requirePerm(a, 'inventory');
        const outlet = Number(url.searchParams.get('outlet'));
        requireOutlet(a, outlet);
        const from = Number(url.searchParams.get('from_ms') || now() - 30 * 86400000);
        const to = Number(url.searchParams.get('to_ms') || now());
        const type = url.searchParams.get('type') || '';
        const names = Object.fromEntries(t.db.all('SELECT id, name, unit FROM ingredients').map(i => [i.id, i]));
        const rows = t.db.all(`SELECT * FROM stock_moves WHERE outlet_id = ? AND created_at BETWEEN ? AND ? ${type ? 'AND type = ?' : ''} ORDER BY created_at DESC LIMIT 500`, outlet, from, to, ...(type ? [type] : []))
            .map(m => {
                parseJson(m, ['items']);
                m.items = m.items.map(i => ({ ...i, name: names[i.ingredient_id] ? names[i.ingredient_id].name : '?', unit: names[i.ingredient_id] ? names[i.ingredient_id].unit : '' }));
                return m;
            });
        return { items: rows };
    });

    router.on('POST', '/stock/moves', async (t, req, a) => {
        requireFeature(t, 'inventory');
        requirePerm(a, 'inventory');
        const body = await readJson(req);
        const type = String(body.type || '');
        if (!TYPES.includes(type)) throw bad('Jenis mutasi tidak valid');
        const outletId = Number(body.outlet_id);
        requireOutlet(a, outletId);
        getOutlet(t, outletId);
        const items = (Array.isArray(body.items) ? body.items : []).filter(i => i && i.ingredient_id);
        if (!items.length) throw bad('Tambahkan minimal satu bahan');
        const ings = Object.fromEntries(t.db.all('SELECT * FROM ingredients').map(i => [i.id, i]));
        let toOutlet = null;
        if (type === 'transfer') {
            toOutlet = Number(body.to_outlet_id);
            if (!toOutlet || toOutlet === outletId) throw bad('Pilih outlet tujuan yang berbeda');
            requireOutlet(a, toOutlet);
            getOutlet(t, toOutlet);
        }
        const note = String(body.note || '').slice(0, 200);
        const by = actorName(a);
        const result = [];
        t.ctx.storage.transactionSync(() => {
            const lines = [];
            let totalCost = 0;
            for (const it of items) {
                const ing = ings[Number(it.ingredient_id)];
                if (!ing) throw notFound('Bahan tidak ditemukan');
                const cur = t.db.val('SELECT qty FROM stock WHERE outlet_id = ? AND ingredient_id = ?', outletId, ing.id) || 0;
                let delta;
                if (type === 'opname') {
                    const actual = Number(it.actual);
                    if (!Number.isFinite(actual) || actual < 0) throw bad(`Stok fisik ${ing.name} tidak valid`);
                    delta = actual - cur;
                } else {
                    const qty = Number(it.qty);
                    if (!Number.isFinite(qty) || qty === 0 || (type !== 'adjust' && qty < 0)) throw bad(`Jumlah ${ing.name} tidak valid`);
                    delta = type === 'purchase' || type === 'adjust' ? qty : -qty;
                }
                if (type === 'purchase') {
                    const unitCost = Number(it.cost);
                    if (Number.isFinite(unitCost) && unitCost >= 0) {
                        // Biaya rata-rata tertimbang dari total stok semua outlet
                        const totalQty = Math.max(0, t.db.val('SELECT COALESCE(SUM(qty),0) FROM stock WHERE ingredient_id = ?', ing.id) || 0);
                        const newCost = totalQty + delta > 0 ? (totalQty * ing.cost + delta * unitCost) / (totalQty + delta) : unitCost;
                        t.db.exec('UPDATE ingredients SET cost = ? WHERE id = ?', Math.round(newCost * 100) / 100, ing.id);
                        totalCost += delta * unitCost;
                    }
                } else totalCost += Math.abs(delta) * ing.cost;
                if (delta !== 0) addStock(t, outletId, ing.id, delta);
                if (type === 'transfer') addStock(t, toOutlet, ing.id, -delta);
                lines.push({ ingredient_id: ing.id, qty: Math.round(delta * 1000) / 1000, before: cur, cost: it.cost !== undefined ? Number(it.cost) : undefined });
            }
            const ref = type === 'purchase' && body.supplier_id ? 'supplier:' + Number(body.supplier_id) : type === 'transfer' ? 'to:' + toOutlet : null;
            const mv = t.db.insert('stock_moves', { outlet_id: outletId, type, ref, items: JSON.stringify(lines), note, total_cost: Math.round(totalCost), by_name: by, created_at: now() });
            result.push(mv);
            if (type === 'transfer') {
                t.db.insert('stock_moves', { outlet_id: toOutlet, type: 'transfer_in', ref: 'from:' + outletId, items: JSON.stringify(lines.map(l => ({ ingredient_id: l.ingredient_id, qty: -l.qty }))), note, total_cost: Math.round(totalCost), by_name: by, created_at: now() });
            }
            if (type === 'opname' || type === 'waste' || type === 'adjust') audit(t, outletId, 'stock_' + type, String(mv.id), a, { items: lines.length, value: Math.round(totalCost) });
        });
        return json({ move: parseJson(result[0], ['items']) }, 201);
    });

    // HPP & margin per menu
    router.on('GET', '/reports/hpp', (t, req, a) => {
        requireFeature(t, 'inventory');
        requirePerm(a, 'reports');
        const ings = Object.fromEntries(t.db.all('SELECT id, name, unit, cost FROM ingredients').map(i => [i.id, i]));
        const cats = Object.fromEntries(t.db.all('SELECT id, name FROM categories').map(c => [c.id, c.name]));
        const items = t.db.all('SELECT id, name, price, category_id, recipe FROM menus WHERE is_active = 1 ORDER BY name').map(m => {
            const recipe = JSON.parse(m.recipe || '[]');
            const lines = recipe.map(r => ({ ...r, name: ings[r.ingredient_id] ? ings[r.ingredient_id].name : '?', unit: ings[r.ingredient_id] ? ings[r.ingredient_id].unit : '', cost: Math.round(r.qty * (ings[r.ingredient_id] ? ings[r.ingredient_id].cost : 0)) }));
            const cost = lines.reduce((s, l) => s + l.cost, 0);
            return { id: m.id, name: m.name, category: cats[m.category_id] || '-', price: m.price, cost, margin: m.price - cost, margin_pct: m.price ? Math.round((m.price - cost) / m.price * 1000) / 10 : 0, has_recipe: recipe.length > 0, lines };
        });
        return { items };
    });
}
