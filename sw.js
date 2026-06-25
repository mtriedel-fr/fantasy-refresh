// Fantasy Refresh — Service Worker
// Caches static assets for offline support. Network-first: a normal
// reload should always see whatever's actually deployed — the cache only
// kicks in when the network is genuinely unreachable.
const CACHE_NAME    = 'fr-v4';
const CACHE_STATIC  = 'fr-static-v4';

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
  // unreachable (true offline support), never a substitute for a fresh
  // file the network can actually serve.
  e.respondWith(
    fetch(e.request).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
