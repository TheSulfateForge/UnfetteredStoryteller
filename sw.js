// A simple, "cache-first" service worker
const CACHE_NAME = 'unfettered-storyteller-cache-v1'; // Bump version for new data
// List all the files that make up the app shell
const dataFiles = [
    'data/spells.json', 'data/monsters.json', 'data/backgrounds.json', 
    'data/feats.json', 'data/conditions.json', 'data/races.json', 
    'data/classes.json', 'data/magicitems.json', 'data/weapons.json', 
    'data/armor.json', 'data/planes.json', 'data/sections.json',
    'data/spelllist.json'
];

const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  '/index.tsx',
  '/manifest.json',
  '/rpg-helpers.ts',
  '/api.ts',
  '/config.ts',
  '/dom.ts',
  '/game.ts',
  '/services.ts',
  '/types.ts',
  '/ui.ts',
  '/llm-provider.ts',
  '/gemini-provider.ts',
  '/local-llm-provider.ts',
  '/rag.ts',
  '/data-manager.ts',
  '/chunking-strategies.ts',
  '/state-manager.ts',
  'https://fonts.googleapis.com/css2?family=MedievalSharp&family=Lato:wght@400;700&display=swap',
  'https://fonts.gstatic.com/s/medievalsharp/v27/EvNf_SysZdDAg_8s61I-0G55_Dt_c131.woff2',
  'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXg.woff2'
  // NOTE: You will need to create 'icon-192.png' and 'icon-512.png'
  // and add them to this list and your project directory for the app to be fully installable.
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
    })
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