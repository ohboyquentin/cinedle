// Service worker : permet d'installer le jeu sur l'écran d'accueil et de le rouvrir même hors connexion.
// Stratégie « réseau d'abord » : tant que le téléphone est en ligne, il reçoit toujours la dernière version
// de la page et des données du jour ; le cache ne sert qu'en secours (hors ligne).
// Si tu modifies ce fichier, change le numéro de version ci-dessous.
const CACHE = 'guesswhat-v1';
const PRECACHE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // polices Google, etc. : laissées au navigateur
  if (req.headers.has('range')) return;              // extraits audio (lecture par morceaux) : laissés au réseau
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) { const copie = res.clone(); caches.open(CACHE).then(c => c.put(req, copie)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
