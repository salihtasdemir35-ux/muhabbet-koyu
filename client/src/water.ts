// Deniz ve havuz su gölgelendiricileri (Gerstner dalgaları, fresnel, güneş parlaması, kıyı köpüğü)
import * as THREE from 'three';

export const seaUniforms = {
  uTime: { value: 0 },
  uAmp: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uSunInt: { value: 1 },
  uZenith: { value: new THREE.Color(0x3a78c0) },
  uHorizon: { value: new THREE.Color(0xbfd8ee) },
  uDeep: { value: new THREE.Color(0x0a3d5c) },
  uShallow: { value: new THREE.Color(0x2bb3b1) },
  uLight: { value: 1 },
  uMoon: { value: 0 },
};

const NOISE = /* glsl */`
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
`;

export function makeSea(size = 900, seg = 220): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -size / 2 + 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, seaUniforms]),
    transparent: true, fog: true,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uAmp;
      varying vec3 vWorld; varying vec3 vN; varying float vCrest;
      #include <fog_pars_vertex>
      vec3 gerstner(vec4 w, vec3 p, inout vec3 tangent, inout vec3 binormal){
        float k = 6.28318/w.w; float c = sqrt(9.8/k); vec2 d = normalize(w.xy);
        float f = k*(dot(d,p.xz) - c*uTime*0.55); float a = w.z/k;
        tangent += vec3(-d.x*d.x*(w.z*sin(f)), d.x*(w.z*cos(f)), -d.x*d.y*(w.z*sin(f)));
        binormal += vec3(-d.x*d.y*(w.z*sin(f)), d.y*(w.z*cos(f)), -d.y*d.y*(w.z*sin(f)));
        return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f)));
      }
      void main(){
        vec3 p = (modelMatrix*vec4(position,1.0)).xyz;
        vec3 t = vec3(1,0,0), b = vec3(0,0,1);
        float shore = clamp((-p.z - 12.0)/18.0, 0.15, 1.0);
        float amp = uAmp*shore;
        vec3 o = vec3(0);
        o += gerstner(vec4(0.2, 1.0, 0.10*amp, 34.0), p, t, b);
        o += gerstner(vec4(-0.4, 1.0, 0.08*amp, 19.0), p, t, b);
        o += gerstner(vec4(0.7, 0.9, 0.06*amp, 11.0), p, t, b);
        o += gerstner(vec4(-0.2, 0.8, 0.05*amp, 6.5), p, t, b);
        p += o;
        vCrest = o.y;
        vN = normalize(cross(b, t));
        vWorld = p;
        vec4 mvPosition = viewMatrix*vec4(p,1.0);
        gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunInt;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uLight; uniform float uMoon; uniform float uAmp;
      varying vec3 vWorld; varying vec3 vN; varying float vCrest;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec2 q = vWorld.xz*0.35;
        float e = 0.08;
        float n0 = vnoise(q*2.0 + uTime*0.25) + 0.5*vnoise(q*5.0 - uTime*0.4);
        float nx = vnoise((q+vec2(e,0.))*2.0 + uTime*0.25) + 0.5*vnoise((q+vec2(e,0.))*5.0 - uTime*0.4);
        float nz = vnoise((q+vec2(0.,e))*2.0 + uTime*0.25) + 0.5*vnoise((q+vec2(0.,e))*5.0 - uTime*0.4);
        vec3 N = normalize(vN + vec3((n0-nx), 0.0, (n0-nz))*0.9);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.03 + 0.97*pow(1.0 - max(dot(N,V),0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y,0.0,1.0), 0.45));
        float depth = 1.0 - smoothstep(-48.0, -16.0, vWorld.z);
        vec3 body = mix(uShallow, uDeep, depth) * (0.35 + 0.65*uLight);
        // dalga tepesinde ışık geçişi (subsurface)
        body += uShallow*max(vCrest,0.0)*0.6*uLight;
        vec3 col = mix(body, sky, fres*0.9);
        float s = max(dot(R, uSunDir), 0.0);
        col += uSunColor*uSunInt*(pow(s, 900.0)*6.0 + pow(s, 90.0)*0.35);
        col += vec3(0.8,0.85,1.0)*uMoon*pow(s, 300.0)*1.5;
        // kıyı köpüğü
        float shoreD = vWorld.z + 17.5;
        float foamBand = smoothstep(-4.5, 0.6, shoreD) * (1.0 - smoothstep(0.6, 2.2, shoreD));
        float foamN = vnoise(vWorld.xz*1.6 + vec2(uTime*0.3, uTime*0.6)) * vnoise(vWorld.xz*4.0 - uTime*0.2);
        float wavesIn = 0.5 + 0.5*sin(vWorld.z*1.3 + uTime*1.6 + vnoise(vWorld.xz*0.3)*3.0);
        float foam = foamBand*smoothstep(0.18, 0.45, foamN*1.4*wavesIn + foamBand*0.25);
        foam += smoothstep(0.25, 0.42, vCrest*uAmp)*0.5*foamN;
        col = mix(col, vec3(0.95)*(0.3+0.7*uLight), clamp(foam,0.0,1.0));
        float alpha = mix(0.38, 0.97, 1.0 - smoothstep(-26.0, -17.0, vWorld.z));
        alpha = max(alpha, fres);
        alpha = max(alpha, foam);
        alpha *= 1.0 - smoothstep(-17.0, -15.6, vWorld.z);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}

export function makePoolWater(w: number, d: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: seaUniforms.uTime, uSunDir: seaUniforms.uSunDir, uSunColor: seaUniforms.uSunColor, uSunInt: seaUniforms.uSunInt, uZenith: seaUniforms.uZenith, uHorizon: seaUniforms.uHorizon, uLight: seaUniforms.uLight, uRipple: { value: new THREE.Vector4(0, 0, -100, 0) }, uNight: { value: 0 } }]),
    transparent: true, fog: true, depthWrite: false,
    vertexShader: /* glsl */`varying vec3 vWorld; #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition; #include <fog_vertex> }`.replace(/#include <fog_pars_vertex>/, '\n#include <fog_pars_vertex>\n').replace(/#include <fog_vertex>/, '\n#include <fog_vertex>\n'),
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunInt; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uLight; uniform vec4 uRipple; uniform float uNight;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        vec2 q = vWorld.xz*1.2; float e=0.05;
        float rip = 0.0;
        float rd = distance(vWorld.xz, uRipple.xy); float age = uTime - uRipple.z;
        if (age < 3.0) rip = sin(rd*9.0 - age*10.0) * exp(-rd*0.8) * (1.0 - age/3.0) * 0.6;
        float n0 = vnoise(q + uTime*0.4)+0.5*vnoise(q*2.3 - uTime*0.5) + rip;
        float nx = vnoise(q+vec2(e,0.) + uTime*0.4)+0.5*vnoise((q+vec2(e,0.))*2.3 - uTime*0.5) + rip;
        float nz = vnoise(q+vec2(0.,e) + uTime*0.4)+0.5*vnoise((q+vec2(0.,e))*2.3 - uTime*0.5) + rip;
        vec3 N = normalize(vec3((n0-nx)*1.5, 1.0, (n0-nz)*1.5));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96*pow(1.0-max(dot(N,V),0.0), 5.0);
        vec3 R = reflect(-V,N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y,0.,1.),0.5));
        vec3 body = vec3(0.12,0.62,0.72)*(0.3+0.7*uLight) + vec3(0.05,0.35,0.45)*uNight*1.2;
        vec3 col = mix(body, sky, fres);
        col += uSunColor*uSunInt*pow(max(dot(R,uSunDir),0.),600.0)*4.0;
        gl_FragColor = vec4(col, mix(0.55, 0.95, fres));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** Havuz tabanı: fayans + hareketli kostik ışık */
export function makeCausticMaterial(tileTex: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.3 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = seaUniforms.uTime; sh.uniforms.uLight = seaUniforms.uLight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime; uniform float uLight;\n' + NOISE)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 cq = vWp.xz*1.3;
        float c1 = abs(vnoise(cq + uTime*0.35) - vnoise(cq*1.3 - uTime*0.3));
        float caus = pow(1.0 - c1, 8.0);
        totalEmissiveRadiance += vec3(0.75,0.95,1.0)*caus*0.55*uLight;`);
  };
  return m;
}
