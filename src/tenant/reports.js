import { bad } from '../lib/http.js';
import { addDays } from '../lib/time.js';
import { requirePerm, scopeOutlets, parseJson } from './base.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ambil rentang tanggal & daftar outlet (dibatasi hak akses). */
function range(t, a, url) {
    requirePerm(a, 'reports');
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const from = url.searchParams.get('from') || today;
    const to = url.searchParams.get('to') || from;
    if (!DATE.test(from) || !DATE.test(to) || from > to) throw bad('Rentang tanggal tidak valid');
    const scope = scopeOutlets(a);
    const all = t.db.all('SELECT id, name, code, is_active FROM outlets ORDER BY id').filter(o => scope === null || scope.includes(o.id));
    const req = (url.searchParams.get('outlets') || url.searchParams.get('outlet') || '').split(',').map(Number).filter(Boolean);
    const outlets = req.length ? all.filter(o => req.includes(o.id)) : all;
    if (!outlets.length) throw bad('Tidak ada outlet yang bisa ditampilkan');
    const ids = outlets.map(o => o.id);
    return { from, to, outlets, ids, ph: ids.map(() => '?').join(',') };
}

const SUM_COLS = ['trx', 'guests', 'gross', 'discount', 'net', 'service', 'tax', 'rounding', 'total', 'commission', 'tip', 'cost', 'refund_trx', 'refund_total'];
const sumSql = SUM_COLS.map(c => `COALESCE(SUM(${c}),0) AS ${c}`).join(', ');

function totals(t, r, from, to) {
    return t.db.one(`SELECT ${sumSql} FROM sales_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ?`, ...r.ids, from, to);
}

export function dailyStats(t) {
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const outlets = t.db.val('SELECT COUNT(*) FROM outlets WHERE is_active = 1');
    // 30 hari terakhir (INSERT OR REPLACE, jadi aman dijalankan berulang)
    return Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).map(date => {
        const r = t.db.one('SELECT COALESCE(SUM(trx),0) AS trx, COALESCE(SUM(total),0) AS sales FROM sales_daily WHERE business_date = ?', date);
        return { date, outlets, trx: r.trx, sales: r.sales };
    });
}

export function registerReports(router) {
    router.on('GET', '/reports/summary', (t, req, a, p, url) => {
        const r = range(t, a, url);
        const days = Math.round((new Date(r.to) - new Date(r.from)) / 86400000) + 1;
        const prevTo = addDays(r.from, -1), prevFrom = addDays(r.from, -days);
        const byOutlet = t.db.all(`SELECT outlet_id, ${sumSql} FROM sales_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY outlet_id`, ...r.ids, r.from, r.to);
        const live = t.db.all(`SELECT outlet_id, COUNT(*) AS open_orders, COALESCE(SUM(total),0) AS open_total FROM orders WHERE status = 'open' AND outlet_id IN (${r.ph}) GROUP BY outlet_id`, ...r.ids);
        const lastSale = t.db.all(`SELECT outlet_id, MAX(closed_at) AS last_sale FROM orders WHERE status = 'paid' AND outlet_id IN (${r.ph}) AND business_date >= ? GROUP BY outlet_id`, ...r.ids, addDays(r.to, -7));
        const shifts = t.db.all(`SELECT outlet_id, COUNT(*) AS n, GROUP_CONCAT(staff_name, ', ') AS staff FROM shifts WHERE status = 'open' AND outlet_id IN (${r.ph}) GROUP BY outlet_id`, ...r.ids);
        const by = (rows) => Object.fromEntries(rows.map(x => [x.outlet_id, x]));
        const bo = by(byOutlet), lv = by(live), ls = by(lastSale), sh = by(shifts);
        return {
            from: r.from, to: r.to,
            totals: totals(t, r, r.from, r.to),
            previous: { from: prevFrom, to: prevTo, ...totals(t, r, prevFrom, prevTo) },
            outlets: r.outlets.map(o => ({
                ...o, ...(bo[o.id] || Object.fromEntries(SUM_COLS.map(c => [c, 0]))),
                open_orders: lv[o.id] ? lv[o.id].open_orders : 0, open_total: lv[o.id] ? lv[o.id].open_total : 0,
                last_sale: ls[o.id] ? ls[o.id].last_sale : null,
                shifts_open: sh[o.id] ? sh[o.id].n : 0, cashiers: sh[o.id] ? sh[o.id].staff : '',
                devices: t.devicesOnline(o.id)
            })),
            by_channel: t.db.all(`SELECT channel, SUM(trx) AS trx, SUM(total) AS total, SUM(net) AS net, SUM(commission) AS commission FROM sales_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY channel ORDER BY total DESC`, ...r.ids, r.from, r.to),
            by_date: t.db.all(`SELECT business_date, outlet_id, SUM(trx) AS trx, SUM(total) AS total FROM sales_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY business_date, outlet_id ORDER BY business_date`, ...r.ids, r.from, r.to),
            hourly: t.db.all(`SELECT hour, outlet_id, SUM(trx) AS trx, SUM(total) AS total FROM sales_hourly WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY hour, outlet_id ORDER BY hour`, ...r.ids, r.from, r.to),
            payments: t.db.all(`SELECT method, MAX(name) AS name, SUM(count) AS count, SUM(amount) AS amount FROM payments_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC`, ...r.ids, r.from, r.to),
            top_items: t.db.all(`SELECT item_key, MAX(name) AS name, SUM(qty) AS qty, SUM(gross) AS gross FROM sales_items_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY item_key ORDER BY qty DESC LIMIT 10`, ...r.ids, r.from, r.to)
        };
    });

    router.on('GET', '/reports/transactions', (t, req, a, p, url) => {
        const r = range(t, a, url);
        const status = url.searchParams.get('status') || '';
        const channel = url.searchParams.get('channel') || '';
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const all = url.searchParams.get('all') === '1';
        let sql = `SELECT data FROM orders WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ?`;
        const args = [...r.ids, r.from, r.to];
        if (status) { sql += ' AND status = ?'; args.push(status); } else sql += " AND status != 'merged'";
        if (channel) { sql += ' AND channel = ?'; args.push(channel); }
        sql += ' ORDER BY COALESCE(closed_at, opened_at) DESC';
        let rows = t.db.all(sql, ...args).map(x => JSON.parse(x.data));
        if (q) rows = rows.filter(o => o.order_no.toLowerCase().includes(q) || String(o.customer_name || '').toLowerCase().includes(q) || String(o.table_name || '').toLowerCase().includes(q));
        const staff = Object.fromEntries(t.db.all('SELECT id, name FROM staff').map(s => [s.id, s.name]));
        const mapped = rows.map(o => ({
            id: o.id, order_no: o.order_no, outlet_id: o.outlet_id, business_date: o.business_date, type: o.type, channel: o.channel,
            table_name: o.table_name, customer_name: o.customer_name, status: o.status, guests: o.guests,
            items: o.items.filter(i => i.status !== 'void').reduce((s, i) => s + i.qty, 0),
            subtotal: o.totals ? o.totals.subtotal : 0, discount: o.totals ? o.totals.item_discount + o.totals.order_discount : 0,
            service: o.totals ? o.totals.service : 0, tax: o.totals ? o.totals.tax : 0,
            total: (o.totals ? o.totals.total : 0) + (o.rounding || 0), payments: o.payments.map(x => x.name).join(', '),
            staff: staff[o.closed_by || o.staff_id] || '', opened_at: o.opened_at, closed_at: o.closed_at, offline: !!o.offline,
            voids: o.items.filter(i => i.status === 'void').length
        }));
        const per = 50;
        return { total_rows: mapped.length, page, per_page: per, items: all ? mapped.slice(0, 5000) : mapped.slice((page - 1) * per, page * per) };
    });

    router.on('GET', '/reports/items', (t, req, a, p, url) => {
        const r = range(t, a, url);
        const cats = Object.fromEntries(t.db.all('SELECT id, name FROM categories').map(c => [c.id, c.name]));
        const items = t.db.all(`SELECT item_key, MAX(menu_id) AS menu_id, MAX(name) AS name, MAX(category_id) AS category_id, SUM(qty) AS qty, SUM(gross) AS gross, SUM(cost) AS cost
            FROM sales_items_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY item_key ORDER BY gross DESC`, ...r.ids, r.from, r.to)
            .map(i => ({ ...i, category: cats[i.category_id] || 'Lainnya', margin: i.gross - i.cost }));
        const byCat = {};
        for (const i of items) { const c = (byCat[i.category] ||= { category: i.category, qty: 0, gross: 0, cost: 0 }); c.qty += i.qty; c.gross += i.gross; c.cost += i.cost; }
        return { items, categories: Object.values(byCat).sort((x, y) => y.gross - x.gross) };
    });

    router.on('GET', '/reports/staff', (t, req, a, p, url) => {
        const r = range(t, a, url);
        const staff = Object.fromEntries(t.db.all('SELECT id, name, role FROM staff').map(s => [s.id, s]));
        const rows = t.db.all(`SELECT data FROM orders WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? AND status IN ('paid','refunded','void')`, ...r.ids, r.from, r.to).map(x => JSON.parse(x.data));
        const by = {};
        for (const o of rows) {
            const id = o.closed_by || o.staff_id || 0;
            const s = (by[id] ||= { staff_id: id, name: staff[id] ? staff[id].name : 'Tanpa nama', role: staff[id] ? staff[id].role : '', trx: 0, total: 0, discount: 0, void_orders: 0, void_items: 0, refunds: 0 });
            if (o.status === 'void') { s.void_orders++; continue; }
            s.trx++;
            s.total += o.totals.total + (o.rounding || 0);
            s.discount += o.totals.item_discount + o.totals.order_discount;
            s.void_items += o.items.filter(i => i.status === 'void').length;
            if (o.status === 'refunded') s.refunds++;
        }
        return { items: Object.values(by).sort((x, y) => y.total - x.total) };
    });

    router.on('GET', '/reports/shifts', (t, req, a, p, url) => {
        const r = range(t, a, url);
        return { items: t.db.all(`SELECT * FROM shifts WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? ORDER BY opened_at DESC`, ...r.ids, r.from, r.to).map(s => parseJson(s, ['summary'])) };
    });

    router.on('GET', '/reports/daily', (t, req, a, p, url) => {
        const r = range(t, a, url);
        return { items: t.db.all(`SELECT business_date, ${sumSql} FROM sales_daily WHERE outlet_id IN (${r.ph}) AND business_date BETWEEN ? AND ? GROUP BY business_date ORDER BY business_date`, ...r.ids, r.from, r.to) };
    });
}
