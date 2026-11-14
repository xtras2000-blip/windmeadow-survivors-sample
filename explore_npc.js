// 탐험 모드 · 보행자(인도/보행로) · 자동차(우측통행 차선) · 그림자
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { hash3, clamp, lerp } from './explore_world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
function lamb(o) { return new THREE.MeshLambertMaterial(o); }
function angLerp(a, b, t) { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
function edgeDir(g, e, dir) { const A = g.nodes[e.a], B = g.nodes[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len; return dir ? [-dx, -dz] : [dx, dz]; }
function edgePt(g, e, dir, s) { const A = g.nodes[dir ? e.b : e.a], d = edgeDir(g, e, dir); return [A.x + d[0] * s, A.z + d[1] * s, d[0], d[1]]; }
function pickNext(g, e, dir, kind) {
  const endN = g.nodes[dir ? e.a : e.b], eid = g.edges.indexOf(e), cand = [];
  for (const id of endN.adj) { if (id === eid) continue; const e2 = g.edges[id]; if (!e2[kind]) continue; const dir2 = (g.nodes[e2.a] === endN) ? 0 : 1; const d1 = edgeDir(g, e, dir), d2 = edgeDir(g, e2, dir2), dot = d1[0] * d2[0] + d1[1] * d2[1]; cand.push([e2, dir2, 0.35 + Math.max(0, dot + 0.3)]); }
  if (!cand.length) return null; let tot = 0; for (const c of cand) tot += c[2]; let r = Math.random() * tot; for (const c of cand) { r -= c[2]; if (r <= 0) return c; } return cand[0];
}
function randomEdgeNear(g, kind, px, pz, rmin, rmax, tries = 10) {
  const grid = kind === 'ped' ? g.gridPed : g.gridCar;
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * TAU, r = rnd(rmin, rmax), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    const ids = g.pick(grid, x, z, 40); if (!ids.length) continue;
    const id = ids[Math.floor(Math.random() * ids.length)], e = g.edges[id], A = g.nodes[e.a], B = g.nodes[e.b], d = Math.hypot((A.x + B.x) / 2 - px, (A.z + B.z) / 2 - pz);
    if (d < rmin * 0.7 || d > rmax * 1.2) continue; return id;
  }
  return -1;
}

// ───────── 그림자 (동그란 블롭) ─────────
export class Shadows {
  constructor(scene, max) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(40,30,20,.55)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), max);
    this.m.frustumCulled = false; this.m.count = 0; this.m.renderOrder = 2; scene.add(this.m); this.n = 0; this.o = new THREE.Object3D(); this.max = max;
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sz, yaw) { if (this.n >= this.max) return; const o = this.o; o.position.set(x, y + 0.04, z); o.rotation.set(0, yaw, 0); o.scale.set(sx, 1, sz); o.updateMatrix(); this.m.setMatrixAt(this.n++, o.matrix); }
  end() { this.m.count = this.n; this.m.instanceMatrix.needsUpdate = true; }
}

// ───────── 보행자 ─────────
export class Peds {
  constructor(scene, g, N) {
    this.g = g; this.N = N;
    const box = (w, h, d, ty) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(0, ty, 0); return q; };
    const head = new THREE.SphereGeometry(0.15, 8, 6); const pos = head.attributes.position, cols = []; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), z = pos.getZ(i); const hair = y > 0.03 || (z < -0.02 && y > -0.08); cols.push(...(hair ? [0.16, 0.12, 0.11] : [1.0, 0.84, 0.70])); } head.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mk = (geo, vc) => { const m = new THREE.InstancedMesh(geo, lamb({ vertexColors: !!vc }), N); m.frustumCulled = false; scene.add(m); return m; };
    this.torso = mk(box(0.42, 0.6, 0.24, 0.3)); this.head = mk(head, true);
    this.legL = mk(box(0.14, 0.8, 0.16, -0.4)); this.legR = mk(box(0.14, 0.8, 0.16, -0.4));
    this.armL = mk(box(0.1, 0.56, 0.12, -0.27)); this.armR = mk(box(0.1, 0.56, 0.12, -0.27));
    const SH = [[.95, .6, .55], [.55, .75, .9], [.95, .85, .45], [.6, .82, .6], [.9, .9, .88], [.3, .35, .5], [.85, .55, .75], [.25, .25, .28], [.9, .5, .3], [.7, .62, .85]], PA = [[.2, .24, .38], [.75, .7, .6], [.35, .35, .38], [.15, .15, .17], [.45, .55, .7]];
    const c = new THREE.Color(); this.sc = []; for (let i = 0; i < N; i++) { const s = SH[Math.floor(Math.random() * SH.length)], p = PA[Math.floor(Math.random() * PA.length)]; c.setRGB(...s); this.torso.setColorAt(i, c); this.armL.setColorAt(i, c); this.armR.setColorAt(i, c); c.setRGB(...p); this.legL.setColorAt(i, c); this.legR.setColorAt(i, c); c.setRGB(1, 1, 1); this.head.setColorAt(i, c); }
    this.e = new Int32Array(N); this.dir = new Uint8Array(N); this.s = new Float32Array(N); this.v = new Float32Array(N); this.v0 = new Float32Array(N); this.lat = new Float32Array(N);
    this.x = new Float32Array(N); this.z = new Float32Array(N); this.hd = new Float32Array(N); this.ox = new Float32Array(N); this.oz = new Float32Array(N); this.ph = new Float32Array(N); this.sc2 = new Float32Array(N);
    this.alive = new Uint8Array(N); this.o = new THREE.Object3D(); this.o.rotation.order = 'YXZ'; this.m4 = new THREE.Matrix4(); this.tp = [0, 0, 0, 0];
  }
  spawn(i, px, pz, rmin, rmax) {
    const id = randomEdgeNear(this.g, 'ped', px, pz, rmin, rmax); if (id < 0) { this.alive[i] = 0; return; }
    const e = this.g.edges[id]; this.e[i] = id; this.dir[i] = Math.random() < .5 ? 0 : 1; this.s[i] = Math.random() * e.len; this.v0[i] = rnd(1.0, 1.55); this.v[i] = this.v0[i]; this.sc2[i] = rnd(.94, 1.06);
    this.lat[i] = e.k >= 2 ? e.w / 2 + 0.8 + rnd(-.3, .35) : rnd(-.45, .45); this.ph[i] = Math.random() * 6; this.alive[i] = 1; this.ox[i] = this.oz[i] = 0;
    const p = edgePt(this.g, e, this.dir[i], this.s[i]); this.hd[i] = Math.atan2(p[2], p[3]); this.x[i] = p[0] - p[3] * this.lat[i]; this.z[i] = p[1] + p[2] * this.lat[i];
  }
  init(px, pz) { for (let i = 0; i < this.N; i++) this.spawn(i, px, pz, i < 14 ? 18 : 30, i < 14 ? 60 : 170); }
  update(dt, P, shadows) {
    const g = this.g, o = this.o, N = this.N;
    for (let i = 0; i < N; i++) {
      if (!this.alive[i]) { this.spawn(i, P.x, P.z, 70, 170); this.hideI(i); continue; }
      const e = g.edges[this.e[i]];
      // 플레이어가 앞에 있으면 멈춤
      const hdx = Math.sin(this.hd[i]), hdz = Math.cos(this.hd[i]), rx = P.x - this.x[i], rz = P.z - this.z[i], rd = Math.hypot(rx, rz);
      let tv = this.v0[i]; if (rd < 1.8 && (rx * hdx + rz * hdz) > 0) tv = 0;
      if (rd < 0.7) { const k = (0.7 - rd) / (rd || 1); this.ox[i] -= rx * k * .6; this.oz[i] -= rz * k * .6; }
      this.v[i] += (tv - this.v[i]) * Math.min(1, dt * 6);
      this.s[i] += this.v[i] * dt;
      if (this.s[i] >= e.len) {
        const nx = pickNext(g, e, this.dir[i], 'ped'), old = edgePt(g, e, this.dir[i], e.len), oldLat = this.lat[i];
        if (nx) { const [e2, d2] = nx; const ls = e2.k >= 2 ? e2.w / 2 + .8 : rnd(-.4, .4); this.e[i] = g.edges.indexOf(e2); this.dir[i] = d2; this.s[i] = 0.01; this.lat[i] = e2.k >= 2 ? ls + rnd(-.3, .3) : ls; } else { this.dir[i] ^= 1; this.s[i] = 0.01; }
        const e3 = g.edges[this.e[i]], np = edgePt(g, e3, this.dir[i], this.s[i]);
        this.ox[i] += (old[0] - old[3] * oldLat) - (np[0] - np[3] * this.lat[i]); this.oz[i] += (old[1] + old[2] * oldLat) - (np[1] + np[2] * this.lat[i]);
      }
      const e4 = g.edges[this.e[i]], p = edgePt(g, e4, this.dir[i], this.s[i]), k = Math.exp(-5 * dt);
      this.ox[i] *= k; this.oz[i] *= k;
      this.x[i] = p[0] - p[3] * this.lat[i] + this.ox[i]; this.z[i] = p[1] + p[2] * this.lat[i] + this.oz[i];
      this.hd[i] = angLerp(this.hd[i], Math.atan2(p[2], p[3]), Math.min(1, dt * 5));
      this.ph[i] += this.v[i] * dt * 5.2;
      const dpx = this.x[i] - P.x, dpz = this.z[i] - P.z; if (dpx * dpx + dpz * dpz > 210 * 210) { this.alive[i] = 0; continue; }
      this.draw(i, o);
      shadows.add(this.x[i], 0, this.z[i], .75, .75, 0);
    }
    for (const m of [this.torso, this.head, this.legL, this.legR, this.armL, this.armR]) m.instanceMatrix.needsUpdate = true;
    if (this.torso.instanceColor) for (const m of [this.torso, this.head, this.legL, this.legR, this.armL, this.armR]) m.instanceColor.needsUpdate = true;
  }
  hideI(i) { const m = this.m4.makeScale(0, 0, 0); for (const mm of [this.torso, this.head, this.legL, this.legR, this.armL, this.armR]) mm.setMatrixAt(i, m); }
  draw(i, o) {
    const x = this.x[i], z = this.z[i], yaw = this.hd[i], sw = Math.sin(this.ph[i]) * Math.min(1, this.v[i] / .9) * .75, sc = this.sc2[i], c = Math.cos(yaw), s = Math.sin(yaw);
    const put = (m, lx, ly, lz, rx) => { o.position.set(x + lx * c + lz * s, ly * sc, z - lx * s + lz * c); o.rotation.set(rx, yaw, 0); o.scale.set(sc, sc, sc); o.updateMatrix(); m.setMatrixAt(i, o.matrix); };
    put(this.torso, 0, .8, 0, 0); put(this.head, 0, 1.55, 0, 0);
    put(this.legL, -.1, .8, 0, sw); put(this.legR, .1, .8, 0, -sw); put(this.armL, -.26, 1.38, 0, -sw * .8); put(this.armR, .26, 1.38, 0, sw * .8);
  }
}

// ───────── 자동차 (우측통행) ─────────
const CAR_COL = [[.95, .95, .95], [.92, .92, .92], [.75, .77, .8], [.18, .18, .2], [.35, .36, .4], [.85, .25, .2], [.25, .45, .75], [.9, .75, .3], [.3, .55, .4], [.88, .88, .86]];
export class Cars {
  constructor(scene, g, N) {
    this.g = g; this.N = N;
    const body = new THREE.BoxGeometry(1.85, .72, 4.3); body.translate(0, .62, 0);
    const cab = new THREE.BoxGeometry(1.62, .58, 2.3); cab.translate(0, 1.2, -.25); { const cl = [], idx = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) cl.push(...(f === 2 ? [1, 1, 1] : [.30, .38, .48])); cab.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); }
    const wh = new THREE.CylinderGeometry(.34, .34, .24, 8); wh.rotateZ(Math.PI / 2);
    this.body = new THREE.InstancedMesh(body, lamb({}), N); this.cab = new THREE.InstancedMesh(cab, lamb({ vertexColors: true }), N); this.wh = new THREE.InstancedMesh(wh, lamb({ color: 0x222226 }), N * 4);
    const tl = new THREE.BoxGeometry(1.5, .14, .06); tl.translate(0, .74, -2.16); this.tl = new THREE.InstancedMesh(tl, new THREE.MeshBasicMaterial({ color: 0xd8302a }), N);
    for (const m of [this.body, this.cab, this.wh, this.tl]) { m.frustumCulled = false; scene.add(m); }
    const c = new THREE.Color(); for (let i = 0; i < N; i++) { c.setRGB(...CAR_COL[Math.floor(Math.random() * CAR_COL.length)]); this.body.setColorAt(i, c); c.setRGB(1, 1, 1); this.cab.setColorAt(i, c); }
    this.e = new Int32Array(N); this.dir = new Uint8Array(N); this.s = new Float32Array(N); this.v = new Float32Array(N); this.vmax = new Float32Array(N); this.x = new Float32Array(N); this.z = new Float32Array(N); this.hd = new Float32Array(N);
    this.ox = new Float32Array(N); this.oz = new Float32Array(N); this.px = new Float32Array(N); this.pz = new Float32Array(N); this.stuck = new Float32Array(N); this.ghost = new Float32Array(N); this.alive = new Uint8Array(N); this.o = new THREE.Object3D(); this.o.rotation.order = 'YXZ';
    this.wheel = new Float32Array(N);
  }
  vmaxOf(e) { return e.c === 'primary' ? rnd(11, 14) : e.c === 'secondary' ? rnd(10, 12) : e.c === 'tertiary' ? rnd(9, 11) : rnd(6, 8.5); }
  spawn(i, px, pz, rmin, rmax) {
    for (let t = 0; t < 6; t++) {
      const id = randomEdgeNear(this.g, 'car', px, pz, rmin, rmax); if (id < 0) continue; const e = this.g.edges[id]; const dir = Math.random() < .5 ? 0 : 1, s = Math.random() * e.len;
      const p = edgePt(this.g, e, dir, s), lane = e.w / 4, x = p[0] - p[3] * lane, z = p[1] + p[2] * lane; let ok = true;
      for (let j = 0; j < this.N; j++) if (j !== i && this.alive[j] && Math.abs(this.x[j] - x) < 7 && Math.abs(this.z[j] - z) < 7) { ok = false; break; } if (!ok) continue;
      this.e[i] = id; this.dir[i] = dir; this.s[i] = s; this.vmax[i] = this.vmaxOf(e); this.v[i] = this.vmax[i] * .5; this.x[i] = x; this.z[i] = z; this.hd[i] = Math.atan2(p[2], p[3]); this.ox[i] = this.oz[i] = this.px[i] = this.pz[i] = 0; this.stuck[i] = 0; this.ghost[i] = 0; this.alive[i] = 1; return;
    }
    this.alive[i] = 0;
  }
  init(px, pz) { for (let i = 0; i < this.N; i++) this.spawn(i, px, pz, i < 10 ? 25 : 40, i < 10 ? 100 : 230); }
  update(dt, P, peds, shadows) {
    const g = this.g, N = this.N, o = this.o;
    for (let i = 0; i < N; i++) {
      if (!this.alive[i]) { this.spawn(i, P.x, P.z, 100, 230); this.hide(i); continue; }
      const e = g.edges[this.e[i]], fx = Math.sin(this.hd[i]), fz = Math.cos(this.hd[i]), rx = -fz, rz = fx, vi = this.v[i];
      let target = this.vmax[i]; const ahead = 4 + vi * 1.3;
      // 앞 장애물(다른 차, 플레이어, 보행자)
      const test = (x, z, minGap, halfW) => { const dx = x - this.x[i], dz = z - this.z[i], f = dx * fx + dz * fz; if (f <= 0 || f > ahead + minGap) return; const lat = Math.abs(dx * rx + dz * rz); if (lat > halfW) return; const t = Math.max(0, (f - minGap) * 1.0); if (t < target) target = t; };
      test(P.x, P.z, 3.4, 1.3);
      if (this.ghost[i] <= 0) for (let j = 0; j < N; j++) if (j !== i && this.alive[j]) { const jx = this.x[j], jz = this.z[j]; if (Math.abs(jx - this.x[i]) > 14 || Math.abs(jz - this.z[i]) > 14) continue; const same = Math.sin(this.hd[j]) * fx + Math.cos(this.hd[j]) * fz > .2; test(jx, jz, 4.6, same ? 1.6 : 1.05); }
      for (let j = 0; j < peds.N; j++) { if (!peds.alive[j]) continue; const jx = peds.x[j], jz = peds.z[j]; if (Math.abs(jx - this.x[i]) > 14 || Math.abs(jz - this.z[i]) > 14) continue; test(jx, jz, 3.2, 1.5); }
      // 모서리 앞 감속
      const rem = e.len - this.s[i]; if (rem < 9) target = Math.min(target, 4.5 + rem * .4);
      const a = target < vi ? 9 : 3.2; this.v[i] += clamp(target - vi, -a * dt, a * dt); if (this.v[i] < 0) this.v[i] = 0;
      if (this.v[i] < .3 && target < .5) this.stuck[i] += dt; else this.stuck[i] = Math.max(0, this.stuck[i] - dt * 2);
      if (this.stuck[i] > 4) { this.ghost[i] = 3; this.stuck[i] = 0; }
      if (this.ghost[i] > 0) this.ghost[i] -= dt;
      this.s[i] += this.v[i] * dt;
      if (this.s[i] >= e.len) {
        const nx = pickNext(g, e, this.dir[i], 'car'), old = edgePt(g, e, this.dir[i], e.len), oldLane = e.w / 4;
        if (nx) { this.e[i] = g.edges.indexOf(nx[0]); this.dir[i] = nx[1]; this.s[i] = 0.01; } else { this.dir[i] ^= 1; this.s[i] = 0.01; }
        const e3 = g.edges[this.e[i]], np = edgePt(g, e3, this.dir[i], this.s[i]); this.ox[i] += (old[0] - old[3] * oldLane) - (np[0] - np[3] * e3.w / 4); this.oz[i] += (old[1] + old[2] * oldLane) - (np[1] + np[2] * e3.w / 4);
        this.vmax[i] = this.vmaxOf(e3);
      }
      const e4 = g.edges[this.e[i]], p = edgePt(g, e4, this.dir[i], this.s[i]), lane = e4.w / 4, k = Math.exp(-3.2 * dt);
      this.ox[i] *= k; this.oz[i] *= k; this.px[i] *= Math.exp(-1.2 * dt); this.pz[i] *= Math.exp(-1.2 * dt);
      // 플레이어가 차를 밀면 살짝 밀려남
      { const dx = P.x - this.x[i], dz = P.z - this.z[i], lf = dx * fx + dz * fz, ll = dx * rx + dz * rz; if (Math.abs(lf) < 2.9 && Math.abs(ll) < 1.5 && P.speed > .4) { this.px[i] += P.vx * dt * .55; this.pz[i] += P.vz * dt * .55; const pl = Math.hypot(this.px[i], this.pz[i]); if (pl > 1.6) { this.px[i] *= 1.6 / pl; this.pz[i] *= 1.6 / pl; } } }
      this.x[i] = p[0] - p[3] * lane + this.ox[i] + this.px[i]; this.z[i] = p[1] + p[2] * lane + this.oz[i] + this.pz[i];
      this.hd[i] = angLerp(this.hd[i], Math.atan2(p[2], p[3]), Math.min(1, dt * 4.5));
      this.wheel[i] += this.v[i] * dt / .34;
      const dpx = this.x[i] - P.x, dpz = this.z[i] - P.z; if (dpx * dpx + dpz * dpz > 280 * 280) { this.alive[i] = 0; continue; }
      const yaw = this.hd[i]; o.position.set(this.x[i], 0, this.z[i]); o.rotation.set(0, yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix(); this.body.setMatrixAt(i, o.matrix); this.cab.setMatrixAt(i, o.matrix); this.tl.setMatrixAt(i, o.matrix);
      const cs = Math.cos(yaw), sn = Math.sin(yaw), wr = this.wheel[i];
      let w = 0; for (const [lx, lz] of [[-.92, 1.4], [.92, 1.4], [-.92, -1.4], [.92, -1.4]]) { o.position.set(this.x[i] + lx * cs + lz * sn, .34, this.z[i] - lx * sn + lz * cs); o.rotation.set(0, yaw, 0); o.updateMatrix(); this.wh.setMatrixAt(i * 4 + w++, o.matrix); }
      shadows.add(this.x[i], 0, this.z[i], 2.4, 4.9, yaw);
    }
    for (const m of [this.body, this.cab, this.wh, this.tl]) m.instanceMatrix.needsUpdate = true;
  }
  hide(i) { const m = new THREE.Matrix4().makeScale(0, 0, 0); this.body.setMatrixAt(i, m); this.cab.setMatrixAt(i, m); this.tl.setMatrixAt(i, m); for (let k = 0; k < 4; k++) this.wh.setMatrixAt(i * 4 + k, m); }
  // 플레이어 근처 차량 → 충돌용 선분 (y 0~1.5)
  segs(P, out) {
    out.length = 0;
    for (let i = 0; i < this.N; i++) {
      if (!this.alive[i]) continue; const dx = this.x[i] - P.x, dz = this.z[i] - P.z; if (dx * dx + dz * dz > 100) continue;
      const yaw = this.hd[i], fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx, hl = 2.15, hw = .95, cx = this.x[i], cz = this.z[i];
      const c = [[cx + fx * hl + rx * hw, cz + fz * hl + rz * hw], [cx + fx * hl - rx * hw, cz + fz * hl - rz * hw], [cx - fx * hl - rx * hw, cz - fz * hl - rz * hw], [cx - fx * hl + rx * hw, cz - fz * hl + rz * hw]];
      for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; out.push(a[0], a[1], b[0], b[1], 0, 1.5); }
    }
  }
}
