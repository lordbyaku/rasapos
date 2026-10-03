import '../../public/js/shared/money.js';
import '../../public/js/shared/order-ops.js';
import '../../public/js/shared/pricing.js';
import { bad, forbidden, notFound, HttpError, readJson } from '../lib/http.js';
import { businessDate, localHour } from '../lib/time.js';
import { parseJson, requireOutlet, requirePerm, can, licenseWritable, actorName, scopeOutlets, staffPerms, features } from './base.js';
import { getOutlet, channels, paymentMethods, settings, audit, verifyStaffPin, activePromos } from './master.js';

const { OrderOps, Money, Pricing } = globalThis;
const OpError = (code, msg) => new OrderOps.OpError(code, msg);
const now = () => Date.now();

// Izin dasar per operasi (void_item & discount ditentukan dinamis)
const PERM = {
    'order.open': 'order', 'order.add_items': 'order', 'order.update_item': 'order', 'order.remove_item': 'order',
    'order.set': 'order', 'order.send': 'order', 'order.print_bill': 'order', 'order.move': 'table',
    'order.merge': 'table', 'order.split': 'table', 'order.pay': 'pay', 'order.void': 'void', 'order.refund': 'refund',
    'shift.open': 'shift', 'shift.close': 'shift', 'shift.cash': 'cash', 'table.clean': 'table', 'menu.availability': 'soldout'
};

function permFor(t, op, order) {
    if (op.type === 'order.void_item') {
        const it = order && order.items.find(i => i.id === op.payload.item_id);
        return it && it.status === 'sent' ? 'void' : 'order';
    }
    if (op.type === 'order.void') {
        return order && order.items.some(i => i.status === 'sent') ? 'void' : 'order';
    }
    if (op.type === 'order.update_item' && op.payload.discount > 0) {
        const it = order && order.items.find(i => i.id === op.payload.item_id);
        const limit = settings(t).discount_limit_pct;
        return it && op.payload.discount > it.price * it.qty * limit / 100 ? 'discount' : 'order';
    }
    if (op.type === 'order.discount') {
        const d = op.payload.discount;
        if (!d || !(d.value > 0) || d.promo_id) return 'order';
        const limit = settings(t).discount_limit_pct;
        if (d.type === 'percent' && d.value <= limit) return 'order';
        return 'discount';
    }
    return PERM[op.type];
}

// ---------------------------------------------------------------- order helpers
function loadOrder(t, id) {
    const row = t.db.one('SELECT data FROM orders WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

function saveOrder(t, o) {
    delete o._sent;
    delete o._voided;
    t.db.exec(`INSERT INTO orders (id, outlet_id, order_no, business_date, type, channel, table_id, status, customer_id, staff_id, shift_id, total, data, opened_at, closed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET type = excluded.type, channel = excluded.channel, table_id = excluded.table_id, status = excluded.status,
            customer_id = excluded.customer_id, shift_id = excluded.shift_id, total = excluded.total, data = excluded.data,
            closed_at = excluded.closed_at, updated_at = excluded.updated_at`,
        o.id, o.outlet_id, o.order_no, o.business_date, o.type, o.channel, o.table_id, o.status, o.customer_id, o.staff_id,
        o.shift_id, (o.totals ? o.totals.total : 0) + (o.rounding || 0), JSON.stringify(o), o.opened_at, o.closed_at, o.updated_at);
}

function tableOf(t, outletId, tableId) {
    if (!tableId) return null;
    const tb = t.db.one('SELECT * FROM tables WHERE id = ? AND outlet_id = ?', Number(tableId), outletId);
    if (!tb) throw OpError('table_not_found', 'Meja tidak ditemukan');
    return tb;
}

function channelOf(t, code) {
    const ch = channels(t).find(c => c.code === code);
    if (!ch) throw OpError('channel_invalid', 'Channel penjualan tidak dikenal');
    return ch;
}

/** Hitung ulang harga item dari data master (server sebagai acuan). */
function priceItems(t, outlet, order, items, offline, a) {
    const ch = channelOf(t, order.channel);
    const ids = [...new Set(items.map(i => Number(i.menu_id)).filter(Boolean))];
    const menus = ids.length ? Object.fromEntries(t.db.all(`SELECT * FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(m => [m.id, parseJson(m, ['modifier_group_ids'])])) : {};
    const cats = Object.fromEntries(t.db.all('SELECT id, station FROM categories').map(c => [c.id, c]));
    const groups = Object.fromEntries(t.db.all('SELECT * FROM modifier_groups').map(g => [g.id, parseJson(g, ['options'])]));
    const om = ids.length ? Object.fromEntries(t.db.all(`SELECT * FROM outlet_menus WHERE outlet_id = ? AND menu_id IN (${ids.map(() => '?').join(',')})`, outlet.id, ...ids).map(r => [r.menu_id, r])) : {};
    const cp = Object.fromEntries(t.db.all('SELECT menu_id, price FROM channel_prices WHERE channel = ?', ch.code).map(r => [r.menu_id, r.price]));
    const today = businessDate(now(), outlet.tz_offset_min, outlet.day_cutoff_hour);

    return items.map(raw => {
        const it = { ...raw };
        if (!it.menu_id) {
            // Item custom (harga terbuka)
            if (!String(it.name || '').trim()) throw OpError('invalid_item', 'Nama item custom wajib diisi');
            it.station = it.station || 'Dapur';
            it.custom = true;
            it.base_price = Math.max(0, Math.round(Number(it.price) || 0));
            it.price = it.base_price;
            it.mods = [];
            audit(t, outlet.id, 'custom_item', order.order_no, a, { name: it.name, price: it.price });
            return it;
        }
        const m = menus[Number(it.menu_id)];
        if (!m) throw OpError('menu_not_found', 'Menu tidak ditemukan: ' + (it.name || it.menu_id));
        const o = om[m.id];
        if (!offline) {
            if (!m.is_active || (o && !o.is_available)) throw OpError('menu_unavailable', `${m.name} tidak tersedia di outlet ini`);
            if (o && o.sold_out_date === today) throw OpError('sold_out', `${m.name} sedang habis`);
        }
        const base = Pricing.basePrice(m, o && o.price !== null ? o.price : null, ch, cp[m.id] ?? null);
        // Validasi modifier terhadap grup milik menu
        const allowed = m.modifier_group_ids.map(id => groups[id]).filter(Boolean);
        const mods = [];
        for (const sel of it.mods || []) {
            const g = allowed.find(g => g.options.some(op => op.id === sel.option_id));
            const opt = g && g.options.find(op => op.id === sel.option_id);
            if (!opt) { if (offline) { mods.push(sel); continue; } throw OpError('modifier_invalid', 'Pilihan modifier tidak valid untuk ' + m.name); }
            mods.push({ group: g.name, group_id: g.id, option_id: opt.id, name: opt.name, price: opt.price });
        }
        if (!offline) {
            for (const g of allowed) {
                const n = mods.filter(x => x.group_id === g.id).length;
                if (n < g.min_select) throw OpError('modifier_required', `${m.name}: pilih ${g.name}`);
                if (n > g.max_select) throw OpError('modifier_invalid', `${m.name}: ${g.name} maksimal ${g.max_select}`);
            }
        }
        const serverUnit = Pricing.unitPrice(base, mods);
        it.station = m.station || (cats[m.category_id] && cats[m.category_id].station) || 'Dapur';
        it.category_id = m.category_id;
        it.taxable = !!m.taxable;
        it.name = m.name;
        if (offline) {
            if (Number(it.price) !== serverUnit) audit(t, outlet.id, 'price_mismatch', order.order_no, a, { menu: m.name, device_price: it.price, server_price: serverUnit });
        } else {
            it.price = serverUnit;
            it.base_price = base;
            it.mods = mods;
        }
        return it;
    });
}

function promoActive(p, outlet, order, at) {
    const local = new Date(at + outlet.tz_offset_min * 60000);
    const day = local.getUTCDay();
    const hhmm = local.toISOString().slice(11, 16);
    const date = local.toISOString().slice(0, 10);
    if (p.days.length && !p.days.map(Number).includes(day)) return false;
    if (p.start_time && hhmm < p.start_time) return false;
    if (p.end_time && hhmm > p.end_time) return false;
    if (p.start_date && date < p.start_date) return false;
    if (p.end_date && date > p.end_date) return false;
    if (p.channels.length && !p.channels.includes(order.channel)) return false;
    return (order.totals ? order.totals.subtotal : 0) >= p.min_subtotal;
}

// ---------------------------------------------------------------- tiket dapur
function ticketLabel(t, o) {
    if (o.table_name) return 'Meja ' + o.table_name;
    const ch = channels(t).find(c => c.code === o.channel);
    const parts = [o.order_no];
    if (ch && ch.type === 'online') parts.unshift(ch.name);
    if (o.customer_name) parts.push(o.customer_name);
    return parts.join(' · ');
}

function createTickets(t, o, itemIds, events, at = now()) {
    const items = o.items.filter(i => itemIds.includes(i.id));
    const byStation = {};
    for (const it of items) (byStation[it.station || 'Dapur'] ||= []).push(it);
    const label = ticketLabel(t, o);
    const extra = o.items.some(i => i.status === 'sent' && !itemIds.includes(i.id));
    for (const [station, list] of Object.entries(byStation)) {
        const no = t.db.counter(`ticket:${o.outlet_id}:${o.business_date}`);
        const tk = t.db.insert('kitchen_tickets', {
            outlet_id: o.outlet_id, order_id: o.id, ticket_no: no, station, label: label + (extra ? ' (tambahan)' : ''), order_type: o.type,
            items: JSON.stringify(list.map(i => ({ id: i.id, name: i.name, qty: i.qty, mods: i.mods.map(m => m.name), note: i.note, done: false }))),
            status: 'new', created_at: at
        });
        events.push({ outlet_id: o.outlet_id, type: 'ticket.new', data: parseJson(tk, ['items']) });
    }
}

function voidInTickets(t, o, voidedIds, events) {
    const tickets = t.db.all("SELECT * FROM kitchen_tickets WHERE order_id = ? AND status != 'void'", o.id).map(x => parseJson(x, ['items']));
    for (const vid of voidedIds) {
        const v = o.items.find(i => i.id === vid);
        const origId = vid.split(':v')[0];
        for (const tk of tickets) {
            const ti = tk.items.find(i => i.id === origId);
            if (!ti || ti.void) continue;
            if (v && v.id !== origId) { ti.qty -= v.qty; if (ti.qty <= 0) ti.void = true; } else ti.void = true;
            const allVoid = tk.items.every(i => i.void);
            t.db.exec('UPDATE kitchen_tickets SET items = ?, status = ? WHERE id = ?', JSON.stringify(tk.items), allVoid ? 'void' : tk.status, tk.id);
            events.push({ outlet_id: o.outlet_id, type: 'ticket.updated', data: { ...tk, status: allVoid ? 'void' : tk.status } });
        }
    }
}

// ---------------------------------------------------------------- penjualan, stok, pelanggan
/** Kebutuhan bahan & HPP per item berdasarkan resep menu + resep opsi modifier. */
function usageOf(t, o) {
    const items = o.items.filter(i => i.status !== 'void' && i.menu_id);
    const byIng = new Map();
    const costByItem = new Map();
    if (!items.length) return { byIng, costByItem };
    const ids = [...new Set(items.map(i => Number(i.menu_id)))];
    const recipes = Object.fromEntries(t.db.all(`SELECT id, recipe FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map(m => [m.id, JSON.parse(m.recipe || '[]')]));
    const optRecipes = {};
    for (const g of t.db.all('SELECT options FROM modifier_groups')) for (const op of JSON.parse(g.options)) if (op.recipe && op.recipe.length) optRecipes[op.id] = op.recipe;
    const ingIds = new Set();
    for (const it of items) {
        for (const r of recipes[it.menu_id] || []) ingIds.add(r.ingredient_id);
        for (const m of it.mods) for (const r of optRecipes[m.option_id] || []) ingIds.add(r.ingredient_id);
    }
    if (!ingIds.size) return { byIng, costByItem };
    const costs = Object.fromEntries(t.db.all(`SELECT id, cost FROM ingredients WHERE id IN (${[...ingIds].map(() => '?').join(',')})`, ...ingIds).map(r => [r.id, r.cost]));
    for (const it of items) {
        let cost = 0;
        const lines = [...(recipes[it.menu_id] || [])];
        for (const m of it.mods) lines.push(...(optRecipes[m.option_id] || []));
        for (const r of lines) {
            const q = r.qty * it.qty;
            byIng.set(r.ingredient_id, (byIng.get(r.ingredient_id) || 0) + q);
            cost += q * (costs[r.ingredient_id] || 0);
        }
        costByItem.set(it.id, Math.round(cost));
    }
    return { byIng, costByItem };
}

function addSales(t, o, sign, bdOverride, costByItem) {
    const tt = o.totals;
    const ch = channels(t).find(c => c.code === o.channel) || { commission_pct: 0 };
    const paid = tt.total + (o.rounding || 0);
    const commission = Math.round(tt.total * (ch.commission_pct || 0) / 100);
    const bd = bdOverride || o.business_date;
    const outlet = getOutlet(t, o.outlet_id);
    const items = o.items.filter(i => i.status !== 'void');
    const cost = items.reduce((s, i) => s + (costByItem.get(i.id) || 0), 0);
    const s = sign;
    t.db.exec(`INSERT INTO sales_daily (outlet_id, business_date, channel, trx, guests, gross, discount, net, service, tax, rounding, total, commission, tip, cost, refund_trx, refund_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(outlet_id, business_date, channel) DO UPDATE SET trx = trx + excluded.trx, guests = guests + excluded.guests, gross = gross + excluded.gross,
            discount = discount + excluded.discount, net = net + excluded.net, service = service + excluded.service, tax = tax + excluded.tax,
            rounding = rounding + excluded.rounding, total = total + excluded.total, commission = commission + excluded.commission, tip = tip + excluded.tip,
            cost = cost + excluded.cost, refund_trx = refund_trx + excluded.refund_trx, refund_total = refund_total + excluded.refund_total`,
        o.outlet_id, bd, o.channel, s, s * (o.guests || 0), s * tt.gross, s * (tt.item_discount + tt.order_discount), s * tt.net, s * tt.service,
        s * tt.tax, s * (o.rounding || 0), s * paid, s * commission, s * (o.tip || 0), s * cost, s < 0 ? 1 : 0, s < 0 ? paid : 0);
    const hour = localHour(s < 0 ? now() : o.closed_at, outlet.tz_offset_min);
    t.db.exec(`INSERT INTO sales_hourly (outlet_id, business_date, hour, trx, total) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(outlet_id, business_date, hour) DO UPDATE SET trx = trx + excluded.trx, total = total + excluded.total`, o.outlet_id, bd, hour, s, s * paid);
    const byKey = {};
    for (const it of items) {
        const key = it.menu_id ? 'm' + it.menu_id : 'c:' + it.name;
        const x = (byKey[key] ||= { menu_id: it.menu_id || null, name: it.name, category_id: it.category_id || null, qty: 0, gross: 0, cost: 0 });
        x.qty += it.qty; x.gross += Money.lineNet(it); x.cost += costByItem.get(it.id) || 0;
    }
    for (const [key, x] of Object.entries(byKey)) {
        t.db.exec(`INSERT INTO sales_items_daily (outlet_id, business_date, item_key, menu_id, name, category_id, qty, gross, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(outlet_id, business_date, item_key) DO UPDATE SET qty = qty + excluded.qty, gross = gross + excluded.gross, cost = cost + excluded.cost, name = excluded.name`,
            o.outlet_id, bd, key, x.menu_id, x.name, x.category_id, s * x.qty, s * x.gross, s * x.cost);
    }
    for (const p of o.payments) {
        const amount = p.type === 'cash' ? p.amount - (o.change || 0) : p.amount;
        t.db.exec(`INSERT INTO payments_daily (outlet_id, business_date, method, name, count, amount) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(outlet_id, business_date, method) DO UPDATE SET count = count + excluded.count, amount = amount + excluded.amount`,
            o.outlet_id, bd, p.method, p.name, s, s * amount);
    }
}

function deductStock(t, o, byIng, a) {
    if (!byIng.size) return;
    const items = [];
    let totalCost = 0;
    const costs = Object.fromEntries(t.db.all(`SELECT id, cost FROM ingredients WHERE id IN (${[...byIng.keys()].map(() => '?').join(',')})`, ...byIng.keys()).map(r => [r.id, r.cost]));
    for (const [ing, qty] of byIng) {
        t.db.exec(`INSERT INTO stock (outlet_id, ingredient_id, qty) VALUES (?, ?, ?) ON CONFLICT(outlet_id, ingredient_id) DO UPDATE SET qty = qty + excluded.qty`, o.outlet_id, ing, -qty);
        items.push({ ingredient_id: ing, qty: -qty });
        totalCost += qty * (costs[ing] || 0);
    }
    t.db.insert('stock_moves', { outlet_id: o.outlet_id, type: 'sale', ref: o.order_no, items: JSON.stringify(items), total_cost: Math.round(totalCost), by_name: actorName(a), created_at: now() });
}

function onPaid(t, o, a, events) {
    const feat = features(t);
    const { byIng, costByItem } = usageOf(t, o);
    addSales(t, o, 1, null, costByItem);
    if (feat.inventory) deductStock(t, o, byIng, a);
    if (o.customer_id && feat.marketing) {
        const loy = settings(t).loyalty;
        const pts = loy.enabled ? Math.floor(o.totals.total / loy.amount_per_point) : 0;
        t.db.exec('UPDATE customers SET points = points + ?, visits = visits + 1, total_spent = total_spent + ?, last_visit_at = ? WHERE id = ?', pts, o.totals.total, now(), o.customer_id);
        o.points_earned = pts;
    }
    if (o.type === 'dine_in' && o.table_id) {
        t.db.exec('UPDATE tables SET dirty = 1 WHERE id = ?', o.table_id);
        events.push({ outlet_id: o.outlet_id, type: 'table.updated', data: { id: o.table_id, dirty: 1 } });
    }
    if (o.discount && (o.discount.approved_by || !o.discount.promo_id)) audit(t, o.outlet_id, 'discount', o.order_no, a, { discount: o.discount, amount: o.totals.order_discount });
    t.db.exec("UPDATE kitchen_tickets SET status = 'served' WHERE order_id = ? AND status = 'ready'", o.id);
    events.push({
        outlet_id: o.outlet_id, type: 'sale.new',
        data: { id: o.id, order_no: o.order_no, outlet_id: o.outlet_id, channel: o.channel, type: o.type, total: o.totals.total + (o.rounding || 0), methods: o.payments.map(p => p.name), staff_id: o.closed_by, staff: a.staff ? a.staff.name : actorName(a), closed_at: o.closed_at, business_date: o.business_date, guests: o.guests, offline: !!o.offline }
    });
}

// ---------------------------------------------------------------- shift
function shiftSummary(t, shift) {
    const orders = t.db.all("SELECT data FROM orders WHERE shift_id = ? AND status IN ('paid','refunded')", shift.id).map(r => JSON.parse(r.data));
    const refunded = t.db.all("SELECT data FROM orders WHERE status = 'refunded' AND json_extract(data, '$.refund_shift_id') = ?", shift.id).map(r => JSON.parse(r.data));
    const byMethod = {};
    let cashSales = 0, total = 0, trx = 0, discounts = 0, voidItems = 0;
    for (const o of orders) {
        trx++;
        total += o.totals.total + (o.rounding || 0);
        discounts += o.totals.item_discount + o.totals.order_discount;
        voidItems += o.items.filter(i => i.status === 'void').length;
        for (const p of o.payments) {
            const amt = p.type === 'cash' ? p.amount - (o.change || 0) : p.amount;
            byMethod[p.name] = (byMethod[p.name] || 0) + amt;
            if (p.type === 'cash') cashSales += amt;
        }
    }
    const refundCash = refunded.reduce((s, o) => s + o.payments.filter(p => p.type === 'cash').reduce((x, p) => x + p.amount - (o.change || 0), 0), 0);
    const mv = t.db.all('SELECT type, SUM(amount) AS amount, COUNT(*) AS n FROM cash_movements WHERE shift_id = ? GROUP BY type', shift.id);
    const m = Object.fromEntries(mv.map(r => [r.type, r]));
    const cashIn = m.in ? m.in.amount : 0, cashOut = m.out ? m.out.amount : 0;
    const expected = shift.opening_cash + cashSales + cashIn - cashOut - refundCash;
    return { trx, total, by_method: byMethod, cash_sales: cashSales, cash_in: cashIn, cash_out: cashOut, no_sale: m.no_sale ? m.no_sale.n : 0, refund_cash: refundCash, refunds: refunded.length, discounts, void_items: voidItems, expected_cash: expected };
}

function applyShiftOp(t, a, op, events) {
    if (a.kind !== 'device') throw forbidden('Shift hanya dari perangkat kasir');
    const p = op.payload || {};
    const outlet = getOutlet(t, a.outlet_id);
    const at = op.offline && op.at ? Math.min(op.at, now()) : now();
    if (op.type === 'shift.open') {
        const open = t.db.one("SELECT * FROM shifts WHERE device_id = ? AND status = 'open'", a.device_id);
        if (open) { if (open.id === p.shift_id) return { shift: open }; throw OpError('shift_open', 'Masih ada shift yang belum ditutup di perangkat ini'); }
        if (!p.shift_id) throw OpError('invalid', 'ID shift wajib');
        const s = t.db.insert('shifts', {
            id: String(p.shift_id), outlet_id: outlet.id, device_id: a.device_id, staff_id: a.staff.id, staff_name: a.staff.name,
            business_date: businessDate(at, outlet.tz_offset_min, outlet.day_cutoff_hour), opening_cash: Math.max(0, Math.round(Number(p.opening_cash) || 0)),
            status: 'open', opened_at: at
        });
        events.push({ outlet_id: outlet.id, type: 'shift.updated', data: s });
        return { shift: s };
    }
    const shift = t.db.one('SELECT * FROM shifts WHERE id = ?', String(p.shift_id));
    if (!shift || shift.outlet_id !== outlet.id) throw OpError('shift_not_found', 'Shift tidak ditemukan');
    if (op.type === 'shift.cash') {
        if (shift.status !== 'open') throw OpError('shift_closed', 'Shift sudah ditutup');
        if (!['in', 'out', 'no_sale'].includes(p.type)) throw OpError('invalid', 'Jenis kas tidak valid');
        const amount = p.type === 'no_sale' ? 0 : Math.max(0, Math.round(Number(p.amount) || 0));
        if (p.type !== 'no_sale' && !amount) throw OpError('invalid', 'Nominal wajib diisi');
        t.db.exec('INSERT OR IGNORE INTO cash_movements (id, shift_id, outlet_id, type, amount, note, staff_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            String(p.id || op.op_id), shift.id, outlet.id, p.type, amount, String(p.note || '').slice(0, 120), a.staff.id, at);
        if (p.type === 'no_sale') audit(t, outlet.id, 'no_sale', shift.id, a, { note: p.note });
        return { ok: true };
    }
    if (op.type === 'shift.close') {
        if (shift.status !== 'open') return { shift: parseJson(shift, ['summary']) };
        const openOrders = t.db.val("SELECT COUNT(*) FROM orders WHERE shift_id = ? AND status = 'open'", shift.id);
        const summary = shiftSummary(t, shift);
        summary.open_orders = openOrders;
        const closing = Math.max(0, Math.round(Number(p.closing_cash) || 0));
        summary.difference = closing - summary.expected_cash;
        const s = t.db.update('shifts', shift.id, { status: 'closed', closing_cash: closing, expected_cash: summary.expected_cash, summary: JSON.stringify(summary), note: String(p.note || '').slice(0, 200), closed_at: at, closed_by: a.staff.id });
        if (summary.difference !== 0) audit(t, outlet.id, 'cash_difference', shift.id, a, { expected: summary.expected_cash, actual: closing, difference: summary.difference });
        events.push({ outlet_id: outlet.id, type: 'shift.updated', data: parseJson(s, ['summary']) });
        return { shift: parseJson(s, ['summary']) };
    }
    throw OpError('unknown_op', 'Operasi shift tidak dikenal');
}

// ---------------------------------------------------------------- operasi order
function applyOrderOp(t, a, op, approval, events) {
    let order = loadOrder(t, op.order_id);
    const outletId = order ? order.outlet_id : a.kind === 'device' ? Number(a.outlet_id) : Number(op.payload && op.payload.outlet_id);
    requireOutlet(a, outletId);
    const outlet = getOutlet(t, outletId);
    const type = op.type;
    if (op.offline && OrderOps.ONLINE_ONLY.includes(type)) throw OpError('online_only', 'Tindakan ini hanya bisa dilakukan saat online');
    if (type === 'order.open' && !licenseWritable(a) && !op.offline) throw new HttpError(402, 'Masa langganan habis. Transaksi baru tidak dapat dibuat.', 'license_expired');

    const at = op.offline && op.at ? Math.min(Number(op.at), now()) : now();
    const staffId = a.staff ? a.staff.id : null;
    const ctx = { outlet, at, staff_id: staffId, device_id: a.device_id || null, offline: !!op.offline };
    const payload = { ...(op.payload || {}) };
    if (approval) payload.approved_by = approval.id;

    switch (type) {
        case 'order.open': {
            const ch = channelOf(t, payload.channel || 'take_away');
            if (!ch.active && !op.offline) throw OpError('channel_inactive', 'Channel tidak aktif');
            payload.channel = ch.code;
            payload.type = ch.type;
            payload.outlet_id = outletId;
            payload.business_date = businessDate(at, outlet.tz_offset_min, outlet.day_cutoff_hour);
            const tb = tableOf(t, outletId, payload.table_id);
            payload.table_name = tb ? tb.name : null;
            if (tb && !op.offline) {
                const busy = t.db.val("SELECT order_no FROM orders WHERE outlet_id = ? AND status = 'open' AND table_id = ?", outletId, tb.id);
                if (busy) throw OpError('table_busy', `Meja ${tb.name} sudah dipakai order ${busy}`);
            }
            if (tb && tb.dirty) t.db.exec('UPDATE tables SET dirty = 0 WHERE id = ?', tb.id);
            if (payload.shift_id === undefined && a.kind === 'device') payload.shift_id = t.db.val("SELECT id FROM shifts WHERE device_id = ? AND status = 'open'", a.device_id);
            break;
        }
        case 'order.add_items':
            if (!order) throw OpError('order_not_found', 'Order tidak ditemukan');
            payload.items = priceItems(t, outlet, order, payload.items || [], !!op.offline, a);
            break;
        case 'order.set':
            if (!order) throw OpError('order_not_found', 'Order tidak ditemukan');
            if (payload.channel !== undefined && payload.channel !== order.channel) {
                if (order.items.some(i => i.status !== 'void')) throw OpError('channel_locked', 'Channel tidak bisa diubah setelah ada item. Buat order baru.');
                const ch = channelOf(t, payload.channel);
                payload.type = ch.type;
            }
            if (payload.table_id !== undefined) {
                const tb = tableOf(t, outletId, payload.table_id);
                payload.table_name = tb ? tb.name : null;
            }
            if (payload.customer_id && !features(t).marketing) payload.customer_id = null; // data pelanggan nonaktif: cukup nama
            if (payload.customer_id) {
                const c = t.db.one('SELECT id, name FROM customers WHERE id = ?', Number(payload.customer_id));
                if (!c) throw OpError('customer_not_found', 'Pelanggan tidak ditemukan');
                payload.customer_name = payload.customer_name || c.name;
            }
            break;
        case 'order.move': {
            const tb = tableOf(t, outletId, payload.table_id);
            if (!tb) throw OpError('table_not_found', 'Pilih meja tujuan');
            const busy = t.db.val("SELECT order_no FROM orders WHERE outlet_id = ? AND status = 'open' AND table_id = ? AND id != ?", outletId, tb.id, op.order_id);
            if (busy) throw OpError('table_busy', `Meja ${tb.name} sudah dipakai — gunakan gabung meja`);
            payload.table_name = tb.name;
            if (order && order.type !== 'dine_in') throw OpError('not_dine_in', 'Hanya order dine-in yang bisa pindah meja');
            break;
        }
        case 'order.discount': {
            const d = payload.discount;
            if (d && d.promo_id) {
                const promo = activePromos(t, outletId).find(p => p.id === Number(d.promo_id));
                if (!promo) { if (!op.offline) throw OpError('promo_invalid', 'Promo tidak berlaku'); audit(t, outletId, 'promo_mismatch', order && order.order_no, a, d); }
                else {
                    if (!op.offline && !promoActive(promo, outlet, order, at)) throw OpError('promo_invalid', 'Promo tidak berlaku untuk order ini');
                    payload.discount = { type: promo.type, value: promo.value, name: promo.name, promo_id: promo.id };
                }
            }
            break;
        }
        case 'order.pay': {
            if (!order) throw OpError('order_not_found', 'Order tidak ditemukan');
            const methods = Object.fromEntries(paymentMethods(t).map(m => [m.code, m]));
            payload.payments = (payload.payments || []).map(p => {
                const m = methods[p.method];
                if (!m) throw OpError('payment_invalid', 'Metode bayar tidak dikenal: ' + p.method);
                return { ...p, name: m.name, type: m.type };
            });
            if (!payload.shift_id && a.kind === 'device') payload.shift_id = order.shift_id || t.db.val("SELECT id FROM shifts WHERE device_id = ? AND status = 'open'", a.device_id);
            if (a.kind === 'device' && !payload.shift_id && !op.offline) throw OpError('no_shift', 'Buka shift kasir terlebih dahulu');
            break;
        }
        case 'order.merge':
            return mergeOrders(t, a, op, order, ctx, events);
        case 'order.split':
            return splitOrder(t, a, op, order, ctx, events);
        default:
            break;
    }

    const next = OrderOps.apply(order, { type, payload }, ctx);
    if (type === 'order.open' && !next.staff_id) next.staff_id = staffId;

    if (next._sent && next._sent.length) createTickets(t, next, next._sent, events, ctx.at);
    if (next._voided && next._voided.length) {
        const v = next.items.find(i => i.id === next._voided[0]);
        if (v && v.prev_status === 'sent') voidInTickets(t, next, next._voided, events);
        audit(t, outletId, 'void_item', next.order_no, a, { item: v && v.name, qty: v && v.qty, reason: v && v.void_reason, approved_by: approval ? approval.name : null, was_sent: v && v.prev_status === 'sent' });
    }
    if (type === 'order.pay') {
        // Item yang langsung dibayar tanpa "kirim dapur" tetap dibuatkan tiket
        const auto = next.items.filter(i => i.auto_sent && i.sent_at === ctx.at).map(i => i.id);
        if (auto.length) createTickets(t, next, auto, events, ctx.at);
        onPaid(t, next, a, events);
    }
    if (type === 'order.void') {
        const sentBefore = order.items.filter(i => i.status === 'sent').map(i => i.id);
        if (sentBefore.length) voidInTickets(t, next, sentBefore, events);
        audit(t, outletId, 'void_order', next.order_no, a, { reason: next.void_reason, total: order.totals ? order.totals.total : 0, approved_by: approval ? approval.name : null });
    }
    if (type === 'order.refund') {
        next.refund_shift_id = a.kind === 'device' ? t.db.val("SELECT id FROM shifts WHERE device_id = ? AND status = 'open'", a.device_id) : null;
        const { costByItem } = usageOf(t, next);
        const today = businessDate(now(), outlet.tz_offset_min, outlet.day_cutoff_hour);
        addSales(t, next, -1, today, costByItem);
        audit(t, outletId, 'refund', next.order_no, a, { reason: next.refund_reason, total: next.totals.total + (next.rounding || 0), approved_by: approval ? approval.name : null });
    }
    if (type === 'order.print_bill' && next.bill_printed_at && order.bill_printed_at) audit(t, outletId, 'reprint_bill', next.order_no, a, null);

    saveOrder(t, next);
    events.push({ outlet_id: outletId, type: 'order.updated', data: next });
    return { order: next };
}

function mergeOrders(t, a, op, target, ctx, events) {
    const src = loadOrder(t, op.payload.from_order_id);
    if (!target || !src) throw OpError('order_not_found', 'Order tidak ditemukan');
    if (target.status !== 'open' || src.status !== 'open') throw OpError('order_closed', 'Kedua order harus masih terbuka');
    if (target.outlet_id !== src.outlet_id || target.id === src.id) throw OpError('invalid', 'Order tidak bisa digabung');
    if (target.channel !== src.channel) throw OpError('invalid', 'Channel kedua order berbeda');
    for (const it of src.items) if (it.status !== 'void') target.items.push(it);
    target.guests = (target.guests || 0) + (src.guests || 0);
    target.updated_at = ctx.at;
    target.totals = Money.calc(target, ctx.outlet);
    src.items = src.items.filter(i => i.status === 'void');
    src.status = 'merged'; src.merged_into = target.id; src.closed_at = ctx.at; src.updated_at = ctx.at;
    src.totals = Money.calc({ ...src, status: 'open' }, ctx.outlet);
    t.db.exec('UPDATE kitchen_tickets SET order_id = ? WHERE order_id = ?', target.id, src.id);
    saveOrder(t, target);
    saveOrder(t, src);
    audit(t, target.outlet_id, 'merge', target.order_no, a, { from: src.order_no });
    events.push({ outlet_id: target.outlet_id, type: 'order.updated', data: src }, { outlet_id: target.outlet_id, type: 'order.updated', data: target });
    return { order: target, merged: src };
}

function splitOrder(t, a, op, src, ctx, events) {
    const p = op.payload;
    if (!src || src.status !== 'open') throw OpError('order_closed', 'Order sumber harus masih terbuka');
    if (!p.new_order_id || !p.new_order_no || !Array.isArray(p.items) || !p.items.length) throw OpError('invalid', 'Pilih item yang dipisah');
    if (loadOrder(t, p.new_order_id)) throw OpError('order_exists', 'Order baru sudah ada');
    const dst = OrderOps.apply(null, {
        type: 'order.open',
        payload: { id: p.new_order_id, order_no: p.new_order_no, type: src.type, channel: src.channel, table_id: src.table_id, table_name: src.table_name, guests: 0, outlet_id: src.outlet_id, business_date: src.business_date, shift_id: src.shift_id, customer_name: p.customer_name || '' }
    }, ctx);
    for (const sel of p.items) {
        const it = src.items.find(i => i.id === sel.item_id && i.status !== 'void');
        if (!it) throw OpError('item_not_found', 'Item tidak ditemukan');
        const qty = Math.min(Math.max(1, Math.round(Number(sel.qty) || it.qty)), it.qty);
        if (qty < it.qty) {
            const part = JSON.parse(JSON.stringify(it));
            part.id = it.id + ':s' + ctx.at;
            part.qty = qty;
            part.discount = 0;
            it.qty -= qty;
            dst.items.push(part);
        } else {
            src.items = src.items.filter(i => i !== it);
            dst.items.push(it);
        }
    }
    if (!src.items.some(i => i.status !== 'void')) throw OpError('invalid', 'Sisakan minimal satu item di bill asal');
    src.totals = Money.calc(src, ctx.outlet); src.updated_at = ctx.at;
    dst.totals = Money.calc(dst, ctx.outlet); dst.updated_at = ctx.at;
    saveOrder(t, src);
    saveOrder(t, dst);
    audit(t, src.outlet_id, 'split', src.order_no, a, { to: dst.order_no, items: p.items.length });
    events.push({ outlet_id: src.outlet_id, type: 'order.updated', data: src }, { outlet_id: src.outlet_id, type: 'order.updated', data: dst });
    return { order: src, created: dst };
}

/** Persetujuan manager (PIN) untuk void/diskon/refund. */
async function resolveApproval(t, a, op, order) {
    const perm = permFor(t, op, order);
    if (!perm || can(a, perm)) return null;
    const ap = op.payload && op.payload.approval;
    if (op.offline && op.payload && op.payload.approved_by) {
        const s = t.db.one('SELECT id, name, role, permissions FROM staff WHERE id = ?', Number(op.payload.approved_by));
        if (!s) throw OpError('approval_invalid', 'Persetujuan offline tidak valid: manager tidak dikenal');
        if (!staffPerms(s).includes(perm)) throw OpError('approval_invalid', `${s.name} tidak berwenang menyetujui tindakan ini`);
        return { id: s.id, name: s.name, offline: true };
    }
    if (!ap || !ap.staff_id || !ap.pin) throw new HttpError(403, 'Butuh persetujuan manager (PIN)', 'approval_required', { perm });
    let s;
    try { s = await verifyStaffPin(t, ap.staff_id, ap.pin, a.kind === 'device' ? a.outlet_id : null); }
    catch (e) { throw OpError('approval_invalid', 'Persetujuan gagal: ' + e.message); }
    if (!s.perms.includes(perm)) throw OpError('approval_invalid', `${s.name} tidak punya izin untuk menyetujui tindakan ini`);
    return { id: s.id, name: s.name };
}

function applyOp(t, a, op, approval, events) {
    const perm = op.type.startsWith('order.') ? permFor(t, op, loadOrder(t, op.order_id)) : PERM[op.type];
    if (!perm) throw OpError('unknown_op', 'Operasi tidak dikenal: ' + op.type);
    if (!approval) requirePerm(a, perm);
    if (op.type.startsWith('order.')) return applyOrderOp(t, a, op, approval, events);
    if (op.type.startsWith('shift.')) return applyShiftOp(t, a, op, events);
    if (op.type === 'table.clean') {
        const outletId = a.kind === 'device' ? Number(a.outlet_id) : Number(op.payload.outlet_id);
        requireOutlet(a, outletId);
        tableOf(t, outletId, op.payload.table_id);
        t.db.exec('UPDATE tables SET dirty = 0 WHERE id = ?', Number(op.payload.table_id));
        events.push({ outlet_id: outletId, type: 'table.updated', data: { id: Number(op.payload.table_id), dirty: 0 } });
        return { ok: true };
    }
    if (op.type === 'menu.availability') {
        const outletId = a.kind === 'device' ? Number(a.outlet_id) : Number(op.payload.outlet_id);
        requireOutlet(a, outletId);
        const outlet = getOutlet(t, outletId);
        const today = businessDate(now(), outlet.tz_offset_min, outlet.day_cutoff_hour);
        const menuId = Number(op.payload.menu_id);
        if (!t.db.one('SELECT id FROM menus WHERE id = ?', menuId)) throw OpError('menu_not_found', 'Menu tidak ditemukan');
        t.db.exec(`INSERT INTO outlet_menus (outlet_id, menu_id, sold_out_date) VALUES (?, ?, ?)
            ON CONFLICT(outlet_id, menu_id) DO UPDATE SET sold_out_date = excluded.sold_out_date`, outletId, menuId, op.payload.sold_out ? today : null);
        events.push({ outlet_id: outletId, type: 'menu.availability', data: { menu_id: menuId, sold_out: !!op.payload.sold_out } });
        return { ok: true };
    }
    throw OpError('unknown_op', 'Operasi tidak dikenal: ' + op.type);
}

/**
 * Operasi offline dicatat atas nama staff yang melakukannya di perangkat (op.staff_id),
 * bukan staff yang kebetulan login saat sinkron. Perangkat yang sudah dipasangkan dipercaya untuk mode offline.
 */
function offlineActor(t, a, op) {
    if (!op.offline || !op.staff_id || a.kind !== 'device' || (a.staff && a.staff.id === Number(op.staff_id))) return a;
    const s = t.db.one('SELECT * FROM staff WHERE id = ? AND is_active = 1', Number(op.staff_id));
    if (!s || !JSON.parse(s.outlet_ids).map(Number).includes(Number(a.outlet_id))) return a;
    return { ...a, staff: { id: s.id, name: s.name, role: s.role, perms: staffPerms(s) } };
}

/** Proses batch operasi secara berurutan & idempotent. */
export async function processOps(t, a, ops) {
    if (!Array.isArray(ops) || !ops.length) throw bad('Tidak ada operasi');
    if (ops.length > 100) throw bad('Maksimal 100 operasi per kiriman');
    const results = [];
    for (const op of ops) {
        if (!op || typeof op.op_id !== 'string' || op.op_id.length > 80 || typeof op.type !== 'string') { results.push({ op_id: op && op.op_id, ok: false, code: 'invalid', error: 'Format operasi tidak valid' }); continue; }
        const prev = t.db.one('SELECT ok, result FROM ops WHERE op_id = ?', op.op_id);
        if (prev) { results.push({ op_id: op.op_id, duplicate: true, ...JSON.parse(prev.result) }); continue; }
        try {
            const actor = offlineActor(t, a, op);
            const approval = await resolveApproval(t, actor, op, op.type.startsWith('order.') ? loadOrder(t, op.order_id) : null);
            const events = [];
            let result = null, dup = false;
            t.ctx.storage.transactionSync(() => {
                if (t.db.one('SELECT op_id FROM ops WHERE op_id = ?', op.op_id)) { dup = true; return; }
                result = applyOp(t, actor, op, approval, events);
                t.db.exec('INSERT INTO ops (op_id, type, ok, result, created_at) VALUES (?, ?, 1, ?, ?)', op.op_id, op.type,
                    JSON.stringify({ ok: true, order_id: result.order ? result.order.id : undefined }), now());
            });
            if (dup) { results.push({ op_id: op.op_id, duplicate: true, ok: true }); continue; }
            for (const ev of events) t.broadcast(ev.outlet_id, ev.type, ev.data);
            results.push({ op_id: op.op_id, ok: true, ...result });
        } catch (e) {
            const opErr = e instanceof OrderOps.OpError;
            const httpErr = e instanceof HttpError && e.status < 500 && e.status !== 401;
            if (!opErr && !httpErr) throw e;
            const res = { ok: false, code: e.code, error: e.message, status: opErr ? 409 : e.status, ...(e.extra || {}) };
            // Kesalahan aturan bisnis bersifat tetap: simpan agar kiriman ulang mendapat jawaban sama
            if (opErr) t.db.exec('INSERT OR REPLACE INTO ops (op_id, type, ok, result, created_at) VALUES (?, ?, 0, ?, ?)', op.op_id, op.type, JSON.stringify(res), now());
            results.push({ op_id: op.op_id, ...res });
        }
    }
    return { results, server_time: now() };
}

// ---------------------------------------------------------------- tutup hari
function closeDay(t, a, outletId, bd) {
    requirePerm(a, 'close_day');
    requireOutlet(a, outletId);
    const outlet = getOutlet(t, outletId);
    bd = bd || businessDate(now(), outlet.tz_offset_min, outlet.day_cutoff_hour);
    if (t.db.one('SELECT outlet_id FROM day_closes WHERE outlet_id = ? AND business_date = ?', outletId, bd)) throw bad('Hari ini sudah ditutup');
    const open = t.db.all("SELECT order_no FROM orders WHERE outlet_id = ? AND status = 'open' AND business_date <= ?", outletId, bd).map(r => r.order_no);
    if (open.length) throw new HttpError(409, `Masih ada ${open.length} order terbuka: ${open.slice(0, 5).join(', ')}`, 'open_orders');
    const shifts = t.db.all("SELECT staff_name FROM shifts WHERE outlet_id = ? AND status = 'open'", outletId).map(r => r.staff_name);
    if (shifts.length) throw new HttpError(409, `Masih ada shift terbuka (${shifts.join(', ')}). Tutup shift dulu.`, 'open_shifts');
    const sales = t.db.all('SELECT * FROM sales_daily WHERE outlet_id = ? AND business_date = ?', outletId, bd);
    const sum = k => sales.reduce((s, r) => s + r[k], 0);
    const summary = {
        business_date: bd, outlet: outlet.name,
        trx: sum('trx'), guests: sum('guests'), gross: sum('gross'), discount: sum('discount'), net: sum('net'), service: sum('service'),
        tax: sum('tax'), rounding: sum('rounding'), total: sum('total'), commission: sum('commission'), refund_trx: sum('refund_trx'), refund_total: sum('refund_total'),
        by_channel: sales.map(r => ({ channel: r.channel, trx: r.trx, total: r.total })),
        by_payment: t.db.all('SELECT method, name, count, amount FROM payments_daily WHERE outlet_id = ? AND business_date = ?', outletId, bd),
        top_items: t.db.all('SELECT name, qty, gross FROM sales_items_daily WHERE outlet_id = ? AND business_date = ? ORDER BY qty DESC LIMIT 10', outletId, bd),
        shifts: t.db.all('SELECT staff_name, opening_cash, expected_cash, closing_cash FROM shifts WHERE outlet_id = ? AND business_date = ?', outletId, bd)
    };
    t.db.exec('INSERT INTO day_closes (outlet_id, business_date, summary, closed_by, closed_at) VALUES (?, ?, ?, ?, ?)', outletId, bd, JSON.stringify(summary), actorName(a), now());
    t.db.exec("UPDATE kitchen_tickets SET status = 'served', done_at = COALESCE(done_at, ?) WHERE outlet_id = ? AND status IN ('new','progress','ready')", now(), outletId);
    audit(t, outletId, 'close_day', bd, a, { total: summary.total, trx: summary.trx });
    return { summary };
}

// ---------------------------------------------------------------- router
export function registerOrders(router) {
    router.on('POST', '/ops', async (t, req, a) => {
        if (a.kind === 'device' && a.device_type !== 'pos') throw forbidden('Perangkat ini tidak bisa membuat transaksi');
        const { ops } = await readJson(req);
        return processOps(t, a, ops);
    });

    router.on('GET', '/orders', (t, req, a, p, url) => {
        const outlet = Number(url.searchParams.get('outlet') || a.outlet_id);
        requireOutlet(a, outlet);
        const status = url.searchParams.get('status') || 'open';
        const rows = status === 'open'
            ? t.db.all("SELECT data FROM orders WHERE outlet_id = ? AND status = 'open' ORDER BY opened_at", outlet)
            : t.db.all('SELECT data FROM orders WHERE outlet_id = ? AND business_date = ? ORDER BY updated_at DESC LIMIT 300', outlet, url.searchParams.get('date') || '');
        return { items: rows.map(r => JSON.parse(r.data)) };
    });

    router.on('GET', '/orders/:id', (t, req, a, p) => {
        const o = loadOrder(t, p.id);
        if (!o) throw notFound('Order tidak ditemukan');
        requireOutlet(a, o.outlet_id);
        return { order: o };
    });

    // KDS
    router.on('GET', '/tickets', (t, req, a, p, url) => {
        const outlet = Number(url.searchParams.get('outlet') || a.outlet_id);
        requireOutlet(a, outlet);
        const active = t.db.all("SELECT * FROM kitchen_tickets WHERE outlet_id = ? AND status IN ('new','progress') AND created_at > ? ORDER BY created_at", outlet, now() - 16 * 3600000);
        const recent = t.db.all("SELECT * FROM kitchen_tickets WHERE outlet_id = ? AND status IN ('ready','served') AND done_at > ? ORDER BY done_at DESC LIMIT 30", outlet, now() - 3 * 3600000);
        return { active: active.map(r => parseJson(r, ['items'])), recent: recent.map(r => parseJson(r, ['items'])) };
    });

    router.on('PATCH', '/tickets/:id', async (t, req, a, p) => {
        if (!can(a, 'kds') && !can(a, 'order')) throw forbidden();
        const tk = parseJson(t.db.one('SELECT * FROM kitchen_tickets WHERE id = ?', Number(p.id)), ['items']);
        if (!tk) throw notFound('Tiket tidak ditemukan');
        requireOutlet(a, tk.outlet_id);
        const body = await readJson(req);
        const patch = {};
        if (body.status) {
            if (!['new', 'progress', 'ready', 'served'].includes(body.status)) throw bad('Status tidak valid');
            patch.status = body.status;
            if (body.status === 'progress' && !tk.started_at) patch.started_at = now();
            if (body.status === 'ready' || body.status === 'served') patch.done_at = tk.done_at || now();
            if (body.status === 'new' || body.status === 'progress') patch.done_at = null;
        }
        if (Array.isArray(body.done_items)) {
            for (const it of tk.items) it.done = body.done_items.includes(it.id);
            patch.items = JSON.stringify(tk.items);
        }
        const out = parseJson(t.db.update('kitchen_tickets', tk.id, patch), ['items']);
        t.broadcast(tk.outlet_id, 'ticket.updated', out);
        return { ticket: out };
    });

    // Shift
    router.on('GET', '/shifts/current', (t, req, a) => {
        if (a.kind !== 'device') throw forbidden();
        const s = t.db.one("SELECT * FROM shifts WHERE device_id = ? AND status = 'open'", a.device_id);
        return { shift: s ? { ...s, live: shiftSummary(t, s) } : null };
    });
    router.on('GET', '/shifts/:id', (t, req, a, p) => {
        const s = t.db.one('SELECT * FROM shifts WHERE id = ?', p.id);
        if (!s) throw notFound('Shift tidak ditemukan');
        requireOutlet(a, s.outlet_id);
        const movements = t.db.all('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at', s.id);
        return { shift: parseJson(s, ['summary']), live: s.status === 'open' ? shiftSummary(t, s) : null, movements };
    });

    // Tutup hari
    router.on('POST', '/days/close', async (t, req, a) => {
        const body = await readJson(req);
        return closeDay(t, a, Number(body.outlet_id || a.outlet_id), body.business_date);
    });
    router.on('GET', '/days', (t, req, a, p, url) => {
        const scope = scopeOutlets(a);
        const from = url.searchParams.get('from') || '0000';
        const to = url.searchParams.get('to') || '9999';
        return {
            items: t.db.all('SELECT * FROM day_closes WHERE business_date BETWEEN ? AND ? ORDER BY business_date DESC', from, to)
                .filter(r => scope === null || scope.includes(r.outlet_id)).map(r => parseJson(r, ['summary']))
        };
    });
}
