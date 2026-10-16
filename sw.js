// Versión de la aplicación. ÚNICA fuente de verdad: cualquier cambio aquí
// se refleja automáticamente en el chip de la UI (vía fetch + postMessage)
// y en el nombre de la caché. Formato libre: '2', '2.2', '2.2.0-beta', etc.
const APP_VERSION = '2.2';

// El nombre de la caché se deriva de la versión: bump de versión = nueva caché.
const CACHE_NAME = `panel-leds-${APP_VERSION}`;

// Recursos locales precargados en la instalación
const PRECACHE = [
    './',
    './index.html',
    './manifest.json',
    './favicon.ico',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
    './icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ includeUncontrolled: true }))
            .then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
                });
            })
    );
});

// Permite a las páginas solicitar la versión activa del SW en cualquier momento.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_APP_VERSION') {
        event.source.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // Navegación: red primero con reserva en caché, y fallback offline a index.html
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Mismo origen: caché primero
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            }))
        );
        return;
    }

    // Recursos de CDN (Tailwind, fuentes de Google): stale-while-revalidate
    event.respondWith(
        caches.match(event.request).then((hit) => {
            const network = fetch(event.request).then((response) => {
                if (response && (response.status === 200 || response.type === 'opaque')) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            }).catch(() => hit);
            return hit || network;
        })
    );
});
