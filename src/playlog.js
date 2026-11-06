// Play log, for troubleshooting a real session: once a second where the player is and what is around them, plus every
// event (hits taken and given, deaths, crates, getting stuck, page errors). F9 saves it as a JSON file; it is also kept in
// localStorage every 30 s, so a crashed tab's log survives to the next load (F9 then saves that one too).
// Served by scripts/serve.py on this machine, it records on its own: the log every 15 s, a small snapshot at each key moment
// and every minute, and a video of the game from its start, all into code/playlogs/ (a plain server just refuses the uploads).
const KEY = 'iw2.playlog', t0 = Date.now(), pad = (n) => String(n).padStart(2, '0'), D = new Date();
// a game joined from another computer gets its own suffix, so two that start in the same second keep separate logs (slice 10)
const SESSION = `${D.getFullYear()}-${pad(D.getMonth() + 1)}-${pad(D.getDate())}_${pad(D.getHours())}-${pad(D.getMinutes())}-${pad(D.getSeconds())}` + (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? '' : '_lan-' + Math.random().toString(36).slice(2, 6));
// (a game joined over the home network records into the host's playlogs/ too: slice 10)
let upload = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname) && (!navigator.webdriver || new URLSearchParams(location.search).get('rec') === '1'); // headless checks upload only with ?rec=1
let chain = Promise.resolve(); // uploads go one at a time, in order (the video is appended chunk by chunk)
function send(name, body) { if (upload) chain = chain.then(() => fetch('/playlog/' + name, { method: 'POST', body })).then(r => { if (r && !r.ok) upload = false; }, () => { upload = false; }); }
const rec = { session: SESSION, started: D.toString(), ua: navigator.userAgent, url: location.href, samples: [], events: [] };
if (upload) fetch('/version').then(r => r.json()).then(v => { rec.build = v; }, () => {}); // which branch and commit was played
let prev = null; try { prev = JSON.parse(localStorage.getItem(KEY)); } catch { /* none, or no storage */ }
const now = () => +((Date.now() - t0) / 1000).toFixed(1);
// ponytail: the event list is capped; a 15-minute play stays far under it
const SNAP_ON = new Set(['mark', 'start', 'stuck', 'died', 'error', 'crate', 'crate-locked']), hurtBy = new Set();
let snapWanted = null, snaps = 0;
// (the event's own type always wins over a data field of that name)
export function logEvent(type, data = {}) { if (rec.events.length >= 20000) return; const ev = { t: now(), ...data, type }; rec.events.push(ev);
  // a snapshot at the moments worth seeing: these events, and the first hit from each kind of attacker
  if (upload && (SNAP_ON.has(type) || (type === 'hurt' && !hurtBy.has(ev.by) && hurtBy.add(ev.by)))) snapWanted ||= ev; return ev; }
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
addEventListener('pagehide', () => { video?.requestData(); if (upload) navigator.sendBeacon(`/playlog/${SESSION}.json`, JSON.stringify(rec)); });
addEventListener('error', e => logEvent('error', { msg: String(e.message), at: `${e.filename}:${e.lineno}` }));
addEventListener('unhandledrejection', e => logEvent('error', { msg: String(e.reason) }));

let acc = 0, saveAcc = 0, still = 0, lastPos = null, stuckLogged = false;
// state: { player, cam, biome, fps, enemies } once per frame; intent: a move key or stick is held
export function tickLog(dt, { player: p, cam, biome, fps, enemies }, intent) {
  // stuck: holding a move for 2 s while getting nowhere (logged once per stuck spell)
  if (lastPos) { const moved = Math.hypot(p.x - lastPos[0], p.z - lastPos[1]); still = intent && moved < dt * 0.4 ? still + dt : 0; }
  lastPos = [p.x, p.z];
  if (still > 2 && !stuckLogged) { stuckLogged = true; logEvent('stuck', { x: +p.x.toFixed(1), z: +p.z.toFixed(1), biome }); } else if (still === 0) stuckLogged = false;
  acc += dt; saveAcc += dt; if (acc < 1) return; acc = 0;
  const near = enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 40);
  rec.samples.push({ t: now(), x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: +p.y.toFixed(1), hp: Math.round(p.hp), cam, biome, fps,
    near: near.map(e => `${e.type}:${e.state}:${Math.round(Math.hypot(e.x - p.x, e.z - p.z))}m`) });
  if (upload && rec.samples.length % 60 === 0) snapWanted ||= logEvent('look'); // a picture every minute for context
  if (saveAcc > 15) { saveAcc = 0; const j = JSON.stringify(rec); send(`${SESSION}.json`, j); try { localStorage.setItem(KEY, j); } catch { /* full or blocked: F9 still works */ } }
}
export function savePlayLog() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(prev ? { ...rec, previous: prev } : rec)], { type: 'application/json' }));
  a.download = `iw2-play-${SESSION}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
