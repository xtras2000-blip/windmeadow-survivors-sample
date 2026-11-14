// 남양동 탐험 모드 (GTA풍 첫 버전) — three.js r187, 모든 에셋은 코드로 생성
// 지도 데이터 © OpenStreetMap contributors (ODbL)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { MB, clamp, lerp, inPoly } from './explore_world.js';
import { buildCity } from './explore_city.js';
import { Peds, Cars, Shadows } from './explore_npc.js';
THREE.ColorManagement.enabled = false;

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0 || Q.has('touch');
const TAU = Math.PI * 2;
window.addEventListener('error', e => fatal('오류: ' + e.message));
window.addEventListener('unhandledrejection', e => fatal('오류: ' + (e.reason && e.reason.message || e.reason)));
function fatal(msg) { const f = $('fatal'); f.style.display = 'flex'; f.textContent = msg; console.error(msg); }

// ───────── 렌더러 ─────────
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !isTouch, powerPreference: 'high-performance' }); } catch (e) { fatal('이 기기에서는 3D(WebGL)를 쓸 수 없어요.'); throw e; }
const PR_MAX = Q.has('pr') ? +Q.get('pr') : Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2);
let pr = Math.min(PR_MAX, isTouch ? 1.35 : PR_MAX);
renderer.setPixelRatio(pr);
const scene = new THREE.Scene();
const FOGC = new THREE.Color(0.86, 0.91, 0.95);
scene.fog = new THREE.Fog(FOGC, 200, 950);
const camera = new THREE.PerspectiveCamera(52, 1, 0.12, 5200);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1 ? 70 : 52; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// 조명 + 하늘
scene.add(new THREE.HemisphereLight(0xd6e8ff, 0xe0cfa8, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d2, 1.65); sun.position.set(-55, 80, 45); scene.add(sun);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uT: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `varying vec3 vP; uniform float uT;
  float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y); }
  void main(){
    vec3 d=normalize(vP); float h=d.y;
    vec3 hor=vec3(0.86,0.91,0.95), top=vec3(0.30,0.58,0.93);
    vec3 c=mix(hor,top,pow(clamp(h,0.0,1.0),0.5));
    c=mix(c,hor,smoothstep(0.02,-0.2,h));
    vec3 sd=normalize(vec3(-0.55,0.8,0.45)); float s=max(dot(d,sd),0.0);
    c+=vec3(1.0,0.85,0.6)*pow(s,22.0)*0.35+vec3(1.0,0.95,0.8)*pow(s,500.0)*1.5;
    vec2 q=d.xz/(h+0.35)*1.4+vec2(uT*0.004,0.0);
    float n=vn(q*1.0)*0.55+vn(q*2.3)*0.3+vn(q*5.1)*0.15;
    float cl=smoothstep(0.52,0.78,n)*smoothstep(0.0,0.22,h);
    c=mix(c,vec3(1.0,0.99,0.97),cl*0.9);
    gl_FragColor=vec4(c,1.0);
  }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(3800, 24, 12), skyMat); sky.frustumCulled = false; sky.renderOrder = -100; scene.add(sky);

// ───────── 상수/상태 ─────────
const STEP = 0.46, GRAV = 22, JUMP_V = 6.6, PR = 0.34, PH = 1.6;
const P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: true, speed: 0, face: 0, visY: 0, gt: 0, jbuf: 0 };
const cam = { yaw: 0, pitch: 0.42, dist: 7.2, curDist: 7.2, pos: new THREE.Vector3(), look: new THREE.Vector3() };
const input = { sx: 0, sy: 0, keys: new Set(), jump: false, act: false };
let world = null, city, J, FEAT = null, peds, cars, shadows, playerMesh, cab = null;
let started = false, simT = 0;

// ───────── 플레이어 모델 ─────────
function makePlayer() {
  const g = new THREE.Group(), L = (c, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const jacket = L(0xf0883a), pants = L(0x34495e), skin = L(0xffd9b8), hair = L(0x3a2a22), pack = L(0x4aa3a0);
  const box = (w, h, d, ty) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(0, ty, 0); return q; };
  const torso = part(box(0.44, 0.58, 0.26, 0.29), jacket, 0, 0.78, 0);
  const head = part(new THREE.SphereGeometry(0.19, 10, 8), skin, 0, 1.5, 0);
  const cap = part(new THREE.SphereGeometry(0.205, 10, 6, 0, TAU, 0, Math.PI * 0.52), hair, 0, 1.52, -0.01);
  const bill = part(new THREE.BoxGeometry(0.2, 0.03, 0.14), hair, 0, 1.52, 0.2);
  const bp = part(new THREE.BoxGeometry(0.34, 0.42, 0.14), pack, 0, 1.06, -0.2);
  const legL = part(box(0.15, 0.78, 0.17, -0.39), pants, -0.11, 0.78, 0), legR = part(box(0.15, 0.78, 0.17, -0.39), pants, 0.11, 0.78, 0);
  const armL = part(box(0.11, 0.56, 0.13, -0.27), jacket, -0.28, 1.34, 0), armR = part(box(0.11, 0.56, 0.13, -0.27), jacket, 0.28, 1.34, 0);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

// ───────── 승강기 (움직이는 칸 + 문) ─────────
function buildElevator() {
  const F = FEAT, { uv, du, dv, h } = F, yaw = F.yaw;
  const g = new THREE.Group(), mb = new MB(), glow = new MB();
  const Pp = (u, y, v) => { const q = uv(u, v); return [q[0], y, q[1]]; };
  const steel = [.80, .82, .85], mirror = [.88, .92, .96], floorC = [.55, .57, .6], wood = [.72, .6, .45];
  const u0 = .2, u1 = 2.2, v0 = .2, v1 = 2.2, H = 2.35;
  mb.quad(Pp(u0, 0, v0), Pp(u1, 0, v0), Pp(u1, 0, v1), Pp(u0, 0, v1), [0, 1, 0], [0, 0, 1, 1], floorC);
  mb.quad(Pp(u0, H, v0), Pp(u1, H, v0), Pp(u1, H, v1), Pp(u0, H, v1), [0, -1, 0], [0, 0, 1, 1], [.95, .93, .88]);
  mb.quad(Pp(u0, 0, v0), Pp(u0, 0, v1), Pp(u0, H, v1), Pp(u0, H, v0), [du[0], 0, du[1]], [0, 0, 1, 1], mirror);
  mb.quad(Pp(u0, 0, v0), Pp(u1, 0, v0), Pp(u1, H, v0), Pp(u0, H, v0), [dv[0], 0, dv[1]], [0, 0, 1, 1], steel);
  mb.quad(Pp(u0, 0, v1), Pp(u1, 0, v1), Pp(u1, H, v1), Pp(u0, H, v1), [-dv[0], 0, -dv[1]], [0, 0, 1, 1], steel);
  mb.quad(Pp(u1, 0, v0), Pp(u1, 0, .7), Pp(u1, H, .7), Pp(u1, H, v0), [-du[0], 0, -du[1]], [0, 0, 1, 1], steel);
  mb.quad(Pp(u1, 0, 1.7), Pp(u1, 0, v1), Pp(u1, H, v1), Pp(u1, H, 1.7), [-du[0], 0, -du[1]], [0, 0, 1, 1], steel);
  mb.quad(Pp(u1, 2.1, .7), Pp(u1, 2.1, 1.7), Pp(u1, H, 1.7), Pp(u1, H, .7), [-du[0], 0, -du[1]], [0, 0, 1, 1], steel);
  // 손잡이, 조작판
  { const q = uv(.3, 1.2); mb.box(q[0], .95, q[1], .06, .06, 1.7, yaw, [.7, .72, .75]); }
  { const q = uv(1.5, 2.12); glow.box(q[0], 1.25, q[1], .22, .55, .05, yaw, [1, .8, .4]); }
  for (let k = 0; k < 4; k++) { const q = uv(1.5, 2.1); const a = uv(1.3 + (k % 2) * .2, 2.12); glow.box(a[0], 1.1 + Math.floor(k / 2) * .22, a[1], .1, .1, .03, yaw, [1, 1, 1]); }
  glow.box(...(() => { const q = uv(1.2, 1.2); return [q[0], H - .03, q[1]]; })(), 1.2, .05, 1.2, yaw, [1, 1, 1]);
  const m1 = mb.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), m2 = glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m1.frustumCulled = m2.frustumCulled = false; g.add(m1); g.add(m2);
  // 층 표시
  const dc = document.createElement('canvas'); dc.width = 128; dc.height = 64; const dg = dc.getContext('2d'), dtex = new THREE.CanvasTexture(dc);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(.44, .22), new THREE.MeshBasicMaterial({ map: dtex, side: THREE.DoubleSide }));
  { const q = uv(2.17, 1.2); disp.position.set(q[0], 2.2, q[1]); disp.rotation.y = Math.atan2(-du[0], -du[1]); g.add(disp); }
  const drawDisp = txt => { dg.fillStyle = '#10151c'; dg.fillRect(0, 0, 128, 64); dg.fillStyle = '#ff6a3a'; dg.font = '900 40px sans-serif'; dg.textAlign = 'center'; dg.textBaseline = 'middle'; dg.fillText(txt, 64, 34); dtex.needsUpdate = true; };
  drawDisp('1');
  scene.add(g);
  // 문짝 (인스턴스: 칸 2 + 각 정지층 2)
  const nS = F.stops.length, doors = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, 2.1, .05), new THREE.MeshLambertMaterial({ color: 0xc4c8ce }), 2 + nS * 2);
  doors.frustumCulled = false; scene.add(doors);
  const o = new THREE.Object3D(); o.rotation.y = Math.atan2(du[0], du[1]) + Math.PI / 2; // 폭이 v 방향
  cab = { g, y: F.stops[0].y, s: 0, state: 'open', door: 1, v: 0, queue: [], dwell: 0, doors, o, drawDisp, ty: 0, last: '' };
  cab.g.position.y = cab.y; updateDoors();
}
function updateDoors() {
  const F = FEAT, o = cab.o, { uv } = F, cd = cab.door;
  const put = (idx, u, v, y) => { const q = uv(u, v); o.position.set(q[0], y + 1.05, q[1]); o.rotation.set(0, F.yaw + Math.PI / 2, 0); o.updateMatrix(); cab.doors.setMatrixAt(idx, o.matrix); };
  put(0, 2.18, .95 - cd * .5, cab.y); put(1, 2.18, 1.45 + cd * .5, cab.y);
  F.stops.forEach((st, i) => { const d = (cab.s === i && cab.state !== 'moving') ? cab.door : 0; put(2 + i * 2, 2.405, .95 - d * .5, st.y); put(3 + i * 2, 2.405, 1.45 + d * .5, st.y); });
  cab.doors.instanceMatrix.needsUpdate = true;
}
const dynSegs = []; const carSegs = [];
function buildDyn() {
  dynSegs.length = 0; if (!cab) return; const F = FEAT, { uv } = F, y0 = cab.y, y1 = cab.y + 2.3;
  const s = (ua, va, ub, vb, a, b) => { const A = uv(ua, va), B = uv(ub, vb); dynSegs.push(A[0], A[1], B[0], B[1], a, b); };
  s(.2, .2, .2, 2.2, y0, y1); s(.2, .2, 2.2, .2, y0, y1); s(.2, 2.2, 2.2, 2.2, y0, y1); s(2.2, .2, 2.2, .7, y0, y1); s(2.2, 1.7, 2.2, 2.2, y0, y1);
  if (cab.door < 0.55) s(2.2, .7, 2.2, 1.7, y0, y1);
  F.stops.forEach((st, i) => { const open = cab.s === i && cab.state !== 'moving' && cab.door > .55; if (!open) s(2.4, .7, 2.4, 1.7, st.y, st.y + 2.2); });
}
function playerUV() { const F = FEAT, dx = P.x - F.P0[0], dz = P.z - F.P0[1]; return [dx * F.du[0] + dz * F.du[1], dx * F.dv[0] + dz * F.dv[1]]; }
const inCab = () => { if (!FEAT || !cab) return false; const [u, v] = playerUV(); return u > .2 && u < 2.2 && v > .2 && v < 2.2 && Math.abs(P.y - cab.y) < .6; };
function elevCall(s) { if (!cab) return; if (cab.s === s && cab.state !== 'moving') { if (cab.state === 'closing') cab.state = 'opening'; return; } if (!cab.queue.includes(s)) cab.queue.push(s); toast(FEAT.stops[s].name + '으로 승강기를 부릅니다'); }
function elevSelect(s) { if (!cab) return; if (cab.s === s && cab.state !== 'moving') { cab.state = 'opening'; return; } cab.queue = [s]; if (cab.state === 'open' || cab.state === 'opening') cab.state = 'closing'; }
function updateElevator(dt) {
  if (!cab) return;
  const F = FEAT, inside = inCab();
  if (cab.state === 'open') {
    cab.dwell += dt; const [u, v] = playerUV(), inDoor = u > 1.8 && u < 3.0 && v > .5 && v < 1.9 && Math.abs(P.y - cab.y) < .6;
    if (cab.queue.length && !inDoor && cab.dwell > (inside ? 4 : 1.2)) { cab.state = 'closing'; }
  }
  if (cab.state === 'closing') { cab.door -= dt / 1.1; if (cab.door <= 0) { cab.door = 0; cab.state = 'moving'; cab.target = cab.queue.shift(); if (cab.target === undefined) { cab.state = 'opening'; } else cab.s = -1; cab.v = 0; } }
  else if (cab.state === 'moving') {
    const ty = F.stops[cab.target].y, d = ty - cab.y, dirn = Math.sign(d), A = 2.6, VM = 7.5, stopD = cab.v * cab.v / (2 * A);
    if (Math.abs(d) <= Math.max(stopD, 0.001) + 0.02) cab.v = Math.max(cab.v - A * dt, 0.7); else cab.v = Math.min(cab.v + A * dt, VM);
    const step = cab.v * dt; if (Math.abs(d) <= step + 0.005) { cab.y = ty; cab.s = cab.target; cab.state = 'opening'; cab.v = 0; cab.dwell = 0; } else cab.y += dirn * step;
    cab.vy = dirn * cab.v;
  } else if (cab.state === 'opening') { cab.door += dt / 1.3; if (cab.door >= 1) { cab.door = 1; cab.state = 'open'; cab.dwell = 0; } }
  if (cab.state !== 'moving') cab.vy = 0;
  cab.g.position.y = cab.y; updateDoors();
  // 층 표시
  let lbl = cab.s >= 0 ? (F.stops[cab.s].f > F.nF ? 'R' : String(F.stops[cab.s].f)) : (() => { let k = 0; for (let i = 0; i < F.stops.length; i++) if (F.stops[i].y <= cab.y + .5) k = i; return F.stops[k].f > F.nF ? 'R' : String(F.stops[k].f); })();
  if (cab.state === 'moving') lbl = (cab.vy > 0 ? '▲' : '▼') + lbl; if (lbl !== cab.last) { cab.drawDisp(lbl); cab.last = lbl; }
}

// ───────── 바닥/충돌 ─────────
function floorHere(x, z, fy) {
  let f = world.col.floorAt(x, z, fy, STEP);
  if (cab && FEAT) { const F = FEAT, dx = x - F.P0[0], dz = z - F.P0[1], u = dx * F.du[0] + dz * F.du[1], v = dx * F.dv[0] + dz * F.dv[1]; if (u > .2 && u < 2.2 && v > .2 && v < 2.2 && cab.y <= fy + STEP + 0.05 && cab.y > f - 0.001) f = cab.y; }
  return f;
}
const out3 = [0, 0, 0];
function physics(dt) {
  // 입력 → 목표 속도 (카메라 기준)
  let sx = input.sx, sy = input.sy; const K = input.keys;
  if (K.size) { const kx = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0), ky = (K.has('s') || K.has('arrowdown') ? 1 : 0) - (K.has('w') || K.has('arrowup') ? 1 : 0); if (kx || ky) { const l = Math.hypot(kx, ky); sx = kx / l; sy = ky / l; } }
  const mag = Math.min(1, Math.hypot(sx, sy)), fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx;
  let tx = 0, tz = 0, ts = 0;
  if (mag > 0.05) { const dx = rx * sx + fx * (-sy), dz = rz * sx + fz * (-sy), l = Math.hypot(dx, dz) || 1; tx = dx / l; tz = dz / l; const sprint = K.has('shift'); ts = (mag < .55 ? 2.6 : 5.6) * (sprint ? 1.5 : 1) * (mag < .55 ? mag / .55 + .3 : 1); }
  const ac = P.grounded ? 12 : 3.0;
  P.vx += (tx * ts - P.vx) * Math.min(1, dt * ac); P.vz += (tz * ts - P.vz) * Math.min(1, dt * ac);
  // 점프
  P.jbuf -= dt; P.gt -= dt; if (input.jump) { P.jbuf = 0.14; input.jump = false; }
  if (P.grounded) P.gt = 0.1;
  if (P.jbuf > 0 && P.gt > 0) { P.vy = JUMP_V; P.grounded = false; P.gt = 0; P.jbuf = 0; }
  P.vy -= GRAV * dt;
  // 이동 + 충돌
  const x0 = P.x, z0 = P.z; out3[0] = P.x + P.vx * dt; out3[1] = P.z + P.vz * dt; out3[2] = 0;
  buildDyn(); cars.segs(P, carSegs); const dyn = carSegs.length ? dynSegs.concat(carSegs) : dynSegs;
  world.col.resolve(out3, PR, P.y, PH, STEP, dyn);
  if (out3[2]) { const nvx = (out3[0] - x0) / dt, nvz = (out3[1] - z0) / dt; P.vx = nvx; P.vz = nvz; }
  const b = world.bounds; P.x = clamp(out3[0], b[0], b[2]); P.z = clamp(out3[1], b[1], b[3]);
  // 수직
  P.y += P.vy * dt;
  let fl = floorHere(P.x, P.z, P.y);
  let top = 1e9; // 승강기 천장
  if (cab && inCab()) top = cab.y + 2.3 - PH;
  if (P.y > top && P.vy > 0) { P.y = top; P.vy = 0; }
  if (P.y <= fl + 0.0001 && P.vy <= 0) { P.y = fl; P.vy = 0; P.grounded = true; }
  else if (P.grounded && P.vy <= 0.01 && P.y - fl < 0.42 && P.vy > -6) { P.y = fl; P.vy = 0; }
  else P.grounded = false;
  P.speed = Math.hypot(P.vx, P.vz);
  if (P.speed > 0.4) P.face = angLerp(P.face, Math.atan2(P.vx, P.vz), Math.min(1, dt * 14));
  if (P.y < -30) respawn();
}
function angLerp(a, b, t) { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
function respawn() { tpHome(); }

// ───────── 카메라 ─────────
function zoneInfo() {
  if (!FEAT) return null;
  const F = FEAT;
  if (inCab()) return { z: 'cab' };
  const [u, v] = playerUV();
  if (P.y >= F.h - 0.6 && inPoly(P.x, P.z, F.poly)) return { z: 'roof' };
  if (u > 2.2 && u < 14.6 && v > -0.4 && v < 7.8 && P.y < 1.2) return { z: 'lobby' };
  if (u > 2.2 && u < F.L + .4 && v > -0.4 && v < 2.7 && P.y > 2.5 && P.y < F.h - .5) { let k = 2; for (let f = 2; f <= F.nF; f++) if (F.yF(f) <= P.y + .5) k = f; return { z: 'corr', y: F.yF(k) }; }
  return null;
}
function updateCamera(dt, snap) {
  const hx = P.x, hy = P.visY + 1.15, hz = P.z;
  let cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch); const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const zi = zoneInfo(); let D = cam.dist; if (zi && zi.z === 'cab') { cp = Math.cos(Math.max(cam.pitch, .95)); sp = Math.sin(Math.max(cam.pitch, .95)); }
  if (zi && zi.z === 'cab') { D = Math.min(D, 2.3); } else if (zi && zi.z === 'lobby') D = Math.min(D, 5.5);
  // 건물에 가려지면 가까이 당김 (표본 검사)
  let maxD = D; const own = (zi && zi.z === 'roof') ? FEAT.id : -1;
  if (!zi || zi.z === 'roof') {
    const N = 14; for (let i = 1; i <= N; i++) { const t = i / N, d = D * t, cx = hx - fx * cp * d, cy = hy + sp * d, cz = hz - fz * cp * d; if (cy < 0.35 || world.col.solidBuilding(cx, cy, cz, own)) { maxD = Math.max(0.9, D * (i - 1) / N - 0.25); break; } }
  }
  if (maxD < cam.curDist || snap) cam.curDist = maxD; else cam.curDist += (maxD - cam.curDist) * Math.min(1, dt * 4);
  let cx = hx - fx * cp * cam.curDist, cy = hy + sp * cam.curDist, cz = hz - fz * cp * cam.curDist;
  cy = Math.max(cy, P.visY + 0.45);
  if (zi) {
    const F = FEAT, uvToW = (u, v) => [F.P0[0] + F.du[0] * u + F.dv[0] * v, F.P0[1] + F.du[1] * u + F.dv[1] * v];
    const dxx = cx - F.P0[0], dzz = cz - F.P0[1]; let u = dxx * F.du[0] + dzz * F.du[1], v = dxx * F.dv[0] + dzz * F.dv[1];
    if (zi.z === 'lobby') { u = clamp(u, 2.6, 14.2); const door = u > 8.7 && u < 10.1; v = clamp(v, door ? -9 : 0.3, 7.3); cy = clamp(cy, 0.7, 2.8); }
    else if (zi.z === 'cab') { u = clamp(u, 0.4, 2.0); v = clamp(v, 0.4, 2.0); cy = clamp(cy, cab.y + 0.6, cab.y + 2.15); }
    else if (zi.z === 'corr') { u = clamp(u, 2.6, F.L - .3); v = clamp(v, -14, 2.2); cy = clamp(cy, zi.y + 0.4, zi.y + 2.6); }
    else if (zi.z === 'roof') { cy = Math.max(cy, F.h + 0.5); }
    if (zi.z !== 'roof') { const w = uvToW(u, v); cx = w[0]; cz = w[1]; }
  }
  const k = snap ? 1 : 1 - Math.exp(-18 * dt);
  cam.pos.x += (cx - cam.pos.x) * k; cam.pos.y += (cy - cam.pos.y) * k; cam.pos.z += (cz - cam.pos.z) * k;
  camera.position.copy(cam.pos); camera.lookAt(hx, hy + 0.05, hz);
  sky.position.copy(camera.position);
}

// ───────── 입력 ─────────
const app = $('app'), stickEl = $('stick'), knob = $('knob');
let stick = null; const camPtrs = new Map(); let pinchD = 0;
app.addEventListener('contextmenu', e => e.preventDefault());
app.addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('.ctl,.panel')) return; if (!started) return;
  e.preventDefault();
  if (e.pointerType === 'mouse') { camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); app.setPointerCapture(e.pointerId); return; }
  if (e.clientX < innerWidth * 0.5 && !stick) { stick = { id: e.pointerId, x: e.clientX, y: e.clientY }; stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on'); stickEl.classList.remove('hint'); knob.style.transform = ''; app.setPointerCapture(e.pointerId); }
  else { camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); app.setPointerCapture(e.pointerId); if (camPtrs.size === 2) pinchD = pdist(); }
});
const pdist = () => { const a = [...camPtrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
app.addEventListener('pointermove', e => {
  if (stick && e.pointerId === stick.id) { let dx = e.clientX - stick.x, dy = e.clientY - stick.y; const l = Math.hypot(dx, dy), R = 56; if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; const m = Math.min(1, l / R); input.sx = l > 6 ? dx / R : 0; input.sy = l > 6 ? dy / R : 0; if (l <= 6) { input.sx = input.sy = 0; } else { const nm = Math.min(1, (l - 6) / (R - 6)); const nl = Math.hypot(dx, dy) || 1; input.sx = dx / nl * nm; input.sy = dy / nl * nm; } return; }
  const c = camPtrs.get(e.pointerId); if (!c) return;
  const dx = e.clientX - c.x, dy = e.clientY - c.y; c.x = e.clientX; c.y = e.clientY;
  if (camPtrs.size === 2) { const d = pdist(); if (pinchD > 0) cam.dist = clamp(cam.dist * pinchD / d, 2.2, 38); pinchD = d; return; }
  const sens = e.pointerType === 'mouse' ? 0.0055 : 0.0062; cam.yaw += dx * sens; cam.pitch = clamp(cam.pitch + dy * sens * 0.8, 0.04, 1.4);
});
const up = e => { if (stick && e.pointerId === stick.id) { stick = null; input.sx = input.sy = 0; stickEl.classList.remove('on'); knob.style.transform = ''; } camPtrs.delete(e.pointerId); pinchD = 0; };
app.addEventListener('pointerup', up); app.addEventListener('pointercancel', up);
app.addEventListener('wheel', e => { cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * .1), 2.2, 38); e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => { const k = e.key.toLowerCase(); input.keys.add(k); if (k === ' ') { input.jump = true; e.preventDefault(); } if (k === 'e' || k === 'f' || k === 'enter') doAct(); if (k === 'r') camBehind(); if (k === 'q') cam.dist = clamp(cam.dist * .85, 2.2, 38); if (k === 'z') cam.dist = clamp(cam.dist * 1.18, 2.2, 38); });
addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => input.keys.clear());
const bind = (id, fn) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(e); }); };
bind('bJump', () => { input.jump = true; });
bind('bAct', () => doAct());
bind('bZin', () => { cam.dist = clamp(cam.dist * .8, 2.2, 38); }); bind('bZout', () => { cam.dist = clamp(cam.dist * 1.25, 2.2, 38); });
bind('bCam', () => camBehind()); bind('bHome', () => tpHome()); bind('bFs', () => { const d = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen && d.requestFullscreen())); });
let qMode = 0; const QN = ['✨ 자동', '✨ 높음', '✨ 보통', '✨ 낮음']; bind('bQ', () => { qMode = (qMode + 1) % 4; $('bQ').textContent = QN[qMode]; if (qMode) { pr = [0, PR_MAX, Math.min(PR_MAX, 1.0), 0.7][qMode]; renderer.setPixelRatio(pr); } });
function camBehind() { cam.yaw = P.face; cam.pitch = 0.36; }
function doAct() { if (!started || !FEAT) return; const t = actTarget(); if (t) t.fn(); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.opacity = 0, 1800); }

// 상호작용 대상 (승강기 호출 버튼)
function actTarget() {
  if (!FEAT || !cab) return null; const F = FEAT, [u, v] = playerUV();
  if (inCab()) return null;
  for (let i = 0; i < F.stops.length; i++) {
    const st = F.stops[i]; if (Math.abs(P.y - st.y) > 1.3) continue;
    if (u > 1.9 && u < 5.0 && v > -0.2 && v < (i === 0 ? 4.5 : 2.7)) { const open = cab.s === i && cab.state !== 'moving' && cab.door > .5; return { label: open ? '문 열림' : '🛗 승강기 호출', fn: () => elevCall(i) }; }
  }
  return null;
}

// ───────── HUD ─────────
let mmBase = null; const MMS = 0.7;
function buildMinimap() {
  const R = J.meta.render, w = Math.round((R[2] - R[0]) * MMS), h = Math.round((R[3] - R[1]) * MMS), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.scale(MMS, MMS); g.translate(-R[0], -R[1]); g.fillStyle = '#e9e6dc'; g.fillRect(R[0], R[1], R[2] - R[0], R[3] - R[1]);
  const col = { park: '#b8dc9c', wood: '#9acb86', meadow: '#c7e0a0', golf: '#c7e0a0', pitch: '#e8c3a6', play: '#f0d8a0', water: '#8ccaec', sch: '#f3ebc8', park_lot: '#dcdcd8' };
  const path = (p) => { for (let i = 0; i < p.length; i += 2) i ? g.lineTo(p[i], p[i + 1]) : g.moveTo(p[i], p[i + 1]); };
  for (const k of ['sch', 'park_lot', 'meadow', 'golf', 'park', 'wood', 'pitch', 'play', 'water']) for (const a of J.areas) if (a.k === k) { g.fillStyle = col[k]; g.beginPath(); path(a.r[0]); g.closePath(); g.fill(); }
  g.strokeStyle = '#8ccaec'; g.lineCap = 'round'; for (const s of J.streams) { g.lineWidth = Math.max(4, s.w); g.beginPath(); path(s.p); g.stroke(); }
  for (const r of J.roads.slice().sort((a, b) => a.k - b.k)) { g.lineWidth = Math.max(2.4, r.w * 1.0); g.strokeStyle = r.k >= 5 ? '#f2b08c' : r.k >= 3 ? '#fbe29a' : r.k === 0 ? '#f6efe2' : '#ffffff'; g.beginPath(); path(r.p); g.stroke(); }
  for (const b of J.bld) { g.fillStyle = b.t === 'apt' ? '#d9a39a' : b.t === 'sch' ? '#e2c46a' : '#b9b3a8'; g.beginPath(); path(b.r); g.closePath(); g.fill(); }
  mmBase = c;
}
function drawMinimap() {
  const mc = $('mm'), g = mc.getContext('2d'), R = J.meta.render, W = 224, rad = 105; // 반경 105m
  g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, TAU); g.clip();
  const sc = W / (rad * 2) / MMS * 1; g.translate(W / 2, W / 2); g.rotate(cam.yaw + Math.PI); // 위쪽=카메라가 보는 방향
  g.drawImage(mmBase, 0, 0, mmBase.width, mmBase.height, -(P.x - R[0]) * MMS * sc, -(P.z - R[1]) * MMS * sc, mmBase.width * sc, mmBase.height * sc);
  g.fillStyle = '#d8402a'; for (let i = 0; i < cars.N; i++) if (cars.alive[i]) { const dx = (cars.x[i] - P.x) * (W / (rad * 2)), dz = (cars.z[i] - P.z) * (W / (rad * 2)); g.fillRect(dx - 2, dz - 2, 4, 4); }
  g.fillStyle = '#4a74c9'; for (let i = 0; i < peds.N; i++) if (peds.alive[i]) { const dx = (peds.x[i] - P.x) * (W / (rad * 2)), dz = (peds.z[i] - P.z) * (W / (rad * 2)); if (dx * dx + dz * dz < 95 * 95) g.fillRect(dx - 1, dz - 1, 2, 2); }
  g.restore(); g.save(); g.translate(W / 2, W / 2); g.rotate(-(P.face - cam.yaw)); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(-8, 8); g.closePath(); g.fill(); g.fillStyle = '#f0883a'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.restore();
}
let locT = 0, lastLoc = '';
function updateHUD(dt) {
  locT -= dt; if (locT <= 0) {
    locT = .3; let name = '남양동', sub = '', best = 60;
    for (const L of J.labels) { if (L.k === 'road' || L.k === 'water') continue; const d = Math.hypot(L.x - P.x, L.z - P.z); if (d < best) { best = d; name = L.n; sub = (L.f ? L.f + '층 단지' : L.k === 'school' ? '학교' : L.k === 'park' ? '공원' : ''); } }
    if (best >= 60) { let rb = 30; for (const L of J.labels) if (L.k === 'road') { const d = Math.hypot(L.x - P.x, L.z - P.z); if (d < rb) { rb = d; name = L.n; sub = '도로'; } } }
    const zi = zoneInfo(); if (zi) { name = '피오르빌'; sub = zi.z === 'lobby' ? '1층 로비' : zi.z === 'roof' ? '옥상 · 높이 약 ' + FEAT.h + 'm' : zi.z === 'cab' ? '승강기 안' : (() => { let k = 2; for (let f = 2; f <= FEAT.nF; f++) if (FEAT.yF(f) <= P.y + .5) k = f; return k + '층 복도'; })(); }
    const s = name + '|' + sub; if (s !== lastLoc) { lastLoc = s; $('loc').innerHTML = name + '<small>' + (sub || '탐험 모드') + '</small>'; }
    const at = actTarget(), b = $('bAct'); if (at) { b.style.display = 'block'; b.textContent = at.label; } else b.style.display = 'none';
    const showEl = inCab(); const el = $('elev'); if (showEl !== (el.style.display === 'block')) el.style.display = showEl ? 'block' : 'none';
    if (showEl) { $('elevDisp').textContent = cab.last || '1'; $('elevState').textContent = cab.state === 'moving' ? '이동 중' : cab.state === 'open' ? '문 열림' : cab.state === 'closing' ? '문 닫는 중' : cab.state === 'opening' ? '문 여는 중' : ''; [...$('floors').children].forEach(bt => bt.classList.toggle('cur', cab.s === +bt.dataset.i)); }
  }
}
function buildFloorPanel() {
  const F = FEAT, box = $('floors'); box.innerHTML = '';
  for (let i = F.stops.length - 1; i >= 0; i--) { const b = document.createElement('button'); b.textContent = F.stops[i].f > F.nF ? '옥상' : F.stops[i].f; b.dataset.i = i; b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); elevSelect(i); }); box.appendChild(b); }
  // 위가 큰 층이 되도록 DOM 순서는 내림차순이고, cur 표시는 dataset으로 맞춘다
  [...box.children].forEach(bt => { bt._i = +bt.dataset.i; });
}

// ───────── 시작/텔레포트 ─────────
function tpHome() {
  if (!FEAT) return tpStreet(); const F = FEAT, q = F.uv(9.4, -11); P.x = q[0]; P.z = q[1]; P.y = 0; P.vx = P.vz = P.vy = 0; P.visY = 0; P.grounded = true; P.face = Math.atan2(F.dv[0], F.dv[1]); cam.yaw = P.face; cam.pitch = 0.3; cam.dist = 8.5; updateCamera(0.016, true);
}
function tpStreet() { P.x = -52; P.z = 72; P.y = 0; P.vx = P.vz = P.vy = 0; P.visY = 0; P.face = 0; cam.yaw = 0; cam.pitch = .4; updateCamera(.016, true); }

// ───────── 품질 자동 조절 ─────────
const fq = { t: 0, n: 0, acc: 0, fps: 60, lowT: 0, hiT: 0 };
function autoQuality(dt) {
  fq.t += dt; fq.n++; if (fq.t < 1.5) return; const fps = fq.n / fq.t; fq.fps = fps; fq.t = 0; fq.n = 0;
  if (qMode) return;
  if (fps < 38 && pr > 0.62) { pr = Math.max(0.62, pr * 0.86); renderer.setPixelRatio(pr); } else if (fps > 57 && pr < PR_MAX) { fq.hiT++; if (fq.hiT >= 3) { pr = Math.min(PR_MAX, pr * 1.12); renderer.setPixelRatio(pr); fq.hiT = 0; } } else fq.hiT = 0;
}

// ───────── 메인 루프 ─────────
let last = performance.now(), frames = 0, cpuAcc = 0, cpuN = 0, cpuMs = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;
  if (!world) return;
  const tc0 = performance.now();
  if (started) {
    simT += dt; const steps = Math.max(1, Math.ceil(dt / 0.0167)), sdt = dt / steps;
    for (let i = 0; i < steps; i++) { updateElevator(sdt); physics(sdt); }
    // 승강기 이동 중 플레이어 동승 보정: 바닥(칸 위)에 서 있으면 칸 높이로
    shadows.begin(); peds.update(dt, P, shadows); cars.update(dt, P, peds, shadows);
    P.visY += (P.y - P.visY) * Math.min(1, dt * 26); if (Math.abs(P.y - P.visY) > 1.2) P.visY = P.y;
    animatePlayer(dt); shadows.add(P.x, P.visY, P.z, .9, .9, 0); shadows.end();
    world.updateDetail(P.x, P.z, dt);
  }
  updateCamera(dt, false);
  skyMat.uniforms.uT.value = simT + now / 1000;
  const tc1 = performance.now();
  renderer.render(scene, camera);
  cpuAcc += tc1 - tc0; if (++cpuN >= 60) { cpuMs = cpuAcc / cpuN; cpuAcc = 0; cpuN = 0; }
  if (started) { updateHUD(dt); if (frames % 3 === 0) drawMinimap(); autoQuality(dt); }
  if (Q.has('fps') && frames % 20 === 0) { $('fps').textContent = fq.fps.toFixed(0) + 'fps · ' + renderer.info.render.calls + ' calls · ' + (renderer.info.render.triangles / 1000).toFixed(0) + 'k tris · pr ' + pr.toFixed(2); }
}
let walkPh = 0;
function animatePlayer(dt) {
  const u = playerMesh.userData; walkPh += P.speed * dt * 2.1; const sw = P.speed > .3 ? Math.sin(walkPh) * Math.min(1, P.speed / 3) * .8 : 0, air = !P.grounded;
  u.legL.rotation.x = air ? -.5 : sw; u.legR.rotation.x = air ? .4 : -sw; u.armL.rotation.x = air ? -2.2 : -sw * .9; u.armR.rotation.x = air ? -2.2 : sw * .9;
  playerMesh.position.set(P.x, P.visY, P.z); playerMesh.rotation.y = P.face;
  u.torso.position.y = .78 + (P.speed > .3 ? Math.abs(Math.sin(walkPh)) * .03 : 0);
}

// ───────── 시작 ─────────
async function init() {
  J = await (await fetch('./namyang_game.json')).json();
  world = await buildCity(scene, J); city = world; FEAT = world.FEAT;
  const nPed = Q.has('peds') ? +Q.get('peds') : (isTouch ? 70 : 100), nCar = Q.has('cars') ? +Q.get('cars') : (isTouch ? 34 : 48);
  peds = new Peds(scene, world.graph, nPed); cars = new Cars(scene, world.graph, nCar); shadows = new Shadows(scene, nPed + nCar + 4);
  playerMesh = makePlayer(); scene.add(playerMesh);
  if (FEAT) { buildElevator(); buildFloorPanel(); }
  buildMinimap();
  tpHome(); peds.init(P.x, P.z); cars.init(P.x, P.z);
  $('loading').style.display = 'none';
  if (Q.get('mode') === 'explore' && Q.has('autostart') || Q.has('autostart')) startGame(Q.get('at') === 'street' ? 'street' : 'home'); else $('menu').classList.remove('hidden');
  if (isTouch) { stickEl.classList.add('hint'); stickEl.classList.add('on'); }
  requestAnimationFrame(frame);
}
function startGame(where) {
  $('menu').classList.add('hidden'); started = true; if (where === 'street') tpStreet(); else tpHome();
  if (isTouch) { stickEl.classList.add('hint'); }
  setTimeout(() => { stickEl.classList.remove('hint'); if (!stick) stickEl.classList.remove('on'); }, 3500);
}
$('bStartHome').addEventListener('click', () => startGame('home')); $('bStartStreet').addEventListener('click', () => startGame('street'));

// 테스트/디버그용 API
window.__explore = {
  start: startGame, P, cam, input,
  tp(x, z, yaw, pitch, dist) { P.x = x; P.z = z; P.y = floorHere(x, z, 50) > 0 ? P.y : 0; P.vx = P.vz = P.vy = 0; if (yaw !== undefined) cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; P.visY = P.y; updateCamera(.016, true); },
  tpUV(u, v, y) { const q = FEAT.uv(u, v); P.x = q[0]; P.z = q[1]; P.y = y || 0; P.visY = P.y; P.vx = P.vz = P.vy = 0; },
  setCam(yaw, pitch, dist) { if (yaw !== undefined) cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) { cam.dist = dist; } },
  home: tpHome, street: tpStreet, elevCall, elevSelect, jump() { input.jump = true; }, move(sx, sy) { input.sx = sx; input.sy = sy; },
  get FEAT() { return FEAT; }, get cab() { return cab; }, get peds() { return peds; }, get cars() { return cars; }, get col() { return world.col; }, playerUV, inCab, camera, renderer, scene, world: () => world,
  stats() { return { cpuMs, fps: fq.fps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pr, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures, balconies: world.bal.active.size }; }
};
init().catch(e => fatal('불러오기 실패: ' + e.message));
