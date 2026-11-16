// Shell fur (slice 4, moved here and extended in slice 19): the base surface gets fine colour noise, and SHELLS offset
// copies along the normal draw strands. Options: vcol (the geometry's vertex colours tint it, and strand tips lighten
// from each spot's own colour: a grizzled coat), furAttr (a per-vertex `fur` attribute scales the length: short on a
// muzzle, long on a hump), comb (a direction in the model's own space the strands lean along as they grow, so the coat
// lies down and back instead of standing straight out like a hedgehog's).
import * as THREE from 'three';
import { Q } from './config.js';
export const SHELLS = Q.furShells ?? 8;
const FUR_GLSL = /* glsl */ `
varying vec3 vRest; uniform float uH; uniform float uDens; uniform vec3 uTip; uniform float uFlash;
float iwH3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float iwN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(iwH3(i), iwH3(i+vec3(1,0,0)), f.x), mix(iwH3(i+vec3(0,1,0)), iwH3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(iwH3(i+vec3(0,0,1)), iwH3(i+vec3(1,0,1)), f.x), mix(iwH3(i+vec3(0,1,1)), iwH3(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;
export function furMaterial(
  color,
  {
    h = 0,
    dens = 18,
    len = 0.1,
    tip = 1.25,
    rough = 0.95,
    vcol = false,
    furAttr = false,
    comb = null,
    root = 0.55,
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, vertexColors: vcol });
  const u = {
    uH: { value: h },
    uLen: { value: len },
    uDens: { value: dens },
    uTip: { value: new THREE.Color(color).multiplyScalar(tip) },
    uTipK: { value: tip },
    uFlash: { value: 0 },
    uComb: { value: comb ? new THREE.Vector3(...comb).normalize() : new THREE.Vector3() },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRest; uniform float uH; uniform float uLen; uniform vec3 uComb;' +
          (furAttr ? '\nattribute float fur;' : ''),
      )
      // grown in the model's rest space, before skinning, so the strands ride the bones; they bend along the comb as they grow
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRest = position;
        { float fl = uLen * uH${furAttr ? ' * fur' : ''}; vec3 cb = uComb - normal * dot(uComb, normal);
          transformed += (normal * (1. - 0.45 * uH * length(cb)) + cb * uH * 0.9) * fl; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FUR_GLSL + '\nuniform float uTipK;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float big = iwN3(vRest * uDens * 0.08), mid = iwN3(vRest * uDens * 0.35);
        vec3 c = vRest * uDens; vec3 id = floor(c); vec3 f = fract(c) - 0.5;
        float hs = iwH3(id); vec3 jit = vec3(iwH3(id + 7.1), iwH3(id + 3.3), iwH3(id + 9.7)) - 0.5;
        float strand = 1. - smoothstep(0.18, 0.5, length(f - jit * 0.35) / max(0.15, 1. - uH));
        if (uH > 0.001) { if (hs < uH * 0.75 || strand < 0.5) discard; }
        vec3 tipC = ${vcol ? 'diffuseColor.rgb * uTipK * vec3(1.06, 1.0, 0.86)' : 'uTip'};
        diffuseColor.rgb *= mix(0.78, 1.18, big) * mix(0.85, 1.1, mid) * mix(0.9, 1.08, hs);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(${root.toFixed(2)}, 1., smoothstep(0., 0.25, uH)), tipC * mix(0.9, 1.1, hs), smoothstep(0.5, 1., uH) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.85), uFlash);`,
      );
  };
  m.customProgramCacheKey = () => 'iwfur' + (h > 0 ? 's' : 'b') + (vcol ? 'v' : '') + (furAttr ? 'f' : '') + root; // (root: how much darker the coat is at the skin than at the strand tips; a softer coat shows less contrast)
  return m;
}
