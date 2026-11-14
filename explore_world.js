// 탐험 모드 · 월드 생성 (OSM 가공 데이터 → 도시 지오메트리, 충돌, 도로 그래프)
// 지도 데이터 © OpenStreetMap contributors (ODbL)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function hash3(a, b, c) { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ───────── 지오메트리 빌더 ─────────
export class MB {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  get n() { return this.P.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, c) { this.P.push(x, y, z); this.N.push(nx, ny, nz); this.U.push(u, v); this.C.push(c[0], c[1], c[2]); return this.P.length / 3 - 1; }
  // p0,p1 아래 두 점 / p2,p3 위 두 점 (p0→p1 가 u 방향)
  quad(p0, p1, p2, p3, n, uv, c) {
    const i = this.n;
    this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uv[0], uv[1], c); this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uv[2], uv[1], c);
    this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uv[2], uv[3], c); this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], uv[0], uv[3], c);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (d >= 0) this.I.push(i, i + 1, i + 2, i, i + 2, i + 3); else this.I.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }
  tri(a, b, c, n, col, uvs) { const i = this.n; const u = uvs || [0, 0, 0, 0, 0, 0]; this.vert(a[0], a[1], a[2], n[0], n[1], n[2], u[0], u[1], col); this.vert(b[0], b[1], b[2], n[0], n[1], n[2], u[2], u[3], col); this.vert(c[0], c[1], c[2], n[0], n[1], n[2], u[4], u[5], col);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    if (d >= 0) this.I.push(i, i + 1, i + 2); else this.I.push(i, i + 2, i + 1); }
  // 회전(yaw) 상자. uvr=[u0,v0,u1,v1] 이면 모든 면에 같은 UV 영역
  box(cx, cy, cz, sx, sy, sz, yaw, c, uvr = [0, 0, 1, 1], skipBottom = true) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), hx = sx / 2, hz = sz / 2, y0 = cy - sy / 2, y1 = cy + sy / 2;
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, ly, cz - lx * sn + lz * cs];
    const a = P(-hx, y0, -hz), b = P(hx, y0, -hz), cc = P(hx, y0, hz), d = P(-hx, y0, hz), e = P(-hx, y1, -hz), f = P(hx, y1, -hz), g = P(hx, y1, hz), h = P(-hx, y1, hz);
    const nx = [cs, 0, -sn], nz = [sn, 0, cs];
    this.quad(a, b, f, e, [-nz[0], 0, -nz[2]], uvr, c); this.quad(cc, d, h, g, nz, uvr, c);
    this.quad(b, cc, g, f, nx, uvr, c); this.quad(d, a, e, h, [-nx[0], 0, -nx[2]], uvr, c);
    this.quad(e, f, g, h, [0, 1, 0], uvr, c);
    if (!skipBottom) this.quad(d, cc, b, a, [0, -1, 0], uvr, c);
  }
  cyl(cx, y0, cz, r, h, seg, c, r2 = r) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const q0 = [cx + Math.cos(a0) * r2, y0 + h, cz + Math.sin(a0) * r2], q1 = [cx + Math.cos(a1) * r2, y0 + h, cz + Math.sin(a1) * r2];
      this.quad(p1, p0, q0, q1, [Math.cos(am), 0, Math.sin(am)], [0, 0, 1, 1], c);
      this.tri([cx, y0 + h, cz], q0, q1, [0, 1, 0], c);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere(); return g;
  }
  mesh(mat) { const m = new THREE.Mesh(this.geometry(), mat); m.frustumCulled = this.n < 30000 ? true : false; return m; }
}

// ───────── 충돌/바닥 격자 ─────────
const CELL = 16, kf = (ix, iz) => (ix + 300) * 1000 + (iz + 300);
export class Colliders {
  constructor() {
    this.sa = []; this.segG = new Map(); this.floorG = new Map(); this.roofG = new Map(); this.circ = []; this.circG = new Map();
    this.floors = []; this.roofs = [];
  }
  _bin(map, x0, z0, x1, z1, val, pad = 0) {
    for (let ix = Math.floor((x0 - pad) / CELL); ix <= Math.floor((x1 + pad) / CELL); ix++) for (let iz = Math.floor((z0 - pad) / CELL); iz <= Math.floor((z1 + pad) / CELL); iz++) {
      const k = kf(ix, iz); let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(val);
    }
  }
  addSeg(ax, az, bx, bz, y0, y1) {
    const id = this.sa.length / 6; this.sa.push(ax, az, bx, bz, y0, y1);
    this._bin(this.segG, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), id, 1.3);
  }
  // 회전 상자: 옆면은 벽, 윗면은 바닥(걸어 올라갈 수 있음)
  addBox(cx, cz, hx, hz, yaw, y0, y1, walls = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const a = P(-hx, -hz), b = P(hx, -hz), d = P(hx, hz), e = P(-hx, hz);
    if (walls) { this.addSeg(a[0], a[1], b[0], b[1], y0, y1); this.addSeg(b[0], b[1], d[0], d[1], y0, y1); this.addSeg(d[0], d[1], e[0], e[1], y0, y1); this.addSeg(e[0], e[1], a[0], a[1], y0, y1); }
    const f = { cx, cz, hx, hz, c, s, top: y1 }; this.floors.push(f);
    this._bin(this.floorG, Math.min(a[0], b[0], d[0], e[0]), Math.min(a[1], b[1], d[1], e[1]), Math.max(a[0], b[0], d[0], e[0]), Math.max(a[1], b[1], d[1], e[1]), f);
  }
  addRoof(poly, top, id) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
    const r = { poly, top, id, x0, z0, x1, z1 }; this.roofs.push(r); this._bin(this.roofG, x0, z0, x1, z1, r);
  }
  addCirc(x, z, r, y1) { const id = this.circ.length / 4; this.circ.push(x, z, r, y1); this._bin(this.circG, x - r, z - r, x + r, z + r, id); }
  cell(map, x, z) { return map.get(kf(Math.floor(x / CELL), Math.floor(z / CELL))); }
  floorAt(x, z, fy, step) {
    let best = 0;
    const fl = this.cell(this.floorG, x, z);
    if (fl) for (let i = 0; i < fl.length; i++) {
      const f = fl[i]; if (f.top > fy + step || f.top <= best) continue;
      const dx = x - f.cx, dz = z - f.cz, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
      if (Math.abs(lx) <= f.hx && Math.abs(lz) <= f.hz) best = f.top;
    }
    const rl = this.cell(this.roofG, x, z);
    if (rl) for (let i = 0; i < rl.length; i++) { const r = rl[i]; if (r.top > fy + step || r.top <= best) continue; if (inPoly(x, z, r.poly)) best = r.top; }
    return best;
  }
  // 점이 건물 덩어리 속인가 (카메라용)
  solidBuilding(x, y, z, skipId = -1) {
    const rl = this.cell(this.roofG, x, z);
    if (rl) for (let i = 0; i < rl.length; i++) { const r = rl[i]; if (r.id === skipId || y > r.top + 0.3 || y < 0) continue; if (inPoly(x, z, r.poly)) return r; }
    return null;
  }
  // 원기둥(반지름 r, 발높이 fy, 키 hh)를 벽/나무에서 밀어냄. out=[x,z,hit]
  resolve(out, r, fy, hh, step, dyn) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const sl = this.cell(this.segG, out[0], out[1]), sa = this.sa;
      if (sl) for (let i = 0; i < sl.length; i++) {
        const o = sl[i] * 6, y0 = sa[o + 4], y1 = sa[o + 5]; if (y0 >= fy + hh || y1 <= fy + step) continue;
        moved = pushSeg(out, sa[o], sa[o + 1], sa[o + 2], sa[o + 3], r) || moved;
      }
      const cl = this.cell(this.circG, out[0], out[1]);
      if (cl) for (let i = 0; i < cl.length; i++) {
        const o = cl[i] * 4; if (this.circ[o + 3] <= fy + step) continue;
        const dx = out[0] - this.circ[o], dz = out[1] - this.circ[o + 1], rr = r + this.circ[o + 2], d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-3, k = (rr - d) / d; out[0] += dx * k; out[1] += dz * k; moved = true; }
      }
      if (dyn) for (let i = 0; i < dyn.length; i += 6) {
        const y0 = dyn[i + 4], y1 = dyn[i + 5]; if (y0 >= fy + hh || y1 <= fy + step) continue;
        moved = pushSeg(out, dyn[i], dyn[i + 1], dyn[i + 2], dyn[i + 3], r) || moved;
      }
      if (!moved) break; out[2] = 1;
    }
  }
}
export function inPoly(x, z, p) {
  let c = false; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) { const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; }
  return c;
}
function pushSeg(out, ax, az, bx, bz, r) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((out[0] - ax) * dx + (out[1] - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, pz = az + dz * t, ex = out[0] - px, ez = out[1] - pz, d2 = ex * ex + ez * ez;
  if (d2 >= r * r) return false;
  if (d2 < 1e-8) { const l = Math.sqrt(l2) || 1; out[0] += -dz / l * r; out[1] += dx / l * r; return true; }
  const d = Math.sqrt(d2), k = (r - d) / d; out[0] += ex * k; out[1] += ez * k; return true;
}

// ───────── 캔버스 텍스처 ─────────
const FONT = '"Noto Sans KR","Gothic A1","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, repeatV = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = repeatV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; return t;
}
function glass(c, x, y, w, h, tint = 0) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, tint ? '#4f82ad' : '#6a9bc9'); g.addColorStop(1, tint ? '#9fc2dc' : '#c2dbec');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.moveTo(x + w * .15, y + h); c.lineTo(x + w * .55, y); c.lineTo(x + w * .75, y); c.lineTo(x + w * .35, y + h); c.fill();
}
function frame(c, x, y, w, h, col = '#cfd3d8', t = 4) { c.strokeStyle = col; c.lineWidth = t; c.strokeRect(x, y, w, h); }
function drawCell(c, X, kind, vi) {
  c.save(); c.translate(X, 0); c.beginPath(); c.rect(0, 0, 128, 128); c.clip();
  c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
  // 층 경계(슬래브) 선
  c.fillStyle = '#d9d3ca'; c.fillRect(0, 121, 128, 7); c.fillStyle = '#efe9e0'; c.fillRect(0, 119, 128, 2);
  const win = (x, y, w, h, mull = 1) => { glass(c, x, y, w, h); frame(c, x, y, w, h, '#b9bec6', 4); if (mull) { c.fillStyle = '#c4c9d0'; c.fillRect(x + w / 2 - 1.5, y, 3, h); } c.fillStyle = '#e2ddd5'; c.fillRect(x - 3, y + h, w + 6, 4); };
  const noise = a => { for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(120,110,100,${a})`; c.fillRect(Math.random() * 128, Math.random() * 118, 2, 2); } };
  if (kind === 'apt') {
    if (vi === 1) win(27, 28, 74, 66);
    else if (vi === 0 || vi === 2) {
      c.fillStyle = '#c9c2b7'; c.fillRect(6, 56, 116, 63); c.fillStyle = '#b3ada3'; c.fillRect(6, 56, 116, 5);
      glass(c, 22, 24, 84, 70, 1); frame(c, 22, 24, 84, 70, '#c0c5cc', 4); c.fillStyle = '#c0c5cc'; c.fillRect(63, 24, 3, 70);
      if (vi === 2) { c.fillStyle = 'rgba(247,232,200,.92)'; c.fillRect(24, 26, 38, 66); c.fillStyle = 'rgba(120,150,90,.9)'; c.beginPath(); c.arc(98, 92, 9, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(178,214,236,.82)'; c.fillRect(6, 88, 116, 31); c.strokeStyle = '#f5f2ec'; c.lineWidth = 4; c.beginPath(); c.moveTo(6, 88); c.lineTo(122, 88); c.stroke();
      c.fillStyle = '#f2eee6'; c.fillRect(2, 115, 124, 6);
    } else if (vi === 3) { c.fillStyle = '#ece5d9'; c.fillRect(0, 0, 128, 119); glass(c, 50, 12, 28, 98); frame(c, 50, 12, 28, 98, '#b9bec6', 4); c.fillStyle = '#c4c9d0'; for (let y = 32; y < 100; y += 22) c.fillRect(50, y, 28, 3); }
    else if (vi === 4) { c.fillStyle = '#8d8a85'; c.fillRect(8, 12, 112, 12); glass(c, 18, 24, 92, 95, 1); frame(c, 18, 24, 92, 95, '#6f737a', 5); c.fillStyle = '#5c6068'; c.fillRect(63, 24, 3, 95); c.fillStyle = '#fff3c9'; c.fillRect(70, 62, 4, 14); }
    else if (vi === 5) { c.fillStyle = '#cbbfae'; c.fillRect(0, 70, 128, 49); noise(.18); win(40, 24, 48, 34, 0); }
    else if (vi === 6) { win(24, 28, 70, 66); c.fillStyle = '#e8e8e8'; c.fillRect(100, 100, 22, 14); c.strokeStyle = '#aaa'; c.lineWidth = 1.5; for (let y = 103; y < 114; y += 3) { c.beginPath(); c.moveTo(102, y); c.lineTo(120, y); c.stroke(); } }
    else noise(.12);
  } else if (kind === 'com') {
    if (vi === 0) { glass(c, 4, 24, 120, 74, 1); c.fillStyle = '#9aa3ad'; for (let x = 4; x <= 124; x += 30) c.fillRect(x - 1.5, 24, 3, 74); frame(c, 4, 24, 120, 74, '#8f98a3', 4); }
    else if (vi === 1) { win(10, 26, 46, 66); win(72, 26, 46, 66); }
    else if (vi === 2) { c.fillStyle = '#d7d1c7'; c.fillRect(0, 0, 128, 119); win(36, 30, 56, 58); }
    else if (vi === 3) { glass(c, 0, 0, 128, 119, 1); c.fillStyle = 'rgba(70,90,110,.55)'; for (let x = 0; x <= 128; x += 32) c.fillRect(x - 1, 0, 3, 119); c.fillRect(0, 56, 128, 3); }
    else if (vi === 6) { c.fillStyle = '#d4cec5'; c.fillRect(0, 0, 128, 119); noise(.16); c.fillStyle = '#8a8f96'; for (let y = 30; y < 90; y += 6) c.fillRect(34, y, 60, 3); }
    else if (vi === 4) { win(26, 30, 76, 60, 0); } else noise(.1);
  } else if (kind === 'sch') {
    if (vi === 0) { glass(c, 6, 26, 116, 66); c.fillStyle = '#d0d4da'; for (let x = 6; x <= 122; x += 29) c.fillRect(x - 1.5, 26, 3, 66); c.fillRect(6, 56, 116, 3); frame(c, 6, 26, 116, 66, '#c9ced4', 4); c.fillStyle = '#e8e2d6'; c.fillRect(2, 92, 124, 5); }
    else if (vi === 1) { win(8, 26, 48, 66); win(72, 26, 48, 66); }
    else if (vi === 2) { c.fillStyle = '#ede6d6'; c.fillRect(0, 0, 128, 119); glass(c, 52, 10, 24, 100); frame(c, 52, 10, 24, 100, '#c9ced4', 4); }
    else if (vi === 6) { glass(c, 8, 0, 112, 128, 1); c.fillStyle = '#9aa3ad'; for (let x = 8; x <= 120; x += 28) c.fillRect(x - 1.5, 0, 3, 128); c.fillRect(8, 40, 112, 3); }
    else noise(.1);
  } else {
    if (vi === 0) win(40, 34, 48, 50, 0); else if (vi === 1) { win(14, 32, 40, 52, 0); win(74, 32, 40, 52, 0); }
    else if (vi === 2) { win(32, 28, 64, 66); c.fillStyle = '#9c8466'; c.fillRect(32, 28, 16, 66); c.fillRect(80, 28, 16, 66); }
    else if (vi === 3) { glass(c, 4, 18, 120, 28); frame(c, 4, 18, 120, 28, '#a9aeb4', 3); noise(.1); }
    else if (vi === 4) { c.fillStyle = '#6d5a49'; c.fillRect(34, 36, 60, 83); c.fillStyle = '#e8c37a'; c.fillRect(72, 74, 5, 5); }
    else if (vi === 5) { c.fillStyle = '#9ca3ab'; c.fillRect(8, 12, 112, 107); c.fillStyle = '#868d95'; for (let y = 16; y < 118; y += 8) c.fillRect(8, y, 112, 3); }
    else if (vi === 6) { c.fillStyle = '#e8dcc8'; c.fillRect(0, 0, 128, 119); c.fillStyle = '#7ba3c8'; c.beginPath(); c.moveTo(44, 110); c.lineTo(44, 40); c.arc(64, 40, 20, Math.PI, 0); c.lineTo(84, 110); c.fill(); frame(c, 44, 22, 40, 88, '#9a8b76', 3); }
    else noise(.12);
  }
  c.restore();
}
export function makeKindTex(kind) {
  const c = mkCanvas(1024, 128), g = c.getContext('2d'); for (let i = 0; i < 8; i++) drawCell(g, i * 128, kind, i); return toTex(c);
}
const SHOPS = [['24시 편의점', '#2b9a6a'], ['미소 치킨', '#e2572e'], ['약국', '#27a35a'], ['공인중개사', '#3563b8'], ['카페 모퉁이', '#7a4b2b'], ['헤어 살롱', '#c24c8b'], ['수학학원', '#2f5fb0'], ['PC방', '#5a3fa8'], ['분식 김밥', '#d98a1c'], ['내과의원', '#2a8f9a'], ['세탁소', '#3e86c9'], ['꽃집', '#d65a7d'], ['안경원', '#4a4f58'], ['정육점', '#b8322c'], ['한우 식당', '#8a3a24'], ['노래방', '#8b3fc4']];
export const SHOP_COLS = 4, SHOP_ROWS = 8;
export function makeShopTex(names) {
  const c = mkCanvas(1024, 1024), g = c.getContext('2d'); const all = SHOPS.concat(names.map((n, i) => [n, ['#c4632f', '#2e7a86', '#6a4a9a', '#b0852a', '#3a7a4a'][i % 5]]));
  for (let i = 0; i < SHOP_COLS * SHOP_ROWS; i++) {
    const [name, col] = all[i % all.length], X = (i % SHOP_COLS) * 256, Y = Math.floor(i / SHOP_COLS) * 128;
    g.save(); g.translate(X, Y); g.beginPath(); g.rect(0, 0, 256, 128); g.clip();
    g.fillStyle = '#efe7da'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = col; g.fillRect(6, 4, 244, 40);
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(6, 4, 244, 8);
    let fs = 26; g.font = `900 ${fs}px ${FONT}`; while (g.measureText(name).width > 226 && fs > 12) { fs -= 1; g.font = `900 ${fs}px ${FONT}`; }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 25);
    for (let x = 6; x < 250; x += 20) { g.fillStyle = (x / 20 | 0) % 2 ? '#f4f1ea' : col; g.fillRect(x, 44, 20, 9); }
    const gx = 14, gw = 228, gy = 58;
    const gr = g.createLinearGradient(0, gy, 0, 124); gr.addColorStop(0, '#ffeab8'); gr.addColorStop(1, '#f3d49a'); g.fillStyle = gr; g.fillRect(gx, gy, gw, 62);
    g.fillStyle = 'rgba(120,150,175,.35)'; g.fillRect(gx, gy, gw, 62);
    g.strokeStyle = '#8a8f96'; g.lineWidth = 3; g.strokeRect(gx, gy, gw, 62);
    const dx = 40 + (i * 37) % 120; g.fillStyle = 'rgba(60,70,80,.55)'; g.fillRect(dx, gy, 44, 62); g.strokeRect(dx, gy, 44, 62);
    g.fillStyle = '#fff'; g.fillRect(gx + 8, gy + 8, 22, 28); g.fillStyle = col; g.fillRect(gx + 11, gy + 12, 16, 3); g.fillRect(gx + 11, gy + 19, 12, 3);
    g.fillStyle = '#b9b1a3'; g.fillRect(0, 120, 256, 8);
    g.restore();
  }
  return toTex(mkCanvasFrom(c), false, 8);
}
function mkCanvasFrom(c) { return c; }
export function makeDetailTex() {
  const c = mkCanvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const v = 205 + Math.random() * 50; g.fillStyle = `rgba(${v},${v},${v},${0.35})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
export function makeRailTex() {
  const c = mkCanvas(128, 64), g = c.getContext('2d'); g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#e9e4da'; g.fillRect(0, 0, 128, 6); g.fillRect(0, 56, 128, 8); g.fillStyle = '#d6d0c4'; for (let x = 4; x < 128; x += 12) g.fillRect(x, 6, 4, 50);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
export function makeDoorTex() {   // 복도식 현관문 한 칸 (폭 3.3m x 한 층)
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#efe8dc'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e1d9ca'; g.fillRect(0, 232, 256, 24);
  g.fillStyle = '#7e8a86'; g.fillRect(70, 30, 82, 202); g.fillStyle = '#6a7672'; g.fillRect(76, 38, 70, 190); g.strokeStyle = '#5e6965'; g.lineWidth = 4; g.strokeRect(70, 30, 82, 202);
  g.fillStyle = '#d9d3c4'; g.fillRect(138, 120, 5, 24); g.fillStyle = '#2a2d31'; g.fillRect(82, 52, 18, 14); g.fillStyle = '#fff'; g.fillRect(168, 66, 30, 22); g.fillStyle = '#c4472f'; g.fillRect(172, 70, 22, 4);
  g.fillStyle = '#b9a98a'; g.fillRect(176, 140, 60, 92); g.fillStyle = '#a09070'; g.fillRect(180, 146, 24, 80); g.fillRect(208, 146, 24, 80);
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, 6, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
export function makePlateTex(nF) {  // 층 표시판 아틀라스 (8x4 칸 각 128x64)
  const c = mkCanvas(1024, 256), g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 32; i++) {
    const X = (i % 8) * 128, Y = Math.floor(i / 8) * 64; g.fillStyle = '#25324a'; g.fillRect(X + 2, Y + 2, 124, 60); g.fillStyle = '#ffd36b';
    g.font = `900 40px ${FONT}`; g.fillText(i === 0 ? '1층' : i <= nF - 1 ? (i + 1) + '층' : i === nF ? '옥상' : '', X + 64, Y + 33);
  }
  return toTex(c, false);
}
export function makeSignTex(text, bg = '#25324a', fg = '#ffe3a0', w = 512, h = 128) {
  const c = mkCanvas(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 72; g.font = `900 ${fs}px ${FONT}`; while (g.measureText(text).width > w - 50 && fs > 14) { fs--; g.font = `900 ${fs}px ${FONT}`; }
  g.fillText(text, w / 2, h / 2 + 4); return toTex(c, false);
}
export function makeMailTex() {
  const c = mkCanvas(256, 128), g = c.getContext('2d'); g.fillStyle = '#9ba3ad'; g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) { g.fillStyle = '#c7ccd2'; g.fillRect(6 + x * 24.6, 6 + y * 30, 22, 26); g.fillStyle = '#6a717b'; g.fillRect(14 + x * 24.6, 24 + y * 30, 6, 3); g.fillStyle = '#fff'; g.fillRect(10 + x * 24.6, 10 + y * 30, 14, 6); }
  return toTex(c, false);
}
export function makeFloorTex() {
  const c = mkCanvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#e9e4da'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
