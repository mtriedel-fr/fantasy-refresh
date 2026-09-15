// Fantasy Refresh — Service Worker
// Caches static assets for offline support. Network-first: a normal
// reload should always see whatever's actually deployed — the cache only
// kicks in when the network is genuinely unreachable.
const CACHE_NAME    = 'fr-v7';
const CACHE_STATIC  = 'fr-static-v7';

// Files to pre-cache on install
const PRECACHE = [
  '/',
  '/welcome.html',
  '/auth.html',
  '/home.html',
  '/league.html',
  '/league-setup.html',
  '/draft.html',
  '/league-context.js',
  '/js/auth.js',
  '/manifest.json',
  '/icons/icon.svg'
];

// URLs that should NEVER be cached — always go to network
const BYPASS_PATTERNS = [
  'googleapis.com',
  'identitytoolkit',
  'securetoken.googleapis',
  'firebaseio.com',
  'firebaseapp.com',
  'tank01',
  'api.',
  '.json'
];

function shouldBypass(url) {
  return BYPASS_PATTERNS.some(function(p) { return url.indexOf(p) >= 0; });
}

// ── INSTALL ────────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_STATIC;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH ──────────────────────────────────────────────────────
// Real timeout on the network attempt — without this, a stalled (not
// fully failed) request would hang here indefinitely, since a service
// worker intercepts every request including full page navigations.
// That freezes the entire site with no way to navigate anywhere at
// all, since every navigation has to go through this same unbounded
// fetch first. Confirmed as the real, structural cause of a reported
// "site freezes, can't go anywhere" issue affecting multiple people
// inconsistently, depending on their network quality at that moment.
const NETWORK_TIMEOUT_MS = 8000;

function fetchWithTimeout(request) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, NETWORK_TIMEOUT_MS);
  return fetch(request, { signal: controller.signal }).then(function(response) {
    clearTimeout(timer);
    return response;
  }).catch(function(err) {
    clearTimeout(timer);
    throw err;
  });
}

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Always bypass — go straight to network, no caching
  if (shouldBypass(url)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Only cache GET requests
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first: a reload should always reflect what's actually
  // deployed. The cache is only a fallback for when the network is
  // unreachable (true offline support) OR too slow to respond within a
  // reasonable window, never a substitute for a fresh file the network
  // can actually serve promptly.
  e.respondWith(
    fetchWithTimeout(e.request).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        // Nothing cached either (e.g. a brand new user, first visit,
        // genuinely offline) — let the real network error surface
        // rather than silently hanging with no response at all.
        return fetch(e.request);
      });
    })
  );
});
