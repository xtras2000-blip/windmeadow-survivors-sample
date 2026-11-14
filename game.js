// 전망순례 · 샘플 플레이 — three.js (vendored r187). 모든 에셋은 코드로 생성.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
THREE.ColorManagement.enabled = false;

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

window.addEventListener('error', e => fatal('오류: ' + e.message));
function fatal(msg) { const f = $('fatal'); f.style.display = 'flex'; f.textContent = msg; }

// ───────────────────────── 설정 ─────────────────────────
const GRASS = [{ n: '높음', c: 70000 }, { n: '보통', c: 36000 }, { n: '낮음', c: 14000 }, { n: '끔', c: 0 }];
let gq = Q.has('q') ? +Q.get('q') : (isTouch ? 1 : 0);
const RUN_SEC = Q.has('run') ? +Q.get('run') : 300;
const BOSS_AT = RUN_SEC * 0.8;
const CAP = isTouch ? 170 : 240;
const VIEWS = [{ n: '높게', pitch: 52, dist: 21 }, { n: '풍경', pitch: 30, dist: 25 }];
let viewIdx = 0;

// ───────────────────────── 렌더러 ─────────────────────────
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
} catch (e) { fatal('이 브라우저는 WebGL을 지원하지 않아요.'); throw e; }
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
let pr = Q.has('pr') ? +Q.get('pr') : Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(pr);
$('app').insertBefore(renderer.domElement, $('fx'));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);

// ───────────────────────── 시간대 팔레트 ─────────────────────────
const PAL = [
  { t: 0.0, hor: [1.0, 0.86, 0.70], mid: [0.98, 0.72, 0.78], top: [0.52, 0.66, 0.92], sun: [1.0, 0.88, 0.70], sky: [1.0, 0.95, 0.86], gnd: [0.50, 0.48, 0.86], el: 0.62 },
  { t: 0.55, hor: [1.0, 0.70, 0.48], mid: [0.95, 0.56, 0.68], top: [0.48, 0.42, 0.78], sun: [1.0, 0.80, 0.62], sky: [1.0, 0.91, 0.86], gnd: [0.54, 0.48, 0.86], el: 0.30 },
  { t: 1.0, hor: [0.80, 0.55, 0.72], mid: [0.48, 0.40, 0.72], top: [0.18, 0.22, 0.50], sun: [0.80, 0.70, 0.96], sky: [0.78, 0.76, 0.96], gnd: [0.44, 0.44, 0.82], el: 0.10 },
];
const U = {
  uPlayer: { value: new THREE.Vector3() }, uTime: { value: 0 },
  uFogColor: { value: new THREE.Color() }, uFogDen: { value: 0.0085 },
  uSkyL: { value: new THREE.Vector3() }, uGndL: { value: new THREE.Vector3() },
  uSunDir: { value: new THREE.Vector3(-0.45, 0.4, -0.8).normalize() }, uSunCol: { value: new THREE.Vector3() },
  uHorizon: { value: new THREE.Vector3() }, uMid: { value: new THREE.Vector3() }, uTop: { value: new THREE.Vector3() },
};
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI);
const sunLight = new THREE.DirectionalLight(0xffffff, Math.PI);
scene.add(hemi, sunLight, sunLight.target);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function mixPal(k, t) {
  let a = PAL[0], b = PAL[PAL.length - 1];
  for (let i = 0; i < PAL.length - 1; i++) if (t >= PAL[i].t && t <= PAL[i + 1].t) { a = PAL[i]; b = PAL[i + 1]; }
  const f = a === b ? 0 : (t - a.t) / (b.t - a.t);
  return a[k].map ? a[k].map((v, i) => lerp(v, b[k][i], f)) : lerp(a[k], b[k], f);
}
function applyTimeOfDay(t) {
  t = clamp(t, 0, 1);
  const hor = mixPal('hor', t), mid = mixPal('mid', t), top = mixPal('top', t), sun = mixPal('sun', t), sky = mixPal('sky', t), gnd = mixPal('gnd', t), el = mixPal('el', t);
  U.uHorizon.value.set(...hor); U.uMid.value.set(...mid); U.uTop.value.set(...top);
  const skyL = tmpA.set(...sky).multiplyScalar(0.80), gndL = tmpB.set(...gnd).multiplyScalar(0.62);
  U.uSkyL.value.copy(skyL); U.uGndL.value.copy(gndL);
  const sunC = new THREE.Vector3(...sun).multiplyScalar(0.42);
  U.uSunCol.value.copy(sunC);
  const az = -0.55;
  U.uSunDir.value.set(Math.sin(az) * Math.sqrt(1 - el * el), el, -Math.cos(az) * Math.sqrt(1 - el * el)).normalize();
  U.uFogColor.value.setRGB(...hor);
  hemi.color.setRGB(skyL.x, skyL.y, skyL.z); hemi.groundColor.setRGB(gndL.x, gndL.y, gndL.z);
  sunLight.color.setRGB(sunC.x, sunC.y, sunC.z);
  sunLight.position.copy(U.uSunDir.value).multiplyScalar(30);
  scene.background = U.uFogColor.value; if (scene.fog) scene.fog.color.copy(U.uFogColor.value);
}
scene.fog = new THREE.FogExp2(0xffffff, U.uFogDen.value);

// ───────────────────────── GLSL 공통 ─────────────────────────
const COMMON = `
uniform vec3 uPlayer; uniform float uTime; uniform vec3 uFogColor; uniform float uFogDen;
uniform vec3 uSkyL; uniform vec3 uGndL; uniform vec3 uSunDir; uniform vec3 uSunCol;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float streamC(float x){ return 11.0*sin(x*0.045)+5.0*sin(x*0.11+1.3); }
float streamD(vec2 p){ float z=p.y-streamC(p.x)+16.0; z=mod(z+60.0,120.0)-60.0; return abs(z); }
vec3 meadowTop(vec2 p, float v){
  float n=vnoise(p*0.06)*0.6+vnoise(p*0.17+9.0)*0.4;
  vec3 a=vec3(0.56,0.76,0.40), b=vec3(0.40,0.68,0.46), c=vec3(0.72,0.83,0.48);
  vec3 col=mix(b,a,smoothstep(0.25,0.75,n));
  col=mix(col,c,smoothstep(0.6,0.9,vnoise(p*0.035+3.0))*0.5);
  return col*(0.9+0.2*v);
}
vec3 cloudTint(vec2 p){
  float s=vnoise(p*0.03+vec2(uTime*0.55,uTime*0.18))*0.65+vnoise(p*0.07-vec2(uTime*0.3,0.0))*0.35;
  float sh=smoothstep(0.52,0.78,s);
  return mix(vec3(1.0), vec3(0.66,0.64,0.88), sh*0.75);
}
vec3 shade(vec3 col, vec3 n){
  float h=n.y*0.5+0.5;
  vec3 amb=mix(uGndL,uSkyL,h);
  float t=smoothstep(0.0,0.65,max(dot(n,uSunDir),0.0));
  return col*(amb+uSunCol*t);
}
float fogAmt(float d){ return 1.0-exp(-pow(uFogDen*d,2.0)); }
`;
function mat(vs, fs, extra = {}) {
  return new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: COMMON + vs, fragmentShader: COMMON + fs, fog: false });
}
const FS_SIMPLE = `varying vec3 vCol; varying float vFog; void main(){ gl_FragColor=vec4(mix(vCol,uFogColor,vFog),1.0); }`;

// ───────────────────────── 하늘 / 땅 ─────────────────────────
const skyMat = new THREE.ShaderMaterial({
  uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*p; gl_Position.z=gl_Position.w*0.99999; }`,
  fragmentShader: COMMON + `uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uTop; varying vec3 vDir;
  float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
  void main(){
    vec3 d=normalize(vDir); float y=d.y;
    vec3 col=mix(uHorizon,uMid,smoothstep(0.0,0.22,y));
    col=mix(col,uTop,smoothstep(0.12,0.75,y));
    float s=max(dot(d,uSunDir),0.0);
    col+=uSunCol*(pow(s,90.0)*1.2+pow(s,7.0)*0.35);
    vec2 cp=d.xz/(max(y,0.0)+0.18)*1.1+vec2(uTime*0.008,0.0);
    float c=smoothstep(0.48,0.82,fbm(cp*1.4))*smoothstep(0.0,0.12,y);
    vec3 cc=mix(uHorizon,vec3(1.0),0.55)*(0.85+0.25*s);
    col=mix(col,cc,c*0.7);
    gl_FragColor=vec4(col,1.0);
  }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 14), skyMat);
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

const groundMat = mat(
  `varying vec3 vWP; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  `varying vec3 vWP;
  void main(){
    vec2 p=vWP.xz; float wd=streamD(p);
    vec3 col=meadowTop(p,0.5)*vec3(0.93,0.96,0.92);
    col*=0.92+0.14*vnoise(p*1.8)+0.05*vnoise(p*5.0);
    float sand=1.0-smoothstep(3.7,5.0,wd);
    col=mix(col,vec3(0.80,0.74,0.58),sand*0.35);
    // 물
    float depth=smoothstep(3.7,0.0,wd);
    vec3 wc=mix(vec3(0.42,0.82,0.88),vec3(0.20,0.50,0.78),depth);
    float streak=vnoise(vec2(p.x*0.7-uTime*1.3,p.y*2.6))*vnoise(vec2(p.x*1.9-uTime*0.9,p.y*1.3+4.0));
    wc+=vec3(0.55,0.62,0.55)*smoothstep(0.30,0.55,streak)*0.55;
    wc=mix(wc,uFogColor,0.22);
    float foam=smoothstep(3.25,3.55,wd)*(1.0-smoothstep(3.55,4.1,wd));
    float w=1.0-smoothstep(3.45,3.8,wd);
    col=mix(col,wc,w); col=mix(col,vec3(1.0,0.98,0.95),foam*0.45*(0.6+0.4*vnoise(p*3.0+uTime*0.4)));
    col=shade(col,vec3(0.0,1.0,0.0))*cloudTint(p);
    // 먼 바다
    float dd=length(p-uPlayer.xz);
    float sea=smoothstep(95.0,140.0,dd);
    vec3 sc=mix(vec3(0.40,0.60,0.85),uFogColor,0.55);
    sc+=uSunCol*pow(max(dot(normalize(vec3(p.x-uPlayer.x,0.6,p.y-uPlayer.z)),uSunDir),0.0),24.0)*(0.5+0.5*vnoise(p*0.6+uTime));
    col=mix(col,sc,sea);
    float fog=fogAmt(length(vWP-cameraPosition));
    gl_FragColor=vec4(mix(col,uFogColor,fog),1.0);
  }`);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), groundMat);
ground.frustumCulled = false; scene.add(ground);

// ───────────────────────── 정적 인스턴스 소품 ─────────────────────────
function instGeo(base, n, size, scaleRange, extraAttr) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  const a = new Float32Array(n * 4), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 4] = rnd(size); a[i * 4 + 1] = rnd(size); a[i * 4 + 2] = rnd(scaleRange[0], scaleRange[1]); a[i * 4 + 3] = rnd(TAU);
    if (extraAttr) { const e = extraAttr(i); c[i * 3] = e[0]; c[i * 3 + 1] = e[1]; c[i * 3 + 2] = e[2]; } else { c[i * 3] = Math.random(); c[i * 3 + 1] = Math.random(); c[i * 3 + 2] = Math.random(); }
  }
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(c, 3));
  g.instanceCount = n;
  return g;
}
function addMesh(geo, m) { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; scene.add(mesh); return mesh; }

// 풀
const GRASS_MAX = 70000, GRASS_TILE = 84;
const bladeBase = new THREE.BufferGeometry();
bladeBase.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.38, 0.5, 0, 0.38, 0.5, 0, 0, 1, 0], 3));
bladeBase.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
const grassGeo = instGeo(bladeBase, GRASS_MAX, GRASS_TILE, [0.7, 1.3]);
const grassMat = mat(`
attribute vec4 aInst; attribute vec3 aCol; uniform float uSize; varying vec3 vCol; varying float vFog;
void main(){
  vec2 hs=vec2(uSize*0.5);
  vec2 wp=uPlayer.xz+mod(aInst.xy-uPlayer.xz+hs,uSize)-hs;
  float d=length(wp-uPlayer.xz);
  float fade=1.0-smoothstep(uSize*0.36,uSize*0.49,d);
  float dry=smoothstep(4.4,5.6,streamD(wp));
  float sc=aInst.z*fade*dry;
  float h=position.y;
  float ca=cos(aInst.w), sa=sin(aInst.w);
  float lx=position.x*0.30*sc;
  vec3 w=vec3(wp.x+lx*ca, h*0.62*sc, wp.y+lx*sa);
  float wave=sin(uTime*1.6+wp.x*0.23+wp.y*0.19);
  float gust=smoothstep(0.35,1.0,sin(dot(wp,vec2(0.045,0.02))-uTime*0.8));
  float bend=h*h*(0.28+0.2*wave+0.6*gust);
  w.xz+=vec2(0.93,0.36)*bend*sc;
  vec2 away=wp-uPlayer.xz; float pd=length(away)+0.001;
  w.xz+=away/pd*(1.0-smoothstep(0.0,2.0,pd))*h*h*1.1;
  vec3 base=meadowTop(wp,aCol.x);
  vec3 col=mix(base*vec3(0.70,0.78,0.74),base*1.12,smoothstep(0.0,0.9,h));
  col+=uSunCol*0.14*h;
  col=shade(col,vec3(0.0,1.0,0.0))*cloudTint(wp);
  col*=1.0+0.14*gust*h;
  vCol=col;
  vec4 mv=viewMatrix*vec4(w,1.0); vFog=fogAmt(length(mv.xyz));
  gl_Position=projectionMatrix*mv;
}`, FS_SIMPLE, { uSize: { value: GRASS_TILE } });
const grassMesh = addMesh(grassGeo, grassMat);

// 꽃
const FL_MAX = 9000, FL_TILE = 80;
{
  const pos = [], part = [], idx = [];
  const quad = (pts, p) => { const b = pos.length / 3; pts.forEach(q => { pos.push(...q); part.push(p); }); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  quad([[-0.035, 0, 0], [0.035, 0, 0], [0.025, 0.9, 0], [-0.025, 0.9, 0]], 0);
  const s = 0.2, y0 = 0.86, y1 = 1.1;
  quad([[-s, y0, 0], [s, y0, 0], [s, y1, 0], [-s, y1, 0]], 1);
  quad([[0, y0, -s], [0, y0, s], [0, y1, s], [0, y1, -s]], 1);
  quad([[-s, 1.0, -s], [s, 1.0, -s], [s, 1.0, s], [-s, 1.0, s]], 1);
  var flBase = new THREE.BufferGeometry();
  flBase.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  flBase.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  flBase.setIndex(idx);
}
const FLCOL = [[1, 1, 0.96], [1, 0.72, 0.84], [1, 0.9, 0.42], [0.8, 0.72, 1], [1, 0.62, 0.52], [0.7, 0.88, 1]];
const flowerGeo = instGeo(flBase, FL_MAX, FL_TILE, [0.7, 1.3], () => FLCOL[(Math.random() * FLCOL.length) | 0]);
const flowerMat = mat(`
attribute vec4 aInst; attribute vec3 aCol; attribute float part; uniform float uSize; varying vec3 vCol; varying float vFog;
void main(){
  vec2 hs=vec2(uSize*0.5);
  vec2 wp=uPlayer.xz+mod(aInst.xy-uPlayer.xz+hs,uSize)-hs;
  float d=length(wp-uPlayer.xz);
  float fade=1.0-smoothstep(uSize*0.33,uSize*0.49,d);
  float dry=smoothstep(4.4,5.6,streamD(wp));
  float clump=smoothstep(0.50,0.62,vnoise(wp*0.11+7.0));
  float sc=aInst.z*fade*dry*clump;
  float h=position.y;
  float ca=cos(aInst.w), sa=sin(aInst.w);
  vec2 q=position.xz*0.5*sc;
  vec3 w=vec3(wp.x+q.x*ca-q.y*sa, h*0.55*sc, wp.y+q.x*sa+q.y*ca);
  float wave=sin(uTime*1.7+wp.x*0.23+wp.y*0.19);
  float gust=smoothstep(0.35,1.0,sin(dot(wp,vec2(0.045,0.02))-uTime*0.8));
  w.xz+=vec2(0.93,0.36)*h*h*(0.28+0.2*wave+0.6*gust)*sc*0.8;
  vec2 away=wp-uPlayer.xz; float pd=length(away)+0.001;
  w.xz+=away/pd*(1.0-smoothstep(0.0,2.0,pd))*h*h*0.9;
  vec3 stem=meadowTop(wp,0.4)*vec3(0.7,0.85,0.7);
  vec3 col=part<0.5?stem:aCol*1.08+0.06;
  col=shade(col,vec3(0.0,1.0,0.0))*cloudTint(wp);
  vCol=col;
  vec4 mv=viewMatrix*vec4(w,1.0); vFog=fogAmt(length(mv.xyz));
  gl_Position=projectionMatrix*mv;
}`, FS_SIMPLE, { uSize: { value: FL_TILE } });
flowerMat.side = THREE.DoubleSide;
const flowerMesh = addMesh(flowerGeo, flowerMat);
grassMat.side = THREE.DoubleSide;

// 병합 헬퍼
function mergeParts(parts) {
  const P = [], N = [], C = [];
  const nm = new THREE.Matrix3();
  for (const { geo, m, col } of parts) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    nm.getNormalMatrix(m);
    const p = g.attributes.position, n = g.attributes.normal;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      P.push(v.x, v.y, v.z); N.push(nv.x, nv.y, nv.z);
      const c = col(v.x, v.y, v.z, nv.x, nv.y, nv.z); C.push(c[0], c[1], c[2]);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('vcol', new THREE.Float32BufferAttribute(C, 3));
  return out;
}
const M4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
function smoothBlob(geo, k, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 1 + k * (Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 + seed * 1.7) + 0.5 * Math.sin(v.y * 4 + seed));
    p.setXYZ(i, v.x * f, v.y * f, v.z * f);
  }
  geo.computeVertexNormals(); return geo;
}
const PROP_VS = `
attribute vec4 aInst; attribute vec3 aCol; attribute vec3 vcol; uniform float uSize; uniform float uTall; uniform float uWaterR;
varying vec3 vCol; varying float vFog;
void main(){
  vec2 hs=vec2(uSize*0.5);
  vec2 wp=uPlayer.xz+mod(aInst.xy-uPlayer.xz+hs,uSize)-hs;
  float d=length(wp-uPlayer.xz);
  float fade=1.0-smoothstep(uSize*0.36,uSize*0.49,d);
  float dry=smoothstep(uWaterR,uWaterR+2.5,streamD(wp));
  float hide;
  if(uTall>0.5){ vec2 dd=wp-uPlayer.xz; float rad=1.0-smoothstep(6.0,11.0,length(dd));
    float a=smoothstep(-14.0,-7.0,dd.y); float b=1.0-smoothstep(28.0,36.0,abs(dd.x)); hide=max(rad,a*b); }
  else hide=1.0-smoothstep(1.5,3.5,d);
  float sc=aInst.z*fade*dry*(1.0-hide);
  float ca=cos(aInst.w), sa=sin(aInst.w);
  vec3 lp=position*sc;
  vec3 w=vec3(wp.x+lp.x*ca+lp.z*sa, lp.y, wp.y-lp.x*sa+lp.z*ca);
  if(uTall>0.5 && uWaterR<6.0) w.xz+=vec2(0.9,0.35)*sin(uTime*1.1+wp.x*0.3)*0.05*position.y*sc;
  vec3 n=vec3(normal.x*ca+normal.z*sa, normal.y, -normal.x*sa+normal.z*ca);
  vec3 col=shade(vcol*(0.88+0.24*aCol),n)*cloudTint(wp);
  vCol=col;
  vec4 mv=viewMatrix*vec4(w,1.0); vFog=fogAmt(length(mv.xyz));
  gl_Position=projectionMatrix*mv;
}`;
function propMat(size, tall, waterR) { return mat(PROP_VS, FS_SIMPLE, { uSize: { value: size }, uTall: { value: tall }, uWaterR: { value: waterR } }); }

// 나무 (동글동글 지브리풍)
{
  const parts = [];
  parts.push({ geo: new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7), m: M4(0, 1.1, 0), col: (x, y) => [0.50 - y * 0.03, 0.36, 0.38] });
  const blobs = [[0, 3.5, 0, 1.9], [-1.1, 2.9, 0.4, 1.35], [1.0, 3.0, -0.3, 1.4], [0.1, 4.5, 0.2, 1.2]];
  blobs.forEach(([x, y, z, r], i) => parts.push({
    geo: smoothBlob(new THREE.IcosahedronGeometry(1, 2), 0.07, i * 3.3), m: M4(x, y, z, r, r * 0.88, r),
    col: (px, py) => { const t = clamp((py - 1.6) / 3.8, 0, 1); return [lerp(0.28, 0.66, t), lerp(0.58, 0.88, t), lerp(0.42, 0.40, t)]; },
  }));
  const treeGeo = instGeo(mergeParts(parts), 36, 130, [1.2, 1.9]);
  addMesh(treeGeo, propMat(130, 1, 6.0));
}
// 바위
{
  const g = new THREE.IcosahedronGeometry(1, 0); g.computeVertexNormals();
  const parts = [{ geo: g, m: M4(0, 0.2, 0, 1.0, 0.62, 0.85), col: (x, y, z, nx, ny) => ny > 0.55 ? [0.66, 0.78, 0.55] : [0.80, 0.78, 0.88] }];
  addMesh(instGeo(mergeParts(parts), 110, 90, [0.3, 1.0]), propMat(90, 0, 3.6));
}
// 하얀 석조 유적
function ruinGeo(kind) {
  const stone = (x, y, z, ny) => { const m = clamp(1 - y / 1.4, 0, 1); return [lerp(1.0, 0.62, m * 0.7), lerp(0.98, 0.78, m * 0.7), lerp(0.97, 0.62, m * 0.7)]; };
  const col = (x, y, z, nx, ny) => stone(x, y, z, ny);
  const parts = [];
  const column = (x, z, h, r = 0.55) => { parts.push({ geo: new THREE.CylinderGeometry(r * 0.85, r, h, 8), m: M4(x, h / 2, z), col }); parts.push({ geo: new THREE.BoxGeometry(r * 2.6, 0.35, r * 2.6), m: M4(x, 0.17, z), col }); };
  const block = (x, y, z, sx, sy, sz, ry) => parts.push({ geo: new THREE.BoxGeometry(sx, sy, sz), m: M4(x, y + sy / 2, z, 1, 1, 1, ry), col });
  if (kind === 0) { // 아치
    column(-2.8, 0, 6.2); column(2.8, 0, 6.2);
    block(0, 6.0, 0, 7.4, 1.0, 1.4, 0); block(0, 7.0, 0, 5.4, 0.7, 1.2, 0);
    column(-6.5, 2.0, 3.0); block(4.6, 0, 2.0, 1.6, 0.9, 1.2, 0.4); block(6.2, 0, -1.4, 1.2, 0.6, 1.6, 1.0); block(-4.2, 0, -2.4, 1.4, 0.7, 1.0, 0.2);
  } else { // 기둥열 + 낮은 벽
    column(-4, 0, 5.2); column(0, 0.4, 3.4); column(4, 0, 4.4); column(8, 0.6, 1.6);
    block(-1, 0, 3.0, 5.0, 1.1, 1.0, 0.06); block(3.4, 0, 3.4, 2.4, 1.7, 1.0, -0.1); block(-6.4, 0, 2.2, 1.4, 0.8, 1.4, 0.7); block(10, 0, -1.4, 1.2, 0.6, 1.2, 0.3);
  }
  return mergeParts(parts);
}
addMesh(instGeo(ruinGeo(0), 4, 150, [0.9, 1.3]), propMat(150, 1, 8.0));
addMesh(instGeo(ruinGeo(1), 5, 150, [0.9, 1.3]), propMat(150, 1, 8.0));

function setGrassQuality(i) {
  gq = i; const c = GRASS[i].c;
  grassGeo.instanceCount = c; grassMesh.visible = c > 0;
  const f = c / GRASS_MAX;
  flowerGeo.instanceCount = Math.round(FL_MAX * Math.max(f, 0.3) * (c > 0 ? 1 : 0.5)); flowerMesh.visible = true;
  $('bQ').textContent = '🌿 ' + GRASS[i].n;
  document.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('sel', +b.dataset.q === i));
}

// ───────────────────────── 동적 오브젝트 ─────────────────────────
const dummy = new THREE.Object3D();
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const flatQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// 적 (말랑 블롭)
const blobGeo = mergeParts([
  { geo: new THREE.SphereGeometry(0.5, 14, 10), m: M4(0, 0.4, 0, 1, 0.82, 1), col: (x, y) => { const t = clamp(y / 0.8, 0, 1); const v = lerp(0.88, 1.08, t); return [v, v, v]; } },
  { geo: new THREE.SphereGeometry(0.07, 6, 5), m: M4(-0.17, 0.5, 0.42), col: () => [0.2, 0.12, 0.3] },
  { geo: new THREE.SphereGeometry(0.07, 6, 5), m: M4(0.17, 0.5, 0.42), col: () => [0.2, 0.12, 0.3] },
]);
const enemyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
blobGeo.setAttribute('color', blobGeo.attributes.vcol);
const enemyMesh = new THREE.InstancedMesh(blobGeo, enemyMat, CAP + 4);
enemyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((CAP + 4) * 3), 3);
enemyMesh.frustumCulled = false; enemyMesh.count = 0; scene.add(enemyMesh);

const shadowMesh = new THREE.InstancedMesh(flatQuad, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false, color: new THREE.Color(0.28, 0.22, 0.5), fog: false }), CAP + 8);
shadowMesh.frustumCulled = false; shadowMesh.renderOrder = 1; scene.add(shadowMesh);

// 경험치 보석
const GEM_MAX = 320;
const gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.26, 0).scale(1, 1.4, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), GEM_MAX);
gemMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GEM_MAX * 3), 3); gemMesh.frustumCulled = false; gemMesh.count = 0; scene.add(gemMesh);
const gemGlow = new THREE.InstancedMesh(flatQuad, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.35, 0.8, 0.9), fog: false }), GEM_MAX);
gemGlow.frustumCulled = false; gemGlow.count = 0; gemGlow.renderOrder = 2; scene.add(gemGlow);

// 꽃잎 화살
const PET_MAX = 48;
const petalMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6).scale(0.55, 0.12, 0.28), new THREE.MeshBasicMaterial({ color: 0xff9ec4 }), PET_MAX);
petalMesh.frustumCulled = false; petalMesh.count = 0; scene.add(petalMesh);
// 맴도는 잎
const LEAF_MAX = 8;
const leafMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6).scale(1.15, 0.1, 0.55), new THREE.MeshBasicMaterial({ color: 0x9be86a }), LEAF_MAX);
leafMesh.frustumCulled = false; leafMesh.count = 0; scene.add(leafMesh);
// 파티클 (처치 퍼프)
const PUF_MAX = 140;
const puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), PUF_MAX);
puffMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PUF_MAX * 3), 3); puffMesh.frustumCulled = false; puffMesh.count = 0; scene.add(puffMesh);
// 바람에 날리는 꽃잎
const AMB_N = 46;
const ambMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd6e6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), AMB_N);
ambMesh.frustumCulled = false; scene.add(ambMesh);
const amb = Array.from({ length: AMB_N }, () => ({ x: rnd(-40, 40), y: rnd(0.5, 6), z: rnd(-40, 40), ph: rnd(TAU), sp: rnd(0.8, 1.6) }));

// 바람 베기 이펙트
const slashVfx = [];
for (let i = 0; i < 3; i++) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const fill = new THREE.Mesh(new THREE.RingGeometry(0.35, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const arcs = new THREE.Group();
  for (let k = 0; k < 3; k++) { const a = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 20, 1, k * 2.09, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); arcs.add(a); }
  g.add(fill, ring, arcs); g.visible = false; g.position.y = 0.12; g.renderOrder = 3; scene.add(g);
  slashVfx.push({ g, ring, fill, arcs, t: 9, R: 3 });
}

// 플레이어 (아주 작은 후드 캐릭터)
const player = new THREE.Group(); scene.add(player);
const rig = new THREE.Group(); player.add(rig);
{
  const hood = new THREE.MeshLambertMaterial({ color: new THREE.Color(1.0, 0.52, 0.22) });
  const trim = new THREE.MeshLambertMaterial({ color: new THREE.Color(1.0, 0.93, 0.8) });
  const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(1.0, 0.85, 0.74) });
  const dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.13, 0.28) });
  const brown = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.55, 0.36, 0.28) });
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); rig.add(me); return me; };
  add(new THREE.CylinderGeometry(0.26, 0.36, 0.6, 10), hood, 0, 0.36, 0);
  add(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 10), trim, 0, 0.1, 0);
  add(new THREE.SphereGeometry(0.34, 12, 9), hood, 0, 0.88, -0.03);
  add(new THREE.SphereGeometry(0.25, 10, 8), skin, 0, 0.86, 0.15, 1, 0.95, 0.7);
  add(new THREE.SphereGeometry(0.045, 6, 5), dark, -0.09, 0.88, 0.3); add(new THREE.SphereGeometry(0.045, 6, 5), dark, 0.09, 0.88, 0.3);
  add(new THREE.ConeGeometry(0.11, 0.26, 6), hood, -0.2, 1.22, -0.05); add(new THREE.ConeGeometry(0.11, 0.26, 6), hood, 0.2, 1.22, -0.05);
  add(new THREE.BoxGeometry(0.4, 0.4, 0.22), brown, 0, 0.42, -0.34);
}
const ringTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,240,200,.25)'); g.addColorStop(0.55, 'rgba(255,240,210,.3)'); g.addColorStop(0.72, 'rgba(255,255,255,1)'); g.addColorStop(0.84, 'rgba(255,225,190,.5)'); g.addColorStop(1, 'rgba(255,220,190,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();
const glowRing = new THREE.Mesh(flatQuad, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
glowRing.scale.setScalar(2.9); glowRing.position.y = 0.08; glowRing.renderOrder = 2; player.add(glowRing);

// ═════════════════════════ 게임 로직 ═════════════════════════
const ET = [
  { hp: 3, sp: 2.1, r: 0.40, dps: 9, xp: 1, s: 0.85, col: [1.0, 0.62, 0.76] },
  { hp: 8, sp: 1.8, r: 0.55, dps: 12, xp: 2, s: 1.15, col: [0.55, 0.92, 0.78] },
  { hp: 2.5, sp: 3.5, r: 0.32, dps: 7, xp: 1, s: 0.7, col: [0.74, 0.64, 0.97] },
  { hp: 340, sp: 1.7, r: 1.8, dps: 30, xp: 60, s: 4.0, col: [1.0, 0.76, 0.42] },
];
const EF = ['x', 'z', 'vx', 'vz', 'hp', 'ph', 'flash', 'leafCd', 'age', 'sv', 'type', 'dead'];
const E = { n: 0 };
for (const f of EF) E[f] = f === 'type' || f === 'dead' ? new Uint8Array(CAP + 4) : new Float32Array(CAP + 4);
const G = { n: 0, x: new Float32Array(GEM_MAX), z: new Float32Array(GEM_MAX), v: new Float32Array(GEM_MAX), mag: new Uint8Array(GEM_MAX), ph: new Float32Array(GEM_MAX), sp: new Float32Array(GEM_MAX) };
const PT = { n: 0, x: new Float32Array(PET_MAX), z: new Float32Array(PET_MAX), vx: new Float32Array(PET_MAX), vz: new Float32Array(PET_MAX), life: new Float32Array(PET_MAX), pierce: new Uint8Array(PET_MAX), dmg: new Float32Array(PET_MAX) };
const PF = { n: 0, x: new Float32Array(PUF_MAX), y: new Float32Array(PUF_MAX), z: new Float32Array(PUF_MAX), vx: new Float32Array(PUF_MAX), vy: new Float32Array(PUF_MAX), vz: new Float32Array(PUF_MAX), life: new Float32Array(PUF_MAX), r: new Float32Array(PUF_MAX), c: new Float32Array(PUF_MAX * 3) };
const NUMS = [];
let S = 'menu';
let P, T, kills, bossAlive, bossIdx, siegeNext, spawnAcc, shake, hurtT, invul, camT = new THREE.Vector3(), camLook = new THREE.Vector3(), camPitch = 24, camDistCur = 27, pending = 0, sndOn = true;
let cdSlash, cdPetal, leafAng;
const input = { x: 0, y: 0 }, keys = {};
let spawnR = 28;

function resetGame() {
  P = { x: 0, z: 0, hp: 100, hpMax: 100, speed: 5.6, magnet: 2.6, lvl: 1, xp: 0, need: needFor(1), face: 0, bob: 0,
    w: { slash: 1, petal: 0, leaf: 0 }, p: { speed: 0, hp: 0, magnet: 0 } };
  T = 0; kills = 0; bossAlive = false; siegeNext = 35; spawnAcc = 0; shake = 0; hurtT = 0; invul = 0; pending = 0;
  cdSlash = 0.6; cdPetal = 0.5; leafAng = 0;
  E.n = 0; G.n = 0; PT.n = 0; PF.n = 0; NUMS.length = 0;
  camT.set(0, 0, 0);
  $('bossbar').style.display = 'none';
}
function needFor(l) { return Math.round(4 + l * 4.2 + l * l * 0.55); }

// ── 스폰 ──
function spawnEnemy(type, x, z) {
  if (E.n >= CAP) return -1;
  const i = E.n++, t = ET[type];
  E.x[i] = x; E.z[i] = z; E.vx[i] = 0; E.vz[i] = 0; E.type[i] = type; E.dead[i] = 0;
  E.hp[i] = type === 3 ? t.hp : t.hp * (1 + T / 110); E.ph[i] = rnd(TAU); E.sv[i] = rnd(0.82, 1.2); E.flash[i] = 0; E.leafCd[i] = 0; E.age[i] = 0;
  return i;
}
function pickType() {
  const r = Math.random();
  if (T > RUN_SEC * 0.3 && r < 0.22) return 1;
  if (T > RUN_SEC * 0.12 && r < 0.45) return 2;
  if (T > RUN_SEC * 0.2 && r < 0.6) return 1;
  return 0;
}
function spawnOne() { const a = rnd(TAU), R = spawnR + rnd(-1, 4); spawnEnemy(pickType(), P.x + Math.cos(a) * R, P.z + Math.sin(a) * R); }
function siege() {
  const n = Math.min(26, CAP - E.n - 4); if (n <= 0) return;
  const R = 14;
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; spawnEnemy(k % 3 === 2 ? 1 : 0, P.x + Math.cos(a) * R, P.z + Math.sin(a) * R); }
  banner('포위 웨이브!');
}
function targetCount() { return Math.min(CAP - 12, Math.round(7 + T * 0.5 + (T / RUN_SEC) * 12)); }

// ── 효과 ──
function puff(x, z, col, n, y = 0.5) {
  for (let k = 0; k < n && PF.n < PUF_MAX; k++) {
    const i = PF.n++, a = rnd(TAU), s = rnd(1.5, 3.6);
    PF.x[i] = x; PF.y[i] = y; PF.z[i] = z; PF.vx[i] = Math.cos(a) * s; PF.vz[i] = Math.sin(a) * s; PF.vy[i] = rnd(2, 4.5);
    PF.life[i] = rnd(0.35, 0.6); PF.r[i] = rnd(0.12, 0.24); PF.c[i * 3] = col[0]; PF.c[i * 3 + 1] = col[1]; PF.c[i * 3 + 2] = col[2];
  }
}
function number(x, z, txt, big) { if (NUMS.length < 36) NUMS.push({ x, y: 1.4, z, t: 0, txt, big }); }
function banner(txt) { const b = $('banner'); b.textContent = txt; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function addGem(x, z, v) {
  let i;
  if (G.n >= GEM_MAX) { i = (Math.random() * G.n) | 0; G.v[i] += v; return; }
  i = G.n++; G.x[i] = x + rnd(-0.5, 0.5); G.z[i] = z + rnd(-0.5, 0.5); G.v[i] = v; G.mag[i] = 0; G.ph[i] = rnd(TAU); G.sp[i] = 0;
}

// ── 소리 ──
let actx = null; const lastSnd = {};
function snd(kind) {
  if (!sndOn || !actx) return;
  const now = actx.currentTime; if (lastSnd[kind] && now - lastSnd[kind] < 0.05) return; lastSnd[kind] = now;
  const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
  const S_ = { pop: [520, 880, 'sine', 0.05, 0.09], gem: [1250, 1700, 'sine', 0.025, 0.06], hit: [300, 180, 'triangle', 0.04, 0.07], slash: [260, 520, 'sawtooth', 0.02, 0.2], hurt: [160, 90, 'sawtooth', 0.05, 0.15], lvl: [660, 1320, 'sine', 0.07, 0.35] }[kind];
  o.type = S_[2]; o.frequency.setValueAtTime(S_[0], now); o.frequency.exponentialRampToValueAtTime(S_[1], now + S_[4]);
  g.gain.setValueAtTime(S_[3], now); g.gain.exponentialRampToValueAtTime(0.0001, now + S_[4] + 0.05); o.start(now); o.stop(now + S_[4] + 0.08);
}

// ── 데미지 ──
function hurtEnemy(i, dmg, kx, kz, kb) {
  if (E.dead[i]) return;
  E.hp[i] -= dmg; E.flash[i] = 1;
  const boss = E.type[i] === 3;
  const m = boss ? 0.04 : 1; E.vx[i] += kx * kb * m; E.vz[i] += kz * kb * m;
  number(E.x[i], E.z[i], String(Math.max(1, Math.round(dmg))), boss);
  if (E.hp[i] <= 0) killEnemy(i); else snd('hit');
}
function killEnemy(i) {
  E.dead[i] = 1; kills++;
  const t = ET[E.type[i]];
  puff(E.x[i], E.z[i], t.col, E.type[i] === 3 ? 30 : 5);
  if (E.type[i] === 3) {
    bossAlive = false; $('bossbar').style.display = 'none'; banner('황혼 젤리를 쓰러뜨렸어요!');
    for (let k = 0; k < 14; k++) addGem(E.x[i] + rnd(-3, 3), E.z[i] + rnd(-3, 3), 5);
    snd('lvl');
  } else addGem(E.x[i], E.z[i], t.xp);
  snd('pop');
}
function hurtPlayer(dps, dt) {
  if (invul > 0) return;
  P.hp -= dps * dt * 0.5; hurtT = Math.min(1, hurtT + dt * 3); shake = Math.max(shake, 0.12);
  if (Math.random() < dt * 4) snd('hurt');
  if (P.hp <= 0) { P.hp = 0; endGame(false); }
}

// ── 무기 ──
function slashStats() { const l = P.w.slash; return { R: 3.3 * Math.pow(1.13, l - 1), cd: 1.5 * Math.pow(0.9, l - 1), dmg: 3 + (l - 1) * 1.1 }; }
function fireSlash() {
  const s = slashStats();
  for (const v of slashVfx) if (v.t > 0.5) { v.t = 0; v.R = s.R; v.g.visible = true; v.g.position.x = P.x; v.g.position.z = P.z; break; }
  snd('slash');
  for (let i = 0; i < E.n; i++) {
    if (E.dead[i]) continue;
    const dx = E.x[i] - P.x, dz = E.z[i] - P.z, d = Math.hypot(dx, dz), rr = s.R + ET[E.type[i]].r;
    if (d < rr) hurtEnemy(i, s.dmg, dx / (d + 0.01), dz / (d + 0.01), 8);
  }
}
function firePetals() {
  const l = P.w.petal, cnt = Math.min(1 + l, 6), dmg = 2.4 + l * 0.7;
  // 가까운 적 순으로
  const cand = [];
  for (let i = 0; i < E.n; i++) { if (E.dead[i]) continue; const d = (E.x[i] - P.x) ** 2 + (E.z[i] - P.z) ** 2; if (d < 18 * 18) cand.push([d, i]); }
  cand.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < cnt && PT.n < PET_MAX; k++) {
    const i = PT.n++; let ang;
    if (cand.length) { const j = cand[Math.min(k, cand.length - 1)][1]; ang = Math.atan2(E.z[j] - P.z, E.x[j] - P.x) + rnd(-0.25, 0.25); } else ang = rnd(TAU);
    PT.x[i] = P.x; PT.z[i] = P.z; PT.vx[i] = Math.cos(ang) * 9; PT.vz[i] = Math.sin(ang) * 9; PT.life[i] = 2.4; PT.pierce[i] = l >= 4 ? 1 : 0; PT.dmg[i] = dmg;
  }
}
function updatePetals(dt) {
  for (let i = PT.n - 1; i >= 0; i--) {
    PT.life[i] -= dt;
    // 유도
    let bj = -1, bd = 14 * 14;
    for (let j = 0; j < E.n; j++) { if (E.dead[j]) continue; const d = (E.x[j] - PT.x[i]) ** 2 + (E.z[j] - PT.z[i]) ** 2; if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) {
      const dx = E.x[bj] - PT.x[i], dz = E.z[bj] - PT.z[i], d = Math.hypot(dx, dz) + 0.001;
      const k = 1 - Math.exp(-7 * dt);
      PT.vx[i] = lerp(PT.vx[i], dx / d * 12, k); PT.vz[i] = lerp(PT.vz[i], dz / d * 12, k);
    }
    PT.x[i] += PT.vx[i] * dt; PT.z[i] += PT.vz[i] * dt;
    let hit = false;
    for (let j = 0; j < E.n && !hit; j++) {
      if (E.dead[j]) continue;
      const dx = E.x[j] - PT.x[i], dz = E.z[j] - PT.z[i], r = ET[E.type[j]].r + 0.3;
      if (dx * dx + dz * dz < r * r) { const d = Math.hypot(dx, dz) + 0.01; hurtEnemy(j, PT.dmg[i], dx / d, dz / d, 3); puff(PT.x[i], PT.z[i], [1, 0.7, 0.85], 2, 0.8); if (PT.pierce[i] > 0) { PT.pierce[i]--; PT.x[i] += PT.vx[i] * 0.05; } else hit = true; }
    }
    if (hit || PT.life[i] <= 0) { PT.n--; for (const f of ['x', 'z', 'vx', 'vz', 'life', 'pierce', 'dmg']) PT[f][i] = PT[f][PT.n]; }
  }
}
const leafPos = [];
function updateLeaves(dt) {
  const l = P.w.leaf; if (!l) { leafMesh.count = 0; return; }
  const cnt = Math.min(1 + l, 6), R = 2.7, spd = 2.3 + l * 0.25;
  leafAng += spd * dt; leafMesh.count = cnt;
  for (let k = 0; k < cnt; k++) {
    const a = leafAng + (k / cnt) * TAU, lx = P.x + Math.cos(a) * R, lz = P.z + Math.sin(a) * R;
    dummy.position.set(lx, 0.8 + Math.sin(leafAng * 2 + k) * 0.08, lz); dummy.rotation.set(0, -a, 0); dummy.scale.setScalar(1.15); dummy.updateMatrix(); leafMesh.setMatrixAt(k, dummy.matrix);
    for (let j = 0; j < E.n; j++) {
      if (E.dead[j] || E.leafCd[j] > 0) continue;
      const dx = E.x[j] - lx, dz = E.z[j] - lz, r = ET[E.type[j]].r + 0.55;
      if (dx * dx + dz * dz < r * r) { E.leafCd[j] = 0.4; const d = Math.hypot(dx, dz) + 0.01; hurtEnemy(j, 2 + l * 0.8, dx / d, dz / d, 5); }
    }
  }
  leafMesh.instanceMatrix.needsUpdate = true;
}

// ── 레벨업 카드 ──
const UPG = {
  slash: { ic: '🌀', nm: '바람 베기', max: 6, kind: 'w', d: l => '범위·위력이 커지고 더 자주 불어요' },
  petal: { ic: '🌸', nm: '꽃잎 화살', max: 5, kind: 'w', d: l => l ? '꽃잎이 한 장 더 늘어요' : '가까운 적을 쫓아가는 꽃잎을 날려요' },
  leaf: { ic: '🍃', nm: '맴도는 잎', max: 5, kind: 'w', d: l => l ? '잎이 한 장 더, 더 빨리 돌아요' : '몸 주변을 도는 잎이 적을 베어요' },
  speed: { ic: '👟', nm: '가벼운 발걸음', max: 5, kind: 'p', d: () => '이동 속도 +10%' },
  hp: { ic: '🍙', nm: '든든한 도시락', max: 5, kind: 'p', d: () => '최대 체력 +20 · 체력 20 회복' },
  magnet: { ic: '🧲', nm: '반짝이 자석', max: 5, kind: 'p', d: () => '경험치 줍는 범위 +35%' },
  heal: { ic: '🍓', nm: '간식 타임', max: 99, kind: 'h', d: () => '체력을 40% 회복해요' },
};
function lvlOf(k) { return UPG[k].kind === 'w' ? P.w[k] : UPG[k].kind === 'p' ? P.p[k] : 0; }
function openCards() {
  const pool = [];
  for (const k in UPG) { if (k === 'heal') continue; if (lvlOf(k) < UPG[k].max) { pool.push(k); if (UPG[k].kind === 'w' && lvlOf(k) === 0) pool.push(k); } }
  if (P.hp < P.hpMax * 0.8) pool.push('heal', 'heal');
  const picks = [];
  while (picks.length < 3 && pool.length) { const k = pool[(Math.random() * pool.length) | 0]; picks.push(k); for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === k) pool.splice(i, 1); }
  while (picks.length < 3) picks.push('heal');
  const row = $('cardrow'); row.innerHTML = '';
  picks.forEach((k, idx) => {
    const u = UPG[k], l = lvlOf(k), b = document.createElement('button'); b.className = 'ucard';
    const tag = k === 'heal' ? '회복' : l === 0 ? '새 무기!' : 'Lv ' + l + ' → ' + (l + 1);
    b.innerHTML = `<div class="ic">${u.ic}</div><b>${u.nm}</b><em>${tag}</em><span>${u.d(l)}</span>`;
    b.addEventListener('click', () => chooseCard(k));
    row.appendChild(b);
  });
  S = 'card'; $('cards').classList.remove('hidden'); snd('lvl');
}
function chooseCard(k) {
  const u = UPG[k];
  if (u.kind === 'w') P.w[k]++;
  else if (u.kind === 'p') { P.p[k]++; if (k === 'speed') P.speed *= 1.1; if (k === 'hp') { P.hpMax += 20; P.hp = Math.min(P.hpMax, P.hp + 20); } if (k === 'magnet') P.magnet *= 1.35; }
  else P.hp = Math.min(P.hpMax, P.hp + P.hpMax * 0.4);
  $('cards').classList.add('hidden'); S = 'play'; invul = 0.8;
  if (pending > 0) { pending--; levelUp(); }
}
function levelUp() { P.lvl++; P.xp -= P.need; P.need = needFor(P.lvl); openCards(); }
function gainXP(v) { P.xp += v; if (P.xp >= P.need && S === 'play') levelUp(); else if (P.xp >= P.need) pending++; }

function endGame(win) {
  if (S === 'over') return; S = 'over';
  $('overTitle').textContent = win ? '5분 생존 성공! 🌅' : '쓰러졌어요';
  $('overSub').textContent = win ? '노을이 지는 초원을 끝까지 지켜냈어요.' : '괜찮아요, 한 번 더 해볼까요?';
  $('sTime').textContent = fmt(T); $('sLv').textContent = P.lvl; $('sKill').textContent = kills;
  setTimeout(() => { if (S === 'over') $('over').classList.remove('hidden'); }, win ? 600 : 900);
}
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

// ── 적 업데이트 ──
const gridHead = new Int32Array(1024), gridNext = new Int32Array(CAP + 4);
const gh = (cx, cz) => (Math.imul(cx, 92837111) ^ Math.imul(cz, 689287499)) & 1023;
function updateEnemies(dt) {
  gridHead.fill(-1);
  for (let i = 0; i < E.n; i++) { const h = gh(Math.floor(E.x[i] / 2), Math.floor(E.z[i] / 2)); gridNext[i] = gridHead[h]; gridHead[h] = i; }
  let touch = 0;
  for (let i = 0; i < E.n; i++) {
    if (E.dead[i]) continue;
    const t = ET[E.type[i]];
    const dx = P.x - E.x[i], dz = P.z - E.z[i], d = Math.hypot(dx, dz) + 0.001;
    const boost = 1 + clamp((d - 18) / 10, 0, 1.6);
    const sp = t.sp * E.sv[i] * boost * (1 + T / RUN_SEC * 0.25);
    E.age[i] += dt; E.ph[i] += dt * (6 + sp);
    E.leafCd[i] -= dt; E.flash[i] = Math.max(0, E.flash[i] - dt * 8);
    const wob = Math.sin(E.ph[i] * 0.4) * 0.35; let mx = (dx / d - dz / d * wob) * sp + E.vx[i], mz = (dz / d + dx / d * wob) * sp + E.vz[i];
    E.vx[i] *= Math.exp(-7 * dt); E.vz[i] *= Math.exp(-7 * dt);
    E.x[i] += mx * dt; E.z[i] += mz * dt;
    if (d < t.r + 0.38) touch += t.dps * (1 + T / RUN_SEC * 0.7);
    // 겹침 방지
    const cx = Math.floor(E.x[i] / 2), cz = Math.floor(E.z[i] / 2);
    for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
      for (let j = gridHead[gh(cx + ax, cz + az)]; j >= 0; j = gridNext[j]) {
        if (j <= i || E.dead[j]) continue;
        const ox = E.x[i] - E.x[j], oz = E.z[i] - E.z[j], rr = (t.r + ET[E.type[j]].r) * 0.9, dd2 = ox * ox + oz * oz;
        if (dd2 < rr * rr && dd2 > 1e-6) { const dd = Math.sqrt(dd2), push = (rr - dd) * 0.5 * Math.min(1, dt * 14); const nx = ox / dd, nz = oz / dd; const wi = E.type[i] === 3 ? 0.1 : 1, wj = E.type[j] === 3 ? 0.1 : 1; E.x[i] += nx * push * wi; E.z[i] += nz * push * wi; E.x[j] -= nx * push * wj; E.z[j] -= nz * push * wj; }
      }
    }
    if (d > 48 && E.type[i] !== 3) { const a = rnd(TAU); E.x[i] = P.x + Math.cos(a) * spawnR; E.z[i] = P.z + Math.sin(a) * spawnR; E.age[i] = 0; }
  }
  if (touch > 0) hurtPlayer(touch, dt);
  // 정리
  let w = 0;
  for (let i = 0; i < E.n; i++) {
    if (E.dead[i]) continue;
    if (w !== i) for (const f of EF) E[f][w] = E[f][i];
    w++;
  }
  E.n = w;
  // 보스 바
  if (bossAlive) { for (let i = 0; i < E.n; i++) if (E.type[i] === 3) { $('bossFill').style.width = clamp(E.hp[i] / ET[3].hp * 100, 0, 100) + '%'; break; } }
}

function updateGems(dt) {
  for (let i = G.n - 1; i >= 0; i--) {
    const dx = P.x - G.x[i], dz = P.z - G.z[i], d = Math.hypot(dx, dz);
    G.ph[i] += dt * 3;
    if (!G.mag[i] && d < P.magnet) G.mag[i] = 1;
    if (G.mag[i]) { G.sp[i] += dt * 30; const s = Math.min(G.sp[i], 22) * dt; G.x[i] += dx / (d + 0.001) * s; G.z[i] += dz / (d + 0.001) * s; }
    if (d < 0.7) { gainXP(G.v[i]); snd('gem'); G.n--; for (const f of ['x', 'z', 'v', 'mag', 'ph', 'sp']) G[f][i] = G[f][G.n]; }
  }
}

// ── 메인 업데이트 ──
function streamD(x, z) { let q = z - (11 * Math.sin(x * 0.045) + 5 * Math.sin(x * 0.11 + 1.3)) + 16; q = ((q + 60) % 120 + 120) % 120 - 60; return Math.abs(q); }
function readInput() {
  let x = input.x, y = input.y;
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; }
  if (BOT) { const b = botInput(); x = b[0]; y = b[1]; }
  return [x, y];
}
function update(dt) {
  T += dt;
  if (T >= RUN_SEC) { for (let i = 0; i < E.n; i++) { puff(E.x[i], E.z[i], ET[E.type[i]].col, 2); E.dead[i] = 1; } E.n = 0; endGame(true); return; }
  invul = Math.max(0, invul - dt); P.hp = Math.min(P.hpMax, P.hp + dt * 1.2);
  const [ix, iy] = readInput();
  let m = Math.hypot(ix, iy); const dead = 0.1;
  if (m > dead) {
    const k = Math.min(1, (m - dead) / (1 - dead)); let sp = P.speed * k;
    if (streamD(P.x, P.z) < 3.6) sp *= 0.8;
    P.x += ix / m * sp * dt; P.z += iy / m * sp * dt; P.face = Math.atan2(ix, iy); P.bob += dt * 11 * k;
  }
  // 스폰
  const tc = targetCount();
  spawnAcc += dt * (3 + T * 0.04);
  while (spawnAcc >= 1) { spawnAcc -= 1; if (E.n < tc) spawnOne(); }
  if (E.n < tc * 0.5) spawnOne();
  if (T >= siegeNext) { siege(); siegeNext += 40; }
  if (!bossAlive && T >= BOSS_AT && T < BOSS_AT + 1 && !bossIdx) { const a = rnd(TAU); bossIdx = 1; if (spawnEnemy(3, P.x + Math.cos(a) * 20, P.z + Math.sin(a) * 20) >= 0) { bossAlive = true; $('bossbar').style.display = 'block'; banner('황혼 젤리 등장!'); } }
  // 무기
  cdSlash -= dt; if (cdSlash <= 0) { fireSlash(); cdSlash = slashStats().cd; }
  if (P.w.petal) { cdPetal -= dt; if (cdPetal <= 0) { firePetals(); cdPetal = 1.25 * Math.pow(0.93, P.w.petal); } }
  updatePetals(dt); updateLeaves(dt);
  updateEnemies(dt);
  updateGems(dt);
}

// ═════════════════════════ 렌더 갱신 ═════════════════════════
const camPos = new THREE.Vector3();
function viewFactor(aspect) { return 1 + clamp((1.15 - aspect) * 0.55, 0, 0.5); }
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const fx = $('fx'); fx.width = w; fx.height = h;
  spawnR = (VIEWS[viewIdx].dist * viewFactor(w / h)) * 0.95 + 8 + (viewIdx === 1 ? 8 : 0);
  $('rot').style.display = (h > w && isTouch) ? 'block' : 'none';
}
function updateCamera(dt, realDt) {
  const v = VIEWS[viewIdx];
  const calm = S === 'menu' || S === 'over';
  const kk = 1 - Math.exp(-(calm ? 1.2 : 1.6) * realDt);
  camPitch = lerp(camPitch, calm ? 24 : v.pitch, kk);
  camDistCur = lerp(camDistCur, (calm ? 27 : v.dist) * viewFactor(camera.aspect), kk);
  const tgt = tmpA.set(P.x, 0, P.z);
  camT.lerp(tgt, 1 - Math.exp(-9 * realDt));
  const p = camPitch * Math.PI / 180;
  const sx = shake > 0 ? rnd(-1, 1) * shake : 0, sz = shake > 0 ? rnd(-1, 1) * shake : 0; shake = Math.max(0, shake - realDt * 0.6);
  camera.position.set(camT.x + sx, Math.sin(p) * camDistCur + 0.5, camT.z + Math.cos(p) * camDistCur + sz);
  camera.lookAt(camT.x, 0.5, camT.z - 2.2);
  sky.position.copy(camera.position);
}
function renderDynamic(realDt, now) {
  // 플레이어
  player.position.set(P.x, 0, P.z);
  rig.rotation.y = lerp(rig.rotation.y, P.face, 1 - Math.exp(-14 * realDt));
  rig.position.y = Math.abs(Math.sin(P.bob)) * 0.1; rig.rotation.z = Math.sin(P.bob) * 0.06;
  glowRing.material.opacity = 0.85 + 0.15 * Math.sin(now / 250);
  glowRing.scale.setScalar(2.9 + 0.12 * Math.sin(now / 300));
  player.visible = true;
  if (invul > 0) player.visible = Math.floor(now / 70) % 2 === 0 || invul > 0.5 ? true : true;
  U.uPlayer.value.set(P.x, 0, P.z);
  // 적
  const n = E.n;
  for (let i = 0; i < n; i++) {
    const t = ET[E.type[i]], dx = P.x - E.x[i], dz = P.z - E.z[i];
    const g = Math.min(1, E.age[i] * 2.2), sq = 1 + 0.07 * Math.sin(E.ph[i] * 1.3);
    const s = t.s * g * (1 + E.flash[i] * 0.15);
    dummy.position.set(E.x[i], Math.abs(Math.sin(E.ph[i] * 0.65)) * 0.14 * t.s, E.z[i]);
    dummy.rotation.set(0, Math.atan2(dx, dz), 0); dummy.scale.set(s / sq, s * sq, s / sq); dummy.updateMatrix();
    enemyMesh.setMatrixAt(i, dummy.matrix);
    const f = E.flash[i], c = t.col, k = i * 3, ca = enemyMesh.instanceColor.array;
    ca[k] = c[0] + (2.2 - c[0]) * f; ca[k + 1] = c[1] + (2.2 - c[1]) * f; ca[k + 2] = c[2] + (2.2 - c[2]) * f;
    dummy.position.y = 0.05; dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(t.s * g * 1.35 + 0.3); dummy.updateMatrix(); shadowMesh.setMatrixAt(i, dummy.matrix);
  }
  dummy.position.set(P.x, 0.05, P.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1.3); dummy.updateMatrix(); shadowMesh.setMatrixAt(n, dummy.matrix);
  enemyMesh.count = n; shadowMesh.count = n + 1;
  enemyMesh.instanceMatrix.needsUpdate = true; enemyMesh.instanceColor.needsUpdate = true; shadowMesh.instanceMatrix.needsUpdate = true;
  // 보석
  for (let i = 0; i < G.n; i++) {
    const v = G.v[i], k = i * 3, ca = gemMesh.instanceColor.array;
    if (v >= 5) { ca[k] = 1; ca[k + 1] = 0.85; ca[k + 2] = 0.4; } else if (v >= 2) { ca[k] = 0.65; ca[k + 1] = 0.7; ca[k + 2] = 1; } else { ca[k] = 0.4; ca[k + 1] = 0.95; ca[k + 2] = 1; }
    const sc = v >= 5 ? 1.5 : v >= 2 ? 1.2 : 1;
    dummy.position.set(G.x[i], 0.55 + Math.sin(G.ph[i]) * 0.12, G.z[i]); dummy.rotation.set(0, G.ph[i] * 0.8, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); gemMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.1; dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1.7 * sc); dummy.updateMatrix(); gemGlow.setMatrixAt(i, dummy.matrix);
  }
  gemMesh.count = G.n; gemGlow.count = G.n; gemMesh.instanceMatrix.needsUpdate = true; gemMesh.instanceColor.needsUpdate = true; gemGlow.instanceMatrix.needsUpdate = true;
  // 꽃잎 화살
  for (let i = 0; i < PT.n; i++) { dummy.position.set(PT.x[i], 0.9, PT.z[i]); dummy.rotation.set(0, -Math.atan2(PT.vz[i], PT.vx[i]), 0); dummy.scale.setScalar(1); dummy.updateMatrix(); petalMesh.setMatrixAt(i, dummy.matrix); }
  petalMesh.count = PT.n; petalMesh.instanceMatrix.needsUpdate = true;
  // 퍼프
  for (let i = PF.n - 1; i >= 0; i--) {
    PF.life[i] -= realDt; PF.vy[i] -= 12 * realDt; PF.x[i] += PF.vx[i] * realDt; PF.z[i] += PF.vz[i] * realDt; PF.y[i] = Math.max(0.05, PF.y[i] + PF.vy[i] * realDt);
    if (PF.life[i] <= 0) { PF.n--; for (const f of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'r']) PF[f][i] = PF[f][PF.n]; for (let q = 0; q < 3; q++) PF.c[i * 3 + q] = PF.c[PF.n * 3 + q]; }
  }
  for (let i = 0; i < PF.n; i++) {
    dummy.position.set(PF.x[i], PF.y[i], PF.z[i]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(PF.r[i] * Math.min(1, PF.life[i] * 3.5) * 2); dummy.updateMatrix(); puffMesh.setMatrixAt(i, dummy.matrix);
    puffMesh.instanceColor.array.set([PF.c[i * 3], PF.c[i * 3 + 1], PF.c[i * 3 + 2]], i * 3);
  }
  puffMesh.count = PF.n; puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor.needsUpdate = true;
  // 바람 꽃잎
  for (let i = 0; i < AMB_N; i++) {
    const a = amb[i]; a.x += (a.sp * 2.2 + Math.sin(now / 900 + a.ph) * 0.6) * realDt; a.z += (0.9 + Math.cos(now / 700 + a.ph) * 0.5) * realDt; a.y += Math.sin(now / 600 + a.ph * 2) * 0.4 * realDt;
    if (a.x - P.x > 40) a.x -= 80; if (a.x - P.x < -40) a.x += 80; if (a.z - P.z > 40) a.z -= 80; if (a.z - P.z < -40) a.z += 80;
    dummy.position.set(a.x, 1.2 + Math.abs(a.y), a.z); dummy.rotation.set(now / 400 + a.ph, now / 500 + a.ph, 0); dummy.scale.setScalar(1.3); dummy.updateMatrix(); ambMesh.setMatrixAt(i, dummy.matrix);
  }
  ambMesh.instanceMatrix.needsUpdate = true;
  // 바람 베기 VFX
  for (const v of slashVfx) {
    if (!v.g.visible) continue;
    v.t += realDt; const k = v.t / 0.4;
    if (k >= 1) { v.g.visible = false; v.t = 9; continue; }
    const e = 1 - Math.pow(1 - k, 3), r = v.R * (0.35 + 0.65 * e);
    v.g.position.set(P.x, 0.12, P.z); v.g.scale.set(r, 1, r);
    v.ring.material.opacity = (1 - k) * 0.95; v.fill.material.opacity = (1 - k) * (1 - k) * 0.28;
    v.arcs.rotation.y = -k * 3.2; v.arcs.children.forEach(a => a.material.opacity = (1 - k) * 0.8); v.arcs.scale.setScalar(1 + k * 0.3);
  }
}
const fxc = $('fx'), fx = fxc.getContext('2d');
function drawFx(realDt) {
  fx.clearRect(0, 0, fxc.width, fxc.height);
  fx.textAlign = 'center'; fx.lineJoin = 'round';
  for (let i = NUMS.length - 1; i >= 0; i--) {
    const n = NUMS[i]; n.t += realDt; if (n.t > 0.7) { NUMS.splice(i, 1); continue; }
    tmpA.set(n.x, n.y + n.t * 1.6, n.z).project(camera);
    const sx = (tmpA.x * 0.5 + 0.5) * fxc.width, sy = (-tmpA.y * 0.5 + 0.5) * fxc.height;
    const a = 1 - n.t / 0.7; fx.globalAlpha = a;
    fx.font = `800 ${n.big ? 18 : 13}px system-ui,sans-serif`;
    fx.strokeStyle = 'rgba(120,70,170,.7)'; fx.lineWidth = 3; fx.strokeText(n.txt, sx, sy);
    fx.fillStyle = '#fff'; fx.fillText(n.txt, sx, sy);
  }
  fx.globalAlpha = 1;
}
let hudCache = {};
function updateHud() {
  const hp = clamp(P.hp / P.hpMax, 0, 1), xp = clamp(P.xp / P.need, 0, 1);
  const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
  set('hp', (hp * 200 | 0), () => { $('hpFill').style.width = hp * 100 + '%'; $('hpTxt').textContent = 'HP ' + Math.ceil(P.hp); });
  set('xp', (xp * 200 | 0), () => $('xpFill').style.width = xp * 100 + '%');
  set('lv', P.lvl, v => $('lvTxt').textContent = 'Lv ' + v);
  set('tm', Math.ceil(RUN_SEC - T), v => $('timer').textContent = fmt(Math.max(0, v)));
  $('hurt').style.opacity = hurtT; hurtT = Math.max(0, hurtT - 0.02);
}

// ═════════════════════════ 입력 / UI ═════════════════════════
let stickId = null, sox = 0, soy = 0; const stick = $('stick'), knob = $('knob');
const app = $('app');
app.addEventListener('pointerdown', e => {
  if (e.target.closest('button') || S !== 'play' || stickId !== null) return;
  stickId = e.pointerId; sox = e.clientX; soy = e.clientY; stick.classList.remove('hint'); stick.style.left = sox + 'px'; stick.style.top = soy + 'px'; stick.style.bottom = 'auto'; stick.classList.add('on');
  knob.style.transform = 'translate(0,0)'; e.preventDefault();
});
app.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId) return;
  let dx = e.clientX - sox, dy = e.clientY - soy; const R = 52, d = Math.hypot(dx, dy);
  if (d > R) { dx = dx / d * R; dy = dy / d * R; }
  input.x = dx / R; input.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
});
const up = e => { if (e.pointerId !== stickId) return; stickId = null; input.x = input.y = 0; stick.classList.remove('on'); };
app.addEventListener('pointerup', up); app.addEventListener('pointercancel', up);
window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); if (S === 'card' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const b = $('cardrow').children[+e.code.slice(5) - 1]; if (b) b.click(); } if (e.code.startsWith('Arrow')) e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.x = input.y = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden && S === 'play') togglePause(); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
function togglePause() {
  if (S === 'play') { S = 'pause'; $('pause').classList.remove('hidden'); input.x = input.y = 0; stick.classList.remove('on'); stickId = null; }
  else if (S === 'pause') { S = 'play'; $('pause').classList.add('hidden'); }
}
$('bPause').onclick = togglePause; $('bResume').onclick = togglePause;
$('bQ').onclick = () => setGrassQuality((gq + 1) % 4);
$('bView').onclick = () => { viewIdx = 1 - viewIdx; $('bView').textContent = '📐 ' + VIEWS[viewIdx].n; resize(); };
$('bSnd').onclick = () => { sndOn = !sndOn; $('bSnd').textContent = sndOn ? '🔊' : '🔇'; };
if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) $('bFs').style.display = 'none';
$('bFs').onclick = () => { const d = document, el = d.documentElement; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); else { const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } };
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => setGrassQuality(+b.dataset.q));
function startGame() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
  resetGame(); bossIdx = 0;
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('cards').classList.add('hidden'); $('pause').classList.add('hidden');
  S = 'play'; $('hud').style.visibility = 'visible'; if (isTouch) { stick.classList.add('hint'); stick.classList.add('on'); }
  hudCache = {}; banner('바람이 불어와요 🍃');
}
$('bStart').onclick = startGame; $('bRestart').onclick = startGame;

// 테스트용 자동 조작 (?bot=1)
const BOT = Q.has('bot');
function botInput() {
  let fx_ = 0, fz_ = 0, close = 0;
  for (let i = 0; i < E.n; i++) { const dx = P.x - E.x[i], dz = P.z - E.z[i], d2 = dx * dx + dz * dz; if (d2 < 9) close++; if (d2 < 36) { const w = 1 / (d2 + 1); fx_ += dx * w; fz_ += dz * w; } }
  if (close >= 7) { const m = Math.hypot(fx_, fz_) || 1; return [fx_ / m, fz_ / m]; }
  let bd = 1e9, bx = 0, bz = 0;
  for (let i = 0; i < G.n; i++) { const dx = G.x[i] - P.x, dz = G.z[i] - P.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bx = dx; bz = dz; } }
  if (bd < 200) { const m = Math.sqrt(bd) + 0.01; return [bx / m, bz / m]; }
  return [0, 0];
}
setInterval(() => { if (BOT && S === 'card') { const b = $('cardrow').children[(Math.random() * 3) | 0]; b && b.click(); } if (BOT && S === 'over') startGame(); }, 250);

// ═════════════════════════ 루프 ═════════════════════════
$('hud').style.visibility = 'hidden'; resetGame(); bossIdx = 0; setGrassQuality(gq); resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
applyTimeOfDay(0.08);
let last = performance.now(), emaMs = 16, slowFor = 0, simSpeed = Q.has('speed') ? +Q.get('speed') : 1, menuT = 0;
renderer.setAnimationLoop(now => {
  const raw = (now - last) / 1000; last = now; const realDt = Math.min(raw, 0.05);
  U.uTime.value = now / 1000;
  if (S === 'menu' || S === 'over') {
    menuT += realDt; const a = menuT * 0.35; P.x += Math.cos(a) * 2.2 * realDt; P.z += Math.sin(a) * 2.2 * realDt; P.face = a + Math.PI / 2; P.bob += realDt * 6;
  }
  if (S === 'play') { const steps = Math.max(1, Math.round(simSpeed)); for (let k = 0; k < steps; k++) { update(realDt * (simSpeed / steps)); if (S !== 'play') break; } }
  if (S === 'play' || S === 'card' || S === 'pause') applyTimeOfDay(T / RUN_SEC);
  updateCamera(realDt, realDt);
  renderDynamic(realDt, now);
  updateHud(); drawFx(realDt);
  renderer.render(scene, camera);
  if (S === 'play' && !Q.has('noauto') && !document.hidden) {
    emaMs = lerp(emaMs, raw * 1000, 0.04);
    if (emaMs > 27 && pr > 0.8) { slowFor += raw; if (slowFor > 2.5) { pr = Math.max(0.75, pr - 0.25); renderer.setPixelRatio(pr); resize(); slowFor = 0; emaMs = 20; } } else slowFor = 0;
  }
});
function simHeadless(sec, dt = 1 / 30) {
  const log = []; let n = Math.round(sec / dt);
  while (n-- > 0) {
    if (S === 'card') { const b = $('cardrow').children[(Math.random() * 3) | 0]; b.click(); continue; }
    if (S === 'play') update(dt); else break;
    if (((T * 30) | 0) % 900 === 0) log.push([Math.round(T), E.n, Math.round(P.hp), P.lvl, kills]);
  }
  return { S, T, hp: P.hp, lvl: P.lvl, kills, n: E.n, log };
}
window.__game = { camera, sim: simHeadless, get S() { return S; }, get P() { return P; }, get T() { return T; }, E, G, setT: v => { T = v; }, siege, spawnOne, spawnEnemy, get kills() { return kills; }, startGame, chooseCard, fmt, renderer, setPitchView: i => { viewIdx = i; resize(); }, levelUp, debugFill: n => { for (let i = 0; i < n; i++) spawnOne(); }, giveW: (k, l) => { P.w[k] = l; } };
