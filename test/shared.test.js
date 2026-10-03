import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/shared/money.js';
import '../public/js/shared/order-ops.js';

const { Money, OrderOps } = globalThis;
const outlet = { tax_rate: 10, service_rate: 5, tax_on_service: true, tax_inclusive: false, cash_rounding: 100 };
const item = (id, price, qty = 1, extra = {}) => ({ id, name: 'Menu ' + id, price, qty, station: 'Dapur', ...extra });

test('calc: service hanya dine-in, pajak termasuk service', () => {
    const t = Money.calc({ type: 'dine_in', items: [item('a', 40000), item('b', 25000, 2)] }, outlet);
    assert.equal(t.subtotal, 90000);
    assert.equal(t.service, 4500);
    assert.equal(t.tax, 9450);
    assert.equal(t.total, 103950);
    const ta = Money.calc({ type: 'take_away', items: [item('a', 40000)] }, outlet);
    assert.equal(ta.service, 0);
    assert.equal(ta.total, 44000);
});

test('calc: diskon persen & item tidak kena pajak & item void', () => {
    const t = Money.calc({
        type: 'take_away', discount: { type: 'percent', value: 10 },
        items: [item('a', 50000), item('b', 50000, 1, { taxable: false }), item('c', 99000, 1, { status: 'void' })]
    }, outlet);
    assert.equal(t.subtotal, 100000);
    assert.equal(t.order_discount, 10000);
    assert.equal(t.net, 90000);
    assert.equal(t.tax, 4500); // hanya 45.000 bagian kena pajak
    assert.equal(t.total, 94500);
});

test('calc: harga termasuk pajak', () => {
    const t = Money.calc({ type: 'take_away', items: [item('a', 110000)] }, { tax_rate: 10, tax_inclusive: true });
    assert.equal(t.tax, 10000);
    assert.equal(t.total, 110000);
});

test('settle: pembulatan hanya untuk tunai', () => {
    const cash = Money.settle(103950, [{ type: 'cash', amount: 104000 }], 100);
    assert.equal(cash.rounding, 50);
    assert.equal(cash.change, 0);
    assert.ok(cash.ok);
    const qris = Money.settle(103950, [{ type: 'noncash', amount: 103950 }], 100);
    assert.equal(qris.rounding, 0);
    assert.ok(qris.ok);
    const split = Money.settle(103950, [{ type: 'noncash', amount: 50000 }, { type: 'cash', amount: 60000 }], 100);
    assert.equal(split.rounding, 50);
    assert.equal(split.change, 6000);
    assert.ok(split.ok);
    assert.ok(!Money.settle(100000, [{ type: 'noncash', amount: 120000 }], 100).ok, 'non-tunai tidak boleh lebih');
    assert.ok(!Money.settle(100000, [{ type: 'noncash', amount: 100000 }, { type: 'cash', amount: 50000 }], 100).ok, 'tunai tidak boleh jika non-tunai sudah lunas');
});

test('order-ops: alur buka → tambah → kirim → void → bayar', () => {
    const ctx = { outlet, at: 1000, staff_id: 's1', device_id: 'd1' };
    let o = OrderOps.apply(null, { type: 'order.open', payload: { id: 'o1', order_no: 'A261002-0001', type: 'dine_in', table_id: 't1', outlet_id: 1 } }, ctx);
    o = OrderOps.apply(o, { type: 'order.add_items', payload: { items: [item('i1', 40000), item('i2', 25000, 2)] } }, ctx);
    o = OrderOps.apply(o, { type: 'order.add_items', payload: { items: [item('i1', 40000)] } }, ctx);
    assert.equal(o.items.length, 2, 'tambah item idempoten per id');
    o = OrderOps.apply(o, { type: 'order.send', payload: {} }, ctx);
    assert.deepEqual(o._sent, ['i1', 'i2']);
    assert.throws(() => OrderOps.apply(o, { type: 'order.remove_item', payload: { item_id: 'i1' } }, ctx), /void/);
    o = OrderOps.apply(o, { type: 'order.void_item', payload: { item_id: 'i2', qty: 1, reason: 'salah input' } }, ctx);
    assert.equal(o.items.find(i => i.id === 'i2').qty, 1);
    assert.equal(o.totals.subtotal, 65000);
    assert.throws(() => OrderOps.apply(o, { type: 'order.pay', payload: { payments: [{ method: 'cash', type: 'cash', amount: 10000 }] } }, ctx), /kurang/);
    o = OrderOps.apply(o, { type: 'order.pay', payload: { payments: [{ method: 'cash', type: 'cash', amount: 100000 }] } }, ctx);
    assert.equal(o.status, 'paid');
    assert.equal(o.totals.total, 75075);
    assert.equal(o.rounding, 25);
    assert.equal(o.change, 24900);
    assert.throws(() => OrderOps.apply(o, { type: 'order.add_items', payload: { items: [item('x', 1000)] } }, ctx), /dibayar/);
});

test('aturan baru: qty ketat, diskon persen maks 100, nominal negatif, tunai Rp 0 untuk sisa kecil', () => {
    const ctx = { outlet, at: 1, staff_id: 's', device_id: 'd' };
    let o = OrderOps.apply(null, { type: 'order.open', payload: { id: 'x', order_no: 'X', type: 'take_away' } }, ctx);
    for (const qty of [0, -1, 'abc', 1.5]) assert.throws(() => OrderOps.apply(o, { type: 'order.add_items', payload: { items: [item('a', 1000, qty)] } }, ctx), /tidak valid/);
    o = OrderOps.apply(o, { type: 'order.add_items', payload: { items: [item('a', 94500)] } }, ctx);
    assert.throws(() => OrderOps.apply(o, { type: 'order.discount', payload: { discount: { type: 'percent', value: 150 } } }, ctx), /100/);
    assert.throws(() => OrderOps.apply(o, { type: 'order.pay', payload: { payments: [{ method: 'qris', type: 'noncash', amount: -5 }] } }, ctx), /tidak valid/);
    const total = o.totals.total;
    const paid = OrderOps.apply(o, { type: 'order.pay', payload: { payments: [{ method: 'qris', type: 'noncash', amount: total - 40 }, { method: 'cash', type: 'cash', amount: 0 }] } }, ctx);
    assert.equal(paid.rounding, -40);
    assert.equal(paid.payments.length, 1);
});

test('pencarian panduan: pertanyaan umum menemukan pelajaran yang tepat', async () => {
    await import('../public/js/tutorial-content.js');
    await import('../public/js/shared/tutorial-search.js');
    const { MODULES, FAQ } = globalThis.RasaTutorial;
    const S = globalThis.TutorialSearch;
    const idx = S.buildIndex(MODULES, FAQ);
    const top = q => S.search(idx, q, 3).map(h => h.doc.id);
    assert.equal(top('lupa pin')[0], 'faq:0');
    assert.ok(top('internet mati bisa jualan?').some(id => id.startsWith('offline:')));
    assert.ok(top('cara split bill').includes('tables:2'));
    assert.ok(top('printer bluetooth tidak bisa cetak')[0].startsWith('printer:'));
    assert.deepEqual(S.search(idx, 'yang dan di', 3), []);
});
