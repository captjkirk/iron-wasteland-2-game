import*as o from"three";import{Q as d}from"./config.js";export const SHELLS=d.furShells??8;const p=`
varying vec3 vRest; uniform float uH; uniform float uDens; uniform vec3 uTip; uniform float uFlash;
float iwH3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float iwN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(iwH3(i), iwH3(i+vec3(1,0,0)), f.x), mix(iwH3(i+vec3(0,1,0)), iwH3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(iwH3(i+vec3(0,0,1)), iwH3(i+vec3(1,0,1)), f.x), mix(iwH3(i+vec3(0,1,1)), iwH3(i+vec3(1,1,1)), f.x), f.y), f.z); }
`;export function furMaterial(f,{h:n=0,dens:m=18,len:s=.1,tip:t=1.25,rough:v=.95,vcol:r=!1,furAttr:u=!1,comb:a=null,root:l=.55}={}){const i=new o.MeshStandardMaterial({color:f,roughness:v,metalness:0,vertexColors:r}),c={uH:{value:n},uLen:{value:s},uDens:{value:m},uTip:{value:new o.Color(f).multiplyScalar(t)},uTipK:{value:t},uFlash:{value:0},uComb:{value:a?new o.Vector3(...a).normalize():new o.Vector3}};return i.userData.u=c,i.onBeforeCompile=e=>{Object.assign(e.uniforms,c),e.vertexShader=e.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vRest; uniform float uH; uniform float uLen; uniform vec3 uComb;`+(u?`
attribute float fur;`:"")).replace("#include <begin_vertex>",`#include <begin_vertex>
        vRest = position;
        { float fl = uLen * uH${u?" * fur":""}; vec3 cb = uComb - normal * dot(uComb, normal);
          transformed += (normal * (1. - 0.45 * uH * length(cb)) + cb * uH * 0.9) * fl; }`),e.fragmentShader=e.fragmentShader.replace("#include <common>",`#include <common>
`+p+`
uniform float uTipK;`).replace("#include <color_fragment>",`#include <color_fragment>
        float big = iwN3(vRest * uDens * 0.08), mid = iwN3(vRest * uDens * 0.35);
        vec3 c = vRest * uDens; vec3 id = floor(c); vec3 f = fract(c) - 0.5;
        float hs = iwH3(id); vec3 jit = vec3(iwH3(id + 7.1), iwH3(id + 3.3), iwH3(id + 9.7)) - 0.5;
        float strand = 1. - smoothstep(0.18, 0.5, length(f - jit * 0.35) / max(0.15, 1. - uH));
        if (uH > 0.001) { if (hs < uH * 0.75 || strand < 0.5) discard; }
        vec3 tipC = ${r?"diffuseColor.rgb * uTipK * vec3(1.06, 1.0, 0.86)":"uTip"};
        diffuseColor.rgb *= mix(0.78, 1.18, big) * mix(0.85, 1.1, mid) * mix(0.9, 1.08, hs);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(${l.toFixed(2)}, 1., smoothstep(0., 0.25, uH)), tipC * mix(0.9, 1.1, hs), smoothstep(0.5, 1., uH) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.85), uFlash);`)},i.customProgramCacheKey=()=>"iwfur"+(n>0?"s":"b")+(r?"v":"")+(u?"f":"")+l,i}
