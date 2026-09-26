'use strict';
/* ============================================================
   Vessel — pour physics (pure, no DOM)
   Volume-true liquid in tilted bottles, ported from Aliquot.
   Coordinates are bottle viewBox units, relative to (50, 0):
   x runs across the bottle (0 = axis), y runs down.
   A rotation by `a` (radians, y-down, positive = clockwise on screen
   = pouring to the right) maps (x, y) → (x·c − y·s, x·s + y·c).
   ============================================================ */

/* interior extent per shape: `top` is the interior path's first y (the
   mouth), `bottom` its lowest point, `cap` the height 4 layers fill to.
   The space above `cap` is headspace. Caps sit 20 % of the column lower
   than the old neck-level line (37 / 33 / 33), so a full bottle reads
   clearly below the neck; with that headspace a full bottle starts
   pouring at ~70–78° (classic 69°, tall 78°, flask 74°). */
const SHAPE_GEO = {
  classic: { top: 26, bottom: 224, cap: 74.4 },
  tall: { top: 24, bottom: 304, cap: 87.2 },
  flask: { top: 26, bottom: 210.2, cap: 68.4 }
};
const CAP_UNITS = 4;
const THETA_MAX = 105 * Math.PI / 180;
const TH_N = 480;
const TH_RANGE = 110 * Math.PI / 180;

/* interior width (viewBox units) at height y */
function shapeWidthAt(sn, y) {
  if (sn === 'classic') {
    if (y <= 54) return 24;
    if (y <= 84) return 24 + (y - 54) / 30 * 32;
    if (y <= 204) return 56;
    return Math.max(4, 56 - (y - 204) / 17 * 36);
  } else if (sn === 'tall') {
    if (y <= 50) return 20;
    if (y <= 74) return 20 + (y - 50) / 24 * 20;
    if (y <= 286) return 40;
    return Math.max(4, 40 - (y - 286) / 15 * 30);
  } else if (sn === 'flask') {
    if (y <= 131) return 16;
    const dy = y - 170.2;
    return 2 * Math.sqrt(Math.max(0, 1600 - dy * dy));
  }
  return 50;
}

/* symmetric interior polygon around the axis, sampled every ≤ step units:
   right wall top → bottom, then left wall bottom → top */
function interiorPolygon(sn, step) {
  const g = SHAPE_GEO[sn];
  if (!g) throw new Error('unknown shape ' + sn);
  step = step || 2;
  const k = Math.ceil((g.bottom - g.top) / step);
  const ys = [];
  for (let i = 0; i <= k; i++) ys.push(g.top + (g.bottom - g.top) * i / k);
  const n = ys.length * 2;
  const xs = new Float64Array(n), yy = new Float64Array(n);
  for (let i = 0; i < ys.length; i++) {
    const h = shapeWidthAt(sn, ys[i]) / 2;
    xs[i] = h; yy[i] = ys[i];
    const j = n - 1 - i;
    xs[j] = -h; yy[j] = ys[i];
  }
  return { xs, ys: yy, n };
}

/* area of the polygon below the horizontal line y = L (y-down: y ≥ L) */
function areaBelow(xs, ys, n, L) {
  let area = 0, first = true, fx = 0, fy = 0, px = 0, py = 0;
  let sx = xs[n - 1], sy = ys[n - 1], sin = sy >= L;
  for (let i = 0; i < n; i++) {
    const ex = xs[i], ey = ys[i], ein = ey >= L;
    if (ein !== sin) {
      const t = (L - sy) / (ey - sy), ix = sx + (ex - sx) * t;
      if (first) { fx = ix; fy = L; first = false; } else area += px * L - ix * py;
      px = ix; py = L;
    }
    if (ein) {
      if (first) { fx = ex; fy = ey; first = false; } else area += px * ey - ex * py;
      px = ex; py = ey;
    }
    sx = ex; sy = ey; sin = ein;
  }
  if (first) return 0;
  area += px * fy - fx * py;
  return Math.abs(area) * 0.5;
}

function rotateInto(poly, a, ox, oy) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < poly.n; i++) {
    const x = poly.xs[i], y = poly.ys[i];
    ox[i] = x * c - y * s; oy[i] = x * s + y * c;
  }
}

/* drop vertices that lie on the straight line between their neighbours —
   same polygon, far fewer points for the area math (straight walls collapse
   to their end points; curves keep their samples) */
function simplifyPolygon(poly) {
  /* repeated points first (the flask meets itself at the bottom), else the
     collinearity test below would drop both copies */
  const px = [], py = [];
  for (let i = 0; i < poly.n; i++) {
    const j = px.length - 1;
    if (j >= 0 && Math.abs(px[j] - poly.xs[i]) < 1e-9 && Math.abs(py[j] - poly.ys[i]) < 1e-9) continue;
    px.push(poly.xs[i]); py.push(poly.ys[i]);
  }
  while (px.length > 1 && Math.abs(px[0] - px[px.length - 1]) < 1e-9 && Math.abs(py[0] - py[py.length - 1]) < 1e-9) { px.pop(); py.pop(); }
  const xs = [], ys = [], n = px.length;
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    const cross = (px[i] - px[a]) * (py[b] - py[a]) - (py[i] - py[a]) * (px[b] - px[a]);
    if (Math.abs(cross) > 1e-9) { xs.push(px[i]); ys.push(py[i]); }
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys), n: xs.length };
}

const models = {};
/* per-shape model: polygon, layer area, capacity-vs-tilt table */
function shapeModel(sn) {
  if (models[sn]) return models[sn];
  const g = SHAPE_GEO[sn];
  const poly = simplifyPolygon(interiorPolygon(sn, 2));
  const totalA = areaBelow(poly.xs, poly.ys, poly.n, -1e9);
  const unitA = areaBelow(poly.xs, poly.ys, poly.n, g.cap) / CAP_UNITS;
  /* lip = interior top-right corner (pouring right; left is the mirror image) */
  const lipX = shapeWidthAt(sn, g.top) / 2, lipY = g.top;
  const thTab = new Float64Array(TH_N + 1), cTab = new Float64Array(TH_N + 1);
  const rx = new Float64Array(poly.n), ry = new Float64Array(poly.n);
  for (let k = 0; k <= TH_N; k++) {
    const th = k / TH_N * TH_RANGE, c = Math.cos(th), s = Math.sin(th);
    rotateInto(poly, th, rx, ry);
    thTab[k] = th;
    cTab[k] = areaBelow(rx, ry, poly.n, lipX * s + lipY * c) / unitA;
  }
  /* guard against float noise: capacity never increases with tilt */
  for (let k = 1; k <= TH_N; k++) if (cTab[k] > cTab[k - 1]) cTab[k] = cTab[k - 1];
  const m = { sn, poly, totalA, unitA, lipX, lipY, thTab, cTab, rx, ry, cache: new Map() };
  /* upright volume → height table, for the volToY fast path */
  const N = 600, vy = new Float64Array(N + 1), vv = new Float64Array(N + 1);
  for (let k = 0; k <= N; k++) {
    const y = g.bottom - (g.bottom - g.top) * k / N;
    vy[k] = y; vv[k] = areaBelow(poly.xs, poly.ys, poly.n, y) / unitA;
  }
  m.upY = vy; m.upV = vv;
  models[sn] = m;
  return m;
}

/* capacity (in layers) held below the lip at tilt theta ≥ 0 */
function capacityAt(sn, theta) {
  const m = shapeModel(sn);
  const f = Math.max(0, Math.min(TH_N, theta / TH_RANGE * TH_N));
  const k = Math.floor(f), t = f - k;
  if (k >= TH_N) return m.cTab[TH_N];
  return m.cTab[k] + (m.cTab[k + 1] - m.cTab[k]) * t;
}

/* tilt (radians, ≥ 0) at which `v` layers just reach the lip; clamped at
   105° — below that capacity the bottle holds its angle and drains */
function thetaFor(sn, v) {
  const m = shapeModel(sn), C = m.cTab;
  if (v >= C[0]) return 0;
  let th;
  if (v <= C[TH_N]) th = TH_RANGE;
  else {
    let lo = 0, hi = TH_N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (C[mid] > v) lo = mid; else hi = mid; }
    const d = C[lo] - C[hi], f = d > 0 ? (C[lo] - v) / d : 0;
    th = m.thTab[lo] + f * (m.thTab[hi] - m.thTab[lo]);
  }
  return Math.min(th, THETA_MAX);
}

/* upright surface height for v layers (fast table lookup) */
function uprightLevel(sn, v) {
  const m = shapeModel(sn), V = m.upV, Y = m.upY, N = V.length - 1;
  if (v <= 0) return Y[0];
  if (v >= V[N]) return Y[N];
  let lo = 0, hi = N;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (V[mid] <= v) lo = mid; else hi = mid; }
  const d = V[hi] - V[lo];
  return Y[lo] + (d > 0 ? (v - V[lo]) / d : 0) * (Y[hi] - Y[lo]);
}

/* horizontal extent of the rotated polygon along the line y = L */
function spanAt(xs, ys, n, L) {
  let xl = Infinity, xr = -Infinity;
  let sx = xs[n - 1], sy = ys[n - 1];
  for (let i = 0; i < n; i++) {
    const ex = xs[i], ey = ys[i];
    if ((sy >= L) !== (ey >= L)) {
      const x = sx + (ex - sx) * (L - sy) / (ey - sy);
      if (x < xl) xl = x; if (x > xr) xr = x;
    }
    sx = ex; sy = ey;
  }
  return xl <= xr ? { xl, xr } : null;
}

/* Cut lines for cumulative volumes (layers, bottom first) at bottle tilt
   alpha, in the surface frame (the bottle rotated by alpha about (50, 0)).
   Returns { tops[k] = y of the line holding cums[k], x0, x1, yt, yb, span }
   where span is the top surface's extent. Cached by signature. */
function levelsFor(sn, alpha, cums) {
  const m = shapeModel(sn);
  let sig = alpha.toFixed(4);
  for (let k = 0; k < cums.length; k++) sig += '|' + cums[k].toFixed(4);
  const hit = m.cache.get(sig);
  if (hit) return hit;
  const xs = m.rx, ys = m.ry, n = m.poly.n;
  rotateInto(m.poly, alpha, xs, ys);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const levelAt = A => {
    if (A <= 0) return y1;
    if (A >= m.totalA) return y0;
    let lo = y0, hi = y1;
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2; if (areaBelow(xs, ys, n, mid) > A) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const tops = [];
  for (let k = 0; k < cums.length; k++) tops.push(levelAt(cums[k] * m.unitA));
  const topL = tops.length ? tops[tops.length - 1] : y1;
  const out = { tops, x0: x0 - 2, x1: x1 + 2, yt: y0, yb: y1 + 2, span: spanAt(xs, ys, n, topL) };
  if (m.cache.size > 400) m.cache.clear();
  m.cache.set(sig, out);
  return out;
}

const PourPhysics = {
  SHAPE_GEO, CAP_UNITS, THETA_MAX,
  shapeWidthAt, interiorPolygon, simplifyPolygon, areaBelow, shapeModel, capacityAt, thetaFor, uprightLevel, levelsFor
};
export { PourPhysics, SHAPE_GEO, shapeWidthAt, interiorPolygon, simplifyPolygon, areaBelow, shapeModel, capacityAt, thetaFor, uprightLevel, levelsFor };
