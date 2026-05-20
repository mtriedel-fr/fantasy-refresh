// Fantasy Refresh — Service Worker
// Caches static assets for fast loads and offline support

const CACHE_NAME    = 'fr-v1';
const CACHE_STATIC  = 'fr-static-v1';

// Files to pre-cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/draft.html',
  '/welcome.html',
  '/league-setup.html',
  '/preseason.html',
  '/league-context.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── INSTALL ────────────────────────────────────────────────────
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache){
      return cache.addAll(PRECACHE);
    }).then(function(){
      return self.skipWaiting(); // activate immediately
    })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){
          // Remove old caches
          return key !== CACHE_STATIC;
        }).map(function(key){
          return caches.delete(key);
        })
      );
    }).then(function(){
      return self.clients.claim(); // take control immediately
    })
  );
});

// ── FETCH ──────────────────────────────────────────────────────
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);

  // Never cache Firebase, Tank01, or Cloudflare Worker calls
  // These must always be fresh
  if(url.hostname.includes('firebase') ||
     url.hostname.includes('googleapis') ||
     url.hostname.includes('rapidapi') ||
     url.hostname.includes('workers.dev') ||
     url.hostname.includes('sleeper') ||
     url.hostname.includes('fonts.gstatic') ||
     url.hostname.includes('fonts.googleapis')){
    e.respondWith(fetch(e.request));
    return;
  }

  // For HTML pages: network first, fall back to cache
  // Ensures players always get latest version
  if(e.request.headers.get('accept') &&
     e.request.headers.get('accept').includes('text/html')){
    e.respondWith(
      fetch(e.request)
        .then(function(response){
          // Cache a copy of the fresh response
          var clone = response.clone();
          caches.open(CACHE_STATIC).then(function(cache){
            cache.put(e.request, clone);
          });
          return response;
        })
        .catch(function(){
          // Offline: serve from cache
          return caches.match(e.request).then(function(cached){
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // For JS/CSS/images: cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(response){
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache){
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
