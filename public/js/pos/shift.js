// Shift kasir: buka (modal awal), kas masuk/keluar, buka laci, tutup (hitung selisih), tutup hari
const Shift = {
    openDialog() {
        if (!POS.can('shift')) return toast('Minta kasir/manager membuka shift', 'error');
        if (POS.shift) return this.panel();
        let buf = '';
        POS.modal({
            title: '<i class="fas fa-lock-open mr-2 text-brand-500"></i>Buka Shift',
            body: `<p class="text-sm text-stone-500 mb-3">Hitung uang tunai di laci sebagai modal awal.</p>
                <div id="sh-input" class="text-4xl font-extrabold text-center border-b-2 border-brand-500 py-2">Rp 0</div>
                <div class="grid grid-cols-4 gap-2 mt-3">${[0, 200000, 300000, 500000].map(v => `<button data-q="${v}" class="py-2.5 rounded-xl bg-brand-50 text-brand-700 font-semibold text-sm">${v ? rp(v) : 'Rp 0'}</button>`).join('')}</div>
                <div class="numpad grid grid-cols-3 gap-2 mt-3">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map(k => `<button data-k="${k}" class="rounded-xl bg-stone-100 hover:bg-stone-200 text-xl font-semibold">${k}</button>`).join('')}</div>`,
            foot: '<button id="sh-later" class="btn-light">Nanti</button><button id="sh-open" class="btn-primary flex-1 py-3">Buka shift</button>'
        });
        const draw = () => { $('#sh-input').textContent = rp(Number(buf) || 0); };
        $$('#pos-modal-body [data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; buf = k === '⌫' ? buf.slice(0, -1) : (buf + k).slice(0, 10); draw(); });
        $$('#pos-modal-body [data-q]').forEach(b => b.onclick = () => { buf = b.dataset.q; draw(); });
        $('#sh-later').onclick = () => POS.closeModal();
        $('#sh-open').onclick = async () => {
            const id = uuid();
            const amount = Number(buf) || 0;
            POS.shift = { id, outlet_id: POS.outlet.id, device_id: POS.device.id, staff_id: POS.staff.id, staff_name: POS.staff.name, opening_cash: amount, opened_at: Date.now(), status: 'open' };
            POS._shiftLocal = true;
            await POS.exec('shift.open', null, { shift_id: id, opening_cash: amount });
            POS.closeModal();
            POS.renderHeader();
            toast('Shift dibuka', 'success');
        };
    },

    async panel() {
        if (!POS.shift) return this.openDialog();
        let live = null;
        if (POS.online) { try { await Sync.flush(); live = (await API.get('/t/shifts/current')).shift; } catch { } }
        const sum = live ? live.live : null;
        const row = (l, v, cls = '') => `<div class="flex justify-between ${cls}"><span class="text-stone-500">${l}</span><b>${v}</b></div>`;
        POS.modal({
            title: '<i class="fas fa-cash-register mr-2 text-brand-500"></i>Shift & Kas',
            body: `<div class="space-y-1 text-sm">${row('Kasir', esc(POS.shift.staff_name || '-'))}${row('Dibuka', fmtDateTime(POS.shift.opened_at))}${row('Modal awal', rp(POS.shift.opening_cash))}</div>
                ${sum ? `<div class="mt-4 p-3 rounded-xl bg-stone-50 space-y-1 text-sm">${row('Transaksi', sum.trx)}${row('Total penjualan', rp(sum.total))}${Object.entries(sum.by_method).map(([m, v]) => row('&nbsp;&nbsp;' + esc(m), rp(v))).join('')}
                    ${row('Kas masuk', rp(sum.cash_in))}${row('Kas keluar', '-' + rp(sum.cash_out))}${sum.refund_cash ? row('Refund tunai', '-' + rp(sum.refund_cash)) : ''}${row('Kas seharusnya di laci', rp(sum.expected_cash), 'text-base pt-1 border-t border-stone-200')}</div>`
                : '<div class="mt-4 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm"><i class="fas fa-wifi mr-1"></i>Ringkasan shift tersedia saat online.</div>'}
                ${POS.can('cash') ? `<div class="grid grid-cols-3 gap-2 mt-4"><button data-cash="in" class="btn-light py-3"><i class="fas fa-arrow-down text-emerald-600"></i>Kas masuk</button><button data-cash="out" class="btn-light py-3"><i class="fas fa-arrow-up text-red-500"></i>Kas keluar</button><button data-cash="no_sale" class="btn-light py-3"><i class="fas fa-inbox"></i>Buka laci</button></div>` : ''}`,
            foot: `${sum ? '<button id="sh-print" class="btn-light"><i class="fas fa-print"></i>Cetak X-report</button>' : ''}<button id="sh-close" class="btn-danger flex-1 py-3" ${POS.can('shift') ? '' : 'disabled'}><i class="fas fa-lock"></i>Tutup shift</button>`
        });
        $$('[data-cash]').forEach(b => b.onclick = () => this.cash(b.dataset.cash));
        const pr = $('#sh-print'); if (pr) pr.onclick = () => Printer.print({ label: 'X-report', lines: Receipt.shift({ ...live, summary: null, closing_cash: null }, POS.outlet) }).catch(e => errorDialog(e));
        $('#sh-close').onclick = () => this.close(sum);
    },

    async cash(type) {
        if (type === 'no_sale') {
            const note = await promptDialog('Buka laci tanpa transaksi', { label: 'Alasan', placeholder: 'mis. tukar uang kecil', validate: v => !v.trim() && 'Alasan wajib' });
            if (!note) return;
            await POS.exec('shift.cash', null, { id: uuid(), shift_id: POS.shift.id, type, amount: 0, note });
            if (Printer.settings.driver !== 'browser') Printer.print({ label: 'Laci', lines: [], drawer: true }).catch(e => errorDialog(e));
            return toast('Laci dibuka & dicatat');
        }
        const r = await SwalBase.fire({
            title: type === 'in' ? 'Kas masuk' : 'Kas keluar',
            html: '<input id="cm-amt" type="number" min="1" class="input mb-2 text-center text-2xl" placeholder="Nominal"><input id="cm-note" class="input" placeholder="Keterangan (mis. beli es batu)">',
            showCancelButton: true, confirmButtonText: 'Simpan', focusConfirm: false,
            preConfirm: () => { const amount = Number($('#cm-amt').value); if (!(amount > 0)) { Swal.showValidationMessage('Nominal wajib'); return false; } return { amount, note: $('#cm-note').value.trim() }; }
        });
        if (!r.isConfirmed) return;
        await POS.exec('shift.cash', null, { id: uuid(), shift_id: POS.shift.id, type, amount: r.value.amount, note: r.value.note });
        toast('Tercatat', 'success');
        this.panel();
    },

    async close(sum) {
        if (!POS.online) return errorDialog(new Error('Tutup shift butuh koneksi internet agar kas seharusnya akurat. Transaksi tetap bisa berjalan selama offline.'));
        const mine = [...POS.orders.values()].filter(o => o.shift_id === POS.shift.id);
        if (mine.length && !(await confirmDialog(`Masih ada ${mine.length} order terbuka`, 'Order terbuka tetap bisa dibayar di shift berikutnya. Lanjut tutup shift?', 'Lanjut'))) return;
        const r = await SwalBase.fire({
            title: 'Tutup shift', html: `<p class="text-sm mb-2">Hitung uang fisik di laci.</p><input id="cl-amt" type="number" min="0" class="input text-center text-2xl" placeholder="Kas aktual"><input id="cl-note" class="input mt-2" placeholder="Catatan (opsional)">`,
            showCancelButton: true, confirmButtonText: 'Tutup shift', confirmButtonColor: '#ef4444', focusConfirm: false,
            preConfirm: () => { const v = $('#cl-amt').value; if (v === '') { Swal.showValidationMessage('Isi kas aktual'); return false; } return { closing_cash: Number(v), note: $('#cl-note').value.trim() }; }
        });
        if (!r.isConfirmed) return;
        await POS.exec('shift.close', null, { shift_id: POS.shift.id, ...r.value });
        await Sync.flush();
        let shift = null;
        try { shift = (await API.get('/t/shifts/' + POS.shift.id)).shift; } catch { }
        POS.shift = null; POS._shiftLocal = false;
        POS.closeModal();
        POS.renderHeader();
        if (shift && shift.summary) {
            const d = shift.summary.difference;
            await SwalBase.fire({ icon: d === 0 ? 'success' : 'warning', title: 'Shift ditutup', html: `Kas seharusnya <b>${rp(shift.expected_cash)}</b><br>Kas aktual <b>${rp(shift.closing_cash)}</b><br>Selisih <b class="${d < 0 ? 'text-red-600' : d > 0 ? 'text-amber-600' : 'text-emerald-600'}">${rp(d)}</b>`, confirmButtonText: 'Cetak laporan', showCancelButton: true, cancelButtonText: 'Tutup' })
                .then(x => { if (x.isConfirmed) Printer.print({ label: 'Laporan shift', lines: Receipt.shift(shift, POS.outlet) }).catch(e => errorDialog(e)); });
        }
        POS.lock();
    },

    async closeDay() {
        if (!POS.online) return errorDialog(new Error('Tutup hari butuh koneksi internet'));
        if (!(await confirmDialog('Tutup hari bisnis?', 'Pastikan semua order sudah dibayar & semua shift sudah ditutup. Laporan Z akan dibuat.', 'Tutup hari'))) return;
        try {
            await Sync.flush();
            const r = await API.post('/t/days/close', { outlet_id: POS.outlet.id });
            await SwalBase.fire({ icon: 'success', title: 'Hari ditutup', html: `${r.summary.trx} transaksi · <b>${rp(r.summary.total)}</b>`, confirmButtonText: 'Cetak Z-report', showCancelButton: true, cancelButtonText: 'Tutup' })
                .then(x => { if (x.isConfirmed) Printer.print({ label: 'Z-report', lines: Receipt.day(r.summary) }).catch(e => errorDialog(e)); });
        } catch (e) { errorDialog(e); }
    }
};
