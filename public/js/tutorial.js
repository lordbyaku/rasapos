// Tutorial interaktif RasaPOS: modul per peran, simulator latihan, kuis, progres & sertifikat.
// Simulator memakai Money.calc / Money.settle yang sama dengan aplikasi kasir, jadi angka latihan = angka asli.
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const rp = n => (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(n)).toLocaleString('id-ID');
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penyimpanan diblokir */ } }
    };

    const OUTLET = { tax_rate: 10, service_rate: 5, tax_on_service: true, tax_inclusive: false, cash_rounding: 100 };
    const { ROLES, MODULES, FAQ } = window.RasaTutorial;

    const GLOSSARY_LINK = '<a data-go="intro" class="text-brand-600 font-semibold cursor-pointer">Kamus istilah ada di modul "Mulai di sini"</a>';

    // =====================================================================================
    // PROGRES
    // =====================================================================================
    const prog = store.get('rp_tutorial', { lessons: {}, quiz: {}, role: 'all' });
    const save = () => store.set('rp_tutorial', prog);
    const lessonKey = (m, i) => `${m.id}:${i}`;
    const modulesForRole = role => MODULES.filter(m => role === 'all' || m.roles.includes(role));
    const moduleDone = m => m.lessons.every((_, i) => prog.lessons[lessonKey(m, i)]) && (m.noQuiz || (prog.quiz[m.id] || 0) >= 70);
    const modulePct = m => {
        const total = m.lessons.length + (m.noQuiz ? 0 : 1);
        const done = m.lessons.filter((_, i) => prog.lessons[lessonKey(m, i)]).length + (!m.noQuiz && (prog.quiz[m.id] || 0) >= 70 ? 1 : 0);
        return Math.round(done / total * 100);
    };
    function updateProgress() {
        const mods = modulesForRole(prog.role);
        const pct = mods.length ? Math.round(mods.reduce((s, m) => s + modulePct(m), 0) / mods.length) : 0;
        $('#t-progress-text').textContent = pct + '%';
        $('#t-progress-bar').style.width = pct + '%';
        renderNav();
    }

    // =====================================================================================
    // NAVIGASI & HALAMAN
    // =====================================================================================
    let current = 'home';
    let query = '';

    function renderNav() {
        const mods = modulesForRole(prog.role);
        $('#t-nav').innerHTML = `<button data-go="home" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${current === 'home' ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-stone-50'}"><i class="fas fa-house w-4"></i>Beranda</button>` +
            mods.map((m, i) => {
                const pct = modulePct(m);
                return `<button data-go="${m.id}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${current === m.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-stone-50'}">
                    <span class="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${pct === 100 ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-500'}">${pct === 100 ? '<i class="fas fa-check"></i>' : i + 1}</span>
                    <span class="flex-1 min-w-0"><span class="block truncate">${m.title}</span><span class="block h-1 bg-stone-100 rounded-full mt-1"><span class="block h-1 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}" style="width:${pct}%"></span></span></span></button>`;
            }).join('');
        $$('#t-nav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    }

    function go(id) {
        current = id;
        location.hash = id;
        toggleSide(false);
        if (id === 'home') renderHome(); else renderModule(MODULES.find(m => m.id === id) || MODULES[0]);
        renderNav();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function renderHome() {
        const mods = modulesForRole(prog.role);
        const done = mods.filter(moduleDone).length;
        const minutes = mods.reduce((s, m) => s + m.minutes, 0);
        $('#t-content').innerHTML = `
            <div class="rounded-3xl bg-stone-900 text-white p-6 lg:p-8 relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand-500/20"></div>
                <div class="text-xs uppercase tracking-widest text-brand-500 font-bold">Training RasaPOS</div>
                <h1 class="text-2xl lg:text-3xl font-extrabold mt-2">Selamat datang! 👋</h1>
                <p class="text-stone-300 mt-2 max-w-xl">Pelajari RasaPOS langkah demi langkah sesuai tugas Anda. Setiap modul berisi penjelasan, <b class="text-white">latihan simulasi</b> yang aman (tidak mengubah data asli), dan kuis singkat.</p>
                <div class="flex flex-wrap gap-3 mt-5 text-sm">
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-layer-group mr-1"></i>${mods.length} modul</span>
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-clock mr-1"></i>± ${minutes} menit</span>
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-circle-check mr-1"></i>${done} selesai</span>
                </div>
            </div>
            <h2 class="font-bold text-lg mt-8 mb-3">Pilih peran Anda</h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">${Object.entries(ROLES).map(([k, v]) => `<button data-role="${k}" class="card p-4 text-left hover:border-brand-500 ${prog.role === k ? 'border-brand-500 bg-brand-50' : ''}">
                <i class="fas ${{ owner: 'fa-crown', manager: 'fa-user-tie', cashier: 'fa-cash-register', waiter: 'fa-bell-concierge', kitchen: 'fa-fire-burner' }[k]} text-brand-500 text-xl"></i>
                <div class="font-semibold mt-2 text-sm">${v}</div><div class="text-[11px] text-stone-500">${modulesForRole(k).length} modul</div></button>`).join('')}</div>
            <h2 class="font-bold text-lg mt-8 mb-3">Modul ${prog.role === 'all' ? '' : 'untuk ' + ROLES[prog.role]}</h2>
            <div class="grid md:grid-cols-2 gap-3">${mods.map((m, i) => { const pct = modulePct(m); return `<button data-go="${m.id}" class="card p-4 text-left hover:border-brand-500 flex gap-4">
                <div class="w-12 h-12 rounded-xl ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'} text-white grid place-items-center text-lg shrink-0"><i class="fas ${pct === 100 ? 'fa-check' : m.icon}"></i></div>
                <div class="flex-1 min-w-0"><div class="text-[11px] text-stone-400 font-semibold">MODUL ${i + 1} · ${m.minutes} MENIT</div><div class="font-bold">${m.title}</div><div class="text-xs text-stone-500 mt-0.5">${m.desc}</div>
                <div class="h-1.5 bg-stone-100 rounded-full mt-2"><div class="h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}" style="width:${pct}%"></div></div></div></button>`; }).join('')}</div>
            <div class="card p-5 mt-8 flex flex-wrap items-center gap-4"><i class="fas fa-award text-4xl text-brand-500"></i><div class="flex-1 min-w-[200px]"><b>Sertifikat training</b><p class="text-sm text-stone-500">Selesaikan semua modul untuk peran Anda (kuis minimal 70%) untuk mencetak sertifikat.</p></div><button class="btn-primary" data-cert>Lihat sertifikat</button></div>`;
        $$('#t-content [data-role]').forEach(b => b.onclick = () => { prog.role = b.dataset.role; $('#t-role').value = prog.role; save(); updateProgress(); renderHome(); });
        $$('#t-content [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
        $('[data-cert]').onclick = showCertificate;
    }

    function renderModule(m) {
        const mods = modulesForRole(prog.role);
        const idx = mods.indexOf(m);
        const next = mods[idx + 1];
        const prev = mods[idx - 1];
        $('#t-content').innerHTML = `
            <div class="text-xs text-stone-500 mb-1"><button data-go="home" class="hover:text-brand-600">Beranda</button> / Modul ${idx + 1}</div>
            <div class="flex items-start gap-4"><div class="w-14 h-14 rounded-2xl bg-brand-500 text-white grid place-items-center text-2xl shrink-0"><i class="fas ${m.icon}"></i></div>
                <div class="flex-1"><h1 class="text-2xl font-extrabold">${m.title}</h1><p class="text-stone-500">${m.desc}</p>
                <div class="flex flex-wrap gap-1 mt-2">${m.roles.map(r => `<span class="badge bg-stone-100 text-stone-600">${ROLES[r]}</span>`).join('')}<span class="badge bg-stone-100 text-stone-600"><i class="fas fa-clock mr-1"></i>${m.minutes} menit</span></div></div></div>
            <div class="mt-6 space-y-3">${m.lessons.map((l, i) => {
                const done = prog.lessons[lessonKey(m, i)];
                const hidden = query && !(l.title + l.html).toLowerCase().includes(query);
                return `<section class="card overflow-hidden ${hidden ? 'hidden' : ''}" data-lesson="${i}">
                    <button class="w-full flex items-center gap-3 p-4 text-left" data-toggle="${i}">
                        <span class="w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700'}">${done ? '<i class="fas fa-check"></i>' : i + 1}</span>
                        <span class="flex-1 font-bold">${l.title}</span><i class="fas fa-chevron-down text-stone-400 transition-transform" data-chev></i></button>
                    <div class="lesson px-4 pb-4 ${i === firstOpen(m) || query ? '' : 'hidden'}" data-body>${l.html}
                        <div class="mt-4 pt-4 border-t border-stone-100 flex justify-end"><button class="${done ? 'btn-light' : 'btn-success'}" data-done="${i}">${done ? '<i class="fas fa-rotate-left"></i>Tandai belum' : '<i class="fas fa-check"></i>Saya sudah paham'}</button></div></div></section>`;
            }).join('')}</div>
            ${m.noQuiz ? '' : `<div class="card p-5 mt-6" id="quiz"></div>`}
            <div class="flex justify-between gap-2 mt-6">${prev ? `<button class="btn-light" data-go="${prev.id}"><i class="fas fa-arrow-left"></i>${prev.title}</button>` : '<span></span>'}${next ? `<button class="btn-primary" data-go="${next.id}">${next.title}<i class="fas fa-arrow-right"></i></button>` : `<button class="btn-primary" data-cert><i class="fas fa-award"></i>Sertifikat</button>`}</div>`;
        $$('#t-content [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
        const cert = $('#t-content [data-cert]'); if (cert) cert.onclick = showCertificate;
        $$('[data-toggle]').forEach(b => b.onclick = () => { const s = b.closest('section'); $('[data-body]', s).classList.toggle('hidden'); $('[data-chev]', s).classList.toggle('rotate-180'); initSims(s); });
        $$('[data-done]').forEach(b => b.onclick = () => {
            const k = lessonKey(m, Number(b.dataset.done));
            prog.lessons[k] = !prog.lessons[k];
            save(); updateProgress();
            const open = $$('section[data-lesson]').map(s => !$('[data-body]', s).classList.contains('hidden'));
            renderModule(m);
            // buka pelajaran berikutnya setelah ditandai selesai
            $$('section[data-lesson]').forEach((s, i) => { const show = prog.lessons[k] ? i === Number(b.dataset.done) + 1 || (open[i] && i !== Number(b.dataset.done)) : open[i]; $('[data-body]', s).classList.toggle('hidden', !show); });
            initSims(document);
        });
        $$('[data-faq]').forEach(el => renderFaq(el));
        if (!m.noQuiz) renderQuiz(m);
        initSims(document);
    }

    function firstOpen(m) {
        const i = m.lessons.findIndex((_, j) => !prog.lessons[lessonKey(m, j)]);
        return i === -1 ? 0 : i;
    }

    function renderFaq(el) {
        el.innerHTML = FAQ.filter(f => !query || (f[0] + f[1]).toLowerCase().includes(query)).map(f => `<details class="border-b border-stone-100 py-3"><summary class="font-semibold cursor-pointer">${f[0]}</summary><p class="text-stone-600 mt-2">${f[1]}</p></details>`).join('') + `<p class="mt-4 text-sm">${GLOSSARY_LINK}</p>`;
        $$('[data-go]', el).forEach(b => b.onclick = () => go(b.dataset.go));
    }

    // =====================================================================================
    // KUIS
    // =====================================================================================
    function renderQuiz(m) {
        const box = $('#quiz');
        const best = prog.quiz[m.id];
        const answers = {};
        box.innerHTML = `<div class="flex items-center gap-3 mb-4"><i class="fas fa-clipboard-question text-2xl text-brand-500"></i><div class="flex-1"><b>Kuis: ${m.title}</b><div class="text-xs text-stone-500">Nilai lulus 70%. ${best !== undefined ? `Nilai terbaik Anda: <b class="${best >= 70 ? 'text-emerald-600' : 'text-red-600'}">${best}%</b>` : ''}</div></div></div>
            ${m.quiz.map((q, i) => `<div class="mb-5" data-q="${i}"><div class="font-semibold mb-2">${i + 1}. ${q.q}</div><div class="grid gap-2">${q.o.map((o, j) => `<button data-a="${j}" class="text-left px-4 py-3 rounded-xl border-2 border-stone-200 hover:border-brand-300 text-sm">${o}</button>`).join('')}</div><div data-exp class="hidden mt-2 text-sm p-3 rounded-xl"></div></div>`).join('')}
            <div class="flex items-center gap-3"><button id="q-submit" class="btn-primary"><i class="fas fa-paper-plane"></i>Periksa jawaban</button><span id="q-result" class="font-bold"></span></div>`;
        $$('[data-q]', box).forEach(qel => $$('[data-a]', qel).forEach(b => b.onclick = () => {
            if (box.dataset.checked) return;
            answers[qel.dataset.q] = Number(b.dataset.a);
            $$('[data-a]', qel).forEach(x => x.classList.toggle('!border-brand-500', x === b));
            $$('[data-a]', qel).forEach(x => x.classList.toggle('bg-brand-50', x === b));
        }));
        $('#q-submit', box).onclick = () => {
            if (box.dataset.checked) { delete box.dataset.checked; renderQuiz(m); return; }
            if (Object.keys(answers).length < m.quiz.length) { $('#q-result').textContent = 'Jawab semua pertanyaan dulu'; $('#q-result').className = 'font-bold text-amber-600'; return; }
            let right = 0;
            m.quiz.forEach((q, i) => {
                const qel = $(`[data-q="${i}"]`, box);
                const ok = answers[i] === q.a;
                if (ok) right++;
                $$('[data-a]', qel).forEach((x, j) => {
                    x.classList.remove('!border-brand-500', 'bg-brand-50');
                    if (j === q.a) x.classList.add('!border-emerald-500', 'bg-emerald-50');
                    else if (j === answers[i]) x.classList.add('!border-red-400', 'bg-red-50');
                });
                const exp = $('[data-exp]', qel);
                exp.className = `mt-2 text-sm p-3 rounded-xl ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`;
                exp.innerHTML = `<b>${ok ? '✅ Benar.' : '❌ Kurang tepat.'}</b> ${q.e}`;
            });
            const score = Math.round(right / m.quiz.length * 100);
            prog.quiz[m.id] = Math.max(prog.quiz[m.id] || 0, score);
            save(); updateProgress();
            box.dataset.checked = '1';
            $('#q-result').innerHTML = `Nilai ${score}% ${score >= 70 ? '— <span class="text-emerald-600">LULUS 🎉</span>' : '— <span class="text-red-600">belum lulus, coba lagi</span>'}`;
            $('#q-submit').innerHTML = '<i class="fas fa-rotate-left"></i>Ulangi kuis';
        };
    }

    // =====================================================================================
    // SIMULATOR
    // =====================================================================================
    const done = (el, msg) => { el.insertAdjacentHTML('beforeend', `<div class="mt-3 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-semibold"><i class="fas fa-circle-check mr-1"></i>${msg}</div>`); };
    const numpad = (keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']) => `<div class="grid grid-cols-3 gap-2">${keys.map(k => `<button data-k="${k}" class="py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-lg font-semibold active:scale-95">${k}</button>`).join('')}</div>`;

    const SIMS = {
        // ---------- Login PIN ----------
        pin(el) {
            const staff = [['Budi', 'Waiter', '2222'], ['Rina', 'Kasir', '1234'], ['Ayu', 'Manager', '111111']];
            let sel = null, pin = '', tries = 0;
            el.innerHTML = `<div class="rounded-2xl bg-stone-900 text-white p-4 grid md:grid-cols-2 gap-4">
                <div><div class="text-sm font-bold mb-2">Siapa yang bertugas?</div><div class="grid grid-cols-3 gap-2" data-staff>${staff.map((s, i) => `<button data-s="${i}" class="p-3 rounded-xl bg-stone-800 text-left"><div class="w-8 h-8 rounded-full bg-brand-500 grid place-items-center font-bold text-sm">${s[0][0]}</div><div class="text-sm font-semibold mt-1">${s[0]}</div><div class="text-[10px] text-stone-400">${s[1]}</div></button>`).join('')}</div></div>
                <div class="flex flex-col items-center"><div data-who class="text-stone-400 text-sm mb-2">Pilih nama Anda</div><div data-dots class="flex gap-2 h-4 mb-3"></div>
                <div class="grid grid-cols-3 gap-2 w-56">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map(k => `<button data-k="${k}" class="py-2.5 rounded-xl ${k === '✓' ? 'bg-brand-500' : 'bg-stone-800'} font-semibold active:scale-95">${k}</button>`).join('')}</div><div data-err class="text-red-400 text-xs h-4 mt-2"></div></div></div>`;
            const dots = () => { $('[data-dots]', el).innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="w-3 h-3 rounded-full ${i < pin.length ? 'bg-brand-500' : 'bg-stone-700'}"></span>`).join(''); };
            const submit = () => {
                if (!sel || pin.length < 4) return;
                if (pin === sel[2]) {
                    $('[data-err]', el).textContent = '';
                    if (sel[0] === 'Rina') done(el, `Berhasil login sebagai ${sel[0]} (${sel[1]}). Di aplikasi asli, langkah berikutnya adalah membuka shift.`);
                    else $('[data-err]', el).textContent = `Login sebagai ${sel[0]} berhasil — tapi latihan ini meminta login sebagai Rina.`;
                } else { tries++; $('[data-err]', el).textContent = tries >= 5 ? 'PIN salah 5 kali — di aplikasi asli PIN terkunci 5 menit.' : `PIN salah (${tries}/5)`; }
                pin = ''; dots();
            };
            $$('[data-s]', el).forEach(b => b.onclick = () => { sel = staff[b.dataset.s]; pin = ''; dots(); $('[data-who]', el).innerHTML = `PIN untuk <b class="text-white">${sel[0]}</b>`; $$('[data-s]', el).forEach(x => x.classList.toggle('ring-2', x === b)); $$('[data-s]', el).forEach(x => x.classList.toggle('ring-brand-500', x === b)); });
            $$('[data-k]', el).forEach(b => b.onclick = () => {
                const k = b.dataset.k;
                if (!sel) { $('[data-err]', el).textContent = 'Pilih nama dulu'; return; }
                if (k === 'C') pin = ''; else if (k === '✓') return submit(); else if (pin.length < 6) pin += k;
                dots(); if (pin.length === 6) submit();
            });
            dots();
        },

        // ---------- Buka shift ----------
        shiftopen(el) {
            let buf = '';
            el.innerHTML = `<div class="max-w-sm mx-auto"><p class="text-sm text-stone-500 mb-2">Hitung uang di laci lalu masukkan sebagai modal awal.</p>
                <div data-v class="text-3xl font-extrabold text-center border-b-2 border-brand-500 py-2">Rp 0</div>
                <div class="grid grid-cols-4 gap-2 my-3">${[0, 200000, 300000, 500000].map(v => `<button data-q="${v}" class="py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold">${rp(v)}</button>`).join('')}</div>
                ${numpad(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'])}<button data-open class="btn-primary w-full mt-3 py-3">Buka shift</button><div data-msg></div></div>`;
            const draw = () => { $('[data-v]', el).textContent = rp(Number(buf) || 0); };
            $$('[data-q]', el).forEach(b => b.onclick = () => { buf = b.dataset.q; draw(); });
            $$('[data-k]', el).forEach(b => b.onclick = () => { const k = b.dataset.k; buf = k === '⌫' ? buf.slice(0, -1) : (buf + k).slice(0, 9); draw(); });
            $('[data-open]', el).onclick = () => {
                $('[data-msg]', el).innerHTML = '';
                if (Number(buf) === 500000) done($('[data-msg]', el), 'Shift dibuka dengan modal Rp 500.000. Badge "Shift" kini tampil di kanan atas kasir.');
                else $('[data-msg]', el).innerHTML = `<div class="mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Modal yang dimasukkan ${rp(Number(buf) || 0)}. Latihan ini meminta Rp 500.000 — coba tombol cepat atau ketik 500000.</div>`;
            };
        },

        // ---------- Kalkulator pajak ----------
        tax(el) {
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="space-y-3 text-sm">
                <div><label class="label">Harga menu (subtotal)</label><input data-f="price" type="number" value="100000" class="input"></div>
                <div class="grid grid-cols-2 gap-2"><div><label class="label">Service %</label><input data-f="service" type="number" value="5" class="input"></div><div><label class="label">Pajak %</label><input data-f="tax" type="number" value="10" class="input"></div></div>
                <label class="flex items-center gap-2"><input data-f="dine" type="checkbox" checked class="accent-orange-500 w-4 h-4">Order dine-in (service berlaku)</label>
                <label class="flex items-center gap-2"><input data-f="tos" type="checkbox" checked class="accent-orange-500 w-4 h-4">Pajak termasuk service</label>
                <label class="flex items-center gap-2"><input data-f="incl" type="checkbox" class="accent-orange-500 w-4 h-4">Harga sudah termasuk pajak</label>
                <div><label class="label">Pembulatan tunai</label><select data-f="round" class="input"><option value="0">Tanpa</option><option value="100" selected>Rp 100</option><option value="500">Rp 500</option><option value="1000">Rp 1.000</option></select></div></div>
                <div class="bg-stone-50 rounded-2xl p-4 font-mono text-sm space-y-1" data-out></div></div>`;
            const calc = () => {
                const f = k => $(`[data-f="${k}"]`, el);
                const cfg = { tax_rate: Number(f('tax').value) || 0, service_rate: Number(f('service').value) || 0, tax_on_service: f('tos').checked, tax_inclusive: f('incl').checked };
                const t = Money.calc({ type: f('dine').checked ? 'dine_in' : 'take_away', items: [{ price: Number(f('price').value) || 0, qty: 1 }] }, cfg);
                const cash = Money.cashDue(t.total, Number(f('round').value));
                const row = (l, v, b) => `<div class="flex justify-between ${b ? 'font-bold text-base border-t border-stone-300 pt-1 mt-1' : ''}"><span>${l}</span><span>${v}</span></div>`;
                $('[data-out]', el).innerHTML = row('Subtotal', rp(t.subtotal)) + row(`Service ${cfg.service_rate}%`, rp(t.service)) + row(`Pajak ${cfg.tax_rate}%${cfg.tax_inclusive ? ' (termasuk)' : ''}`, rp(t.tax)) + row('TOTAL (QRIS/kartu)', rp(t.total), true) + row('Jika bayar tunai', rp(cash)) + `<div class="text-[11px] text-stone-500 font-sans mt-2">${cfg.tax_inclusive ? 'Pajak sudah termasuk dalam harga menu, hanya diekstrak untuk laporan.' : `Pajak dihitung dari ${cfg.tax_on_service ? 'subtotal + service' : 'subtotal saja'}.`}</div>`;
            };
            $$('[data-f]', el).forEach(i => i.oninput = calc);
            calc();
        },

        // ---------- Pairing ----------
        pairing(el) {
            let code = null;
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="rounded-2xl border border-stone-200 p-4"><div class="text-xs font-bold text-stone-500 mb-2"><i class="fas fa-laptop mr-1"></i>BACK OFFICE (pemilik)</div>
                <button data-gen class="btn-primary w-full"><i class="fas fa-link"></i>Pasangkan perangkat</button><div data-code class="text-4xl font-extrabold tracking-[0.3em] text-center text-brand-600 my-4 h-10"></div></div>
                <div class="rounded-2xl bg-stone-900 text-white p-4"><div class="text-xs font-bold text-stone-400 mb-2"><i class="fas fa-tablet-screen-button mr-1"></i>TABLET KASIR</div>
                <input data-in maxlength="6" inputmode="numeric" class="w-full rounded-xl bg-stone-800 text-center text-2xl tracking-[0.4em] font-bold py-3 outline-none" placeholder="••••••"><button data-pair class="btn-primary w-full mt-3">Pasangkan</button><div data-msg class="text-sm mt-2"></div></div></div>`;
            $('[data-gen]', el).onclick = () => { code = String(Math.floor(100000 + Math.random() * 900000)); $('[data-code]', el).textContent = code; };
            $('[data-pair]', el).onclick = () => {
                const v = $('[data-in]', el).value.trim();
                const msg = $('[data-msg]', el);
                if (!code) { msg.innerHTML = '<span class="text-amber-300">Buat kode dulu di Back Office.</span>'; return; }
                if (v !== code) { msg.innerHTML = '<span class="text-red-400">Kode pairing salah atau sudah kedaluwarsa.</span>'; return; }
                msg.innerHTML = '<span class="text-emerald-300"><i class="fas fa-circle-check"></i> Terpasang! Tablet langsung membuka layar login PIN.</span>';
                code = null; $('[data-code]', el).textContent = '✓';
            };
        },

        // ---------- Membuat pesanan ----------
        order(el) {
            const MENU = [
                { id: 1, name: 'Kopi Susu Gula Aren', price: 25000, station: 'Bar', color: '#92400e', mods: [{ g: 'Ukuran', req: true, o: [['Regular', 0], ['Large', 6000]] }, { g: 'Suhu', req: true, o: [['Hot', 0], ['Ice', 0]] }] },
                { id: 2, name: 'Americano', price: 22000, station: 'Bar', color: '#57534e', mods: [] },
                { id: 3, name: 'Nasi Goreng Kampung', price: 35000, station: 'Dapur', color: '#ea580c', mods: [{ g: 'Level Pedas', req: true, o: [['Tidak Pedas', 0], ['Pedas', 0], ['Extra Pedas', 2000]] }] },
                { id: 4, name: 'Kentang Goreng', price: 22000, station: 'Dapur', color: '#eab308', mods: [] },
                { id: 5, name: 'Air Mineral', price: 8000, station: 'Bar', color: '#0ea5e9', mods: [] },
                { id: 6, name: 'Pisang Goreng Keju', price: 24000, station: 'Dapur', color: '#ca8a04', mods: [] }
            ];
            const TASKS = [
                ['dine', 'Pilih channel Dine-in & meja A2'],
                ['kopi', 'Tambahkan 2× Kopi Susu Gula Aren ukuran Large, Ice'],
                ['nasgor', 'Tambahkan 1× Nasi Goreng "Extra Pedas" dengan catatan "tanpa bawang"'],
                ['send', 'Kirim ke dapur (tiket terpecah Bar & Dapur)']
            ];
            const st = { channel: 'take_away', table: null, items: [], sent: [], done: {} };
            el.innerHTML = `<div class="mb-3 p-3 rounded-xl bg-stone-50"><b class="text-sm">Tugas:</b><ol data-tasks class="text-sm mt-1 !ml-0 !list-none space-y-1"></ol></div>
                <div class="grid lg:grid-cols-[1fr_300px] gap-3"><div class="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start" data-grid></div><div class="rounded-2xl border border-stone-200 flex flex-col" data-cart></div></div>
                <div data-modal class="hidden"></div><div data-tickets class="mt-3"></div>`;
            const check = () => {
                const big = st.items.find(i => i.m.id === 1 && i.mods.includes('Large') && i.mods.includes('Ice'));
                st.done.dine = st.channel === 'dine_in' && st.table === 'A2';
                st.done.kopi = !!big && big.qty === 2;
                const ng = st.items.find(i => i.m.id === 3 && i.mods.includes('Extra Pedas') && /bawang/i.test(i.note));
                st.done.nasgor = !!ng;
                st.done.send = st.done.kopi && st.done.nasgor && st.items.every(i => i.sent);
                $('[data-tasks]', el).innerHTML = TASKS.map(([k, t]) => `<li><i class="fas ${st.done[k] ? 'fa-circle-check text-emerald-500' : 'fa-circle text-stone-300'} mr-2"></i>${t}</li>`).join('');
                if (TASKS.every(([k]) => st.done[k]) && !st.finished) { st.finished = true; done(el, 'Hebat! Pesanan dine-in meja A2 terkirim. Perhatikan tiket terpecah per stasiun di bawah.'); }
            };
            const totals = () => Money.calc({ type: st.channel === 'dine_in' ? 'dine_in' : 'take_away', items: st.items.map(i => ({ price: i.price, qty: i.qty })) }, OUTLET);
            const drawGrid = () => {
                $('[data-grid]', el).innerHTML = MENU.map(m => `<button data-m="${m.id}" class="rounded-2xl border border-stone-200 p-2 text-left hover:border-brand-500 bg-white active:scale-95"><div class="h-12 rounded-xl grid place-items-center text-white font-extrabold text-xl" style="background:${m.color}">${m.name[0]}</div><div class="text-xs font-semibold mt-1 leading-tight h-8">${m.name}</div><div class="text-xs text-brand-600 font-bold flex justify-between">${rp(m.price)}${m.mods.length ? '<i class="fas fa-sliders text-stone-300"></i>' : ''}</div></button>`).join('');
                $$('[data-m]', el).forEach(b => b.onclick = () => pick(MENU.find(x => x.id === Number(b.dataset.m))));
            };
            const drawCart = () => {
                const t = totals();
                $('[data-cart]', el).innerHTML = `<div class="p-2 border-b border-stone-100 space-y-2"><div class="grid grid-cols-2 gap-1 bg-stone-100 p-1 rounded-lg text-xs font-semibold">${[['dine_in', 'Dine-in'], ['take_away', 'Take Away']].map(c => `<button data-ch="${c[0]}" ${st.items.length && st.channel !== c[0] ? 'disabled' : ''} class="py-1 rounded-md ${st.channel === c[0] ? 'bg-white text-brand-600 shadow-sm' : 'text-stone-500 disabled:opacity-40'}">${c[1]}</button>`).join('')}</div>
                    ${st.channel === 'dine_in' ? `<div class="flex gap-1">${['A1', 'A2', 'A3'].map(n => `<button data-tb="${n}" class="flex-1 py-1 rounded-lg border text-xs font-semibold ${st.table === n ? 'border-brand-500 bg-brand-50' : 'border-stone-200'}">Meja ${n}</button>`).join('')}</div>` : ''}</div>
                    <div class="flex-1 p-2 space-y-1.5 min-h-[120px]">${st.items.map((i, k) => `<div class="rounded-lg border p-2 text-xs ${i.sent ? 'bg-stone-50 border-stone-200' : 'bg-brand-50/50 border-brand-100'}"><div class="flex justify-between gap-1"><b>${i.qty}× ${i.m.name}</b><span>${rp(i.price * i.qty)}</span></div>
                        ${i.mods.length ? `<div class="text-stone-500">${i.mods.join(', ')}</div>` : ''}${i.note ? `<div class="text-amber-700">📝 ${i.note}</div>` : ''}
                        <div class="flex justify-between items-center mt-1"><span class="font-semibold ${i.sent ? 'text-emerald-600' : 'text-brand-600'}">${i.sent ? '✓✓ Terkirim ' + i.m.station : '● Baru'}</span>${i.sent ? '' : `<span class="flex gap-1"><button data-minus="${k}" class="w-6 h-6 rounded bg-white border">−</button><button data-plus="${k}" class="w-6 h-6 rounded bg-white border">+</button></span>`}</div></div>`).join('') || '<div class="text-center text-stone-400 text-xs py-8">Pilih menu</div>'}</div>
                    <div class="p-2 border-t border-stone-100 text-xs space-y-0.5"><div class="flex justify-between"><span>Subtotal</span><span>${rp(t.subtotal)}</span></div>${t.service ? `<div class="flex justify-between"><span>Service 5%</span><span>${rp(t.service)}</span></div>` : ''}<div class="flex justify-between"><span>PBJT 10%</span><span>${rp(t.tax)}</span></div><div class="flex justify-between font-extrabold text-sm"><span>Total</span><span>${rp(t.total)}</span></div>
                    <button data-send class="btn-outline w-full mt-2 !border-brand-500 !text-brand-600" ${st.items.some(i => !i.sent) ? '' : 'disabled'}><i class="fas fa-paper-plane"></i>Kirim</button></div>`;
                $$('[data-ch]', el).forEach(b => b.onclick = () => { st.channel = b.dataset.ch; if (st.channel !== 'dine_in') st.table = null; drawCart(); check(); });
                $$('[data-tb]', el).forEach(b => b.onclick = () => { st.table = b.dataset.tb; drawCart(); check(); });
                $$('[data-minus]', el).forEach(b => b.onclick = () => { const i = st.items[b.dataset.minus]; i.qty--; if (!i.qty) st.items.splice(b.dataset.minus, 1); drawCart(); check(); });
                $$('[data-plus]', el).forEach(b => b.onclick = () => { st.items[b.dataset.plus].qty++; drawCart(); check(); });
                $('[data-send]', el).onclick = () => {
                    const fresh = st.items.filter(i => !i.sent);
                    const by = {};
                    fresh.forEach(i => { (by[i.m.station] ||= []).push(i); i.sent = true; });
                    $('[data-tickets]', el).innerHTML = `<div class="text-xs font-bold text-stone-500 mb-2">TIKET YANG DITERIMA DAPUR:</div><div class="flex flex-wrap gap-2">${Object.entries(by).map(([s, list]) => `<div class="w-56 rounded-xl bg-neutral-900 text-white overflow-hidden"><div class="bg-emerald-600 px-3 py-1.5 font-bold text-sm">${st.table ? 'Meja ' + st.table : 'Take away'} · ${s}</div><div class="p-2 text-xs space-y-1">${list.map(i => `<div><b>${i.qty}× ${i.m.name}</b>${i.mods.length ? `<div class="text-neutral-400">${i.mods.join(' · ')}</div>` : ''}${i.note ? `<div class="text-amber-400">📝 ${i.note}</div>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`;
                    drawCart(); check();
                };
            };
            const add = (m, mods, price, qty, note) => {
                const same = st.items.find(i => !i.sent && i.m.id === m.id && i.mods.join() === mods.join() && i.note === note);
                if (same) same.qty += qty; else st.items.push({ m, mods, price, qty, note, sent: false });
                drawCart(); check();
            };
            const pick = m => {
                if (!m.mods.length) return add(m, [], m.price, 1, '');
                const sel = m.mods.map(() => 0);
                let qty = 1;
                const box = $('[data-modal]', el);
                const draw = () => {
                    const unit = m.price + m.mods.reduce((s, g, k) => s + g.o[sel[k]][1], 0);
                    box.className = 'mt-3 rounded-2xl border-2 border-brand-500 p-4 bg-white';
                    box.innerHTML = `<div class="flex justify-between"><b>${m.name}</b><button data-x class="text-stone-400"><i class="fas fa-xmark"></i></button></div>
                        ${m.mods.map((g, k) => `<div class="mt-3"><div class="text-xs font-bold mb-1">${g.g} <span class="badge bg-red-50 text-red-600">Wajib</span></div><div class="flex flex-wrap gap-2">${g.o.map((o, j) => `<button data-g="${k}" data-o="${j}" class="px-3 py-2 rounded-xl border-2 text-sm ${sel[k] === j ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-stone-200'}">${o[0]}${o[1] ? ' +' + o[1] / 1000 + 'rb' : ''}</button>`).join('')}</div></div>`).join('')}
                        <input data-note class="input mt-3" placeholder="Catatan item (mis. tanpa bawang)" value="${box.dataset.note || ''}">
                        <div class="flex items-center gap-2 mt-3"><button data-qm class="w-10 h-10 rounded-xl border">−</button><b class="w-6 text-center">${qty}</b><button data-qp class="w-10 h-10 rounded-xl border">+</button><button data-add class="btn-primary flex-1">Tambah · ${rp(unit * qty)}</button></div>`;
                    const keepNote = () => { box.dataset.note = $('[data-note]', box).value; };
                    $$('[data-g]', box).forEach(b => b.onclick = () => { keepNote(); sel[b.dataset.g] = Number(b.dataset.o); draw(); });
                    $('[data-qm]', box).onclick = () => { keepNote(); qty = Math.max(1, qty - 1); draw(); };
                    $('[data-qp]', box).onclick = () => { keepNote(); qty++; draw(); };
                    $('[data-x]', box).onclick = () => { box.className = 'hidden'; box.dataset.note = ''; };
                    $('[data-add]', box).onclick = () => { add(m, m.mods.map((g, k) => g.o[sel[k]][0]), unit, qty, $('[data-note]', box).value.trim()); box.className = 'hidden'; box.dataset.note = ''; };
                };
                draw();
            };
            drawGrid(); drawCart(); check();
        },

        // ---------- Pembayaran ----------
        pay(el) {
            const items = [{ price: 22000, qty: 1 }, { price: 22000, qty: 1 }];
            const total = Money.calc({ type: 'take_away', items }, OUTLET).total; // 48.400
            const methods = [['cash', 'Tunai', 'cash'], ['qris', 'QRIS', 'noncash'], ['debit', 'Debit', 'noncash']];
            let method = 'cash', buf = '', fresh = true;
            const lines = [];
            el.innerHTML = `<div class="mb-3 p-3 rounded-xl bg-stone-50 text-sm"><b>Tugas:</b> tagihan take away <b>${rp(total)}</b>. Pelanggan membayar <b>Rp 20.000 via QRIS</b>, sisanya <b>tunai uang pas</b>.</div>
                <div class="grid md:grid-cols-[220px_1fr] gap-3"><div class="rounded-2xl bg-stone-50 p-3 text-sm flex flex-col"><div class="text-xs text-stone-500">Total tagihan</div><div class="text-2xl font-extrabold">${rp(total)}</div><div data-lines class="space-y-1 my-2 flex-1"></div>
                    <div class="border-t border-stone-200 pt-2 space-y-0.5"><div class="flex justify-between"><span>Dibayar</span><b data-paid></b></div><div class="flex justify-between"><span>Sisa</span><b data-rem class="text-red-500"></b></div><div class="flex justify-between"><span>Kembali</span><b data-chg class="text-emerald-600"></b></div></div></div>
                <div><div class="grid grid-cols-3 gap-2" data-methods></div><div data-input class="text-2xl font-bold border-b-2 border-brand-500 py-1 my-3">Rp 0</div><div data-quick class="grid grid-cols-3 gap-2 mb-2"></div>${numpad(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'])}
                <div class="grid grid-cols-2 gap-2 mt-2"><button data-split class="btn-outline"><i class="fas fa-plus"></i>Split payment</button><button data-done class="btn-success"><i class="fas fa-check"></i>Selesaikan</button></div><div data-msg></div></div></div>`;
            const type = m => methods.find(x => x[0] === m)[2];
            const remaining = m => { const paid = lines.reduce((s, l) => s + l.amount, 0); const rem = Math.max(0, total - paid); return type(m) === 'cash' ? Money.cashDue(rem, 100) : rem; };
            const all = () => [...lines, ...(Number(buf) > 0 ? [{ method, type: type(method), amount: Number(buf) }] : [])];
            const draw = () => {
                const s = Money.settle(total, all(), 100);
                $('[data-methods]', el).innerHTML = methods.map(m => `<button data-m="${m[0]}" class="py-2.5 rounded-xl border-2 text-sm font-semibold ${method === m[0] ? 'border-brand-500 bg-brand-50' : 'border-stone-200'}">${m[1]}</button>`).join('');
                $$('[data-m]', el).forEach(b => b.onclick = () => { method = b.dataset.m; buf = type(method) === 'cash' ? '' : String(remaining(method)); fresh = true; draw(); });
                $('[data-input]', el).textContent = rp(Number(buf) || 0) + ` (${methods.find(x => x[0] === method)[1]})`;
                const rem = remaining(method);
                $('[data-quick]', el).innerHTML = (type(method) === 'cash' ? [rem, 50000, 100000] : [rem]).map((v, i) => `<button data-qv="${v}" class="py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold">${i === 0 ? 'Uang pas · ' : ''}${rp(v)}</button>`).join('');
                $$('[data-qv]', el).forEach(b => b.onclick = () => { buf = b.dataset.qv; fresh = true; draw(); });
                $('[data-lines]', el).innerHTML = lines.map((l, i) => `<div class="flex justify-between bg-white rounded-lg px-2 py-1 border border-stone-200 text-xs"><span>${methods.find(x => x[0] === l.method)[1]}</span><span>${rp(l.amount)} <button data-del="${i}" class="text-red-500 ml-1">✕</button></span></div>`).join('');
                $$('[data-del]', el).forEach(b => b.onclick = () => { lines.splice(b.dataset.del, 1); draw(); });
                $('[data-paid]', el).textContent = rp(s.paid); $('[data-rem]', el).textContent = rp(s.remaining); $('[data-chg]', el).textContent = rp(s.change);
            };
            $$('[data-k]', el).forEach(b => b.onclick = () => { const k = b.dataset.k; if (fresh && k !== '⌫') buf = ''; fresh = false; buf = k === '⌫' ? buf.slice(0, -1) : (buf + k).slice(0, 9); draw(); });
            $('[data-split]', el).onclick = () => {
                if (!(Number(buf) > 0)) return;
                lines.push({ method, type: type(method), amount: type(method) === 'cash' ? Number(buf) : Math.min(Number(buf), remaining(method)) });
                method = method === 'cash' ? 'qris' : 'cash'; buf = type(method) === 'cash' ? '' : String(remaining(method)); fresh = true; draw();
            };
            $('[data-done]', el).onclick = () => {
                const pays = all(), s = Money.settle(total, pays, 100);
                const msg = $('[data-msg]', el);
                msg.innerHTML = '';
                if (!s.ok) { msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">${s.remaining > 0 ? 'Pembayaran kurang ' + rp(s.remaining) : 'Tidak valid: tunai tidak boleh ditambahkan jika non-tunai sudah melunasi tagihan.'}</div>`; return; }
                const q = pays.filter(p => p.method === 'qris').reduce((a, p) => a + p.amount, 0), c = pays.filter(p => p.type === 'cash').reduce((a, p) => a + p.amount, 0);
                if (q === 20000 && c === total - 20000 && s.change === 0) done(msg, `Benar! QRIS ${rp(20000)} + tunai ${rp(c)}, kembalian Rp 0. Di aplikasi asli struk tercetak & laci terbuka.`);
                else msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Pembayaran valid (kembali ${rp(s.change)}), tapi belum sesuai tugas: QRIS Rp 20.000 + tunai uang pas. Hapus baris dengan ✕ dan coba lagi.</div>`;
            };
            draw();
        },

        // ---------- Void ----------
        void(el) {
            const st = { qty: 3, voided: 0 };
            const draw = () => {
                el.innerHTML = `<div class="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"><div class="flex justify-between"><b>${st.qty - st.voided}× Es Teh Leci</b><span>${rp((st.qty - st.voided) * 20000)}</span></div><div class="text-xs text-emerald-600 font-semibold">✓✓ Terkirim Bar</div>
                    ${st.voided ? `<div class="mt-2 line-through text-stone-400">${st.voided}× Es Teh Leci — void: Salah input</div>` : ''}</div>
                    <p class="text-sm mt-3">Pelanggan hanya memesan 2, bukan 3. Void <b>1</b> Es Teh Leci sebagai kasir.</p>
                    <div class="grid sm:grid-cols-3 gap-2 mt-2"><div><label class="label">Jumlah</label><input data-q type="number" min="1" max="${st.qty}" value="1" class="input"></div><div class="sm:col-span-2"><label class="label">Alasan</label><select data-r class="input"><option value="">— pilih —</option><option>Salah input</option><option>Pelanggan batal</option><option>Menu habis</option></select></div></div>
                    <div class="grid sm:grid-cols-2 gap-2 mt-2"><div><label class="label">Manager yang menyetujui</label><select class="input"><option>Ayu (Manager)</option></select></div><div><label class="label">PIN manager</label><input data-p type="password" maxlength="6" class="input" placeholder="••••••"></div></div>
                    <button data-v class="btn-danger mt-3"><i class="fas fa-ban"></i>Void item</button><div data-msg></div>`;
                $('[data-v]', el).onclick = () => {
                    const msg = $('[data-msg]', el);
                    const q = Number($('[data-q]', el).value), r = $('[data-r]', el).value, p = $('[data-p]', el).value;
                    const err = t => { msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">${t}</div>`; };
                    if (!r) return err('Alasan void wajib diisi.');
                    if (p !== '111111') return err('PIN manager salah. (Petunjuk latihan: 111111)');
                    if (q !== 1) return err('Jumlah void seharusnya 1.');
                    st.voided = 1; draw();
                    done($('[data-msg]', el), 'Void berhasil. Dapur melihat item ini dibatalkan, dan audit mencatat alasan serta nama manager yang menyetujui.');
                };
            };
            draw();
        },

        // ---------- Meja ----------
        tables(el) {
            const S = {
                empty: ['Kosong', 'bg-white border-stone-200', 'Siap dipakai. Ketuk → pilih jumlah tamu untuk membuka meja.'],
                seated: ['Terisi, belum pesan', 'bg-sky-50 border-sky-300', 'Meja sudah dibuka tetapi belum ada pesanan. Segera tawarkan menu.'],
                ordered: ['Sudah pesan', 'bg-brand-50 border-brand-500', 'Pesanan sudah masuk. Timer menunjukkan lama tamu duduk.'],
                bill: ['Minta bill', 'bg-red-50 border-red-500 pulse-red', 'Pre-bill sudah dicetak. Tamu siap membayar — prioritaskan!'],
                dirty: ['Perlu dibersihkan', 'bg-stone-200 border-stone-300', 'Sudah dibayar. Setelah dibersihkan, ketuk → Tandai sudah bersih.']
            };
            const tables = [['A1', 'empty'], ['A2', 'ordered', 24], ['A3', 'bill', 67], ['A4', 'seated', 3], ['A5', 'dirty'], ['A6', 'ordered', 72]];
            el.innerHTML = `<p class="text-sm mb-3"><b>Tugas:</b> ketuk meja yang <b>harus didahulukan kasir</b> karena tamu ingin membayar.</p>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">${tables.map(([n, s, m]) => `<button data-t="${n}" data-s="${s}" class="rounded-xl border-2 ${S[s][1]} p-2 h-24 text-left flex flex-col"><b class="text-lg">${n}</b><span class="text-[10px] font-semibold">${S[s][0]}</span>${m ? `<span class="mt-auto text-[10px] ${m > 60 ? 'text-red-600 font-bold' : 'text-stone-500'}"><i class="fas fa-clock"></i> ${m} mnt</span>` : ''}</button>`).join('')}</div><div data-info class="mt-3"></div>`;
            $$('[data-t]', el).forEach(b => b.onclick = () => {
                const s = b.dataset.s;
                $('[data-info]', el).innerHTML = `<div class="p-3 rounded-xl bg-stone-50 text-sm"><b>Meja ${b.dataset.t} — ${S[s][0]}:</b> ${S[s][2]}</div>`;
                if (s === 'bill') done($('[data-info]', el), 'Tepat! Meja berkedip merah = minta bill. Ketuk meja → Bayar.');
            });
        },

        // ---------- Tutup shift ----------
        shiftclose(el) {
            const fields = [['open', 'Modal awal', 500000], ['cash', 'Penjualan tunai (setelah kembalian)', 1250000], ['in', 'Kas masuk', 100000], ['out', 'Kas keluar', 45000], ['refund', 'Refund tunai', 30000], ['actual', 'Uang fisik dihitung di laci', 1770000]];
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="space-y-2">${fields.map(([k, l, v]) => `<div><label class="label">${l}</label><input data-f="${k}" type="number" value="${v}" class="input"></div>`).join('')}</div>
                <div><div data-out class="bg-stone-50 rounded-2xl p-4 text-sm space-y-1"></div><div class="mt-3"><label class="label">Berapa selisihnya? (tebak dulu)</label><div class="flex gap-2"><input data-guess type="number" class="input" placeholder="mis. -5000"><button data-check class="btn-primary">Cek</button></div><div data-msg></div></div></div></div>`;
            const vals = () => Object.fromEntries(fields.map(([k]) => [k, Number($(`[data-f="${k}"]`, el).value) || 0]));
            const calc = () => {
                const v = vals();
                const exp = v.open + v.cash + v.in - v.out - v.refund;
                const diff = v.actual - exp;
                $('[data-out]', el).innerHTML = `<div class="flex justify-between"><span>Modal awal</span><span>${rp(v.open)}</span></div><div class="flex justify-between"><span>+ Penjualan tunai</span><span>${rp(v.cash)}</span></div><div class="flex justify-between"><span>+ Kas masuk</span><span>${rp(v.in)}</span></div><div class="flex justify-between"><span>− Kas keluar</span><span>${rp(v.out)}</span></div><div class="flex justify-between"><span>− Refund tunai</span><span>${rp(v.refund)}</span></div>
                    <div class="flex justify-between font-bold border-t border-stone-300 pt-1"><span>Kas seharusnya</span><span>${rp(exp)}</span></div><div class="flex justify-between"><span>Kas aktual</span><span>${rp(v.actual)}</span></div>
                    <div data-diffrow class="hidden flex justify-between font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-emerald-600'}"><span>Selisih</span><span>${rp(diff)}</span></div>`;
                return diff;
            };
            $$('[data-f]', el).forEach(i => i.oninput = () => { calc(); $('[data-msg]', el).innerHTML = ''; });
            $('[data-check]', el).onclick = () => {
                const diff = calc();
                $('[data-diffrow]', el).classList.remove('hidden');
                $('[data-diffrow]', el).classList.add('flex');
                const g = Number($('[data-guess]', el).value);
                const msg = $('[data-msg]', el);
                msg.innerHTML = '';
                if (g === diff) done(msg, `Benar, selisih ${rp(diff)}. ${diff < 0 ? 'Uang kurang — cek kas keluar yang belum dicatat.' : diff > 0 ? 'Uang lebih — mungkin kembalian kurang diberikan.' : 'Kas cocok sempurna!'}`);
                else msg.innerHTML = `<div class="mt-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Belum tepat. Selisih = kas aktual − kas seharusnya = ${rp(diff)}.</div>`;
            };
            calc();
        },

        // ---------- KDS ----------
        kds(el) {
            let seq = 40;
            const pool = [['Meja A2', 'Dapur', [['2', 'Nasi Goreng Kampung', 'Pedas', 'tanpa bawang'], ['1', 'Kentang Goreng', '', '']]], ['TA-031 · Andi', 'Bar', [['2', 'Kopi Susu Gula Aren', 'Large · Ice', '']]], ['Meja B1', 'Dapur', [['1', 'Ayam Bakar Madu', 'Sedang', '']]], ['GoFood · GF-118', 'Bar', [['1', 'Matcha Latte', 'Ice · Oat Milk', 'less sugar']]]];
            const tickets = [{ id: ++seq, label: 'Meja A8', station: 'Dapur', age: 23, status: 'progress', items: [['2', 'Mie Goreng Jawa', 'Tidak Pedas', ''], ['1', 'Pisang Goreng Keju', '', '']] }, { id: ++seq, label: 'Meja C1', station: 'Bar', age: 12, status: 'new', items: [['3', 'Es Teh Leci', 'Less Sugar', '']] }];
            let served = 0, filter = 'Semua';
            el.innerHTML = `<div class="rounded-2xl bg-neutral-950 text-neutral-100 p-3"><div class="flex items-center gap-2 mb-3 text-sm"><div data-st class="flex bg-neutral-800 rounded-lg p-1"></div><span class="ml-auto text-neutral-400" data-count></span><button data-add class="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs"><i class="fas fa-plus mr-1"></i>Simulasikan pesanan masuk</button></div><div data-board class="flex gap-3 overflow-x-auto thin-scroll pb-2 min-h-[220px]"></div></div><div data-msg></div>`;
            const draw = () => {
                $('[data-st]', el).innerHTML = ['Semua', 'Dapur', 'Bar'].map(s => `<button data-f="${s}" class="px-3 py-1 rounded-md text-xs font-semibold ${filter === s ? 'bg-brand-500 text-white' : 'text-neutral-400'}">${s}</button>`).join('');
                $$('[data-f]', el).forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
                const list = tickets.filter(t => filter === 'Semua' || t.station === filter);
                $('[data-count]', el).textContent = `${tickets.filter(t => t.status === 'new').length} baru · ${tickets.filter(t => t.status === 'progress').length} diproses · ${served} selesai`;
                $('[data-board]', el).innerHTML = list.map(t => `<div class="w-56 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border ${t.status === 'new' ? 'border-sky-500' : 'border-neutral-800'}"><div class="${t.age >= 20 ? 'bg-red-600' : t.age >= 10 ? 'bg-amber-500' : 'bg-emerald-600'} px-3 py-1.5 flex justify-between"><div><b class="text-sm">${t.label}</b><div class="text-[10px]">#${t.id} · ${t.station}</div></div><b class="font-mono ${t.age >= 20 ? 'blink' : ''}">${String(t.age).padStart(2, '0')}m</b></div>
                    <div class="p-2 space-y-1.5 text-xs">${t.items.map(i => `<div class="flex gap-2"><span class="w-6 h-6 rounded bg-neutral-800 grid place-items-center font-bold">${i[0]}</span><span><b>${i[1]}</b>${i[2] ? `<div class="text-neutral-400">${i[2]}</div>` : ''}${i[3] ? `<div class="text-amber-400 font-semibold">📝 ${i[3]}</div>` : ''}</span></div>`).join('')}</div>
                    <div class="p-2 pt-0 flex gap-1">${t.status === 'new' ? `<button data-start="${t.id}" class="flex-1 py-2 rounded-lg bg-sky-600 text-xs font-bold">Mulai</button>` : ''}<button data-ready="${t.id}" class="flex-1 py-2 rounded-lg bg-emerald-600 text-xs font-bold">Siap</button></div></div>`).join('') || '<div class="m-auto text-neutral-500 text-sm">Tidak ada tiket 🎉</div>';
                $$('[data-start]', el).forEach(b => b.onclick = () => { tickets.find(t => t.id === Number(b.dataset.start)).status = 'progress'; draw(); });
                $$('[data-ready]', el).forEach(b => b.onclick = () => {
                    tickets.splice(tickets.findIndex(t => t.id === Number(b.dataset.ready)), 1);
                    served++; draw();
                    if (served === 3 && !el.dataset.done) { el.dataset.done = 1; done($('[data-msg]', el), '3 tiket selesai! Di aplikasi asli, kasir/waiter langsung mendapat notifikasi "siap diantar". Tip: kerjakan tiket merah lebih dulu.'); }
                });
            };
            $('[data-add]', el).onclick = () => { const p = pool[seq % pool.length]; tickets.push({ id: ++seq, label: p[0], station: p[1], age: 0, status: 'new', items: p[2] }); draw(); };
            const timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); tickets.forEach(t => t.age++); draw(); }, 6000);
            draw();
        },

        // ---------- Offline ----------
        offline(el) {
            let online = true, pending = 0, synced = 0, n = 0;
            el.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-3"><button data-net class="btn"></button><span data-badge class="badge"></span></div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${['Buat order', 'Kirim dapur', 'Terima bayar', 'Split bill'].map((a, i) => `<button data-act="${i}" class="btn-light py-3 text-sm">${a}</button>`).join('')}</div>
                <div data-log class="mt-3 text-xs space-y-1 max-h-40 overflow-y-auto thin-scroll"></div><div data-msg></div>`;
            const log = (t, cls = '') => $('[data-log]', el).insertAdjacentHTML('afterbegin', `<div class="${cls}">${new Date().toLocaleTimeString('id-ID')} — ${t}</div>`);
            const draw = () => {
                const b = $('[data-net]', el);
                b.className = 'btn ' + (online ? 'bg-red-50 text-red-600' : 'bg-emerald-500 text-white');
                b.innerHTML = online ? '<i class="fas fa-plug-circle-xmark"></i>Putuskan internet' : '<i class="fas fa-wifi"></i>Sambungkan internet';
                const badge = $('[data-badge]', el);
                badge.className = 'badge ' + (online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600');
                badge.innerHTML = online ? '● Online' : `<i class="fas fa-plug-circle-xmark mr-1"></i>Offline${pending ? ' · ' + pending + ' tertunda' : ''}`;
            };
            $('[data-net]', el).onclick = () => {
                online = !online;
                if (online && pending) {
                    log(`Internet kembali — mengirim ${pending} data…`, 'text-amber-600');
                    const k = pending;
                    setTimeout(() => { synced += k; pending = 0; log(`✔ ${k} data tersinkron ke server. Muncul di dashboard pemilik.`, 'text-emerald-600 font-semibold'); draw(); if (synced >= 3 && !el.dataset.done) { el.dataset.done = 1; done($('[data-msg]', el), 'Anda melihat sendiri: transaksi offline tidak hilang dan terkirim otomatis.'); } }, 1200);
                } else log(online ? 'Online' : 'Internet putus — kasir tetap berjalan', online ? '' : 'text-red-600');
                draw();
            };
            $$('[data-act]', el).forEach(b => b.onclick = () => {
                const i = Number(b.dataset.act);
                if (i === 3 && !online) { log('✖ Split bill butuh online. Tunggu internet kembali.', 'text-red-600'); return; }
                n++;
                if (online) log(`✔ ${b.textContent} #${n} langsung terkirim`, 'text-stone-600');
                else { pending++; log(`💾 ${b.textContent} #${n} disimpan di tablet (tertunda)`, 'text-amber-700'); }
                draw();
            });
            log('Tugas: putuskan internet, lakukan beberapa transaksi, lalu sambungkan lagi.', 'text-stone-500');
            draw();
        }
    };

    function initSims(root) {
        $$('[data-sim]', root).forEach(el => {
            if (el.dataset.ready || el.closest('.hidden')) return;
            el.dataset.ready = '1';
            try { SIMS[el.dataset.sim](el); } catch (e) { el.innerHTML = `<p class="text-red-600 text-sm">Simulasi gagal dimuat: ${e.message}</p>`; }
        });
    }

    // =====================================================================================
    // SERTIFIKAT
    // =====================================================================================
    function showCertificate() {
        const role = prog.role === 'all' ? null : prog.role;
        const mods = modulesForRole(prog.role);
        const finished = mods.filter(moduleDone);
        const ok = role && finished.length === mods.length;
        const box = $('#certificate');
        if (!ok) {
            const left = mods.filter(m => !moduleDone(m));
            $('#t-content').insertAdjacentHTML('afterbegin', `<div class="card p-5 mb-4 border-amber-300 bg-amber-50" data-cert-msg>
                <div class="flex gap-3"><i class="fas fa-award text-3xl text-amber-500"></i><div class="flex-1"><b>Sertifikat belum tersedia</b>
                <p class="text-sm text-stone-600 mt-1">${role ? `Selesaikan semua modul untuk peran <b>${ROLES[role]}</b> (tandai semua pelajaran & lulus kuis ≥ 70%). Sisa:` : 'Pilih peran Anda terlebih dahulu di menu kiri.'}</p>
                ${role ? `<div class="flex flex-wrap gap-2 mt-2">${left.map(m => `<button data-go="${m.id}" class="badge bg-white border border-amber-300 text-amber-800 !py-1">${m.title} — ${modulePct(m)}%</button>`).join('')}</div>` : ''}</div>
                <button data-x class="w-8 h-8 rounded-lg hover:bg-amber-100"><i class="fas fa-xmark"></i></button></div></div>`);
            const msg = $('[data-cert-msg]');
            $$('[data-go]', msg).forEach(b => b.onclick = () => go(b.dataset.go));
            $('[data-x]', msg).onclick = () => msg.remove();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            toggleSide(false);
            return;
        }
        box.classList.remove('hidden'); box.classList.add('flex');
        $('#cert-role').textContent = ROLES[role];
        const avg = Math.round(mods.filter(m => !m.noQuiz).reduce((s, m) => s + (prog.quiz[m.id] || 0), 0) / Math.max(1, mods.filter(m => !m.noQuiz).length));
        $('#cert-detail').textContent = `${mods.length} modul · rata-rata nilai kuis ${avg}%`;
        $('#cert-date').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const name = $('#cert-name');
        name.value = store.get('rp_tutorial_name', '');
        const sync = () => { $('#cert-name-print').textContent = name.value || ' '; store.set('rp_tutorial_name', name.value); };
        name.oninput = sync; sync();
        $('#cert-close').onclick = () => { box.classList.add('hidden'); box.classList.remove('flex'); };
        $('#cert-print').onclick = () => { if (!name.value.trim()) { name.focus(); return; } window.print(); };
    }

    // =====================================================================================
    // INIT
    // =====================================================================================
    function toggleSide(open) {
        $('#t-side').classList.toggle('-translate-x-full', !open);
        $('#t-backdrop').classList.toggle('hidden', !open);
    }
    const onSearch = e => {
        query = e.target.value.trim().toLowerCase();
        if (!query) { go(current); return; }
        const hit = MODULES.find(m => (m.title + m.desc + m.lessons.map(l => l.title + l.html).join('')).toLowerCase().includes(query) && (prog.role === 'all' || m.roles.includes(prog.role))) || MODULES.find(m => (m.title + m.lessons.map(l => l.html).join('')).toLowerCase().includes(query));
        if (hit) { current = hit.id; renderModule(hit); renderNav(); }
        else $('#t-content').innerHTML = `<div class="card p-10 text-center text-stone-500"><i class="fas fa-magnifying-glass text-3xl text-stone-300"></i><p class="mt-3">Tidak ditemukan untuk "<b>${e.target.value.replace(/[<>&]/g, '')}</b>". Coba kata lain atau buka FAQ.</p></div>`;
    };
    $('#t-search').oninput = onSearch;
    $('#t-search-m').oninput = onSearch;
    $('#t-role').value = prog.role;
    $('#t-role').onchange = e => { prog.role = e.target.value; save(); updateProgress(); go(current === 'home' || modulesForRole(prog.role).some(m => m.id === current) ? current : 'home'); };
    $('#t-menu').onclick = () => toggleSide(true);
    $('#t-backdrop').onclick = () => toggleSide(false);
    $('#t-cert').onclick = showCertificate;
    $('#t-reset').onclick = () => { if (confirm('Hapus semua progres training di perangkat ini?')) { prog.lessons = {}; prog.quiz = {}; save(); updateProgress(); go('home'); } };

    // Peran otomatis dari sesi aplikasi (jika ada)
    if (!store.get('rp_tutorial', null)) {
        const staff = store.get('rp_staff', null), user = store.get('rp_user', null), dev = store.get('rp_device', null);
        if (staff && staff.staff) prog.role = staff.staff.role;
        else if (dev && dev.device && dev.device.type === 'kds') prog.role = 'kitchen';
        else if (user && user.user) prog.role = user.user.role === 'owner' ? 'owner' : 'manager';
        $('#t-role').value = prog.role;
        save();
    }
    // Dipakai asisten chat: buka modul & pelajaran tertentu lalu gulir ke sana
    window.TutorialNav = {
        openLesson(moduleId, lesson) {
            query = ''; $('#t-search').value = ''; $('#t-search-m').value = '';
            go(moduleId);
            const s = $(`section[data-lesson="${lesson}"]`);
            if (!s) return;
            $$('section[data-lesson]').forEach(x => $('[data-body]', x).classList.toggle('hidden', x !== s));
            initSims(s);
            s.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const start = location.hash.slice(1);
    updateProgress();
    go(MODULES.some(m => m.id === start) ? start : 'home');
})();
