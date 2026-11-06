// Sound, all synthesised with Web Audio (no audio files): weapon swings and shots, hits, creature voices, pickups,
// the player's hurt grunt, and a quiet wind bed. The context starts on the first key or click (browsers require a
// gesture); M mutes. sfx(name, at) places a sound in the world: distance lowers it, the angle pans it.
let ctx = null, master = null, noiseBuf = null, windGain = null, muted = false, listener = { x: 0, z: 0, yaw: 0 };
try { muted = localStorage.getItem('iw2.mute') === '1'; } catch { /* storage blocked */ }
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // wind: looped noise through a slowly wandering band-pass
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
  windGain = ctx.createGain(); windGain.gain.value = 0.05; src.connect(bp); bp.connect(windGain); windGain.connect(master); src.start();
}
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; try { localStorage.setItem('iw2.mute', muted ? '1' : '0'); } catch { /* fine */ } if (master) master.gain.value = muted ? 0 : 0.7; return muted; }
export function setListener(x, z, yaw) { listener = { x, z, yaw }; }

// ── building blocks ──
function out(at, vol = 1) { const g = ctx.createGain(); let v = vol, pan = 0;
  if (at) { const dx = at.x - listener.x, dz = at.z - listener.z, d = Math.hypot(dx, dz); v *= 1 / (1 + d / 7); if (d > 60) return null;
    const right = [Math.cos(listener.yaw), -Math.sin(listener.yaw)]; pan = Math.max(-0.8, Math.min(0.8, (dx * right[0] + dz * right[1]) / (d + 1))); }
  g.gain.value = v; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master); return g; }
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(dest, t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.8, a = 0.005 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = ctx.createGain(); env(g, t, a, peak, dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + a + dur + 0.05); }
function tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = f0, peak = 0.5, a = 0.005 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dur + 0.05); }
// a growl: a low sawtooth with a wobbling filter and noise breath
function growl(dest, t, dur, pitch, rough = 1) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(pitch, t); o.frequency.linearRampToValueAtTime(pitch * 0.8, t + dur);
  const am = ctx.createOscillator(); am.frequency.value = 22 + Math.random() * 10; const amg = ctx.createGain(); amg.gain.value = pitch * 0.25 * rough; am.connect(amg); amg.connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = pitch * 6; f.Q.value = 4; const g = ctx.createGain(); env(g, t, 0.06, 0.35, dur);
  o.connect(f); f.connect(g); g.connect(dest); o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1); noise(dest, t, dur * 0.8, { f0: pitch * 8, q: 0.8, peak: 0.25, a: 0.05 }); }

const VOICE = {
  wolf: (d, t) => growl(d, t, 0.6, 90), dust_hound: (d, t) => { growl(d, t, 0.35, 140); tone(d, t + 0.1, 0.15, { type: 'triangle', f0: 700, f1: 500, peak: 0.12 }); },
  bear: (d, t) => growl(d, t, 1.0, 55, 1.4), rat: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.07, 0.05, { f0: 2800 + Math.random() * 800, f1: 3600, peak: 0.12 }); },
  ice_crawler: (d, t) => { for (let i = 0; i < 6; i++) noise(d, t + i * 0.035, 0.03, { type: 'highpass', f0: 3000, q: 1, peak: 0.35 }); noise(d, t, 0.4, { f0: 5000, f1: 2500, q: 2, peak: 0.12, a: 0.05 }); },
  bog_lurker: (d, t) => { tone(d, t, 0.3, { type: 'square', f0: 70, f1: 50, peak: 0.18 }); tone(d, t + 0.18, 0.35, { type: 'square', f0: 65, f1: 45, peak: 0.15 }); },
};
const SFX = {
  rally: (d, t) => { tone(d, t, 0.5, { type: 'square', f0: 330, f1: 520, peak: 0.25 }); tone(d, t + 0.1, 0.5, { type: 'square', f0: 440, f1: 660, peak: 0.2 }); },
  charm: (d, t) => { tone(d, t, 0.25, { f0: 880, f1: 1320, peak: 0.3 }); tone(d, t + 0.12, 0.3, { f0: 1320, f1: 1760, peak: 0.2 }); },
  deploy: (d, t) => { tone(d, t, 0.12, { type: 'square', f0: 500, peak: 0.2 }); tone(d, t + 0.1, 0.1, { type: 'triangle', f0: 700, peak: 0.2 }); },
  swing: (d, t) => noise(d, t, 0.22, { f0: 600, f1: 2400, q: 1.5, peak: 0.5, a: 0.04 }),
  heavy: (d, t) => noise(d, t, 0.3, { f0: 300, f1: 1400, q: 1.2, peak: 0.6, a: 0.05 }),
  shot: (d, t) => { noise(d, t, 0.18, { type: 'lowpass', f0: 6000, f1: 300, q: 0.5, peak: 1.2, a: 0.001 }); tone(d, t, 0.15, { f0: 120, f1: 40, peak: 0.8 }); noise(d, t + 0.05, 0.5, { f0: 800, f1: 200, q: 0.4, peak: 0.12, a: 0.02 }); },
  bow: (d, t) => { tone(d, t, 0.25, { type: 'triangle', f0: 180, f1: 150, peak: 0.35, a: 0.001 }); noise(d, t, 0.15, { f0: 2000, f1: 4000, q: 2, peak: 0.25, a: 0.02 }); },
  toss: (d, t) => noise(d, t, 0.25, { f0: 900, f1: 1800, q: 1.2, peak: 0.3, a: 0.05 }),
  hit: (d, t) => { tone(d, t, 0.12, { f0: 160, f1: 60, peak: 0.9 }); noise(d, t, 0.08, { type: 'lowpass', f0: 2500, f1: 400, peak: 0.7 }); },
  hitHard: (d, t) => { tone(d, t, 0.16, { f0: 110, f1: 45, peak: 1 }); noise(d, t, 0.12, { type: 'lowpass', f0: 3000, f1: 300, peak: 0.9 }); },
  chitin: (d, t) => { noise(d, t, 0.06, { type: 'highpass', f0: 2500, peak: 0.9 }); tone(d, t, 0.08, { type: 'square', f0: 900, f1: 500, peak: 0.12 }); },
  hurt: (d, t) => { growl(d, t, 0.25, 130, 0.3); tone(d, t, 0.18, { f0: 90, f1: 50, peak: 0.6 }); },
  pickup: (d, t) => { tone(d, t, 0.12, { type: 'triangle', f0: 660, peak: 0.25 }); tone(d, t + 0.08, 0.2, { type: 'triangle', f0: 990, peak: 0.25 }); },
  splash: (d, t) => { noise(d, t, 0.5, { type: 'lowpass', f0: 2500, f1: 300, peak: 0.7, a: 0.01 }); noise(d, t + 0.1, 0.6, { f0: 1200, f1: 600, q: 1, peak: 0.2, a: 0.05 }); },
  lurk: (d, t) => { growl(d, t, 1.8, 34, 1.8); growl(d, t + 0.5, 1.4, 28, 2); }, // something big, under the water
  thud: (d, t) => tone(d, t, 0.3, { f0: 70, f1: 35, peak: 0.7 }),
  // slice 13: the lake serpent's jaws closing, and its bubbles rising
  snap: (d, t) => { noise(d, t, 0.09, { type: 'lowpass', f0: 3000, f1: 300, peak: 1.1, a: 0.002 }); tone(d, t, 0.2, { f0: 90, f1: 40, peak: 0.9 }); growl(d, t + 0.05, 0.7, 42, 2); },
  night: (d, t) => { tone(d, t, 1.6, { type: 'triangle', f0: 110, f1: 98, peak: 0.3, a: 0.2 }); tone(d, t, 1.8, { f0: 82, f1: 73, peak: 0.25, a: 0.3 }); }, // a low horn at nightfall (IW1)
  dawn: (d, t) => { tone(d, t, 0.9, { type: 'triangle', f0: 520, peak: 0.14, a: 0.1 }); tone(d, t + 0.25, 1.0, { f0: 780, peak: 0.12, a: 0.1 }); }, // a rising chime at dawn (IW1)
  bubble: (d, t) => { for (let i = 0; i < 4; i++) tone(d, t + i * 0.07 + Math.random() * 0.04, 0.06, { f0: 300 + Math.random() * 300, f1: 900 + Math.random() * 500, peak: 0.12 }); },
  // slice 11: an axe biting wood, a tree's creak as it goes, the crash of its fall, hammering at the bench, an arrow striking
  eat: (d, t) => { for (let i = 0; i < 3; i++) noise(d, t + i * 0.08, 0.05, { f0: 2600 - i * 400, f1: 1200, q: 1.4, peak: 0.3 }); }, // a bite (slice 12)
  chop: (d, t) => { tone(d, t, 0.09, { type: 'triangle', f0: 240, f1: 120, peak: 0.6 }); noise(d, t, 0.07, { f0: 1100, f1: 600, q: 2.5, peak: 0.7 }); noise(d, t + 0.02, 0.18, { type: 'lowpass', f0: 900, f1: 200, peak: 0.25, a: 0.01 }); },
  creak: (d, t) => { const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(70, t + 0.6); o.frequency.linearRampToValueAtTime(38, t + 1.3);
    f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 3; env(g, t, 0.15, 0.3, 1.2); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 1.5); },
  crash: (d, t) => { noise(d, t, 1.1, { type: 'lowpass', f0: 1800, f1: 120, peak: 1.0, a: 0.01 }); tone(d, t, 0.5, { f0: 60, f1: 28, peak: 0.9 }); for (let i = 0; i < 5; i++) noise(d, t + 0.05 + i * 0.07, 0.08, { f0: 2400 - i * 250, q: 3, peak: 0.25 }); },
  craft: (d, t) => { for (let i = 0; i < 3; i++) { tone(d, t + i * 0.16, 0.08, { type: 'square', f0: 420 - i * 30, f1: 260, peak: 0.12 }); noise(d, t + i * 0.16, 0.06, { f0: 2600, q: 4, peak: 0.35 }); } tone(d, t + 0.52, 0.35, { type: 'triangle', f0: 660, f1: 990, peak: 0.18 }); },
  sleep: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.32, 0.5, { f0: 523 * [1, 0.84, 0.67][i], peak: 0.12, a: 0.06 }); },
  thunk: (d, t) => { tone(d, t, 0.06, { type: 'triangle', f0: 320, f1: 140, peak: 0.45 }); noise(d, t, 0.05, { f0: 1500, q: 2, peak: 0.35 }); },
  salvage: (d, t) => { for (let i = 0; i < 4; i++) { noise(d, t + i * 0.09, 0.07, { f0: 1800 + i * 300, q: 6, peak: 0.4 }); tone(d, t + i * 0.09, 0.1, { type: 'square', f0: 300 + i * 40, peak: 0.05 }); } },
};
export function sfx(name, at, vol = 1) { if (!ctx || muted) return; const d = out(at, vol); if (!d) return; const t = ctx.currentTime + 0.005; (SFX[name] || VOICE[name])?.(d, t); }
export function windLevel(v) { if (windGain) windGain.gain.setTargetAtTime(v, ctx.currentTime, 0.5); }

// ── The land's own sounds (slice 13), now and then round the listener: birds by day in the green places, frogs in the
// Bog, crickets and an owl at night, and far off at night a wolf's howl (never inside the safe valley) ──
const AMB = {
  bird: { when: (b, n) => n < 0.4 && ['grass', 'ruins', 'fungal'].includes(b), gap: [3, 9], vol: 0.18, play: (d, t) => { const f = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(d, t + i * 0.11, 0.08, { f0: f * (1 + i * 0.04), f1: f * 1.3, peak: 0.2 }); } },
  frog: { when: (b) => b === 'swamp', gap: [0.8, 3], vol: 0.25, play: (d, t) => { for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(d, t + i * 0.16, 0.09, { type: 'square', f0: 130 + Math.random() * 30, f1: 95, peak: 0.12 }); } },
  cricket: { when: (b, n) => n > 0.5 && b !== 'tundra', gap: [0.4, 1.6], vol: 0.07, play: (d, t) => { const f = 4200 + Math.random() * 600; for (let i = 0; i < 3; i++) tone(d, t + i * 0.045, 0.03, { f0: f, peak: 0.25 }); } },
  owl: { when: (b, n) => n > 0.6 && ['grass', 'tundra', 'ruins'].includes(b), gap: [22, 50], vol: 0.3, play: (d, t) => { tone(d, t, 0.35, { f0: 390, f1: 360, peak: 0.3, a: 0.05 }); tone(d, t + 0.55, 0.7, { f0: 370, f1: 330, peak: 0.28, a: 0.06 }); } },
  howl: { when: (b, n, safe) => n > 0.6 && !safe, gap: [35, 80], vol: 0.25, play: (d, t) => { const o = ctx.createOscillator(), g = ctx.createGain(), v = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(640, t + 0.6); o.frequency.linearRampToValueAtTime(560, t + 2.0); o.frequency.linearRampToValueAtTime(420, t + 2.6);
    v.frequency.value = 5.5; vg.gain.value = 9; v.connect(vg); vg.connect(o.frequency); env(g, t, 0.4, 0.22, 2.3); o.connect(g); g.connect(d); o.start(t); v.start(t); o.stop(t + 2.9); v.stop(t + 2.9); } } };
const ambT = {};
export function ambient(dt, biome, night, safe) { if (!ctx || muted) return;
  for (const [k, a] of Object.entries(AMB)) { if (!a.when(biome, night, safe)) { ambT[k] = Math.max(ambT[k] || 0, a.gap[0]); continue; }
    if ((ambT[k] = (ambT[k] ?? a.gap[0]) - dt) > 0) continue; ambT[k] = a.gap[0] + Math.random() * (a.gap[1] - a.gap[0]);
    const r = k === 'howl' ? 55 : 8 + Math.random() * 16, ang = Math.random() * 6.28, d = out({ x: listener.x + Math.cos(ang) * Math.min(r, 50), z: listener.z + Math.sin(ang) * Math.min(r, 50) }, a.vol * (k === 'howl' ? 6 : 1)); if (d) a.play(d, ctx.currentTime + 0.01); } }
