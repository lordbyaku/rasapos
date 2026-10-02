// Pembayaran: promo otomatis, multi metode / split payment, pembulatan tunai, struk, refund
const Payment = {
    receiptCtx(o, copy = false) {
        const st = POS.idx.staff[o.closed_by || o.staff_id];
        return { outlet: POS.outlet, tenantName: POS.boot.tenant.name, staffName: st ? st.name : POS.staff.name, channels: POS.boot.channels, copy };
    },

    /** Sama dengan aturan server (promoActive) */
    promoOk(p, o) {
        const local = new Date(Date.now() + POS.outlet.tz_offset_min * 60000);
        const day = local.getUTCDay(), hhmm = local.toISOString().slice(11, 16), date = local.toISOString().slice(0, 10);
        if (p.days.length && !p.days.map(Number).includes(day)) return false;
        if (p.start_time && hhmm < p.start_time) return false;
        if (p.end_time && hhmm > p.end_time) return false;
        if (p.start_date && date < p.start_date) return false;
        if (p.end_date && date > p.end_date) return false;
        if (p.channels.length && !p.channels.includes(o.channel)) return false;
        return (o.totals ? o.totals.subtotal : 0) >= p.min_subtotal;
    },

    async applyAutoPromo(o) {
        if (o.discount && !o.discount.promo_id) return o; // diskon manual dipertahankan
        const sub = o.totals ? o.totals.subtotal : 0;
        const value = p => p.type === 'percent' ? Math.round(sub * p.value / 100) : Math.min(p.value, sub);
        const best = POS.boot.promos.filter(p => p.auto_apply && this.promoOk(p, o)).sort((a, b) => value(b) - value(a))[0];
        const curId = o.discount ? o.discount.promo_id : null;
        if ((best ? best.id : null) === curId) return o;
        if (curId && !best && !POS.boot.promos.find(p => p.id === curId && p.auto_apply)) return o; // promo manual
        await POS.exec('order.discount', o.id, { discount: best ? { type: best.type, value: best.value, name: best.name, promo_id: best.id } : null }, { render: false });
        if (best) toast('Promo diterapkan: ' + best.name, 'success');
        return POS.orders.get(o.id);
    },

    async open(o) {
        if (!POS.can('pay')) return toast('Anda tidak punya izin menerima pembayaran', 'error');
        if (!POS.shift) return Shift.openDialog();
        o = POS.orders.get(o.id) || o;
        if (!o.items.some(i => i.status !== 'void')) return toast('Order masih kosong');
        o = await this.applyAutoPromo(o);
        const total = o.totals.total;
        const step = POS.outlet.cash_rounding;
        const methods = POS.boot.payment_methods;
        const lines = [];
        let method = methods[0].code, buf = '', fresh = true;
        const typeOf = code => (POS.idx.method[code] || {}).type === 'cash' ? 'cash' : 'noncash';
        const icon = m => m.type === 'cash' ? 'fa-money-bill-wave' : m.code === 'qris' ? 'fa-qrcode' : /debit|credit|kartu/i.test(m.code + m.name) ? 'fa-credit-card' : m.code === 'compliment' ? 'fa-gift' : m.code === 'online' ? 'fa-mobile-screen' : 'fa-wallet';

        POS.modal({
            title: `Pembayaran · ${esc(o.order_no)}`, size: 'max-w-4xl',
            body: `<div class="grid md:grid-cols-[280px_1fr] gap-5">
                <div class="bg-stone-50 rounded-2xl p-4 flex flex-col">
                    <div class="text-xs text-stone-500">${esc((POS.idx.channel[o.channel] || {}).name || '')}${o.table_name ? ' · Meja ' + esc(o.table_name) : ''}${o.customer_name ? ' · ' + esc(o.customer_name) : ''}</div>
                    <div class="text-sm text-stone-500 mt-3">Total tagihan</div><div class="text-3xl font-extrabold">${rp(total)}</div>
                    ${o.discount ? `<div class="text-xs text-emerald-700 mt-1"><i class="fas fa-tag mr-1"></i>${esc(o.discount.name)} −${rp(o.totals.order_discount)}</div>` : ''}
                    <div class="text-sm font-semibold mt-4">Pembayaran</div><div id="py-lines" class="mt-2 space-y-2 flex-1 min-h-[60px]"></div>
                    <div class="border-t border-stone-200 pt-3 space-y-1 text-sm">
                        <div class="flex justify-between"><span>Dibayar</span><b id="py-paid"></b></div>
                        <div class="flex justify-between" id="py-round-row"><span>Pembulatan</span><b id="py-round"></b></div>
                        <div class="flex justify-between"><span>Sisa</span><b id="py-remain" class="text-red-500"></b></div>
                        <div class="flex justify-between text-lg"><span>Kembalian</span><b id="py-change" class="text-emerald-600"></b></div>
                    </div>
                </div>
                <div class="flex flex-col">
                    <div class="grid grid-cols-3 lg:grid-cols-5 gap-2" id="py-methods">${methods.map(m => `<button data-m="${m.code}" class="py-3 rounded-xl border-2 text-xs font-semibold"><i class="fas ${icon(m)} block text-lg mb-1"></i>${esc(m.name)}</button>`).join('')}</div>
                    <div class="flex items-end gap-2 mt-4"><div class="flex-1"><div class="text-xs text-stone-500">Nominal <span id="py-mlabel"></span></div><div id="py-input" class="text-3xl font-bold border-b-2 border-brand-500 py-1">Rp 0</div></div><input id="py-ref" class="input !w-40" placeholder="No. ref (opsional)"></div>
                    <div id="py-quick" class="grid grid-cols-4 gap-2 mt-3"></div>
                    <div class="numpad grid grid-cols-3 gap-2 mt-3">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map(k => `<button data-k="${k}" class="rounded-xl bg-stone-100 hover:bg-stone-200 text-xl font-semibold">${k}</button>`).join('')}</div>
                </div></div>`,
            foot: `<button id="py-split" class="btn-outline"><i class="fas fa-plus"></i>Split payment</button><button id="py-done" class="btn-success flex-1 py-3 text-base"><i class="fas fa-check"></i>Selesaikan</button>`
        });

        const calc = () => {
            const all = [...lines];
            if (Number(buf) > 0) all.push({ method, type: typeOf(method), amount: Number(buf) });
            return { all, s: Money.settle(total, all, step) };
        };
        const remainingFor = m => {
            const nonCash = lines.filter(l => l.type !== 'cash').reduce((a, l) => a + l.amount, 0);
            const cash = lines.filter(l => l.type === 'cash').reduce((a, l) => a + l.amount, 0);
            const rem = Math.max(0, total - nonCash - cash);
            return typeOf(m) === 'cash' ? Money.cashDue(rem, step) : rem;
        };
        const draw = () => {
            const { s } = calc();
            $$('#py-methods [data-m]').forEach(b => b.className = `py-3 rounded-xl border-2 text-xs font-semibold ${b.dataset.m === method ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200'}`);
            $('#py-mlabel').textContent = '(' + (POS.idx.method[method] || {}).name + ')';
            $('#py-input').textContent = rp(Number(buf) || 0);
            const rem = remainingFor(method);
            const quick = typeOf(method) === 'cash' ? [rem, 20000, 50000, 100000, 150000, 200000, 300000, 500000].filter((v, i, a) => v >= rem && a.indexOf(v) === i).slice(0, 4) : [rem];
            $('#py-quick').innerHTML = quick.map((v, i) => `<button data-q="${v}" class="py-2.5 rounded-xl bg-brand-50 text-brand-700 font-semibold text-sm">${i === 0 ? 'Uang pas · ' + rp(v).replace('Rp ', '') : rp(v)}</button>`).join('');
            $$('#py-quick [data-q]').forEach(b => b.onclick = () => { buf = b.dataset.q; fresh = true; draw(); });
            $('#py-lines').innerHTML = lines.map((l, i) => `<div class="flex justify-between bg-white rounded-lg px-3 py-2 text-sm border border-stone-200"><span>${esc((POS.idx.method[l.method] || {}).name)}${l.ref ? ' · ' + esc(l.ref) : ''}</span><span class="font-semibold">${rp(l.amount)} <button data-del="${i}" class="ml-1 text-red-500"><i class="fas fa-xmark"></i></button></span></div>`).join('') || '<div class="text-xs text-stone-400">Pilih metode & nominal</div>';
            $$('#py-lines [data-del]').forEach(b => b.onclick = () => { lines.splice(Number(b.dataset.del), 1); draw(); });
            $('#py-paid').textContent = rp(s.paid);
            $('#py-round-row').classList.toggle('hidden', !s.rounding);
            $('#py-round').textContent = rp(s.rounding);
            $('#py-remain').textContent = rp(s.remaining);
            $('#py-change').textContent = rp(s.change);
        };
        $$('#py-methods [data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; buf = typeOf(method) === 'cash' ? '' : String(remainingFor(method)); fresh = true; draw(); });
        $$('.numpad [data-k]', $('#pos-modal-body')).forEach(b => b.onclick = () => {
            const k = b.dataset.k;
            // Ketikan pertama mengganti nominal yang terisi otomatis
            if (fresh && k !== '⌫') buf = '';
            fresh = false;
            buf = k === '⌫' ? buf.slice(0, -1) : (buf === '0' ? '' : buf) + k;
            if (buf.length > 10) buf = buf.slice(0, 10);
            draw();
        });
        $('#py-split').onclick = () => {
            if (!(Number(buf) > 0)) return toast('Masukkan nominal dulu');
            const amt = typeOf(method) === 'cash' ? Number(buf) : Math.min(Number(buf), remainingFor(method));
            lines.push({ method, type: typeOf(method), amount: amt, ref: $('#py-ref').value.trim() });
            $('#py-ref').value = '';
            method = (methods.find(m => m.code !== method) || methods[0]).code;
            buf = typeOf(method) === 'cash' ? '' : String(remainingFor(method));
            fresh = true;
            draw();
        };
        $('#py-done').onclick = async () => {
            const { all, s } = calc();
            if (!s.ok) return toast(s.remaining > 0 ? 'Pembayaran kurang ' + rp(s.remaining) : 'Nominal non-tunai melebihi tagihan', 'error');
            if (Number(buf) > 0) all[all.length - 1].ref = $('#py-ref').value.trim();
            const payments = all.map(l => ({ method: l.method, name: (POS.idx.method[l.method] || {}).name, type: l.type, amount: l.amount, ref: l.ref || '' }));
            $('#py-done').disabled = true;
            try {
                // Item yang belum dikirim → kirim ke dapur dulu (tiket tercetak & masuk KDS)
                if ((POS.orders.get(o.id) || o).items.some(i => i.status === 'new')) await OrderView.send(POS.orders.get(o.id) || o, true);
                const paid = await POS.exec('order.pay', o.id, { payments, shift_id: POS.shift.id }, { keepCurrent: true });
                POS.closeModal();
                this.done(paid);
            } catch (e) { $('#py-done').disabled = false; errorDialog(e); }
        };
        buf = typeOf(method) === 'cash' ? '' : String(total);
        draw();
    },

    done(o) {
        const hasCash = o.payments.some(p => p.type === 'cash');
        // Cetak otomatis hanya untuk printer thermal langsung (print browser selalu membuka dialog)
        if (Printer.settings.auto !== false && Printer.settings.driver !== 'browser') this.print(o, false, hasCash);
        else if (hasCash && Printer.settings.drawer && Printer.settings.driver !== 'browser') Printer.print({ label: 'Laci', lines: [], drawer: true }).catch(() => { });
        POS.currentId = null;
        OrderView.draft = { ...OrderView.draft, table_id: null, customer_name: '', customer_id: null };
        POS.modal({
            title: '', size: 'max-w-3xl',
            body: `<div class="grid md:grid-cols-2 gap-6"><div class="flex flex-col items-center justify-center text-center py-4">
                <div class="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center text-4xl"><i class="fas fa-check"></i></div>
                <h3 class="text-2xl font-extrabold mt-4">Pembayaran Berhasil</h3>
                <div class="text-stone-500 mt-1">Kembalian</div><div class="text-4xl font-extrabold text-emerald-600">${rp(o.change)}</div>
                ${o.points_earned ? `<div class="mt-2 text-amber-600 text-sm"><i class="fas fa-star"></i> +${o.points_earned} poin</div>` : ''}
                ${!POS.online ? '<div class="mt-2 text-xs text-amber-700"><i class="fas fa-wifi mr-1"></i>Tersimpan offline, akan disinkronkan otomatis</div>' : ''}
                <div class="grid grid-cols-2 gap-2 mt-6 w-full"><button id="dn-print" class="btn-light py-3"><i class="fas fa-print"></i>Cetak</button><button id="dn-wa" class="btn-light py-3"><i class="fab fa-whatsapp"></i>WhatsApp</button></div>
                <button id="dn-new" class="btn-primary w-full mt-2 py-3">Order baru</button></div>
                <div class="bg-stone-100 rounded-2xl p-4 max-h-[60vh] overflow-y-auto thin-scroll"><div class="bg-white p-4 font-mono text-[11px] leading-snug shadow-sm">${Receipt.toHtml(Receipt.order(o, this.receiptCtx(o)))}</div></div></div>`
        });
        $('#dn-print').onclick = () => this.print(o, true);
        $('#dn-wa').onclick = () => this.shareWa(o);
        $('#dn-new').onclick = () => { POS.closeModal(); OrderView.newOrder(); };
    },

    print(o, copy, drawer) {
        Printer.print({ label: 'Struk ' + o.order_no, lines: Receipt.order(o, this.receiptCtx(o, copy)), drawer: !!drawer })
            .catch(e => toast('Gagal cetak: ' + e.message, 'error', 5000));
    },

    reprint(o) {
        if (!POS.can('reprint') && !POS.can('pay')) return toast('Tidak punya izin cetak ulang', 'error');
        this.print(o, true);
    },

    shareWa(o) {
        const lines = Receipt.order(o, this.receiptCtx(o));
        const text = lines.map(l => l.t === 'hr' ? '------------------------' : l.t === 'row' ? `${l.l}  ${l.r}` : l.t === 'feed' ? '' : l.s).join('\n');
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    },

    async printBill(o) {
        o = POS.orders.get(o.id) || o;
        try { await POS.exec('order.print_bill', o.id, {}); } catch (e) { return errorDialog(e); }
        o = POS.orders.get(o.id) || o;
        Printer.print({ label: 'Pre-bill ' + o.order_no, lines: Receipt.order(o, this.receiptCtx(o), 'bill') }).catch(e => toast('Gagal cetak: ' + e.message, 'error'));
        toast('Pre-bill dicetak');
    },

    async refund(o) {
        if (!POS.online) return errorDialog(new Error('Refund hanya bisa saat online'));
        const reason = await promptDialog('Refund ' + o.order_no + ' (' + rp(o.totals.total + (o.rounding || 0)) + ')', { label: 'Alasan refund (wajib)', validate: v => !v.trim() && 'Alasan wajib', confirm: 'Lanjut' });
        if (!reason) return;
        const ap = await POS.askApproval('refund', 'Persetujuan refund');
        if (!ap) return;
        try {
            await POS.execOnline('order.refund', o.id, { reason, ...(ap.staff_id ? { approval: { staff_id: ap.staff_id, pin: ap.pin } } : {}) });
            toast('Refund dicatat. Kembalikan uang ke pelanggan.', 'success', 4000);
            OrdersView.render();
        } catch (e) { errorDialog(e); }
    }
};
