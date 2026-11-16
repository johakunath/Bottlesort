/* ============================================================
   Vessel — Three.js spike (not part of the shipped game).
   Question it answers: do 3D glass bottles with layered liquid look
   clearly better than the canvas board, and do they stay smooth and
   cool on a phone?

   Kept deliberately lean, because the WebGL pass removed in June ran a
   full-screen shader every frame, even at rest:
   - renders only while something moves (zero GPU work at rest)
   - no post-processing, no refraction pass, no real-time shadows
   - one cheap shader for glass, one for liquid
   ============================================================ */
import * as THREE from 'three';
import { APO_COLORS, NEON_COLORS, TIDE_COLORS, SHAPES } from '../bottle-design.js';

const THEMES = [
  { name: 'Apothecary dark', bg: '/assets/optimized/apothecary-moonlit-alchemy-1365.webp', colors: APO_COLORS, rim: [1.0, 0.86, 0.66], shelf: 0x2a1a0c },
  { name: 'Apothecary light', bg: '/assets/optimized/apothecary-sunlit-cabinet-1365.webp', colors: APO_COLORS, rim: [1.0, 1.0, 1.0], shelf: 0x6b4a26 },
  { name: 'Neon', bg: '/assets/optimized/neon-vaporwave-skyline-1365.webp', colors: NEON_COLORS, rim: [0.75, 0.94, 1.0], shelf: 0x2a0f4a },
  { name: 'Tidepool', bg: '/assets/optimized/tidepool-hifi-backdrop-1365.webp', colors: TIDE_COLORS, rim: [0.96, 1.0, 0.98], shelf: 0x2f7f86 }
];
let themeIdx = 0;
const DPR_STEPS = [1.5, 2, 3];
let dprIdx = 1;
const COUNTS = [7, 14, 25];
let countIdx = 0;

/* ---------- bottle profile from the game's own SVG shape ---------- */
const VB_H = SHAPES.round.vbH;
const U = 0.01;                                  /* viewBox unit → scene unit */
const toLocal = (x, y) => new THREE.Vector2((x - 50) * U, (VB_H / 2 - y) * U);
/* sample an SVG path (M/L/C/Q, absolute) and keep the right half, bottom → top */
function halfProfile(d, bottomY) {
  const tok = d.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g);
  const pts = [];
  let i = 0, cx = 0, cy = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M' || c === 'L') { cx = num(); cy = num(); pts.push([cx, cy]); }
    else if (c === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      for (let k = 1; k <= 10; k++) { const t = k / 10, m = 1 - t; pts.push([m * m * m * cx + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x, m * m * m * cy + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y]); }
      cx = x; cy = y;
    } else if (c === 'Q') {
      const x1 = num(), y1 = num(), x = num(), y = num();
      for (let k = 1; k <= 8; k++) { const t = k / 8, m = 1 - t; pts.push([m * m * cx + 2 * m * t * x1 + t * t * x, m * m * cy + 2 * m * t * y1 + t * t * y]); }
      cx = x; cy = y;
    }
  }
  const right = pts.filter(p => p[0] > 50.01);
  right.sort((a, b) => b[1] - a[1] || a[0] - b[0]);            /* bottom (large y) first */
  return [toLocal(50, bottomY), ...right.map(p => toLocal(p[0], p[1]))];
}
const sh = SHAPES.round;
const interiorPts = halfProfile(sh.interior, sh.B);
const outlinePts = halfProfile(sh.outline, sh.B + 3);
const glassGeo = new THREE.LatheGeometry(outlinePts, 40);
const liquidGeo = new THREE.LatheGeometry(interiorPts.map(p => new THREE.Vector2(p.x * 0.985, p.y)), 40);
const BODY_R = (sh.box[1] - 50) * U;             /* 0.32 */
const NECK_R = 0.14;
const Y_BOTTOM = (VB_H / 2 - sh.B) * U;          /* liquid floor */
const Y_FULL = (VB_H / 2 - sh.T) * U;            /* surface of a full bottle */
const Y_LIP = (VB_H / 2 - 21) * U;
const CAP = 4;
const UNIT_H = (Y_FULL - Y_BOTTOM) / CAP;

/* ---------- renderer, camera ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.debug.checkShaderErrors = false;      /* skips a slow driver round-trip per shader at start-up */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 100);

/* ---------- shaders ---------- */
const glassMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uRim: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uRim; varying vec3 vN; varying vec3 vV; varying float vY;
    void main() {
      vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      float fres = pow(1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0), 2.4);
      /* two fake softbox reflections: a wide key strip on the left, a thin one right */
      float ends = smoothstep(1.16, 0.55, abs(vY + 0.1));
      float key = smoothstep(0.13, 0.0, abs(n.x + 0.56)) * 0.85 * ends;
      float fill = smoothstep(0.05, 0.0, abs(n.x - 0.66)) * 0.45 * ends;
      float a = 0.05 + 0.62 * fres + key + fill;
      if (!gl_FrontFacing) a *= 0.35;
      vec3 col = mix(uRim, vec3(1.0), clamp(key + fill, 0.0, 1.0));
      gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
    }`
});

function makeLiquidMat() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uP0: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3(0, 1, 0) },
      uBottom: { value: new THREE.Vector3() },
      uTops: { value: [0, 0, 0, 0] },
      uLight: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uDark: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uCount: { value: 0 }
    },
    vertexShader: `
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uP0; uniform vec3 uN; uniform vec3 uBottom;
      uniform float uTops[4]; uniform vec3 uLight[4]; uniform vec3 uDark[4]; uniform int uCount;
      varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main() {
        if (uCount == 0) discard;
        float d = dot(vW - uP0, uN);
        if (d > 0.0) discard;                       /* above the surface plane */
        float h = dot(vW - uBottom, uN);
        float aa = max(fwidth(h) * 1.5, 0.004);
        vec3 light = uLight[0]; vec3 dark = uDark[0];
        for (int i = 1; i < 4; i++) {
          if (i >= uCount) break;
          float t = smoothstep(uTops[i - 1] - aa, uTops[i - 1] + aa, h);
          light = mix(light, uLight[i], t); dark = mix(dark, uDark[i], t);
        }
        if (!gl_FrontFacing) {
          /* the inside of the far wall, seen through the cut: reads as the liquid's top surface */
          gl_FragColor = vec4(mix(light, vec3(1.0), 0.38), 1.0);
          return;
        }
        vec3 n = normalize(vN);
        float facing = clamp(dot(n, normalize(vV)), 0.0, 1.0);
        vec3 col = mix(dark, light, smoothstep(0.05, 0.85, facing));
        col += vec3(1.0) * smoothstep(0.16, 0.0, abs(n.x + 0.5)) * 0.16;      /* soft inner highlight */
        col = mix(col, vec3(1.0), smoothstep(-0.012, 0.0, d) * 0.55);          /* meniscus line */
        col *= 1.0 - 0.22 * smoothstep(0.5, 0.0, h);                           /* deeper toward the base */
        gl_FragColor = vec4(col, 1.0);
      }`
  });
}

/* ---------- soft contact shadow sprite ---------- */
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1.1, 0.26);
const lipGeo = new THREE.TorusGeometry(0.17, 0.028, 8, 32);
const shelfMat = new THREE.MeshBasicMaterial({ color: 0x2a1a0c, transparent: true, opacity: 0.55 });

/* ---------- board ---------- */
let bottles = [];        /* { group, liquid, mat, segs:[{c,u}], home:Vector3, wob, wobV, busy } */
let shelves = [];
let jobs = [];
let selected = -1;
const board = new THREE.Group();
scene.add(board);

function layout(n) {
  const perRow = n <= 7 ? 4 : n <= 14 ? 5 : 5;
  const rows = Math.ceil(n / perRow), dx = 1.22, dy = 3.05, out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow), inRow = Math.min(perRow, n - r * perRow), k = i - r * perRow;
    out.push(new THREE.Vector3((k - (inRow - 1) / 2) * dx, ((rows - 1) / 2 - r) * dy, 0));
  }
  return { pos: out, rows, perRow, w: perRow * dx, h: rows * dy };
}
let boardSize = { w: 5, h: 6 };

function buildBoard() {
  for (const b of bottles) { board.remove(b.group); b.mat.dispose(); }
  for (const s of shelves) board.remove(s);
  bottles = []; shelves = []; jobs = []; selected = -1;
  const n = COUNTS[countIdx], L = layout(n);
  boardSize = { w: L.w, h: L.h };
  /* colours: (n - 2) colours of 4 units, shuffled, two empties */
  const colors = THEMES[themeIdx].colors, units = [];
  for (let c = 0; c < n - 2; c++) for (let k = 0; k < CAP; k++) units.push(c % colors.length);
  let seed = 12345 + n;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
  for (let i = 0; i < n; i++) {
    const group = new THREE.Group();
    group.position.copy(L.pos[i]);
    const mat = makeLiquidMat();
    const liquid = new THREE.Mesh(liquidGeo, mat);
    const glass = new THREE.Mesh(glassGeo, glassMat); glass.renderOrder = 2;
    const lip = new THREE.Mesh(lipGeo, glassMat); lip.rotation.x = Math.PI / 2; lip.position.y = Y_LIP; lip.renderOrder = 2;
    group.add(liquid, glass, lip);
    board.add(group);
    const stack = i < n - 2 ? units.slice(i * CAP, i * CAP + CAP) : [];
    const segs = [];
    for (const c of stack) { if (segs.length && segs[segs.length - 1].c === c) segs[segs.length - 1].u++; else segs.push({ c, u: 1 }); }
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(L.pos[i].x, L.pos[i].y - VB_H * U / 2 - 0.02, -0.05); shadow.renderOrder = -1;
    board.add(shadow); shelves.push(shadow);
    bottles.push({ group, liquid, mat, segs, home: L.pos[i].clone(), wob: 0, wobV: 0, lastX: L.pos[i].x, lastA: 0, busy: false, lift: 0 });
  }
  for (let r = 0; r < L.rows; r++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(L.w + 0.3, 0.035, 0.5), shelfMat);
    shelf.position.set(0, ((L.rows - 1) / 2 - r) * 3.05 - VB_H * U / 2 - 0.03, -0.05); shelf.renderOrder = -2;
    board.add(shelf); shelves.push(shelf);
  }
  applyTheme(); fitCamera(); invalidate();
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function unitsOf(b) { let s = 0; for (const x of b.segs) s += x.u; return s; }
/* push liquid state into the shader uniforms */
function syncLiquid(b) {
  const u = b.mat.uniforms, total = unitsOf(b), colors = THEMES[themeIdx].colors;
  b.liquid.visible = total > 0.001;
  if (!b.liquid.visible) { u.uCount.value = 0; return; }
  b.group.updateMatrixWorld();
  const n = tmpA.set(b.wob, 1, 0).normalize();
  u.uN.value.copy(n);
  u.uP0.value.set(0, Y_BOTTOM + total * UNIT_H, 0).applyMatrix4(b.group.matrixWorld);
  /* lowest point of the liquid along the surface normal */
  let best = Infinity;
  for (const sx of [-1, 1]) {
    tmpB.set(sx * BODY_R, Y_BOTTOM, 0).applyMatrix4(b.group.matrixWorld);
    const d = tmpB.dot(n);
    if (d < best) { best = d; u.uBottom.value.copy(tmpB); }
  }
  const span = u.uP0.value.clone().sub(u.uBottom.value).dot(n);
  let cum = 0, k = 0;
  for (const s of b.segs) {
    if (s.u <= 0.001 || k >= 4) continue;
    cum += s.u;
    u.uTops.value[k] = span * cum / total;
    u.uLight.value[k].set(colors[s.c][0]); u.uDark.value[k].set(colors[s.c][1]);
    k++;
  }
  u.uCount.value = k;
}

/* ---------- camera fit ---------- */
function fitCamera() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_STEPS[dprIdx]));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const needW = boardSize.w + 0.6, needH = boardSize.h + 2.6;       /* head-room for the pour arc */
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(needH / (2 * t), needW / (2 * t * camera.aspect));
  /* slightly above, so mouths and liquid surfaces read as round */
  const elev = THREE.MathUtils.degToRad(7);
  camera.position.set(0, Math.sin(elev) * dist + 0.3, Math.cos(elev) * dist);
  camera.lookAt(0, 0.3, 0);
  camera.updateProjectionMatrix();
  invalidate();
}
addEventListener('resize', fitCamera);

function applyTheme() {
  const t = THEMES[themeIdx];
  document.getElementById('bg').style.backgroundImage = 'url(' + t.bg + ')';
  glassMat.uniforms.uRim.value.set(t.rim[0], t.rim[1], t.rim[2]);
  shelfMat.color.set(t.shelf);
  invalidate();
}

/* ---------- pour jobs ---------- */
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function topRun(b) { return b.segs.length ? b.segs[b.segs.length - 1] : null; }
function canPour(si, di) {
  if (si === di) return 0;
  const s = bottles[si], d = bottles[di], run = topRun(s);
  if (!run || s.busy || d.busy) return 0;
  const dTop = topRun(d), room = CAP - Math.round(unitsOf(d));
  if (room <= 0 || (dTop && dTop.c !== run.c)) return 0;
  return Math.min(run.u, room);
}
/* tilt at which the surface (through the axis at fill height) reaches the lip */
function tiltFor(units) {
  const hFill = Y_BOTTOM + units * UNIT_H;
  return Math.min(1.75, Math.atan2(Y_LIP - hFill, NECK_R) + 0.04);
}
const streamMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function startPour(si, di, n) {
  const s = bottles[si], d = bottles[di], run = topRun(s);
  s.busy = d.busy = true;
  const dir = d.home.x >= s.home.x ? 1 : -1;
  const job = {
    si, di, n, c: run.c, dir, t: 0, T1: 0.38, T2: 0.22 + 0.13 * n, T3: 0.34, fall: 0.1,
    s0: unitsOf(s), d0: unitsOf(d), srcSegs: s.segs.map(x => ({ ...x })), dstSegs: d.segs.map(x => ({ ...x })),
    stream: new THREE.Mesh(new THREE.BufferGeometry(), streamMat.clone()), from: s.group.position.clone()
  };
  job.stream.material.color.set(THEMES[themeIdx].colors[run.c][0]);
  job.stream.visible = false; job.stream.renderOrder = 1;
  scene.add(job.stream);
  jobs.push(job);
  invalidate();
}
function setSegs(b, base, c, delta) {
  /* base segs plus (delta > 0) or minus (delta < 0) units of colour c on top */
  const out = base.map(x => ({ ...x }));
  if (delta > 0) { const top = out[out.length - 1]; if (top && top.c === c) top.u += delta; else out.push({ c, u: delta }); }
  else if (delta < 0) { const top = out[out.length - 1]; top.u += delta; if (top.u <= 0.001) out.pop(); }
  b.segs = out;
}
function placeSource(job, ang, k) {
  /* pose the source so its lip corner sits over the receiver mouth; k blends home → pour point */
  const s = bottles[job.si], d = bottles[job.di];
  const a = -job.dir * ang, c = Math.cos(a), sn = Math.sin(a);
  const lx = job.dir * NECK_R, ly = Y_LIP;
  const rx = lx * c - ly * sn, ry = lx * sn + ly * c;
  const tx = d.home.x - job.dir * 0.06, ty = d.home.y + Y_LIP + 0.22;
  const px = tx - rx, py = ty - ry;
  s.group.position.set(job.from.x + (px - job.from.x) * k, job.from.y + (py - job.from.y) * k + Math.sin(Math.PI * k) * 0.25, Math.sin(Math.PI * Math.min(1, k)) * 0.0 + 0.7 * k);
  s.group.rotation.z = a;
  return { x: s.group.position.x + rx, y: s.group.position.y + ry, z: s.group.position.z };
}
const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
function stepJob(job, dt) {
  job.t += dt;
  const s = bottles[job.si], d = bottles[job.di], t = job.t;
  let lip = null, flow = 0;
  if (t < job.T1) {
    const k = ease(t / job.T1);
    lip = placeSource(job, tiltFor(job.s0) * k, k);
  } else if (t < job.T1 + job.T2) {
    const e = smooth((t - job.T1) / job.T2);
    setSegs(s, job.srcSegs, job.c, -job.n * e);
    lip = placeSource(job, tiltFor(job.s0 - job.n * e), 1);
    flow = Math.sin(Math.PI * (t - job.T1) / job.T2);
  } else {
    const k = 1 - ease(Math.min(1, (t - job.T1 - job.T2) / job.T3));
    setSegs(s, job.srcSegs, job.c, -job.n);
    lip = placeSource(job, tiltFor(job.s0 - job.n) * k, k);
    if (k <= 0) { s.group.position.copy(s.home); s.group.rotation.z = 0; s.wobV -= job.dir * 2.2; }
  }
  /* receiver fills a moment later (the stream's fall time) */
  const td = (t - job.T1 - job.fall) / job.T2;
  if (td > 0) { setSegs(d, job.dstSegs, job.c, job.n * smooth(td)); if (td < 1) d.wobV += (Math.random() - 0.5) * 6 * dt; }
  /* stream: tube from the lip to the receiver's surface */
  if (flow > 0.05 && lip) {
    const surfY = d.home.y + Y_BOTTOM + unitsOf(d) * UNIT_H;
    curve.v0.set(lip.x, lip.y, lip.z);
    curve.v1.set(lip.x + job.dir * 0.1, lip.y - 0.05, lip.z * 0.6);
    curve.v2.set(d.home.x, surfY, 0);
    job.stream.geometry.dispose();
    job.stream.geometry = new THREE.TubeGeometry(curve, 12, 0.03 + 0.03 * flow, 6, false);
    job.stream.visible = true;
  } else job.stream.visible = false;
  if (t >= job.T1 + job.T2 + job.T3 + 0.05) {
    setSegs(s, job.srcSegs, job.c, -job.n); setSegs(d, job.dstSegs, job.c, job.n);
    for (const b of [s, d]) b.segs.forEach(x => { x.u = Math.round(x.u); });
    s.busy = d.busy = false; d.wobV += job.dir * 1.6;
    scene.remove(job.stream); job.stream.geometry.dispose(); job.stream.material.dispose();
    return false;
  }
  return true;
}

/* ---------- render on demand ---------- */
let rafOn = false, lastT = 0, frames = 0, acc = 0, fps = 0, worst = 0, autoplay = false, autoT = 0, idleFrames = 0;
const hud = document.getElementById('hud');
function invalidate() { if (!rafOn) { rafOn = true; lastT = 0; requestAnimationFrame(frame); } }
function frame(now) {
  const dtMs = lastT ? now - lastT : 16.7, dt = Math.min(0.05, dtMs / 1000);
  lastT = now;
  jobs = jobs.filter(j => stepJob(j, dt));
  let moving = jobs.length > 0;
  for (let i = 0; i < bottles.length; i++) {
    const b = bottles[i];
    /* selection lift */
    const want = i === selected && !b.busy ? 0.28 : 0;
    if (!b.busy) {
      b.lift += (want - b.lift) * Math.min(1, dt * 14);
      if (Math.abs(want - b.lift) > 0.002) moving = true; else b.lift = want;
      b.group.position.y = b.home.y + b.lift;
    }
    /* slosh: damped spring on the surface normal, driven by sideways motion and rotation */
    const vx = (b.group.position.x - b.lastX) / dt, va = (b.group.rotation.z - b.lastA) / dt;
    b.lastX = b.group.position.x; b.lastA = b.group.rotation.z;
    b.wobV += (-120 * b.wob - 7 * b.wobV - 1.2 * vx * 0.2 + va * 0.25) * dt;
    b.wob = THREE.MathUtils.clamp(b.wob + b.wobV * dt, -0.22, 0.22);
    if (Math.abs(b.wob) > 0.0015 || Math.abs(b.wobV) > 0.02) moving = true; else { b.wob = 0; b.wobV = 0; }
    syncLiquid(b);
  }
  if (autoplay) {
    moving = true; autoT -= dt;
    if (autoT <= 0) { autoT = 0.35; autoMove(); }
  }
  renderer.render(scene, camera);
  /* stats over the animating stretch only */
  if (lastT && moving) { frames++; acc += dtMs; if (dtMs > worst) worst = dtMs; if (acc >= 500) { fps = 1000 * frames / acc; showHud(); frames = 0; acc = 0; worst = 0; } }
  if (moving) { idleFrames = 0; requestAnimationFrame(frame); }
  else if (++idleFrames < 2) requestAnimationFrame(frame);          /* one settling frame, then stop */
  else { rafOn = false; idleFrames = 0; showHud(true); }
}
function showHud(idle) {
  const info = renderer.info.render, sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  hud.textContent = (idle ? 'at rest: not rendering' : 'fps ' + fps.toFixed(0) + ' · worst ' + worst.toFixed(0) + ' ms') +
    '\n' + THEMES[themeIdx].name + ' · ' + bottles.length + ' bottles' +
    '\n' + sz.x + '×' + sz.y + ' (' + renderer.getPixelRatio().toFixed(2) + 'x) · ' + info.calls + ' draws';
}

/* ---------- input ---------- */
function pick(ev) {
  const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < bottles.length; i++) {
    const c = bottles[i].home.clone().project(camera), top = bottles[i].home.clone().setY(bottles[i].home.y + 1.2).project(camera);
    const side = bottles[i].home.clone().setX(bottles[i].home.x + 0.6).project(camera);
    const px = (c.x + 1) / 2 * r.width, py = (1 - c.y) / 2 * r.height;
    const hh = Math.abs((1 - top.y) / 2 * r.height - py) * 1.12, hw = Math.abs((side.x + 1) / 2 * r.width - px);
    if (Math.abs(x - px) <= hw && Math.abs(y - py) <= hh) { const dd = Math.abs(x - px); if (dd < bestD) { bestD = dd; best = i; } }
  }
  return best;
}
function tap(i) {
  if (i < 0) { selected = -1; invalidate(); return; }
  if (selected < 0) { if (topRun(bottles[i]) && !bottles[i].busy) { selected = i; bottles[i].wobV += 1.5; } }
  else if (selected === i) selected = -1;
  else {
    const n = canPour(selected, i);
    if (n) { const s = selected; selected = -1; bottles[s].lift = 0.28; startPour(s, i, n); }
    else if (topRun(bottles[i]) && !bottles[i].busy) selected = i;
    else { bottles[selected].wobV += 3; selected = -1; }
  }
  invalidate();
}
canvas.addEventListener('pointerdown', ev => tap(pick(ev)));
function autoMove() {
  /* any legal pour that is not a pointless full-run shuffle; keeps the board busy for measuring */
  const opts = [];
  for (let s = 0; s < bottles.length; s++) for (let d = 0; d < bottles.length; d++) {
    const n = canPour(s, d); if (!n) continue;
    const src = bottles[s], dst = bottles[d];
    if (src.segs.length === 1 && !dst.segs.length) continue;
    opts.push([s, d, n]);
  }
  if (!opts.length) { buildBoard(); return; }
  const [s, d, n] = opts[Math.floor(Math.random() * opts.length)];
  startPour(s, d, n);
}

document.getElementById('b-theme').onclick = () => { themeIdx = (themeIdx + 1) % THEMES.length; applyTheme(); showHud(true); };
document.getElementById('b-res').onclick = () => { dprIdx = (dprIdx + 1) % DPR_STEPS.length; fitCamera(); };
document.getElementById('b-count').onclick = () => { countIdx = (countIdx + 1) % COUNTS.length; buildBoard(); };
document.getElementById('b-reset').onclick = () => buildBoard();
document.getElementById('b-auto').onclick = ev => { autoplay = !autoplay; ev.target.textContent = autoplay ? 'Stop auto-play' : 'Auto-play'; invalidate(); };

/* QA hook for scripted checks */
window.__spike = { tap, get bottles() { return bottles; }, get jobs() { return jobs; }, get rendering() { return rafOn; }, get fps() { return fps; }, setAuto(on) { autoplay = on; invalidate(); }, setCount(k) { countIdx = k; buildBoard(); }, setTheme(k) { themeIdx = k; applyTheme(); } };

buildBoard();
