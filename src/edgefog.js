import*as e from"three";import{params as d,HALF as r}from"./config.js";export const EDGE=["fog","mist"].includes(d.get("edge"))?d.get("edge"):"mountains";const t={fog:[150,14,1,1],mist:[150,45,.55,.3]}[EDGE],n={x:0,y:0,z:0,w:0};if(t){const o=e.ShaderChunk;o.fog_pars_vertex+=`
#ifdef USE_FOG
varying vec3 vEdgeW;
#endif
`,o.fog_vertex+=`
#ifdef USE_FOG
vEdgeW = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`,o.fog_pars_fragment+=`
#ifdef USE_FOG
uniform vec4 uEdge;
varying vec3 vEdgeW;
#endif
`,o.fog_fragment+=`
#ifdef USE_FOG
if (uEdge.y > 0.0) {
  float W = uEdge.y * (1.0 + 0.12 * sin(uEdge.x * 0.011)), n = sin(vEdgeW.x * 0.031 + uEdge.x * 0.05) * sin(vEdgeW.z * 0.027 - uEdge.x * 0.04);
  float dF = smoothstep(${r.toFixed(1)} - W, ${(r-10).toFixed(1)}, max(abs(vEdgeW.x), abs(vEdgeW.z)) + 14.0 * n);
  float dC = smoothstep(${r.toFixed(1)} - W, ${(r-10).toFixed(1)}, max(abs(cameraPosition.x), abs(cameraPosition.z)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uEdge.w * (1.0 - exp(-(dF + dC) * 0.5 * vFogDepth / uEdge.z)));
}
#endif
`,e.UniformsLib.fog.uEdge={value:n};for(const i in e.ShaderLib)e.ShaderLib[i].uniforms.fogColor&&(e.ShaderLib[i].uniforms.uEdge={value:n})}let a=null;const g=new e.Color;export function buildEdgeMist(o){if(!t)return;const i=new e.CylinderGeometry((r+24)*Math.SQRT2,(r+24)*Math.SQRT2,1600,4,1,!0);i.rotateY(Math.PI/4),a=new e.Mesh(i,new e.ShaderMaterial({transparent:!0,depthWrite:!1,side:e.DoubleSide,uniforms:{uEdge:{value:n},uCol:{value:g},uA:{value:t[3]}},vertexShader:"varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",fragmentShader:`uniform vec4 uEdge; uniform vec3 uCol; uniform float uA; varying vec3 vW;
      void main() { float h = vW.y - cameraPosition.y, d = length(vW.xz - cameraPosition.xz);
        float drift = 0.85 + 0.15 * sin(vW.x * 0.013 + vW.z * 0.011 + uEdge.x * 0.07) * sin(vW.y * 0.02 - uEdge.x * 0.03);
        gl_FragColor = vec4(uCol, uA * drift * (1.0 - smoothstep(-10.0, 140.0 + 20.0 * sin(uEdge.x * 0.011), h)) * (1.0 - smoothstep(260.0, 460.0, d)));
        #include <colorspace_fragment>
      }`})),a.frustumCulled=!1,a.name="edge mist",o.add(a)}export function tickEdgeFog(o,i,s){t&&(n.x=o,n.y=i?0:t[0],n.z=t[1],n.w=t[2],a&&(a.visible=!i,g.copy(s.color)))}
