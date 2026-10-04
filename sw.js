// App shell: network-first (always fresh when online), cache fallback offline. CDN libs: cache-first.
const V = 'bkk11bg-v19';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/app.js', 'js/net.js', 'js/rng.js', 'js/onuw.js', 'js/spyfall.js', 'js/undercover.js', 'js/avalon.js', 'js/insider.js', 'js/justone.js', 'js/words.js', 'js/skull.js', 'js/mind.js', 'js/codenames.js', 'js/scout.js', 'js/secrethitler.js', 'js/camelup.js', 'js/taco.js', 'js/salem.js', 'js/abraca.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  ...['ab1', 'ab2', 'ab3', 'ab4', 'ab5', 'ab6', 'ab7', 'ab8', 'assassin', 'blackcat', 'brain', 'bulb', 'camel', 'cards', 'castle', 'cat', 'cauldron', 'cheese', 'church', 'coins', 'crown', 'curse', 'dice', 'dove', 'drunk', 'eagle', 'eye', 'fail', 'fire', 'flag', 'gavel', 'goat', 'gorilla', 'groundhog', 'hand', 'heart', 'hourglass', 'hunter', 'insomniac', 'juggler', 'key', 'knife', 'magnify', 'masks', 'mason', 'master', 'merlin', 'mic', 'minion', 'mirage', 'moon', 'mordred', 'morgana', 'narwhal', 'oberon', 'palm', 'people', 'percival', 'pizza', 'point', 'pyramid', 'qmark', 'ring', 'robber', 'robhand', 'rose', 'scroll', 'seer', 'servant', 'shield', 'skull', 'sparkle', 'spy', 'star', 'stocks', 'sun', 'swap', 'swap2', 'taco', 'tanner', 'target', 'tophat', 'trophy', 'troublemaker', 'veto', 'villager', 'vote', 'wand', 'witchhat', 'wolf'].map(n => `icons/g/${n}.svg`)];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (CDN.includes(u.hostname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
      return res;
    })));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
