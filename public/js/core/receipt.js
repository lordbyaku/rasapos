// Tata letak struk, pre-bill, tiket dapur & laporan → baris abstrak → ESC/POS atau HTML
const nf = n => Math.round(Number(n) || 0).toLocaleString('id-ID');

const Receipt = {
    /** Struk / pre-bill. ctx: {outlet, tenantName, staffName, channels, copy, paidLabel} */
    order(o, ctx, kind = 'receipt') {
        const L = [];
        const out = ctx.outlet || {};
        const ch = (ctx.channels || []).find(c => c.code === o.channel);
        for (const h of String(out.receipt_header || ctx.tenantName || '').split('\n').filter(Boolean)) L.push({ t: 'text', s: h, align: 'center', bold: true });
        L.push({ t: 'text', s: out.name || '', align: 'center' });
        if (out.address) L.push({ t: 'text', s: out.address, align: 'center' });
        if (out.phone) L.push({ t: 'text', s: 'Telp ' + out.phone, align: 'center' });
        if (kind === 'bill') L.push({ t: 'feed' }, { t: 'text', s: 'PRE-BILL / BELUM LUNAS', align: 'center', bold: true });
        if (ctx.copy) L.push({ t: 'text', s: '*** SALINAN ***', align: 'center', bold: true });
        L.push({ t: 'hr' });
        L.push({ t: 'row', l: 'No: ' + o.order_no, r: fmtDate(o.closed_at || Date.now()) + ' ' + fmtTime(o.closed_at || Date.now()) });
        L.push({ t: 'row', l: (ch ? ch.name : o.channel) + (o.table_name ? ' · Meja ' + o.table_name : ''), r: o.guests ? o.guests + ' tamu' : '' });
        if (ctx.staffName) L.push({ t: 'text', s: 'Kasir: ' + ctx.staffName });
        if (o.customer_name) L.push({ t: 'text', s: 'Pelanggan: ' + o.customer_name });
        L.push({ t: 'hr' });
        for (const it of o.items.filter(i => i.status !== 'void')) {
            L.push({ t: 'text', s: it.name });
            if (it.mods && it.mods.length) L.push({ t: 'text', s: '  ' + it.mods.map(m => m.name).join(', '), small: true });
            if (it.note) L.push({ t: 'text', s: '  * ' + it.note, small: true });
            L.push({ t: 'row', l: `  ${it.qty} x ${nf(it.price)}`, r: nf(it.price * it.qty) });
            if (it.discount) L.push({ t: 'row', l: '  Diskon', r: '-' + nf(it.discount) });
        }
        const tt = o.totals || {};
        L.push({ t: 'hr' });
        L.push({ t: 'row', l: 'Subtotal', r: nf(tt.subtotal) });
        if (tt.order_discount) L.push({ t: 'row', l: o.discount && o.discount.name ? o.discount.name : 'Diskon', r: '-' + nf(tt.order_discount) });
        if (tt.service) L.push({ t: 'row', l: `Service ${out.service_rate || ''}%`, r: nf(tt.service) });
        if (tt.tax) L.push({ t: 'row', l: `${out.tax_label || 'Pajak'} ${out.tax_rate || ''}%${out.tax_inclusive ? ' (termasuk)' : ''}`, r: nf(tt.tax) });
        if (o.rounding) L.push({ t: 'row', l: 'Pembulatan', r: nf(o.rounding) });
        L.push({ t: 'row', l: 'TOTAL', r: 'Rp ' + nf((tt.total || 0) + (o.rounding || 0)), bold: true, big: true });
        if (kind === 'receipt') {
            for (const p of o.payments || []) L.push({ t: 'row', l: p.name + (p.ref ? ' ' + p.ref : ''), r: nf(p.amount) });
            if (o.change) L.push({ t: 'row', l: 'Kembali', r: nf(o.change), bold: true });
            if (o.points_earned) L.push({ t: 'text', s: `Poin didapat: ${o.points_earned}` });
            if (o.status === 'refunded') L.push({ t: 'text', s: '*** REFUND ***', align: 'center', bold: true });
        }
        L.push({ t: 'hr' });
        for (const f of String(out.receipt_footer || 'Terima kasih').split('\n').filter(Boolean)) L.push({ t: 'text', s: f, align: 'center' });
        if (o.offline) L.push({ t: 'text', s: '(transaksi offline)', align: 'center', small: true });
        return L;
    },

    /** Tiket dapur */
    kitchen(tk) {
        const L = [];
        L.push({ t: 'text', s: (tk.station || 'DAPUR').toUpperCase(), align: 'center', bold: true });
        L.push({ t: 'text', s: tk.label, align: 'center', bold: true, big: true });
        L.push({ t: 'row', l: '#' + (tk.ticket_no || '-'), r: fmtTime(tk.created_at || Date.now()) });
        L.push({ t: 'hr' });
        for (const it of tk.items.filter(i => !i.void)) {
            L.push({ t: 'text', s: `${it.qty} x ${it.name}`, bold: true, big: true });
            if (it.mods && it.mods.length) L.push({ t: 'text', s: '   ' + it.mods.join(', ') });
            if (it.note) L.push({ t: 'text', s: '   ** ' + it.note, bold: true });
        }
        L.push({ t: 'hr' });
        return L;
    },

    /** Laporan shift */
    shift(s, outlet) {
        const sum = s.summary || s.live || {};
        const L = [{ t: 'text', s: 'LAPORAN SHIFT', align: 'center', bold: true }, { t: 'text', s: outlet ? outlet.name : '', align: 'center' }, { t: 'hr' }];
        L.push({ t: 'row', l: 'Kasir', r: s.staff_name || '-' });
        L.push({ t: 'row', l: 'Buka', r: fmtDateTime(s.opened_at) });
        if (s.closed_at) L.push({ t: 'row', l: 'Tutup', r: fmtDateTime(s.closed_at) });
        L.push({ t: 'hr' });
        L.push({ t: 'row', l: 'Transaksi', r: nf(sum.trx) });
        L.push({ t: 'row', l: 'Total penjualan', r: nf(sum.total) });
        for (const [m, v] of Object.entries(sum.by_method || {})) L.push({ t: 'row', l: '  ' + m, r: nf(v) });
        L.push({ t: 'row', l: 'Diskon', r: nf(sum.discounts) });
        L.push({ t: 'row', l: 'Item void', r: nf(sum.void_items) });
        L.push({ t: 'hr' });
        L.push({ t: 'row', l: 'Modal awal', r: nf(s.opening_cash) });
        L.push({ t: 'row', l: 'Penjualan tunai', r: nf(sum.cash_sales) });
        L.push({ t: 'row', l: 'Kas masuk', r: nf(sum.cash_in) });
        L.push({ t: 'row', l: 'Kas keluar', r: '-' + nf(sum.cash_out) });
        if (sum.refund_cash) L.push({ t: 'row', l: 'Refund tunai', r: '-' + nf(sum.refund_cash) });
        L.push({ t: 'row', l: 'Kas seharusnya', r: nf(sum.expected_cash), bold: true });
        if (s.closing_cash !== null && s.closing_cash !== undefined) {
            L.push({ t: 'row', l: 'Kas aktual', r: nf(s.closing_cash), bold: true });
            L.push({ t: 'row', l: 'Selisih', r: nf(sum.difference), bold: true });
        }
        L.push({ t: 'hr' });
        return L;
    },

    /** Laporan tutup hari */
    day(sum) {
        const L = [{ t: 'text', s: 'TUTUP HARI', align: 'center', bold: true }, { t: 'text', s: sum.outlet + ' · ' + sum.business_date, align: 'center' }, { t: 'hr' }];
        L.push({ t: 'row', l: 'Transaksi', r: nf(sum.trx) }, { t: 'row', l: 'Tamu', r: nf(sum.guests) });
        L.push({ t: 'row', l: 'Penjualan kotor', r: nf(sum.gross) }, { t: 'row', l: 'Diskon', r: '-' + nf(sum.discount) });
        L.push({ t: 'row', l: 'Penjualan bersih', r: nf(sum.net) }, { t: 'row', l: 'Service', r: nf(sum.service) }, { t: 'row', l: 'Pajak', r: nf(sum.tax) });
        L.push({ t: 'row', l: 'TOTAL', r: nf(sum.total), bold: true });
        if (sum.refund_trx) L.push({ t: 'row', l: `Refund (${sum.refund_trx})`, r: nf(sum.refund_total) });
        L.push({ t: 'hr' }, { t: 'text', s: 'Pembayaran', bold: true });
        for (const p of sum.by_payment || []) L.push({ t: 'row', l: `${p.name} (${p.count})`, r: nf(p.amount) });
        L.push({ t: 'hr' }, { t: 'text', s: 'Menu terlaris', bold: true });
        for (const i of sum.top_items || []) L.push({ t: 'row', l: `${i.qty} x ${i.name}`, r: nf(i.gross) });
        L.push({ t: 'hr' });
        return L;
    },

    toEscPos(lines, width = 58, opts = {}) {
        const cols = width === 80 ? 48 : 32;
        const p = new EscPos(cols);
        for (const l of lines) {
            if (l.t === 'hr') { p.align('left').line('-'.repeat(cols)); continue; }
            if (l.t === 'feed') { p.line(''); continue; }
            p.align(l.align || 'left').bold(!!l.bold);
            if (l.big) p.size(1, 2);
            if (l.t === 'text') for (const s of wrapText(l.s, l.big ? cols : cols)) p.line(s);
            if (l.t === 'row') for (const s of padRow(l.l, l.r, cols)) p.line(s);
            if (l.big) p.size(1, 1);
            p.bold(false);
        }
        p.align('left');
        if (opts.drawer) p.drawer();
        p.cut();
        return p.bytes();
    },

    toHtml(lines) {
        return lines.map(l => {
            if (l.t === 'hr') return '<div style="border-top:1px dashed #000;margin:4px 0"></div>';
            if (l.t === 'feed') return '<div style="height:8px"></div>';
            const style = `text-align:${l.align || 'left'};${l.bold ? 'font-weight:700;' : ''}${l.big ? 'font-size:14px;' : ''}${l.small ? 'font-size:10px;' : ''}`;
            if (l.t === 'row') return `<div style="display:flex;justify-content:space-between;gap:8px;${style}"><span>${esc(l.l)}</span><span style="white-space:nowrap">${esc(l.r)}</span></div>`;
            return `<div style="${style}">${esc(l.s)}</div>`;
        }).join('');
    }
};
