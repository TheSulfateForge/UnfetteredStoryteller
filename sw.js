
// A robust, "network-first" for HTML & "cache-first" for assets service worker
const CACHE_NAME = 'unfettered-storyteller-cache-v61'; // Bumped: zero-CDN startup - SDK imports made lazy so app boots offline
// List all the files that make up the app shell
const dataFiles = [
    './data/spells-0-1.json', './data/spells-2-3.json', './data/spells-4-5.json', 
    './data/spells-6-7.json', './data/spells-8-9.json', './data/monsters.json', 
    './data/backgrounds.json', './data/feats.json', './data/conditions.json', 
    './data/races.json', './data/classes.json', './data/magicitems.json', 
    './data/weapons.json', './data/armor.json', './data/planes.json', 
    './data/sections.json', './data/spelllist.json', './data/documents.json', 
    './data/lore.json', './data/class-progression.json'
];

const urlsToCache = [
  './',
  './index.html',
  './index.css',
  './index.js',
  './manifest.json',
  './metadata.json',
  './UFST-192.png',
  './UFST-512.png',
  // JS files (formerly TS)
  './api.js',
  './character-creator.js',
  './chunking-strategies.js',
  './config.js',
  './data-manager.js',
  './dom.js',
  './game-loop.js',
  './game.js',
  './gemini-provider.js',
  './genai-constants.js',
  './llm-provider.js',
  './local-llm-provider.js',
  './local-embedder.js',
  './rag.js',
  './rpg-data.js',
  './rpg-helpers.js',
  './services.js',
  './session-manager.js',
  './state-manager.js',
  './types.js',
  './ui.js',
  './utils.js',
  // Licenses
  './LICENSES/LICENSE-CODE.md',
  './LICENSES/LICENSE-SRD.md',
  // Fonts
  'https://fonts.googleapis.com/css2?family=MedievalSharp&family=Lato:wght@400;700&display=swap',
].concat(dataFiles);

// Install event: opens the cache and adds the app shell files to it
self.addEventListener('install', event => {
  // Skip waiting forces the new service worker to activate immediately.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        // IMPORTANT: cache.addAll() is atomic - a single failed request (an
        // offline CDN font, a large data file, a transient network error) rejects
        // the whole install. The new worker then never activates and the OLD one
        // keeps serving stale files forever, so version bumps stop taking effect.
        // Cache entries individually instead and tolerate failures.
        const results = await Promise.allSettled(
          urlsToCache.map(url => cache.add(url).catch(err => {
            throw new Error(`${url}: ${err && err.message ? err.message : err}`);
          }))
        );
        const failed = results.filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message);
        if (failed.length) {
          console.warn(`SW: ${failed.length}/${urlsToCache.length} assets could not be pre-cached (install continues):`, failed);
        } else {
          console.log(`SW: pre-cached ${urlsToCache.length} assets.`);
        }
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// When the user clicks the update button, this message is received
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});


// Fetch event: implements a network-first strategy for navigation requests (HTML)
// and a cache-first strategy for all other assets.
self.addEventListener('fetch', event => {
    // For navigation requests (e.g., loading the index.html), try the network first.
    // This ensures the user always gets the latest version of the main page,
    // which then loads the correctly versioned assets.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // If network is successful, cache the new response for offline use.
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                })
                .catch(() => {
                    // If the network fails, fall back to the cache.
                    return caches.match(event.request);
                })
        );
        return;
    }

    // For all other requests (CSS, JS, images, data), use a cache-first strategy
    // for speed and offline functionality.
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response from cache.
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network, then cache it for next time.
                return fetch(event.request).then(
                    networkResponse => {
                        return caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                            return networkResponse;
                        });
                    }
                );
            })
    );
});