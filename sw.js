
// A robust, "network-first" for HTML & "cache-first" for assets service worker
const CACHE_NAME = 'unfettered-storyteller-cache-v8'; // Bumped version to force update and reflect new strategy
// List all the files that make up the app shell
const dataFiles = [
    './data/spells.json', './data/monsters.json', './data/backgrounds.json', 
    './data/feats.json', './data/conditions.json', './data/races.json', 
    './data/classes.json', './data/magicitems.json', './data/weapons.json', 
    './data/armor.json', './data/planes.json', './data/sections.json',
    './data/spelllist.json', './data/documents.json', './data/lore.json'
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
  './llm-provider.js',
  './local-llm-provider.js',
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
  'https://fonts.gstatic.com/s/medievalsharp/v27/EvNf_SysZdDAg_8s61I-0G55_Dt_c131.woff2',
  'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXg.woff2'
].concat(dataFiles);

// Install event: opens the cache and adds the app shell files to it
self.addEventListener('install', event => {
  // Skip waiting forces the new service worker to activate immediately.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(urlsToCache);
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