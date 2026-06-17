// 藥記得 - Enhanced Service Worker
const CACHE_NAME = 'medremind-v11';
const STATIC_ASSETS = [
    '/privacy.html',
    '/terms.html',
    '/admin.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install - pre-cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        })
    );
    self.clients.claim();
});

// Fetch - network first for app shell/API, cache fallback for offline use.
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // API calls and HTML app shell must never be served stale first.
    if (url.pathname.startsWith('/api/') || event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response && response.status === 200 && !url.pathname.startsWith('/api/')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                if (url.pathname.startsWith('/api/')) {
                    return new Response(JSON.stringify({ error: 'offline' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                return caches.match(event.request).then(cached => cached || caches.match('/index.html'));
            })
        );
        return;
    }
    
    // Static assets - cache first, network fallback
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached || new Response('Offline', { status: 503 }));
        })
    );
});
