// Service worker mínim: només cal perquè el navegador consideri l'app instal·lable.
// No fem cache agressiva perquè les dades han de ser sempre en directe des del Google Sheet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', () => {}); // pass-through
