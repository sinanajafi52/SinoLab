/**
 * Frog Pump WebApp - Service Worker
 * Handles caching and offline functionality
 */

// Cache version - update this when deploying new versions
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `frogpump-${CACHE_VERSION}`;

// Files to cache for offline use
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/device.html',
    '/dashboard.html',
    '/offline.html',
    '/css/style.css',
    '/js/firebase-config.js',
    '/js/utils.js',
    '/js/auth.js',
    '/js/device.js',
    '/js/dashboard.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Firebase SDK - don't cache as they need to be fresh
const FIREBASE_URLS = [
    'https://www.gstatic.com/firebasejs/'
];

// ========================================
// INSTALL EVENT
// ========================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Cache static assets
                return cache.addAll(STATIC_ASSETS.map(url => {
                    return new Request(url, { cache: 'reload' });
                }));
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Error caching static assets:', error);
            })
    );
});

// ========================================
// ACTIVATE EVENT
// ========================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        // Clean up old caches
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('frogpump-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Old caches cleaned up');
                // Take control of all clients immediately
                return self.clients.claim();
            })
    );
});

// ========================================
// FETCH EVENT
// ========================================

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Firebase SDK requests - always fetch from network
    if (FIREBASE_URLS.some(fbUrl => request.url.startsWith(fbUrl))) {
        return;
    }

    // Skip Firebase API calls
    if (url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebasedatabase.app') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseauth.com')) {
        return;
    }

    // Handle navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Return cached page or offline page
                    return caches.match(request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Return offline page
                            return caches.match('/offline.html');
                        });
                })
        );
        return;
    }

    // Handle static assets with cache-first strategy
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // Return cached version, but also fetch and update cache
                        fetchAndCache(request);
                        return cachedResponse;
                    }
                    return fetchAndCache(request);
                })
        );
        return;
    }

    // Handle external fonts and resources with stale-while-revalidate
    if (isExternalResource(url)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    const fetchPromise = fetch(request)
                        .then((networkResponse) => {
                            if (networkResponse.ok) {
                                const responseClone = networkResponse.clone();
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, responseClone);
                                });
                            }
                            return networkResponse;
                        })
                        .catch(() => cachedResponse);

                    return cachedResponse || fetchPromise;
                })
        );
        return;
    }

    // Default: network-first
    event.respondWith(
        fetch(request)
            .catch(() => caches.match(request))
    );
});

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Check if URL is a static asset
 */
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
           url.pathname === '/' ||
           url.pathname.endsWith('.html');
}

/**
 * Check if URL is an external resource
 */
function isExternalResource(url) {
    return url.hostname === 'fonts.googleapis.com' ||
           url.hostname === 'fonts.gstatic.com';
}

/**
 * Fetch resource and cache it
 */
function fetchAndCache(request) {
    return fetch(request)
        .then((response) => {
            if (response.ok) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseClone);
                });
            }
            return response;
        })
        .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            throw error;
        });
}

// ========================================
// MESSAGE HANDLING
// ========================================

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            event.ports[0].postMessage({ cleared: true });
        });
    }
});

// ========================================
// BACKGROUND SYNC (for future use)
// ========================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-commands') {
        console.log('[SW] Syncing commands...');
        // Could be used for queuing commands when offline
    }
});

// ========================================
// PUSH NOTIFICATIONS (for future use)
// ========================================

self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body: data.body || 'Frog Pump notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/dashboard.html'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Frog Pump', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Focus existing window if available
                for (const client of windowClients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});

console.log('[SW] Service worker loaded');
