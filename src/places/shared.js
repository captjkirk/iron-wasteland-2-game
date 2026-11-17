// Places worth going to (slice 23, #52): what more than one of them uses. The places' own materials (placeMats), a
// geometry list per material (slot), merging those lists into meshes (flush) and a warning sign (signAt). Moved here
// unchanged from src/buildings.js (the code cleanup, November 16, 2026); buildings.js still exports all of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUV, canvasTex } from '../propmodels.js';
import { mats, CUT } from '../buildings.js';

// (slice 23 polish, #52, Jared: "the same sort of scale and quality/detail check" as the plane) the places' own materials, made
// once: chain-link and grating you see through, warning signs, solar cells, a lit window, a stove's glow on the floor, equipment
// cabinets, oil drums, black cable, fibreglass white, a radome's panels, an obstruction light's red, ice, marker orange.
// The ones used indoors take the cutaway plane (CUT); the outdoor ones stay whole
let PM = null;
function placeMats() {
  if (PM) return PM;
  const rep = (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    },
    M = (o, cut = false) => {
      const m = new THREE.MeshStandardMaterial(o);
      if (cut) m.clippingPlanes = [CUT];
      return m;
    };
  const grime = (x, w, h, n = 120) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = `rgba(${80 + Math.random() * 40},${60 + Math.random() * 20},30,${0.05 + Math.random() * 0.15})`;
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 2 + Math.random() * 14);
    }
  };
  const plate = (draw) =>
    M({
      roughness: 0.55,
      metalness: 0.15,
      map: canvasTex(
        256,
        192,
        (x, w, h) => {
          draw(x, w, h);
          x.strokeStyle = '#1a1a1a';
          x.lineWidth = 6;
          x.strokeRect(3, 3, w - 6, h - 6);
          x.fillStyle = '#555';
          for (const [a, c] of [
            [14, 14],
            [w - 14, 14],
            [14, h - 14],
            [w - 14, h - 14],
          ]) {
            x.beginPath();
            x.arc(a, c, 4, 0, 6.283);
            x.fill();
          }
          grime(x, w, h, 90);
        },
        '#f1efe6',
      ),
    });
  const tri = (x, cx, cy, s) => {
    x.fillStyle = '#111';
    x.beginPath();
    x.moveTo(cx, cy - s);
    x.lineTo(cx + s * 1.1, cy + s * 0.9);
    x.lineTo(cx - s * 1.1, cy + s * 0.9);
    x.closePath();
    x.fill();
    x.fillStyle = '#f2c21b';
    x.beginPath();
    x.moveTo(cx, cy - s * 0.62);
    x.lineTo(cx + s * 0.78, cy + s * 0.72);
    x.lineTo(cx - s * 0.78, cy + s * 0.72);
    x.closePath();
    x.fill();
    x.fillStyle = '#111';
  };
  const cab = M({
    roughness: 0.6,
    metalness: 0.35,
    map: canvasTex(
      128,
      256,
      (x, w, h) => {
        x.fillStyle = 'rgba(30,32,30,0.85)';
        x.fillRect(8, 8, w - 16, 3);
        x.fillRect(8, h - 11, w - 16, 3);
        x.fillRect(8, 8, 3, h - 16);
        x.fillRect(w - 11, 8, 3, h - 16);
        x.fillRect(w / 2 - 1, 8, 2, h - 16);
        for (let j = 26; j < 74; j += 7) {
          x.fillRect(18, j, w / 2 - 30, 3);
          x.fillRect(w / 2 + 12, j, w / 2 - 30, 3);
        }
        x.fillRect(w / 2 - 12, h / 2 + 10, 5, 28);
        x.fillRect(w / 2 + 7, h / 2 + 10, 5, 28);
        tri(x, w / 2 + 34, 120, 13);
        grime(x, w, h, 60);
      },
      '#b7bbb3',
    ),
  });
  const drum = M({
    roughness: 0.6,
    metalness: 0.3,
    map: canvasTex(
      128,
      128,
      (x, w, h) => {
        x.fillStyle = 'rgba(15,15,15,0.4)';
        for (const j of [h * 0.33, h * 0.66]) x.fillRect(0, j - 3, w, 6);
        x.fillRect(0, 0, w, 5);
        x.fillRect(0, h - 5, w, 5);
        for (let i = 0; i < 70; i++) {
          x.fillStyle = `rgba(${100 + Math.random() * 50},${55 + Math.random() * 25},25,${0.15 + Math.random() * 0.3})`;
          x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 3 + Math.random() * 24);
        }
      },
      '#ffffff',
    ),
  });
  const tint = (m, c) => {
    const n = m.clone();
    n.color.set(c);
    return n;
  };
  PM = {
    cab,
    gen: tint(cab, 0x7f9160),
    drumB: tint(drum, 0x2f5f8a),
    drumR: tint(drum, 0xa0301f),
    drumY: tint(drum, 0xc8981c),
    chain: M({
      color: 0xc0c4c8,
      metalness: 0.6,
      roughness: 0.45,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.05,
      map: rep(
        canvasTex(
          64,
          64,
          (x, w, h) => {
            x.strokeStyle = '#d4d8dc';
            x.lineWidth = 2.5;
            x.beginPath();
            for (let i = -w; i <= w; i += 16) {
              x.moveTo(i, 0);
              x.lineTo(i + h, h);
              x.moveTo(i + h, 0);
              x.lineTo(i, h);
            }
            x.stroke();
          },
          '#a8acb0',
        ),
      ),
    }),
    grate: M({
      color: 0xa4a6a2,
      metalness: 0.55,
      roughness: 0.6,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
      map: rep(
        canvasTex(
          64,
          64,
          (x, w, h) => {
            x.fillStyle = '#c4c6c2';
            for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 3, h);
            for (let j = 0; j < h; j += 32) x.fillRect(0, j, w, 5);
          },
          '#a4a6a2',
        ),
      ),
    }),
    solar: M({
      metalness: 0.5,
      roughness: 0.22,
      map: canvasTex(
        128,
        192,
        (x, w, h) => {
          x.fillStyle = 'rgba(150,180,225,0.22)';
          for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1, h);
          x.fillStyle = '#c9ced6';
          for (let i = 0; i <= 4; i++) x.fillRect((i * (w - 5)) / 4, 0, 5, h);
          for (let j = 0; j <= 6; j++) x.fillRect(0, (j * (h - 5)) / 6, w, 5);
        },
        '#16264a',
      ),
    }),
    lit: M(
      {
        color: 0x2a2014,
        roughness: 0.25,
        emissive: 0xffffff,
        emissiveIntensity: 1.1,
        emissiveMap: canvasTex(
          64,
          64,
          (x, w, h) => {
            const gr = x.createRadialGradient(w / 2, h * 0.62, 2, w / 2, h / 2, w * 0.75);
            gr.addColorStop(0, '#ffe9b8');
            gr.addColorStop(1, '#b8682a');
            x.fillStyle = gr;
            x.fillRect(0, 0, w, h);
            x.fillStyle = 'rgba(90,40,20,0.75)';
            x.fillRect(0, 0, 12, h);
            x.fillRect(w - 12, 0, 12, h);
          },
          '#000',
        ),
      },
      true,
    ),
    heat: Object.assign(
      new THREE.MeshBasicMaterial({
        color: 0xff8a30,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: canvasTex(
          64,
          64,
          (x, w, h) => {
            const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            gr.addColorStop(0, 'rgba(255,190,120,0.75)');
            gr.addColorStop(1, 'rgba(255,110,30,0)');
            x.fillStyle = gr;
            x.fillRect(0, 0, w, h);
          },
          '#000',
        ),
      }),
      { clippingPlanes: [CUT] },
    ),
    cable: M({ color: 0x18181a, roughness: 0.55 }),
    white: M({ color: 0xe6e8e2, roughness: 0.5, metalness: 0.05 }),
    dome: M({ color: 0xeef0ec, roughness: 0.6, flatShading: true }),
    drift: M({
      roughness: 0.93,
      map: canvasTex(
        128,
        128,
        (x, w, h) => {
          for (let i = 0; i < 260; i++) {
            x.fillStyle = `rgba(${170 + Math.random() * 30},${185 + Math.random() * 25},${205 + Math.random() * 25},${0.05 + Math.random() * 0.1})`;
            x.beginPath();
            x.ellipse(
              Math.random() * w,
              Math.random() * h,
              3 + Math.random() * 14,
              2 + Math.random() * 6,
              Math.random() * 3,
              0,
              6.283,
            );
            x.fill();
          }
        },
        '#d6dde6',
      ),
    }),
    red: new THREE.MeshBasicMaterial({ color: 0xd8261a }),
    ice: M({ color: 0xd4ecf6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 }, true),
    orange: M({ color: 0xe05a18, roughness: 0.8, side: THREE.DoubleSide }),
    danger: plate((x, w, h) => {
      x.fillStyle = '#111';
      x.fillRect(0, 0, w, 66);
      x.fillStyle = '#c4161c';
      x.beginPath();
      x.ellipse(w / 2, 33, 98, 25, 0, 0, 6.283);
      x.fill();
      x.fillStyle = '#fff';
      x.font = 'bold 38px sans-serif';
      x.textAlign = 'center';
      x.fillText('DANGER', w / 2, 47);
      x.fillStyle = '#111';
      x.font = 'bold 32px sans-serif';
      x.fillText('HIGH VOLTAGE', w / 2, 114);
      x.font = 'bold 25px sans-serif';
      x.fillText('KEEP OUT', w / 2, 158);
    }),
    rf: plate((x, w, h) => {
      x.fillStyle = '#f2c21b';
      x.fillRect(0, 0, w, h);
      tri(x, 52, 58, 34);
      x.lineWidth = 3;
      x.strokeStyle = '#111';
      x.beginPath();
      x.arc(52, 72, 4, 0, 6.283);
      x.fill();
      for (const r of [9, 15]) {
        x.beginPath();
        x.arc(52, 72, r, -2.5, -0.64);
        x.stroke();
      }
      x.font = 'bold 30px sans-serif';
      x.textAlign = 'left';
      x.fillText('CAUTION', 102, 58);
      x.font = 'bold 21px sans-serif';
      x.fillText('RADIO WAVES', 102, 86);
      x.textAlign = 'center';
      x.font = 'bold 21px sans-serif';
      x.fillText('AUTHORIZED CLIMBERS', w / 2, 132);
      x.fillText('ONLY', w / 2, 160);
    }),
    station: plate((x, w, h) => {
      x.fillStyle = '#1d4e89';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#f1efe6';
      x.fillRect(14, 14, w - 28, h - 28);
      x.fillStyle = '#1d4e89';
      x.textAlign = 'center';
      x.font = 'bold 36px sans-serif';
      x.fillText('FROSTLINE', w / 2, 66);
      x.font = 'bold 21px sans-serif';
      x.fillText('RESEARCH STATION', w / 2, 100);
      x.fillRect(40, 116, w - 80, 3);
      x.font = '18px sans-serif';
      x.fillText('MET  ·  RADIO  ·  ICE CORE', w / 2, 146);
    }),
  };
  return PM;
}
const PK = [
  'drift',
  'chain',
  'grate',
  'cab',
  'gen',
  'drumB',
  'drumR',
  'drumY',
  'cable',
  'white',
  'dome',
  'red',
  'solar',
  'ice',
  'orange',
  'heat',
  'lit',
];
const slot = () => Object.fromEntries(PK.map((k) => [k, []]));
// a slot's geometries (in the building's frame) merged one mesh per material onto the building's group
function flush(b, Q) {
  const M = placeMats();
  for (const k in Q) {
    if (!Q[k].length) continue;
    const geo = mergeGeometries(Q[k].map((q) => (q.index ? q.toNonIndexed() : q)));
    if (k === 'chain' || k === 'grate' || k === 'drift') boxUV(geo, k === 'chain' ? 0.25 : k === 'grate' ? 0.3 : 3);
    const m = new THREE.Mesh(geo, M[k]);
    m.castShadow = !['heat', 'lit', 'red', 'chain', 'grate', 'ice'].includes(k);
    m.receiveShadow = k !== 'heat';
    b.group.add(m);
  }
}
// a sign plate facing +z turned by ry (its back plain iron)
function signAt(b, m, x, y, z, ry, sw = 0.6, sh = 0.45) {
  const I = mats().iron,
    s = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.025), [I, I, I, I, m, I]);
  s.position.set(x, y, z);
  s.rotation.y = ry;
  s.castShadow = true;
  b.group.add(s);
}

// for the other parts of the split (src/buildings.js, src/interiors.js, src/places/)
export { placeMats, slot, flush, signAt };
