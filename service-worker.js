// Service Worker for timer persistence and background reliability
// This runs completely independent of the page lifecycle

const CACHE_NAME = 'timer-app-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/timer.js',
    '/app.js',
    '/timer-worker.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache');
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch new
                return response || fetch(event.request);
            })
            .catch(() => {
                // Fallback for offline
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Message handling for timer sync
self.addEventListener('message', (event) => {
    if (event.data.type === 'TIMER_SYNC') {
        // Store timer state for recovery
        const timerState = event.data.state;
        self.timerState = timerState;
    }
});

// Periodic sync to keep timers accurate (if browser supports it)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'timer-sync') {
        event.waitUntil(syncTimers());
    }
});

async function syncTimers() {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
        client.postMessage({
            type: 'SYNC_REQUEST',
            timestamp: Date.now()
        });
    });
}