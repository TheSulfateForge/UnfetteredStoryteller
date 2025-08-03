// A simple, "cache-first" service worker
const CACHE_NAME = 'unfettered-storyteller-cache-v5'; // Bump version to include new icons
// List all the files that make up the app shell
const dataFiles = [
    './data/spells.json', './data/monsters.json', './data/backgrounds.json', 
    './data/feats.json', './data/conditions.json', './data/races.json', 
    './data/classes.json', './data/magicitems.json', './data/weapons.json', 
    './data/armor.json', './data/planes.json', './data/sections.json',
    './data/spelllist.json', './data/documents.json'
];

const urlsToCache = [
  './',
  './index.html',
  './index.css',
  './index.tsx',
  './manifest.json',
  './metadata.json',
  './UFST-192.png',
  './UFST-512.png',
  // TS files
  './api.ts',
  './character-creator.ts',
  './chunking-strategies.ts',
  './config.ts',
  './data-manager.ts',
  './dom.ts',
  './game-loop.ts',
  './game.ts',
  './gemini-provider.ts',
  './llm-provider.ts',
  './local-llm-provider.ts',
  './rag.ts',
  './rpg-data.ts',
  './rpg-helpers.ts',
  './services.ts',
  './session-manager.ts',
  './state-manager.ts',
  './types.ts',
  './ui.ts',
  './utils.ts',
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
        console.log('Opened cache');
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


// Fetch event: serves assets from the cache first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      }
    )
  );
});
