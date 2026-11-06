// Menu portraits: each character card shows that character in 3D. The portraits are drawn into a corner of the main
// canvas (scissored), copied into the card's own 2D canvas in the same task, and then the main scene is drawn over the
// corner as usual, so there is no second WebGL context and tone mapping and colour match the game. The selected
// character turns slowly in its idle; the others are redrawn now and then.
import * as THREE from 'three';
import { CHARS } from './config.js';
import { buildCharacter } from './characters.js';

const W = 144, H = 176; // card portrait size in CSS pixels
let pscene = null, pcam = null, figs = [], canvases = [], t = 0, tick = 0, ready = false;

export function initPortraits(mainScene) {
  pscene = new THREE.Scene(); pscene.background = new THREE.Color(0x2a2118); pscene.environment = mainScene.environment; pscene.environmentIntensity = 0.7;
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-2.5, 4, -4); pscene.add(key);
  const rim = new THREE.DirectionalLight(0xffc890, 1.8); rim.position.set(3, 3, 3); pscene.add(rim);
  pscene.add(new THREE.HemisphereLight(0xcfd8e8, 0x3a2a1a, 0.6));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 }));
  pscene.add(floor);
  pcam = new THREE.PerspectiveCamera(26, W / H, 0.1, 30); pcam.position.set(0.15, 1.25, -4.9); pcam.lookAt(0, 0.92, 0);
  figs = CHARS.map((ch) => { const f = buildCharacter(ch); f.visible = false; pscene.add(f); f.userData.anim.update(0.5); return f; });
  canvases = [...document.querySelectorAll('#cards canvas.pv')];
  ready = canvases.length === figs.length;
}

// Called each menu frame before the main render. `sel` is the selected card.
export function drawPortraits(renderer, dt, sel) {
  if (!ready) return; t += dt; tick++;
  const pr = renderer.getPixelRatio(), cv = renderer.domElement, size = renderer.getSize(new THREE.Vector2());
  if (size.x < W || size.y < H) return;
  const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setScissorTest(true); renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
  figs.forEach((f, i) => {
    // the selected one every frame; the rest once at the start and then every 40 frames, staggered
    if (i !== sel && !(tick <= 2 || (tick + i * 8) % 40 === 0)) return;
    f.visible = true; f.userData.anim.update(i === sel ? dt : 0);
    f.rotation.y = i === sel ? Math.sin(t * 0.6) * 0.7 : 0.35;
    renderer.render(pscene, pcam); f.visible = false;
    const c = canvases[i], g = c.getContext('2d'); if (c.width !== Math.round(W * pr)) { c.width = Math.round(W * pr); c.height = Math.round(H * pr); }
    g.drawImage(cv, 0, cv.height - c.height, c.width, c.height, 0, 0, c.width, c.height);
  });
  renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(prevColor, prevAlpha);
}
export function endPortraits() { ready = false; } // geometry is shared with the player's model, so nothing is disposed
export function resumePortraits() { if (pscene) { ready = canvases.length === figs.length; tick = 0; } }
