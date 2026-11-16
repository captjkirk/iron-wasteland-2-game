// the world's edge in mist (Jared, November 16, 2026, 5:00 AM: "mountains at the edge does not look great. I think I would like
// to see what it would look like with a very dense fog instead"). Picked on the page, so he can walk each on Dev:
//   ?edge=mountains (or none): the edge mountains as they are; nothing here runs, every shader is as before
//   ?edge=fog:   no mountains; the land runs into a bank of mist that thickens toward the edge, so its end is never seen
//   ?edge=mist:  the same mist over mountains moved further out, only their shapes showing through it
// The mist is the scene's own fog colour (the sky's at each hour, the weather's, the night's), added on top of the fog in
// every material's fog step, by where each point is in the world: how much depends on how far the eye looks through the
// bank, so the ground at your feet stays clear while walking in closes it round you. It drifts and slowly thickens and thins
// on the game clock (the host's in a co-op game, so both players see it alike). Off inside a cave (they lie past the north
// edge). The walking rule at the edge is unchanged
import * as THREE from 'three';
import { params, HALF } from './config.js';

export const EDGE = ['fog', 'mist'].includes(params.get('edge')) ? params.get('edge') : 'mountains';
// width of the bank in from the edge, the depth that closes it, how much it can hide, and the wall's (mist: shapes stay faint)
const LOOK = { fog: [150, 14, 1, 1], mist: [150, 45, 0.55, 0.3] }[EDGE];
// (a plain object, not a Vector4: three's uniform cloning keeps a plain object shared, so every material reads this one)
const U = { x: 0, y: 0, z: 0, w: 0 };

if (LOOK) {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vEdgeW;\n#endif\n';
  // the world position from the view position (every shader with fog has it): a view matrix turns without stretching
  C.fog_vertex += '\n#ifdef USE_FOG\nvEdgeW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif\n';
  C.fog_pars_fragment += '\n#ifdef USE_FOG\nuniform vec4 uEdge;\nvarying vec3 vEdgeW;\n#endif\n';
  C.fog_fragment += `
#ifdef USE_FOG
if (uEdge.y > 0.0) {
  float W = uEdge.y * (1.0 + 0.12 * sin(uEdge.x * 0.011)), n = sin(vEdgeW.x * 0.031 + uEdge.x * 0.05) * sin(vEdgeW.z * 0.027 - uEdge.x * 0.04);
  float dF = smoothstep(${HALF.toFixed(1)} - W, ${(HALF - 10).toFixed(1)}, max(abs(vEdgeW.x), abs(vEdgeW.z)) + 14.0 * n);
  float dC = smoothstep(${HALF.toFixed(1)} - W, ${(HALF - 10).toFixed(1)}, max(abs(cameraPosition.x), abs(cameraPosition.z)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uEdge.w * (1.0 - exp(-(dF + dC) * 0.5 * vFogDepth / uEdge.z)));
}
#endif
`;
  THREE.UniformsLib.fog.uEdge = { value: U };
  for (const k in THREE.ShaderLib) if (THREE.ShaderLib[k].uniforms.fogColor) THREE.ShaderLib[k].uniforms.uEdge = { value: U };
}

// and a wall of the same mist standing 24 m past the edge, all round: solid from the ground to a little over the eye, then
// thinning into the sky (land drawn into fog alone ended in a flat cut-out against the sky), faded out from far off, drifting
let wall = null; const col = new THREE.Color();
export function buildEdgeMist(scene) { if (!LOOK) return;
  const g = new THREE.CylinderGeometry((HALF + 24) * Math.SQRT2, (HALF + 24) * Math.SQRT2, 1600, 4, 1, true); g.rotateY(Math.PI / 4); // (a square, open top and bottom)
  wall = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uEdge: { value: U }, uCol: { value: col }, uA: { value: LOOK[3] } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec4 uEdge; uniform vec3 uCol; uniform float uA; varying vec3 vW;
      void main() { float h = vW.y - cameraPosition.y, d = length(vW.xz - cameraPosition.xz);
        float drift = 0.85 + 0.15 * sin(vW.x * 0.013 + vW.z * 0.011 + uEdge.x * 0.07) * sin(vW.y * 0.02 - uEdge.x * 0.03);
        gl_FragColor = vec4(uCol, uA * drift * (1.0 - smoothstep(-10.0, 140.0 + 20.0 * sin(uEdge.x * 0.011), h)) * (1.0 - smoothstep(260.0, 460.0, d)));
        #include <colorspace_fragment>
      }` }));
  wall.frustumCulled = false; wall.name = 'edge mist'; scene.add(wall); }

// each frame, after the fog's colour is settled: the game clock in seconds, and whether the camera is out of the world (a cave)
export function tickEdgeFog(t, away, fog) { if (!LOOK) return; U.x = t; U.y = away ? 0 : LOOK[0]; U.z = LOOK[1]; U.w = LOOK[2];
  if (wall) { wall.visible = !away; col.copy(fog.color); } } // (linear, turned to the screen's colours as it is drawn: in a water mirror it stays linear, as the mist on the land does, the review)
