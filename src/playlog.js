// Play log, for troubleshooting a real session: once a second where the player is and what is around them, plus every
// event (hits taken and given, deaths, crates, getting stuck, page errors). F9 saves it as a JSON file.
// Served by scripts/serve.py or the desktop app, it records on its own: the log every 15 s, a small snapshot at each key
// moment and every minute, and a video of the game from its start, into the server's playlogs/ (a plain server just refuses
// the uploads). Slice 13d: the log is also kept in this browser (an outbox in localStorage) until a recording server has
// it, so a play whose server went away mid-game (a host that quit, a dropped network) is sent the next time the game opens
// from one; and watchers (here and in watch.js) log what went wrong even when nobody noticed: page errors, failed loads,
// console errors and long frames. scripts/findings.js turns the logs into a findings report.
const OUTBOX = 'iw2.playlog.out', t0 = Date.now(), pad = (n) => String(n).padStart(2, '0'), D = new Date();
// a game joined from another computer gets its own suffix, so two that start in the same second keep separate logs (slice 10)
const SESSION = `${D.getFullYear()}-${pad(D.getMonth() + 1)}-${pad(D.getDate())}_${pad(D.getHours())}-${pad(D.getMinutes())}-${pad(D.getSeconds())}` + (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? '' : '_lan-' + Math.random().toString(36).slice(2, 6));
// (a game joined over the home network records into the host's playlogs/ too: slice 10)
let upload = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname) && (!navigator.webdriver || new URLSearchParams(location.search).get('rec') === '1'); // headless checks upload only with ?rec=1
const realFetch = window.fetch.bind(window);
let chain = Promise.resolve(); // uploads go one at a time, in order (the video is appended chunk by chunk)
function send(name, body, then) { if (upload) chain = chain.then(() => realFetch('/playlog/' + name, { method: 'POST', body })).then(r => { if (r && !r.ok) upload = false; else then?.(); }, () => { upload = false; }); }
const rec = { session: SESSION, started: D.toString(), ua: navigator.userAgent, url: location.href, samples: [], events: [] };
if (upload) realFetch('/version').then(r => r.json()).then(v => { rec.build = v; }, () => {}); // which branch and commit was played

// the outbox: this browser's copy of each log not yet known to have reached a recording server (the newest six)
// One key per play (iw2.playlog.out.<session>: { at: when it was kept, done: its window closed, j: the log }), so a game
// writes only its own: two tabs share the storage (a host and a joined game in one browser), and the newest six are kept
const store = (() => { try { return localStorage; } catch { return null; } })(), KEY = OUTBOX + '.' + SESSION;
const load = () => { const o = {}; if (store) for (let i = 0; i < store.length; i++) { const k = store.key(i);
  if (k?.startsWith(OUTBOX + '.')) try { o[k.slice(OUTBOX.length + 1)] = JSON.parse(store.getItem(k)); } catch { /* damaged: skipped */ } } return o; };
const drop = (s) => { try { store?.removeItem(OUTBOX + '.' + s); } catch { /* fine */ } };
try { store?.removeItem('iw2.playlog'); } catch { /* the old single copy (before 13d) */ }
function keep(done = false) { if (!store) return; const v = JSON.stringify({ at: Date.now(), done, j: JSON.stringify(rec) });
  for (let k = 0; k < 6; k++) { try { store.setItem(KEY, v); break; } catch { // full: the oldest other play goes first
    const old = Object.keys(load()).filter(s => s !== SESSION).sort()[0]; if (!old) break; drop(old); } }
  for (const s of Object.keys(load()).sort().slice(0, -6)) if (s !== SESSION) drop(s); }
// the earlier plays still waiting: sent now, each forgotten once the server has it (a plain server refuses: they wait on).
// Not one still being played in another tab (kept in the last minute, its window open): its own copy is newer
const waiting = Object.entries(load()).filter(([k, v]) => k !== SESSION && /^[A-Za-z0-9_-]{1,80}$/.test(k) && v?.j && (v.done || Date.now() - v.at > 60000)), gone = [];
for (const [k, v] of waiting) send(`${k}.json`, v.j, () => { gone.push(k); drop(k); });
if (upload && waiting.length) chain = chain.then(() => { logEvent('outbox', { sent: gone.length, of: waiting.length }); });

const now = () => +((Date.now() - t0) / 1000).toFixed(1);
// ponytail: the event list is capped; a 15-minute play stays far under it
const SNAP_ON = new Set(['mark', 'start', 'stuck', 'died', 'error', 'crate', 'crate-locked', 'in-solid', 'under-ground', 'out-of-world', 'stall']), hurtBy = new Set();
let snapWanted = null, snaps = 0;
// (the event's own type always wins over a data field of that name)
export function logEvent(type, data = {}) { if (rec.events.length >= 20000) return; const ev = { t: now(), ...data, type }; rec.events.push(ev);
  // a snapshot at the moments worth seeing: these events (the player's own troubles: a creature stuck out of sight is not
  // in the picture), and the first hit from each kind of attacker
  if (upload && ((SNAP_ON.has(type) && !data.quiet && (!data.who || data.who === 'player')) || (type === 'hurt' && !hurtBy.has(ev.by) && hurtBy.add(ev.by)))) snapWanted ||= ev; return ev; }
// called right after each render (the frame is only readable then): a 480 px JPEG of the queued moment
export function snapFrame(canvas) { if (!snapWanted || snaps >= 150 || !canvas.width || !canvas.height) return; /* a hidden window has a 0-size canvas */ const ev = snapWanted; snapWanted = null; ev.snap = `${SESSION}-${++snaps}.jpg`;
  const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * canvas.height / canvas.width); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  c.toBlob(b => b && send(ev.snap, b), 'image/jpeg', 0.75); }
// the game's video, from its start (20 fps at 0.5 Mbit/s asked; VP8 keeps closer to it than VP9 did: 97 MB in 5 minutes)
let video = null;
export function startVideo(canvas) { if (!upload || video || !window.MediaRecorder || !canvas.captureStream) return;
  const type = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)); if (!type) return;
  const name = `${SESSION}.${type.includes('mp4') ? 'mp4' : 'webm'}`; video = new MediaRecorder(canvas.captureStream(20), { mimeType: type, videoBitsPerSecond: 5e5 });
  video.ondataavailable = (e) => { if (e.data.size) send(name, e.data); }; video.start(5000); rec.video = name; }
addEventListener('pagehide', () => { video?.requestData(); keep(true); if (upload) navigator.sendBeacon(`/playlog/${SESSION}.json`, JSON.stringify(rec)); });

// ── watchers: what went wrong on the page ──
addEventListener('error', e => logEvent('error', { msg: String(e.message), at: `${e.filename}:${e.lineno}` }));
addEventListener('unhandledrejection', e => logEvent('error', { msg: String(e.reason) }));
let fails = 0; const failed = (url, why) => { if (++fails <= 40) logEvent('load-fail', { url: String(url).replace(location.origin, '').slice(0, 200), why: String(why).slice(0, 120) }); };
// a file that did not load: an image, script or style (their errors do not bubble, so they are caught on the way down), or
// a fetch that failed or was refused (Three.js loads models and textures by fetch); the log's own uploads and co-op's not
addEventListener('error', e => { const t = e.target; if (t && t !== window && (t.src || t.href)) failed(t.src || t.href, t.tagName?.toLowerCase() || 'element'); }, true);
window.fetch = (input, init) => { const url = String(input?.url ?? input), p = realFetch(input, init);
  if (!/^(blob|data):|\/(playlog|net)\//.test(url)) p.then(r => { if (!r.ok && r.status !== 304) failed(url, r.status); }, e => failed(url, e?.message || e)); return p; };
// anything the game or a library reports as an error on the console (a shader that did not compile, a texture refused)
const cerr = console.error.bind(console); let cerrs = 0;
console.error = (...a) => { if (++cerrs <= 40) logEvent('console-error', { msg: a.map(v => v instanceof Error ? v.message : String(v)).join(' ').slice(0, 300) }); cerr(...a); };
// a long frame: the game froze for half a second or more while its window was in front (main.js times every frame)
let shownAt = 0, lastP = null, longest = 0, stalls = 0; document.addEventListener('visibilitychange', () => { if (!document.hidden) shownAt = performance.now(); });
export function frameTime(ms, running) { if (running) longest = Math.max(longest, ms);
  // (the first 60 a game; a snapshot of the first five: a slow computer would fill the log with them)
  if (ms >= 500 && running && !document.hidden && performance.now() - shownAt > 2000 + ms && ++stalls <= 60) logEvent('stall', { ms: Math.round(ms), ...(stalls > 5 && { quiet: 1 }), ...(lastP && { x: lastP[0], z: lastP[1], biome: lastP[2] }) }); }

let acc = 0, saveAcc = 0, still = 0, lastPos = null, stuckLogged = false;
// state: { player, cam, biome, fps, enemies } once per frame; intent: a move key or stick is held
export function tickLog(dt, { player: p, cam, biome, fps, enemies }, intent) {
  // stuck: holding a move for 2 s while getting nowhere (logged once per stuck spell)
  if (lastPos) { const moved = Math.hypot(p.x - lastPos[0], p.z - lastPos[1]); still = intent && moved < dt * 0.4 ? still + dt : 0; }
  lastPos = [p.x, p.z]; lastP = [+p.x.toFixed(1), +p.z.toFixed(1), biome];
  if (still > 2 && !stuckLogged) { stuckLogged = true; logEvent('stuck', { x: +p.x.toFixed(1), z: +p.z.toFixed(1), biome }); } else if (still === 0) stuckLogged = false;
  acc += dt; saveAcc += dt; if (acc < 1) return; acc = 0;
  const near = enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 40);
  // lf: the longest frame of the last second, in ms (a hitch the frame rate hides)
  rec.samples.push({ t: now(), x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(1), hp: Math.round(p.hp), cam, biome, fps, lf: Math.round(longest),
    near: near.map(e => `${e.type}:${e.state}:${Math.round(Math.hypot(e.x - p.x, e.z - p.z))}m`) }); longest = 0;
  if (upload && rec.samples.length % 60 === 0) snapWanted ||= logEvent('look'); // a picture every minute for context
  if (saveAcc > 15) { saveAcc = 0; send(`${SESSION}.json`, JSON.stringify(rec)); keep(); } // (game time: slower than real only when frames are slow)
}
export function savePlayLog() { // (with the newest earlier play this browser still holds, as before 13d)
  const o = load(), prev = Object.keys(o).filter(k => k !== SESSION).sort().at(-1), was = prev && (() => { try { return JSON.parse(o[prev].j); } catch { return null; } })();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(was ? { ...rec, previous: was } : rec)], { type: 'application/json' }));
  a.download = `iw2-play-${SESSION}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export const recording = () => upload; // this game's log reaches a server (F9 then marks without a download)
// (for the checks)
export const playlogState = () => ({ session: SESSION, upload, outbox: Object.keys(load()), kinds: rec.events.reduce((s, e) => { s[e.type] = (s[e.type] || 0) + 1; return s; }, {}) });
