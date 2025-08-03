// A simple, "cache-first" service worker
const CACHE_NAME = 'unfettered-storyteller-cache-v4'; // Bump version for new data and path fixes
// List all the files that make up the app shell
const dataFiles = [
    '/UnfetteredStoryteller/data/spells.json', '/UnfetteredStoryteller/data/monsters.json', '/UnfetteredStoryteller/data/backgrounds.json', 
    '/UnfetteredStoryteller/data/feats.json', '/UnfetteredStoryteller/data/conditions.json', '/UnfetteredStoryteller/data/races.json', 
    '/UnfetteredStoryteller/data/classes.json', '/UnfetteredStoryteller/data/magicitems.json', '/UnfetteredStoryteller/data/weapons.json', 
    '/UnfetteredStoryteller/data/armor.json', '/UnfetteredStoryteller/data/planes.json', '/UnfetteredStoryteller/data/sections.json',
    '/UnfetteredStoryteller/data/spelllist.json', '/UnfetteredStoryteller/data/documents.json'
];

const urlsToCache = [
  '/UnfetteredStoryteller/',
  '/UnfetteredStoryteller/index.html',
  '/UnfetteredStoryteller/index.css',
  '/UnfetteredStoryteller/index.tsx',
  '/UnfetteredStoryteller/manifest.json',
  '/UnfetteredStoryteller/metadata.json',
  '/UnfetteredStoryteller/icon-192.png',
  '/UnfetteredStoryteller/icon-512.png',
  // TS files
  '/UnfetteredStoryteller/api.ts',
  '/UnfetteredStoryteller/character-creator.ts',
  '/UnfetteredStoryteller/chunking-strategies.ts',
  '/UnfetteredStoryteller/config.ts',
  '/UnfetteredStoryteller/data-manager.ts',
  '/UnfetteredStoryteller/dom.ts',
  '/UnfetteredStoryteller/game-loop.ts',
  '/UnfetteredStoryteller/game.ts',
  '/UnfetteredStoryteller/gemini-provider.ts',
  '/UnfetteredStoryteller/llm-provider.ts',
  '/UnfetteredStoryteller/local-llm-provider.ts',
  '/UnfetteredStoryteller/rag.ts',
  '/UnfetteredStoryteller/rpg-data.ts',
  '/UnfetteredStoryteller/rpg-helpers.ts',
  '/UnfetteredStoryteller/services.ts',
  '/UnfetteredStoryteller/session-manager.ts',
  '/UnfetteredStoryteller/state-manager.ts',
  '/UnfetteredStoryteller/types.ts',
  '/UnfetteredStoryteller/ui.ts',
  '/UnfetteredStoryteller/utils.ts',
  // Licenses
  '/UnfetteredStoryteller/LICENSES/LICENSE-CODE.md',
  '/UnfetteredStoryteller/LICENSES/LICENSE-SRD.md',
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
