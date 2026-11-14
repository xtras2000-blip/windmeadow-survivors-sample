// 창원시 성산구 남양동 실제 지도 (OSM + V-World 법정동 경계) → three.js 도시 맵
// 데이터: © OpenStreetMap contributors (ODbL) / 법정구역: 국가공간정보포털(V-World)
export async function loadNamyang(THREE, C) {
  const { scene, mat, U, COMMON, FS_COMMON, isTouch, clamp, lerp } = C;
  const J = await (await fetch('./namyang_game.json')).json();
  const META = J.meta, PLAY = META.play, REND = META.render;
  const [gx0, gz0, gx1, gz1] = PLAY, GW = gx1 - gx0, GH = gz1 - gz0;

  // ───────── 정적 지오메트리 (한 덩어리 = 드로우콜 1) ─────────
  const POS = [], NOR = [], COL = [], KIND = [], BASE = [], HGT = [];
  const push = (x, y, z, nx, ny, nz, c, k, bx, bz, h) => { POS.push(x, y, z); NOR.push(nx, ny, nz); COL.push(c[0], c[1], c[2]); KIND.push(k); BASE.push(bx, bz); HGT.push(h); };
  const tri = (a, b, c, col, k = 0) => { for (const p of [a, b, c]) push(p[0], p[1], p[2], 0, 1, 0, col, k, 0, 0, 0); };
  // 위쪽을 보도록 삼각형 (xz 평면)
  const triUp = (ax, az, bx, bz, cx, cz, y, col, k = 0, bx0 = 0, bz0 = 0, h = 0) => {
    const cr = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const A = [ax, az], B = cr >= 0 ? [bx, bz] : [cx, cz], Cc = cr >= 0 ? [cx, cz] : [bx, bz];
    push(A[0], y, A[1], 0, 1, 0, col, k, bx0, bz0, h); push(B[0], y, B[1], 0, 1, 0, col, k, bx0, bz0, h); push(Cc[0], y, Cc[1], 0, 1, 0, col, k, bx0, bz0, h);
  };
  const V2 = a => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(new THREE.Vector2(a[i], a[i + 1])); return o; };
  function fillPoly(rings, y, col, k = 0, bx = 0, bz = 0, h = 0) {
    const contour = V2(rings[0]); const holes = rings.slice(1).map(V2);
    let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
    const all = contour.concat(...holes);
    for (const t of idx) triUp(all[t[0]].x, all[t[0]].y, all[t[1]].x, all[t[1]].y, all[t[2]].x, all[t[2]].y, y, col, k, bx, bz, h);
  }
  function disc(x, z, r, y, col, k = 0, n = 6) {
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2; triUp(x, z, x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, y, col, k); }
  }
  function ribbon(p, w, y, col, k = 0, round = true) {
    const hw = w / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw;
      triUp(ax + nx, az + nz, ax - nx, az - nz, bx + nx, bz + nz, y, col, k); triUp(bx + nx, bz + nz, ax - nx, az - nz, bx - nx, bz - nz, y, col, k);
    }
    if (round) for (let i = 0; i < p.length; i += 2) disc(p[i], p[i + 1], hw, y, col, k, w < 4 ? 4 : 7);
  }
  // 바닥 (넓게)
  const GR = 2600, groundCol = [0.70, 0.74, 0.80];
  triUp(-GR, -GR, GR, -GR, GR, GR, 0, groundCol, 0.2); triUp(-GR, -GR, GR, GR, -GR, GR, 0, groundCol, 0.2);
  // 면 (토지 이용)
  const AC = { res: [0.74, 0.74, 0.82], com: [0.82, 0.72, 0.78], ind: [0.64, 0.69, 0.80], sch: [0.88, 0.84, 0.66], golf: [0.66, 0.82, 0.46], meadow: [0.66, 0.82, 0.46], park_lot: [0.62, 0.64, 0.74], park: [0.52, 0.76, 0.40], wood: [0.40, 0.66, 0.40], pitch: [0.80, 0.55, 0.46], play: [0.90, 0.74, 0.46], water: [0.40, 0.72, 0.88] };
  const AORD = ['res', 'com', 'ind', 'sch', 'golf', 'meadow', 'park_lot', 'park', 'wood', 'pitch', 'play', 'water'];
  AORD.forEach((k, i) => { for (const a of J.areas) if (a.k === k) fillPoly(a.r, 0.004 + i * 0.0012, AC[k], k === 'water' ? 2 : (k === 'res' || k === 'com' || k === 'ind' || k === 'sch' || k === 'park_lot') ? 0.2 : 0); });
  // 하천
  for (const s of J.streams) { ribbon(s.p, s.w + 3.2, 0.02, [0.80, 0.80, 0.85], 0); ribbon(s.p, s.w, 0.024, [0.42, 0.78, 0.90], 2); }
  // 도로 (인도 → 차도)
  const RCOL = { primary: [0.40, 0.42, 0.54], primary_link: [0.43, 0.45, 0.56], secondary: [0.44, 0.46, 0.58], secondary_link: [0.46, 0.48, 0.59], tertiary: [0.48, 0.50, 0.61], tertiary_link: [0.49, 0.51, 0.62], residential: [0.54, 0.56, 0.66], living_street: [0.58, 0.60, 0.68], unclassified: [0.54, 0.56, 0.66], service: [0.60, 0.61, 0.70], pedestrian: [0.88, 0.76, 0.70], footway: [0.84, 0.80, 0.80], cycleway: [0.70, 0.82, 0.70], track: [0.78, 0.72, 0.62] };
  const roads = J.roads.slice().sort((a, b) => a.k - b.k);
  for (const r of roads) if (r.k >= 2) ribbon(r.p, r.w + 2.6, 0.03, [0.84, 0.83, 0.88], 0, false);
  for (const r of roads) ribbon(r.p, r.w, 0.036 + r.k * 0.004, RCOL[r.c] || RCOL.residential, 0);
  // 차선 (중앙 점선)
  for (const r of roads) if (r.k >= 3 && r.w >= 8) {
    const p = r.p; let acc = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue; const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let d = (4 - acc % 4 + 4) % 4; d + 1.8 < L; d += 5.6) ribbon([ax + ux * d, az + uz * d, ax + ux * (d + 2.6), az + uz * (d + 2.6)], 0.28, 0.036 + r.k * 0.004 + 0.003, [0.96, 0.95, 0.88], 0, false);
      acc += L;
    }
  }
  // 법정동 경계 (점선)
  {
    const b = META.boundary, n = b.length / 2; const dash = 7, gap = 4, yb = 0.09, col = [1.0, 0.84, 0.30];
    for (let i = 0; i < n; i++) {
      const ax = b[i * 2], az = b[i * 2 + 1], bx = b[((i + 1) % n) * 2], bz = b[((i + 1) % n) * 2 + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let d = 0; d < L; d += dash + gap) { const e = Math.min(d + dash, L); ribbon([ax + ux * d, az + uz * d, ax + ux * e, az + uz * e], 1.1, yb, col, 4, false); }
    }
  }
  // 건물
  const PAL = { apt: [[0.99, 0.88, 0.85], [0.96, 0.93, 0.80], [0.86, 0.93, 0.89], [0.89, 0.89, 0.98], [0.99, 0.91, 0.78], [0.93, 0.86, 0.95]], com: [[0.83, 0.89, 0.98], [0.91, 0.87, 0.96]], sch: [[0.99, 0.90, 0.62]], pub: [[0.89, 0.83, 0.97]], ind: [[0.78, 0.82, 0.89]], rel: [[0.96, 0.85, 0.76]], house: [[0.95, 0.89, 0.83]], oth: [[0.93, 0.88, 0.86], [0.88, 0.90, 0.95]] };
  const bldInfo = []; // 라벨용 높이 조회
  for (let bi = 0; bi < J.bld.length; bi++) {
    const b = J.bld[bi], r = b.r, n = r.length / 2, h = b.h, cx = b.c[0], cz = b.c[1];
    const pal = PAL[b.t] || PAL.oth, base = pal[(bi * 7 + (b.cx ? b.cx.length : 0)) % pal.length];
    let A = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1]; }
    const sg = A >= 0 ? 1 : -1;
    const wc = base, rc = [lerp(base[0], 0.58, 0.62), lerp(base[1], 0.62, 0.62), lerp(base[2], 0.76, 0.62)];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      if (l < 0.05) continue;
      const nx = dz / l * sg, nz = -dx / l * sg;
      const v = (x, y, z) => push(x, y, z, nx, 0, nz, wc, 1, cx, cz, h);
      v(ax, 0, az); v(bx, 0, bz); v(bx, h, bz); v(ax, 0, az); v(bx, h, bz); v(ax, h, az);
    }
    fillPoly([r], h, rc, 3, cx, cz, h);
    bldInfo.push({ x: cx, z: cz, h });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(POS, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(NOR, 3));
  geo.setAttribute('vcol', new THREE.Float32BufferAttribute(COL, 3));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(KIND, 1));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(BASE, 2));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(HGT, 1));
  U.uCutR = { value: new THREE.Vector2(20, 40) };
  U.uPlay = { value: new THREE.Vector4(gx0, gz0, gx1, gz1) };
  const cityMat = mat(`
    attribute vec3 vcol; attribute float aKind; attribute vec2 aBase; attribute float aH; uniform vec2 uCutR;
    varying vec3 vCol; varying vec3 vN; varying vec3 vWP; varying float vK; varying float vU;
    void main(){
      vec3 p=position;
      if((aKind>0.5&&aKind<1.5)||(aKind>2.5&&aKind<3.5)){
        float d=length(aBase-uPlayer.xz);
        float f=smoothstep(uCutR.x,uCutR.y,d);
        float hc=mix(min(aH,3.6),aH,f);
        p.y=min(p.y,hc);
      }
      vWP=p; vCol=vcol; vN=normal; vK=aKind; vU=dot(p.xz,vec2(-normal.z,normal.x));
      gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
    }`, `
    varying vec3 vCol; varying vec3 vN; varying vec3 vWP; varying float vK; varying float vU;
    void main(){
      vec2 p=vWP.xz; vec3 col=vCol; float kind=vK;
      if(kind>3.5){ gl_FragColor=vec4(col,1.0); return; }
      if(kind<0.5){ col*=0.95+0.07*vnoise(p*0.45)+0.03*vnoise(p*2.1); }
      if(kind>0.1&&kind<0.3){ vec2 g=abs(fract(p/2.4)-0.5); float ln=smoothstep(0.46,0.5,max(g.x,g.y)); col*=1.0-0.09*ln*(1.0-smoothstep(0.25,0.8,fwidth(p.x))); }
      if(kind>1.5&&kind<2.5&&kind!=3.0){
        float st=vnoise(vec2(p.x*0.9-uTime*0.8,p.y*0.9+uTime*0.3))*vnoise(vec2(p.x*0.5+uTime*0.4,p.y*1.6));
        col+=vec3(0.45,0.5,0.45)*smoothstep(0.25,0.5,st)*0.45;
      }
      if(kind>0.5&&kind<1.5){
        float fu=fract(vU/3.1), fv=fract(vWP.y/3.0);
        float win=step(0.14,fu)*step(fu,0.80)*step(0.26,fv)*step(fv,0.80);
        float fw=fwidth(vU/3.1)+fwidth(vWP.y/3.0);
        win*=(1.0-smoothstep(0.22,0.65,fw))*step(2.2,vWP.y);
        col=mix(col,vec3(0.50,0.64,0.90),win*0.62);
        col*=mix(1.0,0.86,smoothstep(2.4,0.0,vWP.y));
      }
      vec3 n=normalize(vN);
      col=shade(col,n)*cloudTint(p);
      // 플레이 영역 밖은 흐리게
      float od=max(max(uPlay.x-p.x,p.x-uPlay.z),max(uPlay.y-p.y,p.y-uPlay.w));
      col=mix(col,mix(uFogColor,vec3(0.80,0.74,0.92),0.5),smoothstep(0.0,14.0,od)*0.62);
      float fog=fogAmt(length(vWP-cameraPosition));
      gl_FragColor=vec4(mix(col,uFogColor,fog),1.0);
    }`);
  cityMat.side = THREE.DoubleSide;
  cityMat.extensions = { derivatives: true };
  const city = new THREE.Mesh(geo, cityMat); city.frustumCulled = false; scene.add(city);

  // ───────── 나무 (파스텔 동글 나무, 인스턴스) ─────────
  {
    const parts = [];
    const cyl = new THREE.CylinderGeometry(0.16, 0.26, 2.0, 5), ico = () => new THREE.IcosahedronGeometry(1, 1);
    const add = (g, x, y, z, sx, sy, sz, c0, c1) => {
      g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
      const p = g.attributes.position, nn = g.attributes.normal, vv = new THREE.Vector3();
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { vv.set(p.getX(i), p.getY(i), p.getZ(i)); const t = clamp((vv.y + 1) / 2, 0, 1); const c = [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)]; cols.set(c, i * 3); p.setXYZ(i, vv.x * sx + x, vv.y * sy + y, vv.z * sz + z); }
      g.setAttribute('vcol', new THREE.BufferAttribute(cols, 3)); g.deleteAttribute('uv'); parts.push(g);
    };
    add(cyl, 0, 1.0, 0, 1, 1, 1, [0.50, 0.36, 0.38], [0.58, 0.44, 0.42]);
    add(ico(), 0, 3.1, 0, 1.7, 1.5, 1.7, [0.30, 0.60, 0.44], [0.70, 0.88, 0.42]);
    add(ico(), 0.5, 4.1, 0.2, 1.1, 1.0, 1.1, [0.40, 0.68, 0.44], [0.76, 0.92, 0.46]);
    let nv = 0; parts.forEach(g => nv += g.attributes.position.count);
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3); let o = 0;
    parts.forEach(g => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); Cc.set(g.attributes.vcol.array, o * 3); o += g.attributes.position.count; });
    const tg = new THREE.InstancedBufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(P, 3)); tg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); tg.setAttribute('vcol', new THREE.BufferAttribute(Cc, 3));
    const T = J.trees, inst = new Float32Array(T.length * 4);
    T.forEach((t, i) => { inst[i * 4] = t[0]; inst[i * 4 + 1] = t[1]; inst[i * 4 + 2] = t[2]; inst[i * 4 + 3] = (i * 2.399) % 6.283; });
    tg.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4)); tg.instanceCount = T.length;
    const tm = mat(`attribute vec4 aInst; attribute vec3 vcol; varying vec3 vCol; varying float vFog;
      void main(){
        vec2 wp=aInst.xy; float d=length(wp-uPlayer.xz);
        float sc=aInst.z*(1.0-smoothstep(120.0,160.0,d));
        float ca=cos(aInst.w), sa=sin(aInst.w);
        vec3 lp=position*sc;
        vec3 w=vec3(wp.x+lp.x*ca+lp.z*sa, lp.y, wp.y-lp.x*sa+lp.z*ca);
        w.xz+=vec2(0.9,0.35)*sin(uTime*1.2+wp.x*0.3)*0.06*position.y*sc;
        vec3 n=vec3(normal.x*ca+normal.z*sa, normal.y, -normal.x*sa+normal.z*ca);
        vec3 col=shade(vcol,n)*cloudTint(wp);
        float od=max(max(uPlay.x-wp.x,wp.x-uPlay.z),max(uPlay.y-wp.y,wp.y-uPlay.w));
        col=mix(col,mix(uFogColor,vec3(0.80,0.74,0.92),0.5),smoothstep(0.0,14.0,od)*0.62);
        vCol=col; vec4 mv=viewMatrix*vec4(w,1.0); vFog=fogAmt(length(mv.xyz)); gl_Position=projectionMatrix*mv;
      }`, `varying vec3 vCol; varying float vFog; void main(){ gl_FragColor=vec4(mix(vCol,uFogColor,vFog),1.0); }`);
    const tr = new THREE.Mesh(tg, tm); tr.frustumCulled = false; scene.add(tr);
  }

  // ───────── 래스터: 충돌 격자 + 풀 마스크 (1m 셀) ─────────
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH; const cx2 = cv.getContext('2d', { willReadFrequently: true });
  const poly = (c, a, ring) => { c.beginPath(); for (let i = 0; i < ring.length; i += 2) { const x = ring[i] - gx0, z = ring[i + 1] - gz0; i ? c.lineTo(x, z) : c.moveTo(x, z); } c.closePath(); };
  // 하천(느림) → 초록, 건물/연못(막힘) → 빨강
  cx2.strokeStyle = '#0f0'; cx2.lineJoin = 'round'; cx2.lineCap = 'round';
  for (const s of J.streams) { cx2.lineWidth = s.w; cx2.beginPath(); for (let i = 0; i < s.p.length; i += 2) { const x = s.p[i] - gx0, z = s.p[i + 1] - gz0; i ? cx2.lineTo(x, z) : cx2.moveTo(x, z); } cx2.stroke(); }
  cx2.fillStyle = '#f00'; cx2.strokeStyle = '#f00'; cx2.lineWidth = 1.2;
  for (const b of J.bld) { poly(cx2, 0, b.r); cx2.fill(); cx2.stroke(); }
  for (const a of J.areas) if (a.k === 'water') { poly(cx2, 0, a.r[0]); cx2.fill(); }
  const img = cx2.getImageData(0, 0, GW, GH).data;
  const BLK = new Uint8Array(GW * GH), SLOW = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) { const a = img[i * 4 + 3]; if (a > 80) { if (img[i * 4] > 128) BLK[i] = 1; else if (img[i * 4 + 1] > 128) SLOW[i] = 1; } }
  // 풀 마스크
  cx2.clearRect(0, 0, GW, GH);
  cx2.fillStyle = '#fff';
  for (const a of J.areas) if (a.k === 'park' || a.k === 'wood' || a.k === 'meadow' || a.k === 'golf') { poly(cx2, 0, a.r[0]); cx2.fill(); }
  cx2.globalCompositeOperation = 'destination-out'; cx2.strokeStyle = '#000'; cx2.lineJoin = 'round'; cx2.lineCap = 'round';
  for (const r of J.roads) { if (r.k < 1) { cx2.lineWidth = r.w + 1; } else cx2.lineWidth = r.w + 2.4; cx2.beginPath(); for (let i = 0; i < r.p.length; i += 2) { const x = r.p[i] - gx0, z = r.p[i + 1] - gz0; i ? cx2.lineTo(x, z) : cx2.moveTo(x, z); } cx2.stroke(); }
  cx2.fillStyle = '#000'; cx2.lineWidth = 2.5;
  for (const b of J.bld) { poly(cx2, 0, b.r); cx2.fill(); cx2.stroke(); }
  cx2.globalCompositeOperation = 'source-over';
  const mimg = cx2.getImageData(0, 0, GW, GH).data, MASK = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) MASK[i] = mimg[i * 4 + 3];
  const maskTex = new THREE.DataTexture(MASK, GW, GH, THREE.RedFormat, THREE.UnsignedByteType);
  maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter; maskTex.unpackAlignment = 1; maskTex.needsUpdate = true; maskTex.generateMipmaps = false;
  U.uMask.value = maskTex; U.uMapB.value.set(gx0, gz0, GW, GH);
  cv.width = cv.height = 1; // 메모리 반환

  const cell = (x, z) => { const ix = Math.floor(x - gx0), iz = Math.floor(z - gz0); return (ix < 0 || iz < 0 || ix >= GW || iz >= GH) ? -1 : iz * GW + ix; };
  const walk = (x, z) => { const c = cell(x, z); return c >= 0 && !BLK[c]; };
  const slow = (x, z) => { const c = cell(x, z); return c >= 0 && SLOW[c] === 1; };
  const R = 0.32;
  const walkR = (x, z) => walk(x - R, z - R) && walk(x + R, z - R) && walk(x - R, z + R) && walk(x + R, z + R);

  // ───────── 길찾기 (플레이어 기준 BFS 거리장, 128×128) ─────────
  const NW = 129, NH = NW >> 1, ND = new Uint16Array(NW * NW), NQ = new Int32Array(NW * NW);
  let nox = 0, noz = 0, navT = 0, navValid = false;
  function navBuild(px, pz) {
    nox = Math.floor(px) - NH; noz = Math.floor(pz) - NH; ND.fill(65535);
    let sx = Math.floor(px) - nox, sz = Math.floor(pz) - noz, found = false;
    for (let r = 0; r < 4 && !found; r++) for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) { const x = sx + dx, z = sz + dz; if (x >= 0 && z >= 0 && x < NW && z < NW && walk(nox + x + 0.5, noz + z + 0.5)) { sx = x; sz = z; found = true; } }
    if (!found) { navValid = false; return; }
    let qh = 0, qt = 0; NQ[qt++] = sz * NW + sx; ND[sz * NW + sx] = 0;
    while (qh < qt) {
      const c = NQ[qh++], x = c % NW, z = (c / NW) | 0, d = ND[c] + 1;
      for (let k = 0; k < 8; k++) {
        const dx = k < 4 ? (k === 0 ? 1 : k === 1 ? -1 : 0) : (k === 4 || k === 6 ? 1 : -1), dz = k < 4 ? (k === 2 ? 1 : k === 3 ? -1 : 0) : (k < 6 ? 1 : -1);
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= NW || nz >= NW) continue;
        const nc = nz * NW + nx; if (ND[nc] !== 65535) continue;
        if (!walk(nox + nx + 0.5, noz + nz + 0.5)) continue;
        if (k >= 4 && (!walk(nox + x + dx + 0.5, noz + z + 0.5) || !walk(nox + x + 0.5, noz + z + dz + 0.5))) continue;
        ND[nc] = d; NQ[qt++] = nc;
      }
    }
    navValid = true;
  }
  const reach = (x, z) => { const ix = Math.floor(x - nox), iz = Math.floor(z - noz); return ix >= 0 && iz >= 0 && ix < NW && iz < NW && ND[iz * NW + ix] !== 65535; };
  // 시선이 열려 있나 (격자 따라 걷기)
  function los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.min(80, Math.ceil(Math.hypot(dx, dz) / 0.8)); 
    for (let i = 1; i < n; i++) { const t = i / n; if (!walk(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
  }
  const out = [0, 0];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // 적이 가야 할 방향 (단위벡터) — 막히면 거리장을 따라감, 도달 불가면 null
  function navDir(x, z, px, pz) {
    if (los(x, z, px, pz)) { const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz) + 1e-3; out[0] = dx / d; out[1] = dz / d; return out; }
    if (!navValid) return null;
    const ix = Math.floor(x - nox), iz = Math.floor(z - noz);
    if (ix < 1 || iz < 1 || ix >= NW - 1 || iz >= NW - 1) return null;
    const c = iz * NW + ix; let bd = ND[c], bk = -1;
    if (bd === 65535) return null;
    for (let k = 0; k < 8; k++) { const d = ND[(iz + DIRS[k][1]) * NW + ix + DIRS[k][0]]; if (d < bd) { bd = d; bk = k; } }
    if (bk < 0) return null;
    // 한 칸 더 앞을 보고 방향 보정 (모서리 비비기 방지)
    const tx = nox + ix + 0.5 + DIRS[bk][0] * 1.0, tz = noz + iz + 0.5 + DIRS[bk][1] * 1.0;
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) + 1e-3; out[0] = dx / d; out[1] = dz / d; return out;
  }
  function pickRing(px, pz, Rr, tries = 18) {
    for (let t = 0; t < tries; t++) {
      const a = Math.random() * Math.PI * 2, r = Rr + (Math.random() * 5 - 1), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (walkR(x, z) && (!navValid || reach(x, z))) return [x, z];
    }
    return null;
  }
  function pickAt(px, pz, a, Rr) { for (let k = 0; k < 6; k++) { const r = Rr + k * 1.5 * (k % 2 ? 1 : -1), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r; if (walkR(x, z) && (!navValid || reach(x, z))) return [x, z]; } return null; }
  // 시작 위치: 목표점에서 가장 가까운 걸을 수 있는 곳
  function nearestWalk(tx, tz) { for (let r = 0; r < 80; r += 1) for (let k = 0; k < 16 + r * 6; k++) { const a = k * 2.399, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; if (walkR(x, z) && (!(slowPen(x, z)))) return [x, z]; } return [tx, tz]; }
  const slowPen = (x, z) => slow(x, z);

  // ───────── 미니맵 ─────────
  const MMW = isTouch ? 104 : 124, MMH = Math.round(MMW * GH / GW);
  const mm = document.createElement('canvas'); mm.width = MMW * 2; mm.height = MMH * 2;
  {
    const c = mm.getContext('2d'), s = (MMW * 2) / GW; c.scale(s, s); c.translate(-gx0, -gz0);
    c.fillStyle = '#efe9ee'; c.fillRect(gx0, gz0, GW, GH);
    const col = { park: '#b6dfa0', wood: '#97cf88', meadow: '#c5e2a2', golf: '#c5e2a2', pitch: '#e8c3a6', play: '#f0d8a0', water: '#8ccaec', sch: '#f3ebc8', park_lot: '#dedde8' };
    c.save(); c.beginPath(); c.rect(gx0, gz0, GW, GH); c.clip();
    for (const k of ['sch', 'park_lot', 'meadow', 'golf', 'park', 'wood', 'pitch', 'play', 'water']) for (const a of J.areas) if (a.k === k) { c.fillStyle = col[k]; poly2(c, a.r[0]); c.fill(); }
    c.strokeStyle = '#8ccaec'; c.lineCap = 'round'; for (const st of J.streams) { c.lineWidth = Math.max(4, st.w); c.beginPath(); path(c, st.p); c.stroke(); }
    c.strokeStyle = '#ffffff'; for (const r of J.roads.slice().sort((a, b) => a.k - b.k)) { c.lineWidth = Math.max(2.2, r.w * (r.k >= 4 ? 1.1 : 0.9)); c.strokeStyle = r.k >= 5 ? '#f3a98c' : r.k >= 3 ? '#fbe29a' : '#ffffff'; c.beginPath(); path(c, r.p); c.stroke(); }
    for (const b of J.bld) { c.fillStyle = b.t === 'apt' ? '#e6a0a8' : b.t === 'sch' ? '#e8c860' : '#b9b3cc'; poly2(c, b.r); c.fill(); }
    c.setLineDash([18, 10]); c.strokeStyle = '#ff9d00'; c.lineWidth = 4; c.beginPath(); path(c, META.boundary); c.closePath(); c.stroke();
    c.restore();
    function path(c2, p) { for (let i = 0; i < p.length; i += 2) i ? c2.lineTo(p[i], p[i + 1]) : c2.moveTo(p[i], p[i + 1]); }
    function poly2(c2, r) { c2.beginPath(); path(c2, r); c2.closePath(); }
  }
  const mmCanvas = document.getElementById('mm');
  if (mmCanvas) { mmCanvas.width = MMW * 2; mmCanvas.height = MMH * 2; mmCanvas.style.width = MMW + 'px'; mmCanvas.style.height = MMH + 'px'; mmCanvas.style.display = 'block'; }
  function drawMini(P, E, camYaw) {
    if (!mmCanvas) return; const c = mmCanvas.getContext('2d'), s = mmCanvas.width / GW;
    c.clearRect(0, 0, mmCanvas.width, mmCanvas.height); c.drawImage(mm, 0, 0);
    c.fillStyle = 'rgba(210,60,110,.9)';
    for (let i = 0; i < E.n; i++) { const x = (E.x[i] - gx0) * s, y = (E.z[i] - gz0) * s; c.fillRect(x - 1.2, y - 1.2, E.type[i] === 3 ? 6 : 2.4, E.type[i] === 3 ? 6 : 2.4); }
    const px = (P.x - gx0) * s, py = (P.z - gz0) * s;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 6.5, 0, 7); c.fill(); c.fillStyle = '#ff7a2e'; c.beginPath(); c.arc(px, py, 4.5, 0, 7); c.fill();
  }

  // ───────── 라벨 (2D 캔버스에 투영) ─────────
  const LK = { apt: ['#9a2a58', 13], school: ['#8a5a00', 12], park: ['#1f7a3a', 12], public: ['#5a3a9a', 12], water: ['#1f5ea8', 11], road: ['#5a5a6a', 10] };
  const tmpV = new THREE.Vector3();
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function visH(h, x, z, P) { const r = U.uCutR.value, f = sstep(r.x, r.y, Math.hypot(x - P.x, z - P.z)); return lerp(Math.min(h, 3.6), h, f); }
  const placed = [];
  function drawLabels(fx, camera, P, w, h) {
    placed.length = 0; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.lineJoin = 'round';
    const cand = [];
    for (const L of J.labels) {
      const d = Math.hypot(L.x - P.x, L.z - P.z), lim = L.k === 'road' ? 52 : L.k === 'apt' ? 95 : 70;
      if (d > lim) continue; cand.push([d, L]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [d, L] of cand) {
      const y = (L.k === 'road' || L.k === 'water' ? 0.6 : visH(L.h, L.x, L.z, P) + 2.5);
      tmpV.set(L.x, y, L.z).project(camera); if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) continue;
      const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h, [colr, fs] = LK[L.k], txt = (L.a && L.k === 'apt' ? '≈ ' : '') + L.n + (L.f ? ' · ' + L.f + '층' : '');
      fx.font = `800 ${fs}px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Gothic A1",system-ui,sans-serif`;
      const tw = fx.measureText(txt).width + 6, th = fs + 4; let ok = true;
      for (const q of placed) if (Math.abs(q[0] - sx) < (q[2] + tw) / 2 && Math.abs(q[1] - sy) < (q[3] + th) / 2) { ok = false; break; }
      if (!ok) continue; placed.push([sx, sy, tw, th]);
      fx.globalAlpha = L.k === 'road' || L.k === 'water' ? 0.85 : clamp(1.15 - d / 120, 0.55, 1);
      fx.strokeStyle = 'rgba(255,255,255,.92)'; fx.lineWidth = 3.5; fx.strokeText(txt, sx, sy); fx.fillStyle = colr; fx.fillText(txt, sx, sy);
    }
    fx.globalAlpha = 1;
  }

  const start = nearestWalk(-123, -221); // 다솜어린이공원
  return { meta: META, J, walk, walkR, slow, navBuild, navDir, pickRing, pickAt, reach, drawMini, drawLabels, start, bounds: [gx0 + 1, gz0 + 1, gx1 - 1, gz1 - 1], city, cityMat, cell };
}
