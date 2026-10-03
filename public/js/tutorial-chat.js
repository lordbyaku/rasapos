// Asisten "Tanya Panduan": pencarian lokal (selalu ada, offline) + jawaban AI Gemini bila diaktifkan admin
// dan pengguna sedang login (akun Back Office atau perangkat kasir/dapur yang sudah dipasangkan).
(function () {
    const { MODULES, FAQ } = window.RasaTutorial;
    const S = window.TutorialSearch;
    const INDEX = S.buildIndex(MODULES, FAQ);
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PREF = 'rp_tutorial_ai';
    const SUGGEST = ['Cara void item yang sudah dikirim ke dapur', 'Printer Bluetooth tidak mau mencetak', 'Internet mati, masih bisa jualan?', 'Cara split bill', 'Selisih kas saat tutup shift'];

    let aiEnabled = false;  // server punya GEMINI_API_KEY
    let history = [];       // percakapan AI terakhir: [{role:'user'|'model', text}]
    let busy = false;
    let sessionLost = false; // token ditolak server → berhenti mencoba AI sampai halaman dimuat ulang

    const session = () => (Auth.user ? 'user' : Auth.device ? 'device' : null);
    const prefAI = () => { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } };
    const useAI = () => aiEnabled && !!session() && !sessionLost && prefAI() && navigator.onLine;

    document.body.insertAdjacentHTML('beforeend', `
        <button id="ask-fab" class="fixed z-40 right-4 bottom-4 lg:right-6 lg:bottom-6 h-14 pl-4 pr-5 rounded-full bg-stone-900 text-white shadow-xl flex items-center gap-2 font-semibold hover:bg-stone-800 active:scale-95 transition">
            <i class="fas fa-comments text-brand-500 text-lg"></i><span>Tanya Panduan</span></button>
        <div id="ask-panel" class="hidden fixed z-50 inset-0 sm:inset-auto sm:right-4 sm:bottom-4 lg:right-6 lg:bottom-6 sm:w-[400px] sm:h-[min(620px,calc(100vh-6rem))] bg-white sm:rounded-2xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
            <div class="px-4 py-3 bg-stone-900 text-white flex items-center gap-3 shrink-0">
                <div class="w-9 h-9 rounded-xl bg-brand-500 grid place-items-center"><i class="fas fa-robot"></i></div>
                <div class="flex-1 leading-tight"><div class="font-bold text-sm">Asisten Panduan</div><div id="ask-mode" class="text-[11px] text-stone-400">Pencarian panduan</div></div>
                <button id="ask-clear" class="w-9 h-9 rounded-lg hover:bg-white/10" title="Mulai percakapan baru"><i class="fas fa-rotate-left"></i></button>
                <button id="ask-close" class="w-9 h-9 rounded-lg hover:bg-white/10" title="Tutup"><i class="fas fa-xmark"></i></button>
            </div>
            <div id="ask-msgs" class="flex-1 overflow-y-auto thin-scroll p-4 space-y-3 bg-stone-50"></div>
            <div class="p-3 border-t border-stone-200 bg-white shrink-0">
                <form id="ask-form" class="flex gap-2"><input id="ask-input" class="input !py-2" maxlength="500" autocomplete="off" placeholder="Tulis pertanyaan…"><button class="btn-primary !px-3 shrink-0" title="Kirim"><i class="fas fa-paper-plane"></i></button></form>
                <label id="ask-ai-toggle" class="hidden mt-2 items-center gap-2 text-[11px] text-stone-500 cursor-pointer select-none"><input type="checkbox" id="ask-ai" class="accent-orange-500">Jawab dengan AI (Gemini) — butuh internet</label>
            </div>
        </div>`);

    const msgs = $('#ask-msgs');
    const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };

    function bubble(html, who) {
        const el = document.createElement('div');
        el.className = who === 'user' ? 'flex justify-end' : 'flex';
        el.innerHTML = who === 'user'
            ? `<div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-brand-500 text-white text-sm whitespace-pre-wrap">${html}</div>`
            : `<div class="max-w-[92%] px-3 py-2.5 rounded-2xl rounded-bl-md bg-white border border-stone-200 text-sm text-stone-700 leading-relaxed">${html}</div>`;
        msgs.appendChild(el);
        scroll();
        return el;
    }

    function welcome() {
        msgs.innerHTML = '';
        bubble(`Halo! Saya membantu menjawab pertanyaan seputar <b>cara memakai RasaPOS</b> berdasarkan panduan ini. Contoh pertanyaan:
            <div class="flex flex-wrap gap-1.5 mt-2">${SUGGEST.map(q => `<button data-q="${esc(q)}" class="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 text-left">${esc(q)}</button>`).join('')}</div>`, 'bot');
        history = [];
    }

    function sourceLinks(sources, label = 'Baca di panduan') {
        if (!sources.length) return '';
        return `<div class="mt-2 pt-2 border-t border-stone-100"><div class="text-[11px] font-semibold text-stone-400 mb-1">${label}</div>${sources.map((s, i) =>
            `<button data-open="${esc(s.id)}" class="flex items-start gap-1.5 w-full text-left text-xs text-brand-700 hover:underline py-0.5"><span class="text-stone-400 shrink-0">[${i + 1}]</span><span>${esc(s.moduleTitle)} → <b>${esc(s.title)}</b></span></button>`).join('')}</div>`;
    }

    // Markdown ringan dari AI: **tebal**, daftar bernomor/berpoin, [n] → rujukan sumber
    function renderAnswer(text) {
        const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d)\]/g, '<sup class="text-brand-600 font-semibold">[$1]</sup>');
        let html = '', list = null;
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            const ol = line.match(/^\d+[.)]\s+(.*)/), ul = line.match(/^[-*•]\s+(.*)/);
            const kind = ol ? 'ol' : ul ? 'ul' : null;
            if (list && kind !== list) { html += `</${list}>`; list = null; }
            if (kind) {
                if (!list) { html += kind === 'ol' ? '<ol class="list-decimal ml-5 my-1 space-y-0.5">' : '<ul class="list-disc ml-5 my-1 space-y-0.5">'; list = kind; }
                html += `<li>${inline((ol || ul)[1])}</li>`;
            } else if (line) html += `<p class="my-1">${inline(line)}</p>`;
        }
        if (list) html += `</${list}>`;
        return html;
    }

    function searchAnswer(q, note) {
        const hits = S.search(INDEX, q, 4);
        if (!hits.length) {
            return bubble(`${note || ''}Maaf, saya tidak menemukan topik itu di panduan. Coba kata lain, misalnya <i>void</i>, <i>split bill</i>, <i>printer</i>, <i>offline</i>, atau buka modul <button data-open="faq:0" class="text-brand-700 font-semibold hover:underline">FAQ</button>.`, 'bot');
        }
        const top = hits[0].doc;
        const sources = hits.map(h => ({ id: h.doc.id, title: h.doc.title, moduleTitle: h.doc.moduleTitle }));
        return bubble(`${note || ''}<div class="text-[11px] font-semibold text-stone-400 mb-1">${esc(top.moduleTitle)} → ${esc(top.title)}</div>
            <p>${esc(S.snippet(top, q))}</p>${sourceLinks(sources, 'Topik terkait')}`, 'bot');
    }

    async function ask(q) {
        q = q.trim();
        if (!q || busy) return;
        bubble(esc(q), 'user');
        if (!useAI()) return searchAnswer(q);

        busy = true;
        const wait = bubble('<span class="text-stone-400"><i class="fas fa-circle-notch fa-spin mr-1"></i>Mencari di panduan…</span>', 'bot');
        try {
            API.mode = session();
            const r = await API.post('/assist', { question: q, history });
            wait.remove();
            bubble(renderAnswer(r.answer) + sourceLinks(r.sources) + '<div class="mt-1.5 text-[10px] text-stone-400"><i class="fas fa-wand-magic-sparkles mr-1"></i>Dijawab AI dari isi panduan — cek kembali di pelajaran terkait.</div>', 'bot');
            history = [...history, { role: 'user', text: q }, { role: 'model', text: r.answer }].slice(-6);
        } catch (e) {
            wait.remove();
            const why = e.code === 'ai_quota' ? e.message : e.status === 0 ? 'Tidak ada internet' : e.status === 401 ? 'Sesi login berakhir' : 'Asisten AI sedang tidak tersedia';
            if (e.code === 'ai_disabled') aiEnabled = false;
            if (e.status === 401) sessionLost = true;
            updateMode();
            searchAnswer(q, `<div class="mb-1.5 text-[11px] text-amber-700"><i class="fas fa-circle-info mr-1"></i>${esc(why)} — memakai pencarian panduan.</div>`);
        } finally {
            busy = false;
        }
    }

    function updateMode() {
        const toggle = $('#ask-ai-toggle');
        toggle.classList.toggle('hidden', !aiEnabled);
        toggle.classList.toggle('flex', aiEnabled);
        $('#ask-ai').checked = prefAI();
        $('#ask-ai').disabled = !session() || sessionLost;
        let mode = 'Pencarian panduan · bisa offline';
        if (aiEnabled && (!session() || sessionLost)) mode = 'Pencarian panduan · login untuk jawaban AI';
        else if (useAI()) mode = '<i class="fas fa-wand-magic-sparkles text-brand-500 mr-1"></i>AI Gemini + panduan';
        else if (aiEnabled && !navigator.onLine) mode = 'Pencarian panduan · offline';
        $('#ask-mode').innerHTML = mode;
    }

    function openSource(id) {
        const [mod, idx] = id.split(':');
        if (mod === 'faq') window.TutorialNav.openLesson('faq', 0);
        else window.TutorialNav.openLesson(mod, Number(idx));
        if (window.innerWidth < 640) togglePanel(false);
    }

    function togglePanel(open) {
        $('#ask-panel').classList.toggle('hidden', !open);
        $('#ask-fab').classList.toggle('hidden', open);
        if (open) { updateMode(); setTimeout(() => $('#ask-input').focus(), 50); }
    }

    $('#ask-fab').onclick = () => togglePanel(true);
    $('#ask-close').onclick = () => togglePanel(false);
    $('#ask-clear').onclick = welcome;
    $('#ask-form').onsubmit = e => { e.preventDefault(); const v = $('#ask-input').value; $('#ask-input').value = ''; ask(v); };
    $('#ask-ai').onchange = e => { try { localStorage.setItem(PREF, e.target.checked ? 'on' : 'off'); } catch { /* storage diblokir */ } updateMode(); };
    msgs.addEventListener('click', e => {
        const q = e.target.closest('[data-q]'); if (q) return ask(q.dataset.q);
        const o = e.target.closest('[data-open]'); if (o) openSource(o.dataset.open);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ask-panel').classList.contains('hidden')) togglePanel(false); });
    window.addEventListener('online', updateMode);
    window.addEventListener('offline', updateMode);

    welcome();
    fetch('/api/assist').then(r => r.ok ? r.json() : null).then(d => { aiEnabled = !!(d && d.enabled); updateMode(); }).catch(() => { });
})();
