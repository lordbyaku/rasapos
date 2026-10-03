// Perhitungan uang — dipakai bersama oleh frontend (script biasa) dan Worker (import side-effect).
// Semua nilai dalam Rupiah integer.
(function (root) {
    const r = n => Math.round(n);
    const activeItems = items => (items || []).filter(i => i.status !== 'void');

    function lineGross(it) { return it.price * it.qty; }
    function lineNet(it) { return Math.max(0, lineGross(it) - (it.discount || 0)); }

    /**
     * Hitung total order.
     * order: { type, items[], discount: {type:'percent'|'amount', value} | null }
     * cfg  : { tax_rate, service_rate, tax_on_service, tax_inclusive }  (dari outlet)
     */
    function calc(order, cfg) {
        cfg = cfg || {};
        const items = activeItems(order.items);
        const gross = items.reduce((s, i) => s + lineGross(i), 0);
        const itemDiscount = items.reduce((s, i) => s + Math.min(i.discount || 0, lineGross(i)), 0);
        const subtotal = gross - itemDiscount;

        let orderDiscount = 0;
        const d = order.discount;
        if (d && d.value > 0) {
            orderDiscount = d.type === 'percent' ? r(subtotal * Math.min(d.value, 100) / 100) : Math.min(r(d.value), subtotal);
        }
        const net = subtotal - orderDiscount;
        const ratio = subtotal > 0 ? net / subtotal : 0;
        const taxableNet = r(items.filter(i => i.taxable !== false && i.taxable !== 0).reduce((s, i) => s + lineNet(i), 0) * ratio);

        const taxRate = Number(cfg.tax_rate) || 0;
        const serviceRate = order.type === 'dine_in' ? Number(cfg.service_rate) || 0 : 0;

        let service = 0, tax = 0, total = 0, taxIncluded = 0;
        if (cfg.tax_inclusive) {
            // Harga menu sudah termasuk pajak: pajak diekstrak dari bagian kena pajak.
            taxIncluded = taxRate ? r(taxableNet * taxRate / (100 + taxRate)) : 0;
            service = r((net - taxIncluded) * serviceRate / 100);
            const serviceTax = cfg.tax_on_service ? r(service * taxRate / 100) : 0;
            tax = taxIncluded + serviceTax;
            total = net + service + serviceTax;
        } else {
            service = r(net * serviceRate / 100);
            const base = taxableNet + (cfg.tax_on_service ? service : 0);
            tax = r(base * taxRate / 100);
            total = net + service + tax;
        }
        return { gross, item_discount: itemDiscount, subtotal, order_discount: orderDiscount, net, service, tax, tax_included: taxIncluded, total };
    }

    /**
     * Penyelesaian pembayaran. Pembulatan hanya untuk sisa yang dibayar tunai.
     * payments: [{method, type:'cash'|'noncash', amount}]
     */
    function settle(total, payments, step) {
        step = step || 0;
        const cashPaid = payments.filter(p => p.type === 'cash').reduce((s, p) => s + p.amount, 0);
        const nonCash = payments.filter(p => p.type !== 'cash').reduce((s, p) => s + p.amount, 0);
        const remainingForCash = Math.max(0, total - nonCash);
        let rounding = 0;
        const hasCash = payments.some(p => p.type === 'cash');
        if (hasCash && step > 0 && remainingForCash > 0) rounding = Math.round(remainingForCash / step) * step - remainingForCash;
        const due = total + rounding;
        const paid = cashPaid + nonCash;
        const change = Math.max(0, paid - due);
        // Tunai tidak boleh ditambahkan jika non-tunai sudah menutup seluruh tagihan
        const ok = nonCash <= total && paid >= due && change <= cashPaid && !(cashPaid > 0 && nonCash >= total && total > 0);
        return { due, paid, rounding, change, ok, remaining: Math.max(0, due - paid) };
    }

    /** Pembulatan pembayaran tunai penuh (untuk tombol "Uang pas"). */
    function cashDue(total, step) {
        return step > 0 ? Math.round(total / step) * step : total;
    }

    root.Money = { calc, settle, cashDue, lineGross, lineNet };
})(typeof globalThis !== 'undefined' ? globalThis : window);
