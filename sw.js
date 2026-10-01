// Cat Cafe's service worker: a copy of the game kept on the device, so it opens
// and plays with no connection — on a plane, in the car, on a kid's iPad with
// no data plan.
//
// Only the public site registers it (see registerOffline in src/main.js). On
// the LAN it would just get in the way of somebody editing the game and
// reloading, and browsers don't allow one on a plain-http LAN address anyway.
//
// How it stays current: the server lists the game's files and a version stamp
// at /sw-assets.json. Each time the game starts it asks this worker to check;
// a new version is downloaded whole into a cache of its own, and only once
// every file has arrived does it replace the old one. A half-downloaded update
// never mixes with a working copy. The page is then told, and offers a reload.
//
// What it never touches: the multiplayer endpoints (valleys, polls, sockets),
// anything on another site, and the test harness.

const PREFIX = 'catcafe-';
const DONE = '/__complete__';
const SKIP = /^\/(valleys|games|poll|ws|status|sw-assets\.json|sw\.js|tools)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(refresh(false).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.t === 'check') e.waitUntil(refresh(true));
});

let busy = null;

/** Make sure the newest version is fully cached. `tell` says so to open pages. */
function refresh(tell) {
  if (!busy) busy = doRefresh(tell).finally(() => { busy = null; });
  return busy;
}

async function doRefresh(tell) {
  let list;
  try {
    const res = await fetch('/sw-assets.json', { cache: 'no-store' });
    if (!res.ok) return;
    list = await res.json();
  } catch { return; }                       // offline: keep what we have
  if (!list || !list.version || !Array.isArray(list.files)) return;
  const name = PREFIX + list.version;
  const keys = await caches.keys();
  if (keys.includes(name) && await (await caches.open(name)).match(DONE)) return;
  const cache = await caches.open(name);
  try {
    await cache.addAll(list.files.map((f) => new Request(f, { cache: 'reload' })));
  } catch {
    await caches.delete(name);              // try again whole next time
    return;
  }
  await cache.put(DONE, new Response('1'));
  const old = keys.filter((k) => k.startsWith(PREFIX) && k !== name);
  await Promise.all(old.map((k) => caches.delete(k)));
  if (tell && old.length) {
    for (const c of await self.clients.matchAll()) c.postMessage({ t: 'updated' });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  if (req.mode === 'navigate') { e.respondWith(page(req, url)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

/**
 * The page itself: fresh from the server when there is one, and the copy when
 * there isn't. An invite link (/v/...) needs the same <base> the server adds,
 * so its files are still found from under /v/.
 */
async function page(req, url) {
  try {
    return await fetch(req);
  } catch {
    const hit = await caches.match('/index.html');
    if (!hit) return Response.error();
    if (!url.pathname.startsWith('/v/')) return hit;
    const html = (await hit.text()).replace(/<head>/i, '<head>\n<base href="/">');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
