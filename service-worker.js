/**
 * SUPERMANAGER MCBF 26/27 — Service worker
 *
 * L'app el cridava des del primer dia (app.js) però el fitxer no existia: el registre
 * fallava en silenci i cada obertura es baixava tot de zero. Amb això, la closca de
 * l'app (pàgina, estils, icones) surt a l'instant i sense xarxa.
 *
 * Les crides a Apps Script NO es guarden mai aquí: són d'un altre domini i han de
 * portar dades fresques. De la còpia de les dades ja se n'ocupa l'app amb localStorage.
 */

const CACHE = 'supermanager-v5';

const CLOSCA = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e => {
  // Els fitxers que fallin no han de tombar la instal·lació sencera.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CLOSCA.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/**
 * Serveix la còpia de seguida i en demana una de fresca per darrere, que servirà el
 * proper cop. Així s'obre a l'instant i els canvis arriben igualment, amb un obert de
 * retard.
 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script i companyia, mai al cau

  e.respondWith(
    caches.match(req).then(desat => {
      const xarxa = fetch(req).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => desat);
      return desat || xarxa;
    })
  );
});
