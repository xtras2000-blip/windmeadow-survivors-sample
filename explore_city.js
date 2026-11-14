// 탐험 모드 · 도시 지오메트리 (OSM 가공 데이터 기반, 전부 코드 생성)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js';
import { MB, Colliders, inPoly, hash3, clamp, lerp, makeDetailTex, makeRailTex, makeDoorTex, makePlateTex, makeSignTex, makeMailTex, makeFloorTex, makeShopTex, SHOP_COLS, SHOP_ROWS } from './explore_world.js';

const V2 = a => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(new THREE.Vector2(a[i], a[i + 1])); return o; };
const areaOf = r => { let A = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1]; } return A; };

// ── 팔레트 (원신풍 따뜻한 파스텔, 분홍기 제거) ──
const AC = { res: [.80, .78, .66], com: [.82, .78, .68], ind: [.72, .72, .68], sch: [.84, .80, .60], golf: [.60, .76, .42], meadow: [.60, .76, .42], park_lot: [.66, .66, .66], park: [.46, .72, .32], wood: [.36, .60, .32], pitch: [.78, .54, .38], play: [.88, .72, .46], water: [.34, .66, .82] };
const AORD = ['res', 'com', 'ind', 'sch', 'golf', 'meadow', 'park_lot', 'park', 'wood', 'pitch', 'play', 'water'];
const GROUND = [.56, .74, .40];
const RCOL = [.47, .47, .49];
const PALAPT = [[.99, .94, .84], [.98, .88, .76], [.86, .94, .89], [.87, .91, .96], [.99, .95, .76], [.94, .81, .71], [.95, .95, .92]];
const PALCOM = [[.86, .90, .96], [.93, .88, .80], [.82, .90, .90]];
const PALSCH = [[1.0, .92, .66]], PALPUB = [[.90, .88, .80]], PALIND = [[.82, .85, .88]], PALREL = [[.97, .88, .78]], PALHOUSE = [[.96, .90, .82], [.90, .86, .80]], PALOTH = [[.94, .90, .84], [.88, .90, .93]];
const ROOFC = { apt: [.50, .66, .54], com: [.66, .66, .66], sch: [.72, .52, .42], oth: [.66, .64, .62] };

export async function buildCity(scene, J, opt = {}) {
  const META = J.meta, REND = META.render;
  const T = { detail: makeDetailTex() };
  const kinds = {};
  const col = new Colliders();
  const mats = {};
  const mkL = (o) => new THREE.MeshLambertMaterial(o);
  // 건물 종류별 텍스처 (공장에서 한 번만)
  const { makeKindTexExport } = await import('./explore_world.js').then(m => ({ makeKindTexExport: m.makeKindTex }));
  const shopNames = []; for (const b of J.bld) if ((b.t === 'com' || b.t === 'oth' || b.t === 'pub') && b.n && !/동$/.test(b.n) && shopNames.length < 16) shopNames.push(b.n.length > 11 ? b.n.slice(0, 11) : b.n);
  T.shop = makeShopTex(shopNames);
  for (const k of ['apt', 'com', 'sch', 'oth']) T[k] = makeKindTexExport(k);
  T.rail = makeRailTex(); T.door = makeDoorTex(); T.mail = makeMailTex(); T.floor = makeFloorTex();
  const FEATN = '피오르빌';
  mats.apt = mkL({ map: T.apt, vertexColors: true, side: THREE.DoubleSide }); mats.com = mkL({ map: T.com, vertexColors: true, side: THREE.DoubleSide });
  mats.sch = mkL({ map: T.sch, vertexColors: true, side: THREE.DoubleSide }); mats.oth = mkL({ map: T.oth, vertexColors: true, side: THREE.DoubleSide });
  mats.shop = mkL({ map: T.shop, vertexColors: true, side: THREE.DoubleSide });
  mats.vc = mkL({ vertexColors: true, side: THREE.DoubleSide });
  mats.rail = mkL({ map: T.rail, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  mats.door = mkL({ map: T.door, vertexColors: true, side: THREE.DoubleSide });
  mats.mail = mkL({ map: T.mail, vertexColors: true, side: THREE.DoubleSide });
  mats.floor = mkL({ map: T.floor, vertexColors: true, side: THREE.DoubleSide });
  mats.glass = new THREE.MeshLambertMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false });
  mats.glow = new THREE.MeshBasicMaterial({ color: 0xfff6dc, side: THREE.DoubleSide });
  const gmat = () => { const m = mkL({ map: T.detail, vertexColors: true, side: THREE.DoubleSide }); m.depthTest = false; m.depthWrite = false; return m; };

  // ───────── 지면 (깊이 쓰기 없이 순서대로 덮어 그림 → z-fighting 없음) ─────────
  const gUV = (x, z) => [x / 7, z / 7];
  const G = [new MB(), new MB(), new MB(), new MB(), new MB()]; // 0 바탕 1 토지 2 하천/인도 3 도로 4 차선
  const gTri = (mb, ax, az, bx, bz, cx, cz, c) => { const u0 = gUV(ax, az), u1 = gUV(bx, bz), u2 = gUV(cx, cz); mb.tri([ax, 0, az], [bx, 0, bz], [cx, 0, cz], [0, 1, 0], c, [u0[0], u0[1], u1[0], u1[1], u2[0], u2[1]]); };
  function fillPoly(mb, rings, c) {
    const contour = V2(rings[0]), holes = rings.slice(1).map(V2); let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
    const all = contour.concat(...holes); for (const t of idx) gTri(mb, all[t[0]].x, all[t[0]].y, all[t[1]].x, all[t[1]].y, all[t[2]].x, all[t[2]].y, c);
  }
  function disc(mb, x, z, r, c, n = 6) { for (let i = 0; i < n; i++) { const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832; gTri(mb, x, z, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, c); } }
  function ribbon(mb, p, w, c, round = true) {
    const hw = w / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw;
      gTri(mb, ax + nx, az + nz, ax - nx, az - nz, bx + nx, bz + nz, c); gTri(mb, bx + nx, bz + nz, ax - nx, az - nz, bx - nx, bz - nz, c);
    }
    if (round) for (let i = 0; i < p.length; i += 2) disc(mb, p[i], p[i + 1], hw, c, w < 4 ? 4 : 7);
  }
  const GR = 3000; gTri(G[0], -GR, -GR, GR, -GR, GR, GR, GROUND); gTri(G[0], -GR, -GR, GR, GR, -GR, GR, GROUND);
  AORD.forEach(k => { for (const a of J.areas) if (a.k === k) fillPoly(G[1], a.r, AC[k]); });
  for (const s of J.streams) { ribbon(G[2], s.p, s.w + 3.4, [.72, .70, .62], true); ribbon(G[2], s.p, s.w, [.36, .70, .86], true); }
  const roads = J.roads.slice().sort((a, b) => a.k - b.k);
  for (const r of roads) if (r.k >= 2) ribbon(G[2], r.p, r.w + 3.2, [.84, .80, .72], false);
  for (const r of roads) if (r.k === 0) ribbon(G[2], r.p, r.w + 0.4, [.82, .76, .66], false);
  const RC = { primary: [.43, .43, .46], primary_link: [.44, .44, .47], secondary: [.45, .45, .48], secondary_link: [.46, .46, .49], tertiary: [.48, .48, .5], tertiary_link: [.48, .48, .5], residential: [.53, .53, .54], living_street: [.58, .57, .56], unclassified: [.53, .53, .54], service: [.60, .59, .58], pedestrian: [.86, .78, .68], footway: [.80, .73, .62], cycleway: [.62, .76, .62], track: [.74, .66, .54] };
  for (const r of roads) if (r.k >= 1) ribbon(G[3], r.p, r.w, RC[r.c] || RCOL, false);
  for (const r of roads) if (r.k >= 1) { const p = r.p; for (let i = 0; i < p.length; i += 2) disc(G[3], p[i], p[i + 1], r.w / 2, RC[r.c] || RCOL, r.w < 5 ? 5 : 8); }
  for (const r of roads) if (r.k === 0) ribbon(G[3], r.p, r.w, RC[r.c] || RC.footway, true);
  for (const r of roads) if (r.k >= 2 && r.w >= 5.5) {
    const p = r.p; let acc = 0, lc = r.k >= 3 ? [.97, .95, .78] : [.9, .9, .88];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue; const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let d = (4 - acc % 4 + 4) % 4; d + 1.8 < L; d += 6) ribbon(G[4], [ax + ux * d, az + uz * d, ax + ux * (d + 2.8), az + uz * (d + 2.8)], 0.22, lc, false);
      acc += L;
    }
  }
  const gmats = G.map(() => gmat());
  G.forEach((mb, i) => { const m = mb.mesh(gmats[i]); m.renderOrder = -20 + i; m.frustumCulled = false; scene.add(m); });

  // ───────── 건물 ─────────
  const B = { apt: new MB(), com: new MB(), sch: new MB(), oth: new MB(), shop: new MB(), vc: new MB(), rail: new MB(), door: new MB(), mail: new MB(), floor: new MB(), glass: new MB(), glow: new MB() };
  const bayW = { apt: 3.3, com: 3.4, sch: 3.7, oth: 3.0 };
  const fhOf = { apt: 3.0, com: 3.4, sch: 3.8, oth: 3.2 };
  const kindOf = t => t === 'apt' ? 'apt' : t === 'com' ? 'com' : (t === 'sch' || t === 'pub') ? 'sch' : 'oth';
  const palOf = (t) => ({ apt: PALAPT, com: PALCOM, sch: PALSCH, pub: PALPUB, ind: PALIND, rel: PALREL, house: PALHOUSE }[t] || PALOTH);
  const u8 = vi => [(vi * 128 + 2) / 1024, 0, ((vi + 1) * 128 - 2) / 1024];
  function aptVariant(bi, i, j, n, l) {
    const r = hash3(bi, i, j);
    if (l < 11) return (j === Math.floor(n / 2) && n > 1) ? 3 : (r < .5 ? 1 : 6);
    if (j === Math.floor(n / 2) && (bi + i) % 2 === 0) return 3;
    if (r < .26) return 0; if (r < .5) return 2; if (r < .75) return 1; return 6;
  }
  const PH = h => h > 20 ? 1.2 : 0.8;
  const aptList = [];
  const bldMeta = [];

  function facade(bi, b, ax, az, bx, bz, nx, nz, i, opt2 = {}) {
    const kind = kindOf(b.t), mb = B[kind], h = b.h, nF = Math.max(1, Math.round(h / fhOf[kind])), fh = opt2.fh || h / nF;
    const l = Math.hypot(bx - ax, bz - az); if (l < 0.3) return;
    const base = opt2.base, n = Math.max(1, Math.round(l / bayW[kind]));
    const hasShop = (kind === 'com' || (kind === 'oth' && b.n)) && b.t !== 'rel' && b.t !== 'ind';
    const y1 = opt2.y1 === undefined ? h : opt2.y1;
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n, x0 = lerp(ax, bx, t0), z0 = lerp(az, bz, t0), x1 = lerp(ax, bx, t1), z1 = lerp(az, bz, t1);
      let vi, vg;
      if (kind === 'apt') { vi = aptVariant(bi, i, j, n, l); vg = (l > 11 && j === Math.floor(n / 2)) || (n <= 3 && j === 0) ? 4 : 5; }
      else if (kind === 'com') { vi = [0, 1, 2, 3, 0, 4][Math.floor(hash3(bi, i, j) * 6)]; }
      else if (kind === 'sch') { vi = l < 8 ? 2 : (hash3(bi, i, j) < .8 ? 0 : 1); vg = j === Math.floor(n / 2) && l > 12 ? 6 : 0; }
      else { const r = hash3(bi, i, j); vi = b.t === 'ind' ? (r < .5 ? 3 : 5) : b.t === 'rel' ? 6 : (r < .4 ? 0 : r < .7 ? 1 : 2); vg = b.t === 'ind' ? 5 : (r < .3 ? 4 : vi); }
      // 1층
      if (!opt2.noGround) {
        if (hasShop) {
          const nm = (b.n && j === Math.floor(n / 2)) ? 16 + shopNames.indexOf(b.n.length > 11 ? b.n.slice(0, 11) : b.n) : Math.floor(hash3(bi, i, j + 77) * 16);
          const ci = Math.max(0, nm) % 32, cx = ci % SHOP_COLS, cy = Math.floor(ci / SHOP_COLS) % SHOP_ROWS;
          const uv = [(cx * 256 + 3) / 1024, 1 - ((cy + 1) * 128 - 2) / 1024, ((cx + 1) * 256 - 3) / 1024, 1 - (cy * 128 + 2) / 1024];
          B.shop.quad([x0, 0, z0], [x1, 0, z1], [x1, fh, z1], [x0, fh, z0], [nx, 0, nz], uv, base);
          // 차양 + 돌출 간판
          const aw = [.95, .55, .45];
          B.vc.quad([x0 + nx * .02, fh * .78, z0 + nz * .02], [x1 + nx * .02, fh * .78, z1 + nz * .02], [x1 + nx * .95, fh * .66, z1 + nz * .95], [x0 + nx * .95, fh * .66, z0 + nz * .95], [nx * .5, .85, nz * .5], [0, 0, 1, 1], [lerp(.9, aw[0], hash3(bi, j, 3)), .72, .6]);
          if (j % 3 === 1 && kind === 'com') { const sx = x0 + nx * .28, sz = z0 + nz * .28, ang = Math.atan2(bx - ax, bz - az); const wcx = (x0 + x1) / 2 + nx * .25, wcz = (z0 + z1) / 2 + nz * .25; B.shop.box(wcx, fh * 1.35, wcz, 1.1, 1.5, .18, Math.atan2(-(bz - az), bx - ax), [1, 1, 1], [uv[0] + .003, uv[3] - .040, uv[2] - .003, uv[3] - .003]); }
        } else {
          const uu = kind === 'apt' ? u8(vg) : kind === 'sch' || kind === 'oth' ? u8(vg) : u8(vi);
          mb.quad([x0, 0, z0], [x1, 0, z1], [x1, fh, z1], [x0, fh, z0], [nx, 0, nz], [uu[0], 0, uu[2], 1], base);
        }
      }
      // 위층 (세로로 반복)
      const yb = opt2.noGround ? (opt2.y0 || 0) : fh;
      if (y1 > yb + 0.05) {
        const u = u8(vi), reps = (y1 - yb) / fh;
        mb.quad([x0, yb, z0], [x1, yb, z1], [x1, y1, z1], [x0, y1, z0], [nx, 0, nz], [u[0], 0, u[2], reps], base);
      }
    }
  }
  const roofGear = (b, r, c, bi) => {
    const kind = kindOf(b.t), h = b.h; if (kind !== 'apt' && kind !== 'com') return;
    let best = 0, bj = 0; const n = r.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(r[j * 2] - r[i * 2], r[j * 2 + 1] - r[i * 2 + 1]); if (l > best) { best = l; bj = i; } }
    const j = (bj + 1) % n, dx = (r[j * 2] - r[bj * 2]) / best, dz = (r[j * 2 + 1] - r[bj * 2 + 1]) / best, yaw = Math.atan2(-dz, dx);
    const put = (t, fn) => { const px = c[0] + dx * best * t, pz = c[1] + dz * best * t; if (inPoly(px, pz, r)) fn(px, pz); };
    const tankC = [.88, .93, .97], boxC = [.86, .84, .80], doorC = [.45, .5, .55];
    if (kind === 'apt') {
      put(0, (x, z) => { B.vc.cyl(x, h, z, 1.5, 2.3, 8, tankC); B.vc.cyl(x, h + 2.3, z, 1.5, .15, 8, [.7, .78, .85]); B.vc.box(x + 1.9, h + .5, z, .3, 1.0, .3, yaw, [.6, .6, .6]); });
      if (best > 24) for (const t of [-0.36, 0.36]) put(t, (x, z) => { B.vc.box(x, h + 1.4, z, 3.6, 2.8, 3.2, yaw, boxC); B.vc.box(x + dz * 1.65, h + .95, z - dx * 1.65, 1.0, 1.9, .08, yaw, doorC); });
      else put(0.3, (x, z) => { B.vc.box(x, h + 1.3, z, 3.2, 2.6, 3.0, yaw, boxC); });
    } else { put(0, (x, z) => { B.vc.box(x, h + .7, z, 2.4, 1.4, 1.6, yaw, [.78, .78, .8]); }); }
  };

  const bldPoly = [];
  let FEAT = null;
  for (let bi = 0; bi < J.bld.length; bi++) {
    const b = J.bld[bi], r = b.r, n = r.length / 2, h = b.h, c = b.c;
    const pal = palOf(b.t), baseC = pal[(bi * 7 + (b.cx ? b.cx.length : 0)) % pal.length];
    const kind = kindOf(b.t), sg = areaOf(r) >= 0 ? 1 : -1;
    const ph = PH(h);
    bldPoly.push(r);
    if (kind === 'apt') aptList.push(bi);
    // 대표 건물(승강기 시험동): 피오르빌 15층 한 동
    const isFeat = b.t === 'apt' && b.cx === FEATN && Math.hypot(c[0] - (-4.9), c[1] - 63.1) < 3;
    let frontI = -1;
    if (isFeat) { let bm = -1e9; for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(r[j * 2] - r[i * 2], r[j * 2 + 1] - r[i * 2 + 1]), mz = (r[i * 2 + 1] + r[j * 2 + 1]) / 2; if (l > 30 && mz > bm) { bm = mz; frontI = i; } } }
    const baseV = [baseC[0], baseC[1], baseC[2]];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 0.05) continue;
      const nx = dz / l * sg, nz = -dx / l * sg;
      const uvPlain = u8(7);
      // 처마(코니스)
      const cc = [baseC[0] * 0.92 + .06, baseC[1] * 0.92 + .06, baseC[2] * 0.92 + .06];
      if (isFeat && i === frontI) {
        // 전면: 방향이 +x 쪽으로 가도록 (P0=서쪽 끝)
        let P0 = [ax, az], P1 = [bx, bz]; if (bx < ax) { P0 = [bx, bz]; P1 = [ax, az]; }
        const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]), du = [(P1[0] - P0[0]) / L, (P1[1] - P0[1]) / L];
        let dv = [du[1], -du[0]]; const mx = (P0[0] + du[0] * L / 2 + dv[0] * 4 - c[0]), mz = (P0[1] + du[1] * L / 2 + dv[1] * 4 - c[1]); if (Math.hypot(mx, mz) > Math.hypot(P0[0] + du[0] * L / 2 - c[0], P0[1] + du[1] * L / 2 - c[1])) dv = [-dv[0], -dv[1]];
        FEAT = { frontI: i, id: bi, P0, du, dv, L, h, nF: 15, ph, out: [-dv[0], -dv[1]], poly: r, bi, base: baseV };
        FEAT.uv = (u, v) => [P0[0] + du[0] * u + dv[0] * v, P0[1] + du[1] * u + dv[1] * v];
        FEAT.yaw = Math.atan2(-du[1], du[0]);
        continue;
      }
      facade(bi, b, ax, az, bx, bz, nx, nz, i, { base: baseV });
      // 난간벽(파라펫)
      B[kind].quad([ax, h, az], [bx, h, bz], [bx, h + ph, bz], [ax, h + ph, az], [nx, 0, nz], [uvPlain[0], 0, uvPlain[2], 1], baseV);
      // 처마 윗면 + 옆면
      B.vc.quad([ax + nx * .3, h + ph, az + nz * .3], [bx + nx * .3, h + ph, bz + nz * .3], [bx, h + ph, bz], [ax, h + ph, az], [0, 1, 0], [0, 0, 1, 1], cc);
      B.vc.quad([ax + nx * .3, h + ph - .22, az + nz * .3], [bx + nx * .3, h + ph - .22, bz + nz * .3], [bx + nx * .3, h + ph, bz + nz * .3], [ax + nx * .3, h + ph, az + nz * .3], [nx, 0, nz], [0, 0, 1, 1], [cc[0] * .9, cc[1] * .9, cc[2] * .9]);
      col.addSeg(ax, az, bx, bz, 0, h + ph);
    }
    // 지붕면
    {
      const rc = ROOFC[kind] || ROOFC.oth, contour = V2(r); let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { idx = []; }
      for (const t of idx) B.vc.tri([contour[t[0]].x, h, contour[t[0]].y], [contour[t[1]].x, h, contour[t[1]].y], [contour[t[2]].x, h, contour[t[2]].y], [0, 1, 0], [rc[0] * (.94 + hash3(bi, 1, 1) * .1), rc[1], rc[2]]);
    }
    col.addRoof(r.slice(), h, bi);
    if (!isFeat) roofGear(b, r, c, bi);
    bldMeta.push({ bi, kind, h, c, t: b.t });
  }

  // 대표 건물 내부/전면 구성 ───────────────────────────
  let elev = null;
  if (FEAT) {
    const F = FEAT, { du, dv, L, h, uv } = F, nF = F.nF, base = F.base, yaw = F.yaw;
    const b = J.bld[F.bi], nO = F.out;
    const P = (u, y, v) => { const q = uv(u, v); return [q[0], y, q[1]]; };
    const yF = f => f === 1 ? 0.3 : f <= nF ? (f - 1) * 3.0 : h;   // f=16 → 옥상
    F.yF = yF; F.stops = []; for (let f = 1; f <= nF + 1; f++) F.stops.push({ f, y: yF(f), name: f <= nF ? f + '층' : '옥상' });
    const mbA = B.apt;
    // 서쪽 끝(승강기 코어) 일반 외벽 u:0~2.4
    const wallSub = (u0, u1, o) => { const a = uv(u0, 0), bb = uv(u1, 0); facade(F.bi, b, a[0], a[1], bb[0], bb[1], nO[0], nO[1], 99, Object.assign({ base }, o)); };
    wallSub(0, 2.4, {});
    const parap = (u0, u1) => { const a = uv(u0, 0), bb = uv(u1, 0), pu = u8(7); mbA.quad([a[0], h, a[1]], [bb[0], h, bb[1]], [bb[0], h + F.ph, bb[1]], [a[0], h + F.ph, a[1]], [nO[0], 0, nO[1]], [pu[0], 0, pu[2], 1], base); };
    parap(0, 2.4);
    // 1층 동쪽(14.4~L): 일반 1층 벽 + 위는 복도
    wallSub(14.4, L, { y1: 0 });
    // 접근/코니스
    const cornice = (u0, u1) => { const a = uv(u0, 0), bb = uv(u1, 0), cc = [base[0] * .92 + .06, base[1] * .92 + .06, base[2] * .92 + .06]; B.vc.quad([a[0] + nO[0] * .3, h + F.ph, a[1] + nO[1] * .3], [bb[0] + nO[0] * .3, h + F.ph, bb[1] + nO[1] * .3], [bb[0], h + F.ph, bb[1]], [a[0], h + F.ph, a[1]], [0, 1, 0], [0, 0, 1, 1], cc); B.vc.quad([a[0] + nO[0] * .3, h + F.ph - .22, a[1] + nO[1] * .3], [bb[0] + nO[0] * .3, h + F.ph - .22, bb[1] + nO[1] * .3], [bb[0] + nO[0] * .3, h + F.ph, bb[1] + nO[1] * .3], [a[0] + nO[0] * .3, h + F.ph, a[1] + nO[1] * .3], [nO[0], 0, nO[1]], [0, 0, 1, 1], cc); };
    cornice(0, L);
    // 복도 앞면: 슬래브 파시아 + 난간(알파) + 열린 공간 / 맨 위 띠
    const concrete = [.80, .78, .73], steel = [.72, .75, .78], warm = [.96, .93, .86];
    const railC = [1, 1, 1];
    for (let f = 2; f <= nF + 1; f++) {
      const y = f <= nF ? yF(f) : nF * 3.0; // f=nF+1 → 지붕 슬래브(45m)
      if (f <= nF) {
        // 파시아
        B.vc.quad(P(2.4, y - .3, 0), P(L, y - .3, 0), P(L, y, 0), P(2.4, y, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], warm);
        // 난간 (1.1m)
        B.rail.quad(P(2.4, y, 0), P(L, y, 0), P(L, y + 1.1, 0), P(2.4, y + 1.1, 0), [nO[0], 0, nO[1]], [0, 0, (L - 2.4) / 2.2, 1], railC);
        // 바닥 슬래브(윗면) + 슬래브 윗면 타일
        B.floor.quad(P(2.4, y, 0), P(L, y, 0), P(L, y, 2.4), P(2.4, y, 2.4), [0, 1, 0], [0, 0, (L - 2.4) / 2, 1.2], [.9, .9, .88]);
        // 복도 안쪽 벽: 현관문 반복
        B.door.quad(P(2.4, y, 2.4), P(L, y, 2.4), P(L, y + 3.0, 2.4), P(2.4, y + 3.0, 2.4), [-nO[0], 0, -nO[1]], [0, 0, (L - 2.4) / 3.3, 1], [1, 1, 1]);
        // 층 표시판 (엘리베이터 옆)
        const pi = f - 1, pu0 = (pi % 8) / 8, pv0 = 1 - (Math.floor(pi / 8) + 1) / 4, pu1 = pu0 + 1 / 8 - .002, pv1 = pv0 + 1 / 4;
        B.mail.quad(P(2.6, y + 2.15, 2.39), P(3.4, y + 2.15, 2.39), P(3.4, y + 2.6, 2.39), P(2.6, y + 2.6, 2.39), [-nO[0], 0, -nO[1]], [0, 0, 1, 1], [1, 1, 1]);
        // 조명 패널
        for (let u = 6; u < L - 2; u += 9) B.glow.box(...(() => { const q = uv(u, 1.2); return [q[0], y + 2.92, q[1]]; })(), 1.4, .06, .5, yaw, [1, 1, 1]);
      } else {
        B.vc.quad(P(2.4, y - .3, 0), P(L, y - .3, 0), P(L, h + F.ph, 0), P(2.4, h + F.ph, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], warm);
      }
      // 슬래브 박스 (바닥/천장 역할)
      const cu = (2.4 + L) / 2, q = uv(cu, 1.2);
      B.vc.box(q[0], y - .15, q[1], L - 2.4, .3, 2.4, yaw, concrete);
      if (f <= nF) col.addBox(q[0], q[1], (L - 2.4) / 2, 1.2, yaw, y - .3, y, false);
    }
    // 코어 쪽 전면(u 0~2.4) 위쪽도 막힌 벽이라 위에서 이미 그렸음. 뒤쪽 긴 면은 일반 facade.
    // 1층 로비 전면: 유리창 + 문 + 간판
    const stone = [.74, .72, .68];
    B.vc.quad(P(2.4, 0, 0), P(14.4, 0, 0), P(14.4, .9, 0), P(2.4, .9, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], stone);
    B.vc.quad(P(2.4, 2.6, 0), P(14.4, 2.6, 0), P(14.4, 3.0, 0), P(2.4, 3.0, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], warm);
    for (const [a0, a1] of [[2.4, 8.4], [10.4, 14.4]]) B.glass.quad(P(a0, .9, 0), P(a1, .9, 0), P(a1, 2.6, 0), P(a0, 2.6, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], [1, 1, 1]);
    for (let u = 2.4; u <= 14.41; u += 1.5) if (Math.abs(u - 9.4) > 1.1) { const q = uv(u, 0); B.vc.box(q[0], 1.75, q[1], .08, 1.7, .08, yaw, [.5, .53, .56]); }
    for (const u of [8.4, 10.4]) { const q = uv(u, 0); B.vc.box(q[0], 1.5, q[1], .14, 3.0, .14, yaw, [.45, .48, .52]); }
    // 문 위 간판 "피오르빌"
    const signT = makeSignTex('피오르빌', '#2a4a5a', '#ffe9b0');
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.05), new THREE.MeshLambertMaterial({ map: signT, side: THREE.DoubleSide, emissive: 0x333333 }));
    { const q = uv(9.4, -.08); signM.position.set(q[0], 3.55, q[1]); signM.rotation.y = Math.atan2(nO[0], nO[1]); scene.add(signM); }
    // 입구 계단 (0.15 + 0.30) — 올라서면 되는 발판
    { const q1 = uv(9.4, -1.35), q2 = uv(9.4, -.45); B.vc.box(q1[0], .075, q1[1], 3.2, .15, .9, yaw, [.78, .76, .72]); B.vc.box(q2[0], .15, q2[1], 3.2, .3, .9, yaw, [.82, .8, .76]); col.addBox(q1[0], q1[1], 1.6, .45, yaw, 0, .15); col.addBox(q2[0], q2[1], 1.6, .45, yaw, 0, .30); }
    // 로비 (u 2.4~14.4, v 0~7.6): 바닥 높이 0.3
    { const q = uv(8.4, 3.8); col.addBox(q[0], q[1], 6, 3.8, yaw, 0, .3, false); }
    B.floor.quad(P(2.4, .3, 0), P(14.4, .3, 0), P(14.4, .3, 7.6), P(2.4, .3, 7.6), [0, 1, 0], [0, 0, 6, 3.8], [1, 1, 1]);
    B.vc.quad(P(2.4, 3.0, 0), P(14.4, 3.0, 0), P(14.4, 3.0, 7.6), P(2.4, 3.0, 7.6), [0, -1, 0], [0, 0, 1, 1], [.97, .95, .9]);
    for (let u = 4; u < 14; u += 3.2) for (let v = 1.6; v < 7; v += 3) { const q = uv(u, v); B.glow.box(q[0], 2.96, q[1], 1.2, .05, .5, yaw, [1, 1, 1]); }
    const wl = [.95, .92, .86];
    B.vc.quad(P(14.4, .3, 0), P(14.4, .3, 7.6), P(14.4, 3, 7.6), P(14.4, 3, 0), [-du[0], 0, -du[1]], [0, 0, 1, 1], wl);
    B.vc.quad(P(2.4, .3, 7.6), P(14.4, .3, 7.6), P(14.4, 3, 7.6), P(2.4, 3, 7.6), [-dv[0], 0, -dv[1]], [0, 0, 1, 1], wl);
    B.vc.quad(P(2.4, .3, 2.4), P(2.4, .3, 7.6), P(2.4, 3, 7.6), P(2.4, 3, 2.4), [du[0], 0, du[1]], [0, 0, 1, 1], wl);
    // 우편함 / 게시판 / 벤치 / 화분 / 안내 간판
    B.mail.quad(P(10.6, 1.0, 7.55), P(13.6, 1.0, 7.55), P(13.6, 2.0, 7.55), P(10.6, 2.0, 7.55), [-dv[0], 0, -dv[1]], [0, 0, 1, 1], [1, 1, 1]);
    { const q = uv(6.2, 7.1); B.vc.box(q[0], .65, q[1], 2.4, .1, .6, yaw, [.55, .38, .26]); B.vc.box(q[0], .32, q[1], 2.2, .3, .5, yaw, [.4, .3, .22]); }
    { const q = uv(13.5, 6.6); B.vc.cyl(q[0], .3, q[1], .32, .5, 8, [.78, .52, .38]); B.vc.cyl(q[0], .8, q[1], .5, .9, 7, [.30, .62, .34], .1); }
    { const q = uv(3.4, 6.9); B.vc.cyl(q[0], .3, q[1], .32, .5, 8, [.78, .52, .38]); B.vc.cyl(q[0], .8, q[1], .5, .9, 7, [.32, .64, .32], .1); }
    const lobbySign = makeSignTex('피오르빌  1층 로비', '#f2ead8', '#3a4a5a', 512, 96);
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .68), new THREE.MeshLambertMaterial({ map: lobbySign, side: THREE.DoubleSide, emissive: 0x444444 })); const q = uv(6.8, 7.57); m.position.set(q[0], 2.3, q[1]); m.rotation.y = Math.atan2(-dv[0], -dv[1]); scene.add(m); }
    // 승강기 층 입구 벽(코어) — 각 층마다 문 구멍(v 0.7~1.7)
    const metal = [.78, .8, .83];
    const stopsY = F.stops.map(s => s.y);
    for (let s = 0; s < stopsY.length; s++) {
      const y = stopsY[s], top = y + 3.0 > h + 0.01 && s === stopsY.length - 1 ? y + 3.4 : y + (s === 0 ? 2.7 : 3.0);
      const hh = (s === 0) ? 3.0 : (s === stopsY.length - 1 ? y + 3.3 : y + 3.0);
      const y0 = y - (s === 0 ? .3 : 0);
      B.vc.quad(P(2.4, y0, 0), P(2.4, y0, .7), P(2.4, hh, .7), P(2.4, hh, 0), [du[0], 0, du[1]], [0, 0, 1, 1], metal);
      B.vc.quad(P(2.4, y0, 1.7), P(2.4, y0, 2.4), P(2.4, hh, 2.4), P(2.4, hh, 1.7), [du[0], 0, du[1]], [0, 0, 1, 1], metal);
      B.vc.quad(P(2.4, y + 2.2, .7), P(2.4, y + 2.2, 1.7), P(2.4, hh, 1.7), P(2.4, hh, .7), [du[0], 0, du[1]], [0, 0, 1, 1], metal);
      // 호출 버튼 판
      const q = uv(2.44, 2.05); B.glow.box(q[0], y + 1.1, q[1], .06, .26, .14, yaw, [1, .75, .35]);
    }
    // 옥탑(승강기 기계실) 외벽 + 지붕
    const hy = h; const hc = [.86, .84, .8];
    B.vc.quad(P(0, hy, 0), P(2.4, hy, 0), P(2.4, hy + 3.3, 0), P(0, hy + 3.3, 0), [nO[0], 0, nO[1]], [0, 0, 1, 1], hc);
    B.vc.quad(P(0, hy, 2.4), P(2.4, hy, 2.4), P(2.4, hy + 3.3, 2.4), P(0, hy + 3.3, 2.4), [-nO[0], 0, -nO[1]], [0, 0, 1, 1], hc);
    B.vc.quad(P(0, hy, 0), P(0, hy, 2.4), P(0, hy + 3.3, 2.4), P(0, hy + 3.3, 0), [-du[0], 0, -du[1]], [0, 0, 1, 1], hc);
    B.vc.quad(P(-.2, hy + 3.3, -.2), P(2.6, hy + 3.3, -.2), P(2.6, hy + 3.3, 2.6), P(-.2, hy + 3.3, 2.6), [0, 1, 0], [0, 0, 1, 1], [.62, .62, .64]);
    // 옥상 물탱크 · 옥상 장비
    for (const u of [L * .32, L * .62]) { const q = uv(u, 4.4); B.vc.cyl(q[0], h, q[1], 1.6, 2.4, 8, [.88, .93, .97]); B.vc.cyl(q[0], h + 2.4, q[1], 1.6, .15, 8, [.7, .78, .85]); }
    { const q = uv(L - 4, 4.4); B.vc.box(q[0], h + 1.3, q[1], 3.4, 2.6, 3.0, yaw, hc); }
    // ── 충돌 ──
    const seg = (u0, v0, u1, v1, y0, y1) => { const a = uv(u0, v0), bb = uv(u1, v1); col.addSeg(a[0], a[1], bb[0], bb[1], y0, y1); };
    // 전면: 서쪽 코어 전체, 1층 벽(문 틈 제외), 위쪽 난간 전체
    seg(0, 0, 2.4, 0, 0, h + F.ph); seg(2.4, 0, 8.4, 0, 0, 3.0); seg(10.4, 0, L, 0, 0, 3.0); seg(2.4, 0, L, 0, 3.0, h + F.ph);
    seg(2.4, 2.4, L, 2.4, 2.9, h + F.ph);                      // 복도 안쪽 벽
    seg(0, 0, 0, 2.4, 0, h + 3.3); seg(0, 2.4, 2.4, 2.4, 0, h + 3.3);  // 코어 서/북쪽 벽
    seg(2.4, 0, 2.4, .7, 0, h + 3.3); seg(2.4, 1.7, 2.4, 2.4, 0, h + 3.3); // 문 양옆
    seg(2.4, 2.4, 2.4, 7.6, 0, 3.0); seg(2.4, 7.6, 14.4, 7.6, 0, 3.0); seg(14.4, 0, 14.4, 7.6, 0, 3.0); // 로비 벽
    seg(14.4, 0, L, 0, 0, 3.0);
    // 승강기 컨테이너 (모양은 explore.js 에서 이동체로 만든다)
    elev = { stops: F.stops };
  }
  // 일반 건물 외곽선 충돌: (이미 facade 루프에서 추가함)

  // 메시 추가
  const mm = (mb, mat, ro) => { if (mb.n === 0) return null; const m = mb.mesh(mat); m.frustumCulled = false; if (ro !== undefined) m.renderOrder = ro; scene.add(m); return m; };
  mm(B.apt, mats.apt); mm(B.com, mats.com); mm(B.sch, mats.sch); mm(B.oth, mats.oth); mm(B.shop, mats.shop); mm(B.vc, mats.vc);
  mm(B.rail, mats.rail); mm(B.door, mats.door); mm(B.mail, mats.mail); mm(B.floor, mats.floor); mm(B.glow, mats.glow);
  const glassMesh = mm(B.glass, mats.glass, 5);

  // ───────── 나무 (11월: 은행 노랑 · 단풍 주황 · 상록 초록 섞기) ─────────
  {
    const trees = J.trees.filter(t => { for (let i = 0; i < 1; i++) { const rl = col.cell(col.roofG, t[0], t[1]); if (rl) for (const r of rl) if (inPoly(t[0], t[1], r.poly)) return false; } return true; });
    const cm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mkL({}), trees.length), tm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .22, 2.0, 5), mkL({ color: 0x8a6a4c }), trees.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    const PC = [[.40, .68, .38], [.46, .72, .36], [.96, .78, .22], [.98, .70, .20], [.92, .48, .20], [.34, .60, .36]];
    trees.forEach((t, i) => {
      const s = t[2] * (1.0 + hash3(i, 3, 5) * .5), ht = 3.2 * s + 1.2;
      o.position.set(t[0], 1.0 * s, t[1]); o.scale.set(s * .8, s, s * .8); o.rotation.set(0, 0, 0); o.updateMatrix(); tm.setMatrixAt(i, o.matrix);
      o.position.set(t[0], 2.7 * s + 1.0, t[1]); o.scale.set(1.9 * s, 1.6 * s, 1.9 * s); o.rotation.set(hash3(i, 1, 2) * 3, hash3(i, 2, 3) * 3, 0); o.updateMatrix(); cm.setMatrixAt(i, o.matrix);
      const pc = PC[Math.floor(hash3(i, 9, 1) * PC.length)], v = .9 + hash3(i, 4, 4) * .2; c.setRGB(pc[0] * v, pc[1] * v, pc[2] * v); cm.setColorAt(i, c);
      col.addCirc(t[0], t[1], .3, 3.0);
    });
    cm.frustumCulled = false; tm.frustumCulled = false; scene.add(cm); scene.add(tm);
  }
  // ───────── 가로등 ─────────
  {
    const pts = [];
    for (const r of J.roads) if (r.k >= 3) { const p = r.p; let acc = 20; for (let i = 0; i + 3 < p.length; i += 2) { const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < .5) continue; const ux = (bx - ax) / L, uz = (bz - az) / L, off = r.w / 2 + 1.0; for (let d = (36 - acc % 36) % 36; d < L; d += 36) { const x = ax + ux * d - uz * off, z = az + uz * d + ux * off; if (!col.solidBuilding(x, 1, z)) pts.push(x, z, Math.atan2(-uz, -ux)); } acc += L; } }
    const n = pts.length / 3, pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .1, 6.2, 5), mkL({ color: 0x8a8f96 }), n), hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, .14, .32), mkL({ color: 0xeee4c8, emissive: 0x554a30 }), n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { o.position.set(pts[i * 3], 3.1, pts[i * 3 + 1]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); o.position.set(pts[i * 3] + Math.cos(pts[i * 3 + 2]) * .6, 6.25, pts[i * 3 + 1] - Math.sin(pts[i * 3 + 2]) * .6); o.rotation.y = pts[i * 3 + 2]; o.updateMatrix(); hm.setMatrixAt(i, o.matrix); col.addCirc(pts[i * 3], pts[i * 3 + 1], .12, 6); }
    pm.frustumCulled = false; hm.frustumCulled = false; scene.add(pm); scene.add(hm);
  }
  // ───────── 멀리 보이는 산 (분위기용 장식 — 실제 지형 아님) ─────────
  {
    const mb = new MB(); const cx = -80, cz = 150;
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * 6.2832 + hash3(i, 1, 1) * .2, R = 2500 + hash3(i, 2, 2) * 500, hgt = 260 + hash3(i, 3, 3) * 380, w = 420 + hash3(i, 4, 4) * 320, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, seg = 7;
      for (let k = 0; k < seg; k++) { const a0 = k / seg * 6.2832, a1 = (k + 1) / seg * 6.2832; const p0 = [x + Math.cos(a0) * w, 0, z + Math.sin(a0) * w], p1 = [x + Math.cos(a1) * w, 0, z + Math.sin(a1) * w], pk = [x + Math.cos((a0 + a1) / 2) * w * .05, hgt, z + Math.sin((a0 + a1) / 2) * w * .05]; const tc = [.62, .76, .66], bc = [.76, .84, .84]; mb.vert(...p0, 0, 1, 0, 0, 0, bc); mb.vert(...p1, 0, 1, 0, 0, 0, bc); mb.vert(...pk, 0, 1, 0, 0, 0, tc); const n0 = mb.n - 3; mb.I.push(n0, n0 + 1, n0 + 2); }
    }
    const m = mb.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = -30; scene.add(m);
  }

  // ───────── 아파트 발코니 (가까이 가면 실제 입체로 생성) ─────────
  const bal = { active: new Map(), mat: mkL({ vertexColors: true, side: THREE.DoubleSide }) };
  function makeBalconies(bi) {
    const b = J.bld[bi], r = b.r, n = r.length / 2, sg = areaOf(r) >= 0 ? 1 : -1, nF = Math.max(1, Math.round(b.h / fhOf.apt)), fh = b.h / nF, mb = new MB();
    for (let i = 0; i < n; i++) {
      if (FEAT && bi === FEAT.bi && i === FEAT.frontI) continue;
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 11) continue;
      const nx = dz / l * sg, nz = -dx / l * sg, nb = Math.max(1, Math.round(l / bayW.apt)), yaw = Math.atan2(-dz, dx);
      for (let q = 0; q < nb; q++) {
        const vi = aptVariant(bi, i, q, nb, l); if (vi !== 0 && vi !== 2) continue;
        const cx = lerp(ax, bx, (q + .5) / nb), cz = lerp(az, bz, (q + .5) / nb), bw = l / nb * .86;
        for (let f = 1; f < nF; f++) {
          const y = f * fh; const px = cx + nx * .65, pz = cz + nz * .65;
          mb.box(px, y + .08, pz, bw, .16, 1.3, yaw, [.95, .93, .88], [0, 0, 1, 1], false);
          const gc = [.72, .86, .94];
          mb.quad([cx + nx * 1.28 - dx / l * bw / 2, y + .16, cz + nz * 1.28 - dz / l * bw / 2], [cx + nx * 1.28 + dx / l * bw / 2, y + .16, cz + nz * 1.28 + dz / l * bw / 2], [cx + nx * 1.28 + dx / l * bw / 2, y + 1.05, cz + nz * 1.28 + dz / l * bw / 2], [cx + nx * 1.28 - dx / l * bw / 2, y + 1.05, cz + nz * 1.28 - dz / l * bw / 2], [nx, 0, nz], [0, 0, 1, 1], gc);
          for (const s of [-1, 1]) mb.quad([cx + nx * .02 + s * dx / l * bw / 2, y + .16, cz + nz * .02 + s * dz / l * bw / 2], [cx + nx * 1.28 + s * dx / l * bw / 2, y + .16, cz + nz * 1.28 + s * dz / l * bw / 2], [cx + nx * 1.28 + s * dx / l * bw / 2, y + 1.05, cz + nz * 1.28 + s * dz / l * bw / 2], [cx + nx * .02 + s * dx / l * bw / 2, y + 1.05, cz + nz * .02 + s * dz / l * bw / 2], [dx / l, 0, dz / l], [0, 0, 1, 1], gc);
        }
      }
    }
    if (mb.n === 0) return null; const m = mb.mesh(bal.mat); m.frustumCulled = true; scene.add(m); return m;
  }
  let balT = 0;
  function updateDetail(px, pz, dt) {
    balT -= dt; if (balT > 0) return; balT = 0.6; let made = 0;
    for (const bi of aptList) {
      const c = J.bld[bi].c, d = Math.hypot(c[0] - px, c[1] - pz), has = bal.active.has(bi);
      if (d < 90 && !has && made < 2) { bal.active.set(bi, makeBalconies(bi)); made++; }
      else if (d > 130 && has) { const m = bal.active.get(bi); if (m) { scene.remove(m); m.geometry.dispose(); } bal.active.delete(bi); }
    }
  }

  // ───────── 도로 그래프 (보행자/차량 경로) ─────────
  const graph = buildGraph(J);

  return { col, FEAT, elev, graph, updateDetail, mats, T, glassMesh, bounds: [REND[0] + 15, REND[1] + 15, REND[2] - 15, REND[3] - 15], bal, stat: { bld: J.bld.length, balcony: () => bal.active.size } };
}

// ───────── 도로 그래프 ─────────
function buildGraph(J) {
  const nodes = [], key = new Map(), edges = [];
  const nid = (x, z) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); let i = key.get(k); if (i === undefined) { i = nodes.length; nodes.push({ x, z, adj: [] }); key.set(k, i); } return i; };
  for (const r of J.roads) {
    const p = r.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const a = nid(p[i], p[i + 1]), b = nid(p[i + 2], p[i + 3]); if (a === b) continue;
      const len = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); if (len < .2) continue;
      const e = { a, b, len, w: r.w, k: r.k, c: r.c, ped: r.k <= 3 && r.c !== 'primary', car: r.k >= 2 && r.c !== 'footway' };
      const id = edges.length; edges.push(e); nodes[a].adj.push(id); nodes[b].adj.push(id);
    }
  }
  // 공간 격자 (64m)
  const CELLS = 64, gridPed = new Map(), gridCar = new Map();
  const add = (m, e, id) => { for (const t of [0, .5, 1]) { const x = lerp(nodes[e.a].x, nodes[e.b].x, t), z = lerp(nodes[e.a].z, nodes[e.b].z, t), k = Math.floor(x / CELLS) * 4096 + Math.floor(z / CELLS); let a = m.get(k); if (!a) { a = []; m.set(k, a); } if (a[a.length - 1] !== id) a.push(id); } };
  edges.forEach((e, id) => { if (e.ped) add(gridPed, e, id); if (e.car) add(gridCar, e, id); });
  const pick = (m, x, z, rad) => { const out = []; for (let ix = Math.floor((x - rad) / CELLS); ix <= Math.floor((x + rad) / CELLS); ix++) for (let iz = Math.floor((z - rad) / CELLS); iz <= Math.floor((z + rad) / CELLS); iz++) { const a = m.get(ix * 4096 + iz); if (a) for (const id of a) out.push(id); } return out; };
  return { nodes, edges, gridPed, gridCar, pick, CELLS };
}
