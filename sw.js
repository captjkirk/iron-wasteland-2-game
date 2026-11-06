// Service worker (slice 13a): the game installs like an app, starts with no network, and later loads come from this cache.
// Never stale: under scripts/serve.py each page load first asks /files for every game file's size and time and drops
// the cached copies that changed (a slice that changes only code re-fetches only that code). Without /files (another
// server, or no network) it goes to the network first and falls back to the cache. Three.js and ez-tree come from the
// CDN at exact versions, so those copies never change. Browsers run this only on localhost or https: a family computer
// that opens the host's http://192.168... address plays from the network as before.
const CACHE = 'iw2-1', OURS = /^(index\.html)?$|^(src|assets)\/|^manifest\.webmanifest$/, CDN = 'https://cdn.jsdelivr.net/npm/';
const scope = self.registration.scope;
let fresh = false; // this load's /files check passed: the cache is current, so serve from it
let gen = 0;       // bumped by each check: a fetch that began before one may hold an old file, so it is not kept

// the cache key of a URL the game loads, or null for anything else (co-op, play logs, /version pass straight through)
function keyOf(href) { const u = new URL(href);
  if (href.startsWith(CDN)) return href;
  if (!u.href.startsWith(scope)) return null;
  const rel = u.pathname.slice(new URL(scope).pathname.length);
  return OURS.test(rel) ? scope + (rel || 'index.html') : null; } // (the page's ?q=low and the like are not part of the file)

// fetch past the browser's own cache's guesses (a static host's max-age could hand back an old file) and keep a good copy
const keep = (c, key) => { const g = gen;
  return fetch(key, { cache: 'no-cache' }).then(r => { if (r.ok && g === gen) c.put(key, r.clone()).catch(() => {}); return r; }); };

// drop every cached copy whose stamp changed (or was never stamped); returns the server's list, or null when it has none
async function sync() { gen++;
  try { const r = await fetch(scope + 'files', { cache: 'no-store', signal: AbortSignal.timeout(3000) }); if (!r.ok) return fresh = null;
    const files = await r.json(), c = await caches.open(CACHE);
    const old = await (await c.match(scope + 'stamps.json'))?.json().catch(() => null) || {};
    await Promise.all([...new Set([...Object.keys(old), ...Object.keys(files)])].filter(p => old[p] !== files[p]).map(p => c.delete(scope + p)));
    await c.put(scope + 'stamps.json', new Response(JSON.stringify(files))); fresh = true; return files; }
  catch { return fresh = null; } } // no server, or the cache refused (a private window, a full disk): play from the network

// fetch whatever the list has that the cache lacks
async function fill(keys) { try { const c = await caches.open(CACHE), todo = [];
  for (const k of keys) if (!(await c.match(k))) todo.push(k);
  await Promise.all(Array.from({ length: 6 }, async () => { for (let k; (k = todo.pop());) await keep(c, k).catch(() => {}); })); } catch {} }
const fillAll = files => files && fill(Object.keys(files).map(p => scope + p));

self.addEventListener('install', () => self.skipWaiting());
// (no filling here: until activation ends, the page's own requests wait for it)
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  .catch(() => {}).then(() => self.clients.claim())));
// the page lists what it loaded once the world is built: the first load fetched it before this was running, and the
// rest of the game's files follow (this is also where the very first fill happens). Only under serve.py: elsewhere the
// next load caches what it fetches, and a server that cannot answer "not changed" would send all 31 MB again at once
// (the headless checks' own server: it stalled the co-op timing walk)
self.addEventListener('message', e => { if (Array.isArray(e.data))
  e.waitUntil((fresh ? Promise.resolve(null) : sync()).then(files => (fresh || files) && fill(e.data.map(keyOf).filter(Boolean)).then(() => fillAll(files)))); });

self.addEventListener('fetch', e => { const r = e.request, key = r.method === 'GET' && keyOf(r.url); if (!key) return;
  if (key.startsWith(CDN)) return e.respondWith(caches.open(CACHE).then(async c => (await c.match(key)) || keep(c, key)).catch(() => fetch(r)));
  const ready = r.mode === 'navigate' ? sync() : null; // each load re-checks first, so the page and its code are current
  if (ready) e.waitUntil(ready.then(fillAll));
  e.respondWith((ready || Promise.resolve()).then(async () => { const c = await caches.open(CACHE);
    if (fresh) { const m = await c.match(key); if (m) return m; }
    // network first; a failed fetch or a server error falls back to the cached copy
    return keep(c, key).then(async res => res.ok ? res : (await c.match(key)) || res, async err => (await c.match(key)) || Promise.reject(err)); })
    .catch(() => fetch(r)));
});
