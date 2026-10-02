// Reducer operasi order — dipakai bersama oleh kasir (termasuk saat offline) dan Worker (sumber kebenaran).
// Fungsi murni: apply(order, op, ctx) -> order baru, atau melempar OpError.
(function (root) {
    const Money = root.Money;

    class OpError extends Error {
        constructor(code, message) { super(message); this.code = code; }
    }

    const TYPES = ['dine_in', 'take_away', 'delivery', 'online'];
    // Operasi yang tidak boleh dilakukan saat offline (butuh data terbaru dari server)
    const ONLINE_ONLY = ['order.move', 'order.merge', 'order.split', 'order.refund'];

    const clone = o => JSON.parse(JSON.stringify(o));
    const findItem = (o, id) => {
        const it = o.items.find(i => i.id === id);
        if (!it) throw new OpError('item_not_found', 'Item tidak ditemukan');
        return it;
    };
    const mustBeOpen = o => {
        if (!o) throw new OpError('order_not_found', 'Order tidak ditemukan');
        if (o.status !== 'open') throw new OpError('order_closed', `Order ${o.order_no} sudah ${o.status === 'paid' ? 'dibayar' : 'dibatalkan'}`);
    };
    const int = (v, d = 0) => (Number.isFinite(+v) ? Math.round(+v) : d);

    function sanitizeItem(it) {
        const qty = int(it.qty, 1);
        if (!it.id || !it.name || qty <= 0) throw new OpError('invalid_item', 'Data item tidak valid');
        return {
            id: String(it.id),
            menu_id: it.menu_id || null,
            name: String(it.name).slice(0, 120),
            station: it.station || 'Dapur',
            category_id: it.category_id || null,
            base_price: int(it.base_price, int(it.price)),
            price: Math.max(0, int(it.price)),
            mods: Array.isArray(it.mods) ? it.mods.slice(0, 20).map(m => ({ group: String(m.group || ''), option_id: m.option_id || null, name: String(m.name || ''), price: int(m.price) })) : [],
            qty,
            note: String(it.note || '').slice(0, 200),
            discount: Math.max(0, int(it.discount)),
            taxable: it.taxable === false || it.taxable === 0 ? false : true,
            status: it.status === 'held' ? 'held' : 'new',
            added_by: it.added_by || null,
            added_at: it.added_at || null
        };
    }

    function recalc(o, ctx) {
        o.totals = Money.calc(o, ctx.outlet || {});
        return o;
    }

    const handlers = {
        'order.open'(o, p, ctx) {
            if (o) throw new OpError('order_exists', 'Order sudah ada');
            if (!p.id || !p.order_no) throw new OpError('invalid', 'ID/nomor order wajib');
            const type = TYPES.includes(p.type) ? p.type : 'take_away';
            return {
                id: p.id, outlet_id: p.outlet_id, order_no: String(p.order_no), business_date: p.business_date,
                type, channel: p.channel || type, table_id: p.table_id || null, table_name: p.table_name || null,
                guests: Math.max(0, int(p.guests, type === 'dine_in' ? 1 : 0)), customer_id: p.customer_id || null,
                customer_name: String(p.customer_name || '').slice(0, 80), note: String(p.note || '').slice(0, 200),
                status: 'open', items: [], discount: null, payments: [], totals: null, rounding: 0, change: 0,
                shift_id: p.shift_id || null, device_id: ctx.device_id || null, staff_id: ctx.staff_id || null,
                opened_at: ctx.at, closed_at: null, bill_printed_at: null, offline: !!ctx.offline
            };
        },
        'order.add_items'(o, p, ctx) {
            mustBeOpen(o);
            const items = (p.items || []).map(sanitizeItem);
            if (!items.length) throw new OpError('invalid', 'Tidak ada item');
            for (const it of items) {
                if (o.items.some(x => x.id === it.id)) continue; // idempoten per item
                it.added_by = ctx.staff_id || null;
                it.added_at = ctx.at;
                o.items.push(it);
            }
            o.bill_printed_at = null;
            return o;
        },
        'order.update_item'(o, p) {
            mustBeOpen(o);
            const it = findItem(o, p.item_id);
            if (!['new', 'held'].includes(it.status)) throw new OpError('item_sent', 'Item sudah dikirim ke dapur — gunakan void');
            if (p.qty !== undefined) {
                const q = int(p.qty);
                if (q <= 0) { o.items = o.items.filter(i => i.id !== it.id); return o; }
                it.qty = q;
            }
            if (p.note !== undefined) it.note = String(p.note).slice(0, 200);
            if (p.discount !== undefined) it.discount = Math.max(0, Math.min(int(p.discount), it.price * it.qty));
            if (p.held !== undefined) it.status = p.held ? 'held' : 'new';
            return o;
        },
        'order.remove_item'(o, p) {
            mustBeOpen(o);
            const it = findItem(o, p.item_id);
            if (!['new', 'held'].includes(it.status)) throw new OpError('item_sent', 'Item sudah dikirim ke dapur — gunakan void');
            o.items = o.items.filter(i => i.id !== it.id);
            return o;
        },
        'order.set'(o, p) {
            mustBeOpen(o);
            if (p.type !== undefined && TYPES.includes(p.type)) o.type = p.type;
            if (p.channel !== undefined) o.channel = p.channel;
            if (p.table_id !== undefined) { o.table_id = p.table_id || null; o.table_name = p.table_name || null; }
            if (p.guests !== undefined) o.guests = Math.max(0, int(p.guests));
            if (p.customer_id !== undefined) o.customer_id = p.customer_id || null;
            if (p.customer_name !== undefined) o.customer_name = String(p.customer_name || '').slice(0, 80);
            if (p.note !== undefined) o.note = String(p.note || '').slice(0, 200);
            return o;
        },
        'order.discount'(o, p) {
            mustBeOpen(o);
            const d = p.discount;
            if (!d || !(+d.value > 0)) { o.discount = null; return o; }
            if (!['percent', 'amount'].includes(d.type)) throw new OpError('invalid', 'Jenis diskon tidak valid');
            o.discount = { type: d.type, value: int(d.value), name: String(d.name || 'Diskon').slice(0, 60), promo_id: d.promo_id || null, approved_by: d.approved_by || null };
            return o;
        },
        'order.send'(o, p, ctx) {
            mustBeOpen(o);
            const ids = p.item_ids && p.item_ids.length ? p.item_ids : o.items.filter(i => i.status === 'new').map(i => i.id);
            const sent = [];
            for (const it of o.items) {
                if (ids.includes(it.id) && (it.status === 'new' || it.status === 'held')) {
                    it.status = 'sent'; it.sent_at = ctx.at; sent.push(it.id);
                }
            }
            if (!sent.length) throw new OpError('nothing_to_send', 'Tidak ada item baru untuk dikirim');
            o._sent = sent; // dipakai server untuk membuat tiket dapur; dihapus sebelum disimpan
            return o;
        },
        'order.void_item'(o, p, ctx) {
            mustBeOpen(o);
            const it = findItem(o, p.item_id);
            if (it.status === 'void') return o;
            if (!String(p.reason || '').trim()) throw new OpError('reason_required', 'Alasan void wajib diisi');
            const qty = p.qty ? Math.min(int(p.qty), it.qty) : it.qty;
            if (qty < it.qty) {
                // void sebagian: pecah item
                const part = Object.assign(clone(it), { id: it.id + ':v' + ctx.at, qty, status: 'void', void_reason: String(p.reason).slice(0, 120), void_by: p.approved_by || ctx.staff_id || null, voided_at: ctx.at, prev_status: it.status });
                it.qty -= qty;
                o.items.push(part);
                o._voided = [part.id];
            } else {
                it.prev_status = it.status;
                it.status = 'void'; it.void_reason = String(p.reason).slice(0, 120); it.void_by = p.approved_by || ctx.staff_id || null; it.voided_at = ctx.at;
                o._voided = [it.id];
            }
            return o;
        },
        'order.print_bill'(o, p, ctx) {
            mustBeOpen(o);
            o.bill_printed_at = ctx.at;
            return o;
        },
        'order.pay'(o, p, ctx) {
            mustBeOpen(o);
            const items = o.items.filter(i => i.status !== 'void');
            if (!items.length) throw new OpError('empty', 'Order kosong');
            recalc(o, ctx);
            const payments = (p.payments || []).map(x => ({ id: x.id || null, method: String(x.method), name: String(x.name || x.method), type: x.type === 'cash' ? 'cash' : 'noncash', amount: Math.max(0, int(x.amount)), ref: String(x.ref || '').slice(0, 60) })).filter(x => x.amount > 0);
            if (!payments.length && o.totals.total > 0) throw new OpError('no_payment', 'Belum ada pembayaran');
            const s = Money.settle(o.totals.total, payments, ctx.outlet && ctx.outlet.cash_rounding);
            if (!s.ok) throw new OpError('underpaid', 'Pembayaran kurang atau tidak valid');
            // item yang belum dikirim dianggap terkirim (langsung bayar)
            for (const it of o.items) if (it.status === 'new' || it.status === 'held') { it.status = 'sent'; it.sent_at = ctx.at; it.auto_sent = true; }
            o.payments = payments;
            o.rounding = s.rounding;
            o.change = s.change;
            o.tip = Math.max(0, int(p.tip));
            o.status = 'paid';
            o.closed_at = ctx.at;
            o.closed_by = ctx.staff_id || null;
            o.shift_id = p.shift_id || o.shift_id;
            return o;
        },
        'order.void'(o, p, ctx) {
            mustBeOpen(o);
            if (!String(p.reason || '').trim()) throw new OpError('reason_required', 'Alasan pembatalan wajib diisi');
            for (const it of o.items) if (it.status !== 'void') { it.prev_status = it.status; it.status = 'void'; it.void_reason = p.reason; it.voided_at = ctx.at; }
            o.status = 'void';
            o.void_reason = String(p.reason).slice(0, 120);
            o.void_by = p.approved_by || ctx.staff_id || null;
            o.closed_at = ctx.at;
            return o;
        },
        'order.move'(o, p) {
            mustBeOpen(o);
            o.table_id = p.table_id || null;
            o.table_name = p.table_name || null;
            return o;
        },
        'order.refund'(o, p, ctx) {
            if (!o || o.status !== 'paid') throw new OpError('not_paid', 'Hanya order lunas yang bisa direfund');
            if (!String(p.reason || '').trim()) throw new OpError('reason_required', 'Alasan refund wajib diisi');
            o.status = 'refunded';
            o.refund_reason = String(p.reason).slice(0, 120);
            o.refund_by = p.approved_by || ctx.staff_id || null;
            o.refunded_at = ctx.at;
            return o;
        }
    };

    /** Terapkan satu operasi. ctx: { outlet, at, staff_id, device_id, offline } */
    function apply(order, op, ctx) {
        const h = handlers[op.type];
        if (!h) throw new OpError('unknown_op', 'Operasi tidak dikenal: ' + op.type);
        const base = order ? clone(order) : null;
        const res = h(base, op.payload || {}, ctx);
        if (res.status === 'open' || op.type === 'order.pay') recalc(res, ctx);
        res.updated_at = ctx.at;
        if (ctx.offline) res.offline = true;
        return res;
    }

    /** Status meja dari daftar order terbuka. */
    function tableStatus(order) {
        if (!order) return 'empty';
        if (order.bill_printed_at) return 'bill';
        return order.items.some(i => i.status !== 'void') ? 'ordered' : 'seated';
    }

    root.OrderOps = { apply, OpError, ONLINE_ONLY, TYPES, tableStatus, sanitizeItem };
})(typeof globalThis !== 'undefined' ? globalThis : window);
