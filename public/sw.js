// Service worker: app shell cache-first (aman offline), API selalu ke jaringan, foto menu di-cache permanen.
const VERSION = '1.0.0+202610022235';
const CACHE = 'rasapos-' + VERSION;
const IMG_CACHE = 'rasapos-img';

const SHELL = [
    '/', '/index.html', '/pos.html', '/kds.html', '/backoffice.html', '/admin.html',
    '/manifest.json', '/css/app.css',
    '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png',
    '/vendor/sweetalert2.all.min.js', '/vendor/chart.umd.js', '/vendor/fontawesome/css/all.min.css',
    '/vendor/fontawesome/webfonts/fa-solid-900.woff2', '/vendor/fontawesome/webfonts/fa-regular-400.woff2', '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
    '/js/shared/money.js', '/js/shared/order-ops.js', '/js/shared/pricing.js',
    '/js/core/utils.js', '/js/core/api.js', '/js/core/idb.js', '/js/core/realtime.js', '/js/core/pwa.js',
    '/js/core/escpos.js', '/js/core/receipt.js', '/js/core/printer.js',
    '/js/index.js',
    '/js/pos/app.js', '/js/pos/sync.js', '/js/pos/order.js', '/js/pos/tables.js', '/js/pos/payment.js', '/js/pos/shift.js',
    '/js/kds/app.js',
    '/js/backoffice/app.js', '/js/backoffice/dashboard.js', '/js/backoffice/transactions.js', '/js/backoffice/reports.js',
    '/js/backoffice/menu.js', '/js/backoffice/outlets.js', '/js/backoffice/staff.js', '/js/backoffice/inventory.js',
    '/js/backoffice/marketing.js', '/js/backoffice/settings.js',
    '/js/admin/app.js',
    '/tutorial.html', '/js/tutorial.js'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.action === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Foto menu: id acak & immutable → cache permanen
    if (url.pathname.startsWith('/api/f/')) {
        event.respondWith(caches.open(IMG_CACHE).then(async c => {
            const hit = await c.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res.ok) c.put(req, res.clone());
            return res;
        }));
        return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/version.json') return;

    // App shell: cache-first, fallback jaringan (lalu simpan)
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = req.mode === 'navigate' ? (url.pathname === '/' ? '/index.html' : url.pathname) : url.pathname;
        const hit = await cache.match(key) || await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        try {
            const res = await fetch(req);
            if (res.ok && res.type === 'basic') cache.put(key, res.clone());
            return res;
        } catch (e) {
            if (req.mode === 'navigate') return (await cache.match('/index.html')) || Response.error();
            return Response.error();
        }
    })());
});
