// LAN co-op transport (slice 10). Every game playing together talks through the host machine's scripts/serve.py, which
// only relays: messages come down one Server-Sent Events stream and go up as small JSON batches, one post at a time so
// they arrive in order. The page the host's own browser loads (localhost) hosts; a page loaded from another machine's
// address (or with ?join, for the checks) joins. Under a plain file server there is no /net/info, so nothing here runs.
import { params, netInfo, SEED_TEXT } from './config.js';
import { logEvent } from './playlog.js';

export const net = { role: null, id: Math.random().toString(36).slice(2, 10), host: null, info: null, stream: 'none', fails: 0 };
// what the play log says about the link (the gate of slice 12: a joined game that never got in left no trace of why)
let netLogs = 0; const netLog = (type, data) => { if (netLogs++ < 40) logEvent(type, data); };
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname), out = new Map(); let busy = false, handler = () => {};
// (config.js asks /net/info, before the world is built: a joining game needs the host's seed first, slice 13c)
// the host's stream carries its world's seed, which the server hands every game that joins (slice 13c)
export const netReady = netInfo.then(info => { if (!info) return; net.info = info; net.role = local && !params.has('join') ? 'host' : 'join';
  const es = new EventSource(`/net/listen?id=${net.id}&role=${net.role}${net.role === 'host' ? '&seed=' + encodeURIComponent(SEED_TEXT) : ''}`);
  es.onopen = () => { net.stream = 'open'; netLog('net-open', { ms: Math.round(performance.now()) }); };
  es.onerror = () => { net.stream = ['connecting', 'open', 'closed'][es.readyState] === 'open' ? 'error' : ['connecting', 'open', 'closed'][es.readyState]; netLog('net-error', { state: net.stream }); };
  es.onmessage = (e) => { const b = JSON.parse(e.data); for (const m of b.m) handler(m, b.from); }; });
export function onMessage(fn) { handler = fn; }
// to: 'all', 'host' or a game's id; batched until flush() (call it every frame: a post waits for the last one)
export function send(to, msg) { if (!net.role) return; let l = out.get(to); if (!l) out.set(to, l = []); l.push(msg); }
export function flush() { if (busy || !out.size) return; const jobs = [...out]; out.clear(); busy = true;
  // (a post that never settles used to hold every later one back for good: each now gives up after 4 s)
  // A post that never reached the server goes again with the next (one-off messages, such as a build or a tear, would be
  // lost); the newest player and world states replace theirs anyway. A timed-out post may have arrived, so it is not resent.
  const fail = (to, why, l) => { net.fails++; netLog('net-send-fail', { to, why }); if (why === 'TypeError') { const keep = l.filter(m => m.t !== 'p' && m.t !== 'w'); if (keep.length) { const q = out.get(to) || []; out.set(to, [...keep, ...q]); } } };
  Promise.all(jobs.map(([to, l]) => fetch(`/net/send?id=${net.id}&to=${to}`, { method: 'POST', body: JSON.stringify(l), signal: AbortSignal.timeout?.(4000) })
    .then(r => { if (!r.ok) fail(to, 'HTTP ' + r.status, l); }, e => fail(to, String(e?.name || e), l)))).then(() => { busy = false; }); }
