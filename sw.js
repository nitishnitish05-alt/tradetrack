// ═══════════════════════════════════════════════════════
// TradeTrack Service Worker
// FMPL Procurement Management System
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'tradetrack-v4';
const FIREBASE_CACHE = 'tradetrack-firebase-v4';

// Files to cache for offline shell
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Firebase SDKs (cached from CDN on first load)
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
];

// ─── INSTALL ───────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[TradeTrack SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[TradeTrack SW] Caching app shell');
      // Cache each file individually so one failure doesn't block all
      return Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ──────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[TradeTrack SW] Activating...');
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME && key !== FIREBASE_CACHE) {
            console.log('[TradeTrack SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Let Firestore/Firebase Auth API calls pass through (always online)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.pathname.includes('/__/firebase/')
  ) {
    return; // Network only for Firestore data
  }

  // Firebase SDK JS files — cache first, then network
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebasejs')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(FIREBASE_CACHE).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App shell — cache first, fallback to network, then cache update
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache, but update in background (stale-while-revalidate)
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {});
        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback — return cached index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ─── BACKGROUND SYNC (future-ready) ───────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-deliveries') {
    console.log('[TradeTrack SW] Background sync: deliveries');
    // Placeholder for future offline delivery queue sync
  }
});

// ─── PUSH NOTIFICATIONS (future-ready) ────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'TradeTrack', {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: 'tradetrack-notification',
  });
});
