// Halaman depan: login, daftar, reset password, pairing perangkat
const views = ['login', 'register', 'forgot', 'reset', 'pair'];
let resetToken = null;

function show(view) {
    for (const v of views) $('#view-' + v).classList.toggle('hidden', v !== view);
    $$('#tabs [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const first = $(`#view-${view} input`);
    if (first) setTimeout(() => first.focus(), 50);
}

function redirectAfterLogin(res) {
    if (res.user && res.user.superadmin && !res.tenant) location.href = '/admin.html';
    else location.href = '/backoffice.html';
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

async function submitWith(form, fn) {
    const btn = form.querySelector('button:not([type=button])');
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses…';
    try { await fn(formData(form)); } catch (e) { errorDialog(e); } finally { btn.disabled = false; btn.innerHTML = label; }
}

$('#view-login').addEventListener('submit', e => {
    e.preventDefault();
    submitWith(e.target, async d => {
        const res = await API.publicPost('/auth/login', d);
        Auth.saveUser(res);
        redirectAfterLogin(res);
    });
});

$('#view-register').addEventListener('submit', e => {
    e.preventDefault();
    submitWith(e.target, async d => {
        const res = await API.publicPost('/auth/register', d);
        Auth.saveUser(res);
        await SwalBase.fire({ icon: 'success', title: 'Selamat datang!', html: `Trial Anda aktif sampai <b>${fmtDate(res.tenant.license.until)}</b>.<br>Mulai dengan menambah menu, staff, lalu pasangkan tablet kasir.` });
        location.href = '/backoffice.html';
    });
});

$('#view-forgot').addEventListener('submit', e => {
    e.preventDefault();
    submitWith(e.target, async d => {
        const res = await API.publicPost('/auth/forgot', d);
        await SwalBase.fire({ icon: 'info', title: 'Cek email Anda', text: res.message + ' Jika tidak menerima email, minta admin untuk reset password.' });
        show('login');
    });
});

$('#view-reset').addEventListener('submit', e => {
    e.preventDefault();
    submitWith(e.target, async d => {
        await API.publicPost('/auth/reset', { token: resetToken, password: d.password });
        history.replaceState(null, '', '/');
        await SwalBase.fire({ icon: 'success', title: 'Password diperbarui', text: 'Silakan login dengan password baru.' });
        show('login');
    });
});

$('#view-pair').addEventListener('submit', e => {
    e.preventDefault();
    submitWith(e.target, async d => {
        const res = await API.publicPost('/auth/pair', { code: d.code.trim() });
        Auth.device = { device: res.device, tenant: res.tenant, access_token: res.access_token, exp: Date.now() + res.expires_in * 1000, license: res.license };
        Auth.staff = null;
        location.href = res.device.type === 'kds' ? '/kds.html' : '/pos.html';
    });
});

$$('[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

(function init() {
    Pwa.init();
    const m = location.hash.match(/reset=([\w-]+)/);
    if (m) { resetToken = m[1]; show('reset'); return; }
    const d = Auth.device;
    if (d && d.device) { location.href = d.device.type === 'kds' ? '/kds.html' : '/pos.html'; return; }
    const u = Auth.user;
    if (u && u.refresh_token) { location.href = u.user && u.user.superadmin && !u.tenant ? '/admin.html' : '/backoffice.html'; return; }
    show(location.hash === '#daftar' ? 'register' : location.hash === '#perangkat' ? 'pair' : 'login');
})();
