// Sound, all synthesised with Web Audio (no audio files): weapon swings and shots, hits, creature voices, pickups,
// the player's hurt grunt, and a quiet wind bed. The context starts on the first key or click (browsers require a
// gesture); M mutes. sfx(name, at) places a sound in the world: distance lowers it, the angle pans it.
let ctx = null,
  master = null,
  noiseBuf = null,
  windGain = null,
  riverGain = null,
  muted = false,
  listener = { x: 0, z: 0, yaw: 0 };
try {
  muted = localStorage.getItem('iw2.mute') === '1';
} catch {
  /* storage blocked */
}
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // wind: looped noise through a slowly wandering band-pass
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 400;
  bp.Q.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lg = ctx.createGain();
  lg.gain.value = 250;
  lfo.connect(lg);
  lg.connect(bp.frequency);
  lfo.start();
  windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  src.connect(bp);
  bp.connect(windGain);
  windGain.connect(master);
  src.start();
  // slice 31: the river's soft rush, looped noise low-passed and a little hollow, louder the nearer the running water (riverLevel)
  const rs = ctx.createBufferSource();
  rs.buffer = noiseBuf;
  rs.loop = true;
  rs.playbackRate.value = 0.63;
  const rl = ctx.createBiquadFilter();
  rl.type = 'lowpass';
  rl.frequency.value = 1100;
  rl.Q.value = 0.3;
  const rp = ctx.createBiquadFilter();
  rp.type = 'peaking';
  rp.frequency.value = 380;
  rp.gain.value = 5;
  riverGain = ctx.createGain();
  riverGain.gain.value = 0;
  rs.connect(rl);
  rl.connect(rp);
  rp.connect(riverGain);
  riverGain.connect(master);
  rs.start();
  startMusic();
}
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('iw2.mute', muted ? '1' : '0');
  } catch {
    /* fine */
  }
  if (master) master.gain.value = muted ? 0 : 0.7;
  return muted;
}
export function setListener(x, z, yaw) {
  listener = { x, z, yaw };
}

// ── building blocks ──
// where a sound sits left to right for the listener (-0.8 left, 0.8 right)
export function panOf(at) {
  const dx = at.x - listener.x,
    dz = at.z - listener.z,
    d = Math.hypot(dx, dz),
    right = [Math.cos(listener.yaw), -Math.sin(listener.yaw)];
  return Math.max(-0.8, Math.min(0.8, (dx * right[0] + dz * right[1]) / (d + 1)));
}
// (reach: how far it carries, the distance at which it is half as loud; max: past it, silence. A wolf's call carries further
// than its growl: the follow-ups to #66, "wolves that seem silent")
function out(at, vol = 1, reach = 7, max = 60) {
  const g = ctx.createGain();
  let v = vol,
    pan = 0;
  if (at) {
    const d = Math.hypot(at.x - listener.x, at.z - listener.z);
    v *= 1 / (1 + d / reach);
    if (d > max) return null;
    pan = panOf(at);
  }
  g.gain.value = v;
  if (cave && echo) g.connect(echo); // (#8: in a cave every sound comes back off the rock)
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(master);
  } else g.connect(master);
  return g;
}
function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(dest, t, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.8, a = 0.005 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, a, peak, dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(t, Math.random());
  s.stop(t + a + dur + 0.05);
}
function tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = f0, peak = 0.5, a = 0.005 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, a, peak, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + a + dur + 0.05);
}
// a growl: a low sawtooth with a wobbling filter and noise breath
function growl(dest, t, dur, pitch, rough = 1) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(pitch, t);
  o.frequency.linearRampToValueAtTime(pitch * 0.8, t + dur);
  const am = ctx.createOscillator();
  am.frequency.value = 22 + Math.random() * 10;
  const amg = ctx.createGain();
  amg.gain.value = pitch * 0.25 * rough;
  am.connect(amg);
  amg.connect(o.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = pitch * 6;
  f.Q.value = 4;
  const g = ctx.createGain();
  env(g, t, 0.06, 0.35, dur);
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(t);
  am.start(t);
  o.stop(t + dur + 0.1);
  am.stop(t + dur + 0.1);
  noise(dest, t, dur * 0.8, { f0: pitch * 8, q: 0.8, peak: 0.25, a: 0.05 });
}

const VOICE = {
  wolf: (d, t) => growl(d, t, 0.6, 90),
  dust_hound: (d, t) => {
    growl(d, t, 0.35, 140);
    tone(d, t + 0.1, 0.15, { type: 'triangle', f0: 700, f1: 500, peak: 0.12 });
  },
  bear: (d, t) => growl(d, t, 0.85 + Math.random() * 0.3, 55 * (0.88 + Math.random() * 0.24), 1.4),
  rat: (d, t) => {
    for (let i = 0; i < 3; i++) tone(d, t + i * 0.07, 0.05, { f0: 2800 + Math.random() * 800, f1: 3600, peak: 0.12 });
  }, // (each roar its own pitch and length: several bears at once)
  ice_crawler: (d, t) => {
    for (let i = 0; i < 6; i++) noise(d, t + i * 0.035, 0.03, { type: 'highpass', f0: 3000, q: 1, peak: 0.35 });
    noise(d, t, 0.4, { f0: 5000, f1: 2500, q: 2, peak: 0.12, a: 0.05 });
  },
  // slice 22: a giant spider's dry chitter (fangs clicking) over a breathy hiss; its nest tears with a wet rip
  spider: (d, t) => {
    for (let i = 0; i < 9; i++)
      noise(d, t + i * 0.028 + Math.random() * 0.01, 0.02, {
        type: 'bandpass',
        f0: 1800 + Math.random() * 900,
        q: 6,
        peak: 0.45,
      });
    noise(d, t + 0.05, 0.55, { type: 'highpass', f0: 3800, f1: 2600, q: 0.7, peak: 0.22, a: 0.08 });
  },
  spider_nest: (d, t) => {
    noise(d, t, 0.5, { type: 'lowpass', f0: 1400, f1: 200, q: 1, peak: 0.6, a: 0.02 });
    for (let i = 0; i < 5; i++) noise(d, t + i * 0.06, 0.05, { f0: 3000 - i * 300, q: 3, peak: 0.25 });
  },
  bog_lurker: (d, t) => {
    tone(d, t, 0.3, { type: 'square', f0: 70, f1: 50, peak: 0.18 });
    tone(d, t + 0.18, 0.35, { type: 'square', f0: 65, f1: 45, peak: 0.15 });
  },
};
const SFX = {
  rally: (d, t) => {
    tone(d, t, 0.5, { type: 'square', f0: 330, f1: 520, peak: 0.25 });
    tone(d, t + 0.1, 0.5, { type: 'square', f0: 440, f1: 660, peak: 0.2 });
  },
  charm: (d, t) => {
    tone(d, t, 0.25, { f0: 880, f1: 1320, peak: 0.3 });
    tone(d, t + 0.12, 0.3, { f0: 1320, f1: 1760, peak: 0.2 });
  },
  deploy: (d, t) => {
    tone(d, t, 0.12, { type: 'square', f0: 500, peak: 0.2 });
    tone(d, t + 0.1, 0.1, { type: 'triangle', f0: 700, peak: 0.2 });
  },
  swing: (d, t) => noise(d, t, 0.22, { f0: 600, f1: 2400, q: 1.5, peak: 0.5, a: 0.04 }),
  heavy: (d, t) => noise(d, t, 0.3, { f0: 300, f1: 1400, q: 1.2, peak: 0.6, a: 0.05 }),
  shot: (d, t) => {
    noise(d, t, 0.18, { type: 'lowpass', f0: 6000, f1: 300, q: 0.5, peak: 1.2, a: 0.001 });
    tone(d, t, 0.15, { f0: 120, f1: 40, peak: 0.8 });
    noise(d, t + 0.05, 0.5, { f0: 800, f1: 200, q: 0.4, peak: 0.12, a: 0.02 });
  },
  bow: (d, t) => {
    tone(d, t, 0.25, { type: 'triangle', f0: 180, f1: 150, peak: 0.35, a: 0.001 });
    noise(d, t, 0.15, { f0: 2000, f1: 4000, q: 2, peak: 0.25, a: 0.02 });
  },
  toss: (d, t) => noise(d, t, 0.25, { f0: 900, f1: 1800, q: 1.2, peak: 0.3, a: 0.05 }),
  hit: (d, t) => {
    tone(d, t, 0.12, { f0: 160, f1: 60, peak: 0.9 });
    noise(d, t, 0.08, { type: 'lowpass', f0: 2500, f1: 400, peak: 0.7 });
  },
  hitHard: (d, t) => {
    tone(d, t, 0.16, { f0: 110, f1: 45, peak: 1 });
    noise(d, t, 0.12, { type: 'lowpass', f0: 3000, f1: 300, peak: 0.9 });
  },
  chitin: (d, t) => {
    noise(d, t, 0.06, { type: 'highpass', f0: 2500, peak: 0.9 });
    tone(d, t, 0.08, { type: 'square', f0: 900, f1: 500, peak: 0.12 });
  },
  hurt: (d, t) => {
    growl(d, t, 0.25, 130, 0.3);
    tone(d, t, 0.18, { f0: 90, f1: 50, peak: 0.6 });
  },
  pickup: (d, t) => {
    tone(d, t, 0.12, { type: 'triangle', f0: 660, peak: 0.25 });
    tone(d, t + 0.08, 0.2, { type: 'triangle', f0: 990, peak: 0.25 });
  },
  splash: (d, t) => {
    noise(d, t, 0.5, { type: 'lowpass', f0: 2500, f1: 300, peak: 0.7, a: 0.01 });
    noise(d, t + 0.1, 0.6, { f0: 1200, f1: 600, q: 1, peak: 0.2, a: 0.05 });
  },
  lurk: (d, t) => {
    growl(d, t, 1.8, 34, 1.8);
    growl(d, t + 0.5, 1.4, 28, 2);
  }, // something big, under the water
  // slice 22: a spider coming down its thread (a silk zip, then a hiss), and the sticky crackle of walking into a web
  spiderdrop: (d, t) => {
    noise(d, t, 0.6, { type: 'bandpass', f0: 5200, f1: 1800, q: 4, peak: 0.35, a: 0.01 });
    noise(d, t + 0.55, 0.7, { type: 'highpass', f0: 4200, f1: 2400, q: 0.6, peak: 0.5, a: 0.04 });
    for (let i = 0; i < 6; i++) noise(d, t + 0.6 + i * 0.03, 0.02, { f0: 2200, q: 8, peak: 0.3 });
  },
  hiss: (d, t) => {
    noise(d, t, 0.85, { type: 'highpass', f0: 5200, f1: 3400, q: 0.8, peak: 0.4, a: 0.12 });
    noise(d, t + 0.1, 0.6, { type: 'bandpass', f0: 2600, f1: 1900, q: 3, peak: 0.15, a: 0.1 });
  }, // #66: a pale spider about to spit
  web: (d, t) => {
    for (let i = 0; i < 7; i++)
      noise(d, t + i * 0.035 + Math.random() * 0.02, 0.03, {
        type: 'highpass',
        f0: 3500 + Math.random() * 2000,
        q: 1,
        peak: 0.25,
      });
  },
  thud: (d, t) => tone(d, t, 0.3, { f0: 70, f1: 35, peak: 0.7 }),
  // slice 13: the lake serpent's jaws closing, and its bubbles rising
  snap: (d, t) => {
    noise(d, t, 0.09, { type: 'lowpass', f0: 3000, f1: 300, peak: 1.1, a: 0.002 });
    tone(d, t, 0.2, { f0: 90, f1: 40, peak: 0.9 });
    growl(d, t + 0.05, 0.7, 42, 2);
  },
  night: (d, t) => {
    tone(d, t, 1.6, { type: 'triangle', f0: 110, f1: 98, peak: 0.3, a: 0.2 });
    tone(d, t, 1.8, { f0: 82, f1: 73, peak: 0.25, a: 0.3 });
  }, // a low horn at nightfall (IW1)
  dawn: (d, t) => {
    tone(d, t, 0.9, { type: 'triangle', f0: 520, peak: 0.14, a: 0.1 });
    tone(d, t + 0.25, 1.0, { f0: 780, peak: 0.12, a: 0.1 });
  }, // a rising chime at dawn (IW1)
  bubble: (d, t) => {
    for (let i = 0; i < 4; i++)
      tone(d, t + i * 0.07 + Math.random() * 0.04, 0.06, {
        f0: 300 + Math.random() * 300,
        f1: 900 + Math.random() * 500,
        peak: 0.12,
      });
  },
  // slice 11: an axe biting wood, a tree's creak as it goes, the crash of its fall, hammering at the bench, an arrow striking
  eat: (d, t) => {
    for (let i = 0; i < 3; i++) noise(d, t + i * 0.08, 0.05, { f0: 2600 - i * 400, f1: 1200, q: 1.4, peak: 0.3 });
  }, // a bite (slice 12)
  chop: (d, t) => {
    tone(d, t, 0.09, { type: 'triangle', f0: 240, f1: 120, peak: 0.6 });
    noise(d, t, 0.07, { f0: 1100, f1: 600, q: 2.5, peak: 0.7 });
    noise(d, t + 0.02, 0.18, { type: 'lowpass', f0: 900, f1: 200, peak: 0.25, a: 0.01 });
  },
  // #8, the caves' own: a drop of water into a pool, and its smaller echo-drop; trickling grit; a deep rumble in the rock; the cave's slow breath
  drip: (d, t) => {
    const f = 1500 + Math.random() * 1100;
    tone(d, t, 0.07, { f0: f, f1: f * 0.45, peak: 0.3 });
    tone(d, t + 0.1 + Math.random() * 0.08, 0.05, { f0: f * 1.25, f1: f * 0.6, peak: 0.1 });
  },
  grit: (d, t) => {
    for (let i = 0; i < 7 + Math.floor(Math.random() * 6); i++)
      noise(d, t + i * 0.05 + Math.random() * 0.05, 0.025, {
        type: 'highpass',
        f0: 2500 + Math.random() * 2500,
        q: 1,
        peak: 0.25,
      });
  },
  rumble: (d, t) => {
    noise(d, t, 2.2, { type: 'lowpass', f0: 140, f1: 50, q: 1, peak: 1.1, a: 0.4 });
    tone(d, t, 1.8, { f0: 42, f1: 30, peak: 0.5, a: 0.3 });
  },
  hum: (d, t) =>
    noise(d, t, 3.2, { type: 'bandpass', f0: 180 + Math.random() * 120, f1: 140, q: 3, peak: 0.12, a: 1.2 }),
  creak: (d, t) => {
    const o = ctx.createOscillator(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(48, t);
    o.frequency.linearRampToValueAtTime(70, t + 0.6);
    o.frequency.linearRampToValueAtTime(38, t + 1.3);
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 3;
    env(g, t, 0.15, 0.3, 1.2);
    o.connect(f);
    f.connect(g);
    g.connect(d);
    o.start(t);
    o.stop(t + 1.5);
  },
  crash: (d, t) => {
    noise(d, t, 1.1, { type: 'lowpass', f0: 1800, f1: 120, peak: 1.0, a: 0.01 });
    tone(d, t, 0.5, { f0: 60, f1: 28, peak: 0.9 });
    for (let i = 0; i < 5; i++) noise(d, t + 0.05 + i * 0.07, 0.08, { f0: 2400 - i * 250, q: 3, peak: 0.25 });
  },
  craft: (d, t) => {
    for (let i = 0; i < 3; i++) {
      tone(d, t + i * 0.16, 0.08, { type: 'square', f0: 420 - i * 30, f1: 260, peak: 0.12 });
      noise(d, t + i * 0.16, 0.06, { f0: 2600, q: 4, peak: 0.35 });
    }
    tone(d, t + 0.52, 0.35, { type: 'triangle', f0: 660, f1: 990, peak: 0.18 });
  },
  sleep: (d, t) => {
    for (let i = 0; i < 3; i++) tone(d, t + i * 0.32, 0.5, { f0: 523 * [1, 0.84, 0.67][i], peak: 0.12, a: 0.06 });
  },
  thunk: (d, t) => {
    tone(d, t, 0.06, { type: 'triangle', f0: 320, f1: 140, peak: 0.45 });
    noise(d, t, 0.05, { f0: 1500, q: 2, peak: 0.35 });
  },
  salvage: (d, t) => {
    for (let i = 0; i < 4; i++) {
      noise(d, t + i * 0.09, 0.07, { f0: 1800 + i * 300, q: 6, peak: 0.4 });
      tone(d, t + i * 0.09, 0.1, { type: 'square', f0: 300 + i * 40, peak: 0.05 });
    }
  },
};
// wolves (the follow-ups to #66): a pack's long howl at night from where it stands; a low rising call when it has seen you and
// is watching; a sharp yipping call as it comes for you
VOICE.howl = (d, t) => AMB.howl.play(d, t);
VOICE.wolfwatch = (d, t) => {
  growl(d, t, 0.9, 75, 0.8);
  tone(d, t + 0.2, 0.9, { type: 'triangle', f0: 260, f1: 340, peak: 0.12, a: 0.15 });
};
VOICE.wolfcall = (d, t) => {
  const f = 520 + Math.random() * 120;
  for (let i = 0; i < 3; i++)
    tone(d, t + i * 0.16, 0.12, { type: 'triangle', f0: f * (1 + i * 0.08), f1: f * 1.35, peak: 0.25 });
  tone(d, t + 0.5, 0.8, { type: 'triangle', f0: f, f1: f * 0.7, peak: 0.2, a: 0.05 });
};
VOICE.spider_pale = VOICE.spider_widow = VOICE.spider;
VOICE.spider_brute = (d, t) => {
  VOICE.spider(d, t);
  growl(d, t, 0.5, 60 * (0.88 + Math.random() * 0.24), 1.6);
}; // (the kinds of spider, slice 22: the brute rasps low under its chitter)
// how loud and far a voice carries, where it is not a growl's [1, 7, 60]: [volume, half as loud at, silent past] (wolves' calls)
const CARRY = { wolfcall: [1, 20, 120], wolfwatch: [0.9, 16, 90], howl: [0.8, 30, 170] };
export const heard = []; // (the last 40 sounds with a place within earshot, and where each sat left to right: for the walk test)
export function sfx(name, at, vol = 1) {
  const [cv = 1, reach, max] = CARRY[name] || [];
  if (at && Math.hypot(at.x - listener.x, at.z - listener.z) <= (max ?? 60)) {
    heard.push({ name, x: at.x, z: at.z, pan: panOf(at) });
    if (heard.length > 40) heard.shift();
  } // (only what is in earshot)
  if (!ctx || muted) return;
  const d = out(at, vol * cv, reach, max);
  if (!d) return;
  duck();
  const t = ctx.currentTime + 0.005;
  (SFX[name] || VOICE[name])?.(d, t);
}
export function windLevel(v) {
  if (windGain) windGain.gain.setTargetAtTime(cave ? 0 : v, ctx.currentTime, 0.5);
}
let riverWant = 0;
export function riverLevel(v) {
  riverWant = cave ? 0 : v;
  if (riverGain) riverGain.gain.setTargetAtTime(riverWant, ctx.currentTime, 0.8);
}
// #8 (Jared, November 15, 2026: "Cave sounds and fog will add to the feeling of the cave. Maybe music fades, and it sounds wet and
// drippy in some caves, or dry and unstable in others"): inside a cave (kind, or null outside) the music sinks to a murmur, the wind,
// the river and the open land's birds and frogs go quiet, and every sound comes back off the rock (the cave's own tail, below); caves.js
// plays each cave's own drips, grit, creaks and rumbles round you
// (Jared on Dev, November 15, 2026, 9:15 PM: "the echo in the cave is a little too much- less like a cave, more like a manufactured
// reverb". The first echo was one 0.16 s delay fed back into itself: even repeats you could count, half as loud as the sound. Now the rock
// answers as a cave does: many uneven reflections that blur into a dark tail with no repeat to count (a convolver fed a fading, darkening
// noise made here, no sound files), well under the sound itself; long and bright off ice and crystal, short and soft among roots and timbers)
let cave = null,
  echo = null;
const rooms = {};
// each kind's rock: [seconds for its tail to fade away (60 dB), how loud the tail sits under the sound, how bright it starts (Hz)]
const ROOM = {
  ice: [2.2, 0.45, 5200],
  crystal: [2.4, 0.45, 6000],
  fungal: [1.5, 0.38, 3200],
  mine: [1.3, 0.34, 3600],
  roots: [1.2, 0.34, 2600],
};
// the cave's answer to a single click: silence for 12 ms (the nearest wall), a few uneven early reflections, then noise that thickens over
// 30 ms, fades over the room's time and darkens as it goes (high notes die first in rock); each ear its own noise, so it surrounds you
export function caveImpulse(ac, kind) {
  const [T, , hz] = ROOM[kind] || ROOM.mine,
    sr = ac.sampleRate,
    pre = 0.012,
    n = Math.ceil(sr * (T + pre)),
    b = ac.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let y = 0;
    for (let i = Math.ceil(pre * sr); i < n; i++) {
      const t = i / sr - pre,
        a = Math.exp((-2 * Math.PI * (hz * Math.exp(-t * 1.6) + 400)) / sr);
      y = a * y + (1 - a) * (Math.random() * 2 - 1);
      d[i] = y * Math.exp((-6.9 * t) / T) * Math.min(1, t / 0.03);
    }
    for (let k = 0; k < 7; k++)
      d[Math.floor(sr * (pre + 0.006 + Math.random() * 0.05))] +=
        (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);
  }
  return b;
}
export function caveAudio(kind) {
  if (kind === cave) return;
  cave = kind;
  if (!ctx) return;
  if (!echo) echo = ctx.createGain(); // (what every sound in a cave also feeds: out())
  if (cave) {
    let r = rooms[cave];
    if (!r) {
      r = rooms[cave] = { cv: ctx.createConvolver(), wet: ctx.createGain() };
      r.cv.buffer = caveImpulse(ctx, cave);
      r.wet.gain.value = (ROOM[cave] || ROOM.mine)[1];
      r.cv.connect(r.wet);
      r.wet.connect(master);
    }
    echo.disconnect();
    echo.connect(r.cv);
  } // (leaving, sounds stop feeding it and the last tail rings out)
  setMusicVolume(musicVol);
  if (cave) {
    windLevel(0);
    riverLevel(0);
  }
}

// ── The land's own sounds (slice 13), now and then round the listener: birds by day in the green places, frogs in the
// Bog, crickets and an owl at night, and far off at night a wolf's howl (never inside the safe valley) ──
const AMB = {
  bird: {
    when: (b, n) => n < 0.4 && ['grass', 'ruins', 'fungal'].includes(b),
    gap: [3, 9],
    vol: 0.18,
    play: (d, t) => {
      const f = 2400 + Math.random() * 1600,
        n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) tone(d, t + i * 0.11, 0.08, { f0: f * (1 + i * 0.04), f1: f * 1.3, peak: 0.2 });
    },
  },
  frog: {
    when: (b) => b === 'swamp',
    gap: [0.8, 3],
    vol: 0.25,
    play: (d, t) => {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++)
        tone(d, t + i * 0.16, 0.09, { type: 'square', f0: 130 + Math.random() * 30, f1: 95, peak: 0.12 });
    },
  },
  cricket: {
    when: (b, n) => n > 0.5 && b !== 'tundra',
    gap: [0.4, 1.6],
    vol: 0.07,
    play: (d, t) => {
      const f = 4200 + Math.random() * 600;
      for (let i = 0; i < 3; i++) tone(d, t + i * 0.045, 0.03, { f0: f, peak: 0.25 });
    },
  },
  owl: {
    when: (b, n) => n > 0.6 && ['grass', 'tundra', 'ruins'].includes(b),
    gap: [22, 50],
    vol: 0.3,
    play: (d, t) => {
      tone(d, t, 0.35, { f0: 390, f1: 360, peak: 0.3, a: 0.05 });
      tone(d, t + 0.55, 0.7, { f0: 370, f1: 330, peak: 0.28, a: 0.06 });
    },
  },
  howl: {
    when: () => false,
    gap: [35, 80],
    vol: 0.25,
    play: (d, t) => {
      /* (now only a real pack's: VOICE.howl, from game.js) */ const o = ctx.createOscillator(),
        g = ctx.createGain(),
        v = ctx.createOscillator(),
        vg = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(380, t);
      o.frequency.linearRampToValueAtTime(640, t + 0.6);
      o.frequency.linearRampToValueAtTime(560, t + 2.0);
      o.frequency.linearRampToValueAtTime(420, t + 2.6);
      v.frequency.value = 5.5;
      vg.gain.value = 9;
      v.connect(vg);
      vg.connect(o.frequency);
      env(g, t, 0.4, 0.22, 2.3);
      o.connect(g);
      g.connect(d);
      o.start(t);
      v.start(t);
      o.stop(t + 2.9);
      v.stop(t + 2.9);
    },
  },
};
const ambT = {};
export function ambient(dt, biome, night, safe) {
  if (!ctx || muted || cave) return; // (#8: a cave has its own: caves.js)
  for (const [k, a] of Object.entries(AMB)) {
    if (!a.when(biome, night, safe)) {
      ambT[k] = Math.max(ambT[k] || 0, a.gap[0]);
      continue;
    }
    if ((ambT[k] = (ambT[k] ?? a.gap[0]) - dt) > 0) continue;
    ambT[k] = a.gap[0] + Math.random() * (a.gap[1] - a.gap[0]);
    const r = k === 'howl' ? 55 : 8 + Math.random() * 16,
      ang = Math.random() * 6.28,
      d = out(
        { x: listener.x + Math.cos(ang) * Math.min(r, 50), z: listener.z + Math.sin(ang) * Math.min(r, 50) },
        a.vol * (k === 'howl' ? 6 : 1),
      );
    if (d) a.play(d, ctx.currentTime + 0.01);
  }
}

// ── Background music (IW1's day tune, softer): the same 16-beat A-minor melody, bass and arpeggio as IW1's day loop, but
// played by rounded sine/triangle voices with a slow soft pad and a dark echo, at IW1's own 125 bpm with a light beat under it, through its
// own volume that ducks a third of the way down while any sound effect plays and gently returns. Starts with the audio (first
// click/key); the pause screen fades it out; M mutes everything; the Music slider in settings sets its level. ──
let musicDest = null,
  musicMode = 'day',
  bossHold = 0,
  musicBus = null,
  duckG = null,
  musicVol = 0.5,
  musicPaused = false,
  musicNext = 0,
  musicTimer = 0,
  duckT = 0;
const MUSIC_BASE = 0.1; // against the master 0.7: one loud sound effect peaks near 1.0 and the wind sits at 0.05
export function setMusicVolume(v) {
  musicVol = Math.max(0, Math.min(1, v));
  if (musicBus)
    musicBus.gain.setTargetAtTime(
      musicPaused ? 0 : musicVol * MUSIC_BASE * (cave ? 0.12 : 1),
      ctx.currentTime,
      cave ? 1.2 : 0.8,
    );
} // (#8: in a cave, a murmur, faded slowly)
export function setMusicPaused(p) {
  musicPaused = p;
  setMusicVolume(musicVol);
}
export const audioState = () => ({
  started: !!ctx,
  music: musicBus ? musicBus.gain.value : null,
  musicDuck: duckG ? duckG.gain.value : null,
  wind: windGain ? windGain.gain.value : null,
  river: riverWant,
  muted,
  master: master ? master.gain.value : null,
});
function duck() {
  if (!duckG) return;
  const t = ctx.currentTime;
  if (t - duckT < 0.08) return;
  duckT = t;
  duckG.gain.cancelScheduledValues(t);
  duckG.gain.setTargetAtTime(0.35, t, 0.05);
  duckG.gain.setTargetAtTime(1, t + 0.9, 0.7);
}
function startMusic() {
  duckG = ctx.createGain();
  musicBus = ctx.createGain();
  musicBus.gain.value = musicPaused ? 0 : musicVol * MUSIC_BASE;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  lp.Q.value = 0.4;
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.45;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 1100;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  lp.connect(duckG);
  lp.connect(dl);
  dl.connect(dlp);
  dlp.connect(fb);
  fb.connect(dl);
  dlp.connect(wet);
  wet.connect(duckG);
  duckG.connect(musicBus);
  musicBus.connect(master);
  musicBus.input = lp;
  musicDest = ctx.createGain();
  musicDest.connect(lp);
  musicNext = ctx.currentTime + 0.3;
  musicLoop();
}
function mnote(t, f, dur, type, peak, a = 0.06) {
  const o = ctx.createOscillator(),
    g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(0, t + Math.max(a, dur - 0.1), 0.18);
  o.connect(g);
  g.connect(musicDest);
  o.start(t);
  o.stop(t + dur + 1.2);
}
function mbeat(t, kick, tick, snare, f0 = 110, vol = 0.9) {
  if (kick) {
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g);
    g.connect(musicDest);
    o.start(t);
    o.stop(t + 0.3);
  } else {
    const n = ctx.createBufferSource(),
      h = ctx.createBiquadFilter(),
      g = ctx.createGain();
    n.buffer = noiseBuf;
    h.type = snare ? 'bandpass' : 'highpass';
    h.frequency.value = snare ? 1800 : 7000;
    g.gain.setValueAtTime(snare ? 0.4 : tick ? 0.12 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (snare ? 0.14 : 0.05));
    n.connect(h);
    h.connect(g);
    g.connect(musicDest);
    n.start(t, Math.random());
    n.stop(t + 0.18);
  }
}
const MEL = [
  [220, 0, 0.7],
  [261.63, 1, 0.7],
  [329.63, 2, 0.35],
  [293.66, 2.5, 0.35],
  [261.63, 3, 0.7],
  [220, 4, 0.7],
  [196, 5, 0.35],
  [220, 5.5, 0.35],
  [261.63, 6, 1.4],
  [329.63, 8, 0.7],
  [349.23, 9, 0.7],
  [329.63, 10, 0.35],
  [293.66, 10.5, 0.35],
  [261.63, 11, 0.7],
  [220, 12, 1.4],
  [196, 14, 0.7],
  [220, 15, 0.7],
];
const BASS = [
  [55, 0, 6],
  [49, 6, 4],
  [43.65, 10, 4],
  [49, 14, 2],
]; // IW1's bass notes (A, G, F, G), held long
const PAD = [
  [[220, 261.63, 329.63], 0],
  [[196, 246.94, 293.66], 6],
  [[174.61, 220, 261.63], 10],
  [[196, 246.94, 293.66], 14],
]; // chords under them: A minor, G, F, G
const LOOPS = {
  day: {
    bpm: 125,
    beats: 16,
    play(t0, b) {
      // IW1's day tune
      for (const [f, t, d] of MEL) {
        mnote(t0 + t * b, f, d * b * 1.1, 'triangle', 0.6, 0.02);
        mnote(t0 + t * b + 0.01, f * 2, d * b * 0.9, 'sine', 0.2, 0.02);
      }
      for (const [f, t, d] of BASS) mnote(t0 + t * b, f, d * b, 'sine', 0.7, 0.15);
      for (const [fs, t] of PAD) for (const f of fs) mnote(t0 + t * b, f, 3.4 * b, 'sine', 0.07, 0.9);
      for (let i = 0; i < 32; i++) {
        const f = [440, 523.25, 659.25, 523.25][i % 4];
        mnote(t0 + (i * b) / 2, f, b * 0.5, 'sine', i % 8 < 4 ? 0.11 : 0.08, 0.01);
      }
      for (let i = 0; i < 16; i++) {
        mbeat(t0 + i * b, i % 4 === 0, false, i % 4 === 2);
        if (i % 2) mbeat(t0 + i * b - b / 2, false, true);
      }
    },
  }, // a soft kick on beat one of each bar, a snare on beat three, light ticks between
  night: {
    bpm: 80,
    beats: 16,
    play(t0, b) {
      // IW1's night loop: its low, uneasy melody, now on soft low voices, with a heartbeat and sparse bell notes
      for (const [f, t, d] of [
        [110, 0, 1.5],
        [116.54, 2, 1.5],
        [103.83, 4, 1.5],
        [110, 6, 0.7],
        [92.5, 7, 2],
        [87.31, 9, 1],
        [98, 10, 0.5],
        [92.5, 10.5, 0.5],
        [87.31, 11, 2],
        [82.41, 13, 1.5],
        [87.31, 15, 0.7],
      ]) {
        mnote(t0 + t * b, f, d * b * 1.2, 'triangle', 0.7, 0.12);
        mnote(t0 + t * b, f * 2, d * b, 'sine', 0.12, 0.12);
      }
      for (const [f, t] of [
        [36.71, 0],
        [34.65, 4],
        [32.7, 8],
        [36.71, 12],
      ])
        mnote(t0 + t * b, f * 2, 4 * b, 'sine', 0.8, 0.5); // the drone
      for (const [f, t] of [
        [659.25, 1],
        [698.46, 5],
        [622.25, 8.5],
        [739.99, 12],
        [659.25, 14.5],
      ])
        mnote(t0 + t * b, f, 1.2, 'sine', 0.1, 0.01); // bell notes
      for (const t of [3, 7, 11, 15]) {
        mbeat(t0 + t * b, true, false, false, 85, 2);
        mbeat(t0 + (t + 0.3) * b, true, false, false, 85, 1.5);
      } // the heartbeat
      for (let i = 0; i < 32; i++) if (i % 4 === 2) mbeat(t0 + (i * b) / 2, false, true);
    },
  },
  boss: {
    bpm: 130,
    beats: 8,
    play(t0, b) {
      // IW1's boss loop: driving E-minor bass, stabs and a four-on-the-floor beat, kept soft
      for (const [f, t] of [
        [82.41, 0],
        [82.41, 2],
        [98, 4],
        [82.41, 6],
      ])
        mnote(t0 + t * b, f * 2, b * 1.8, 'triangle', 0.6, 0.02);
      for (const [f, t, d] of [
        [329.63, 0, 0.6],
        [392, 1, 0.5],
        [440, 2, 0.6],
        [392, 3, 0.5],
        [329.63, 4, 0.6],
        [311.13, 5, 0.5],
        [349.23, 6, 0.6],
        [392, 7, 0.5],
      ]) {
        mnote(t0 + t * b, f, d * b * 1.2, 'triangle', 0.5, 0.01);
        mnote(t0 + t * b, f * 2, d * b, 'sine', 0.15, 0.01);
      }
      for (const t of [0, 2, 4, 6]) {
        mnote(t0 + t * b, 196, b * 0.5, 'triangle', 0.3, 0.01);
        mnote(t0 + t * b, 293.66, b * 0.5, 'triangle', 0.25, 0.01);
      }
      for (const [f, t] of [
        [98, 0],
        [110, 4],
      ])
        mnote(t0 + t * b, f, 4 * b, 'sine', 0.12, 0.4);
      for (let i = 0; i < 8; i++) {
        mbeat(t0 + i * b, true, false, false, 120);
        mbeat(t0 + (i + 0.5) * b, false, true);
        if (i % 2) mbeat(t0 + i * b, false, false, true);
      }
    },
  },
};
// day, night or boss: a change fades the old loop out and starts the new one on the spot. Boss lingers 6 s after the last big foe.
export function setMusicMode(m, dt = 0) {
  if (m === 'boss') bossHold = 6;
  else if (musicMode === 'boss' && (bossHold -= dt) > 0) return;
  if (m === musicMode || !musicDest) return;
  const now = ctx.currentTime;
  musicDest.gain.setTargetAtTime(0, now, 0.25);
  musicDest = ctx.createGain();
  musicDest.gain.setValueAtTime(0, now);
  musicDest.gain.linearRampToValueAtTime(1, now + 0.6);
  musicDest.connect(musicBus.input);
  musicMode = m;
  musicNext = now + 0.1;
  musicLoop();
}
function musicLoop() {
  if (!ctx) return;
  const L = LOOPS[musicMode],
    b = 60 / L.bpm,
    now = ctx.currentTime;
  if (!musicPaused && !muted) {
    // (while paused or muted the loop idles; it picks up at the next bar)
    if (musicNext < now) musicNext = now + 0.1;
    L.play(musicNext, b);
    musicNext += L.beats * b;
  }
  clearTimeout(musicTimer);
  musicTimer = setTimeout(musicLoop, Math.max(200, (musicNext - ctx.currentTime - 1) * 1000));
}
