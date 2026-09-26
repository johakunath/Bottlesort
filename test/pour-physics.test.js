'use strict';
/* Pure pour-physics module (src/pour-physics.js): polygon, area, tilt
   capacity, levels. No DOM. Run with `npm test`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PourPhysics as P } from '../src/pour-physics.js';

const SHAPES = ['classic', 'tall', 'flask'];
const deg = d => d * Math.PI / 180;

function rotated(poly, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const xs = new Float64Array(poly.n), ys = new Float64Array(poly.n);
  for (let i = 0; i < poly.n; i++) { xs[i] = poly.xs[i] * c - poly.ys[i] * s; ys[i] = poly.xs[i] * s + poly.ys[i] * c; }
  return { xs, ys, n: poly.n };
}

test('areaBelow: unit square cut in half, full, and empty', () => {
  const xs = [0, 1, 1, 0], ys = [0, 0, 1, 1];
  assert.ok(Math.abs(P.areaBelow(xs, ys, 4, 0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(P.areaBelow(xs, ys, 4, -1) - 1) < 1e-12);
  assert.equal(P.areaBelow(xs, ys, 4, 2), 0);
});

test('areaBelow: triangle below a line', () => {
  /* apex at top (y=0), base at y=2, width 2 → area below y=1 is 2 - 0.5 = 1.5 */
  const xs = [0, 1, -1], ys = [0, 2, 2];
  assert.ok(Math.abs(P.areaBelow(xs, ys, 3, 1) - 1.5) < 1e-12);
});

test('interiorPolygon: symmetric, samples every ≤ 2 units, spans top to bottom', () => {
  for (const sn of SHAPES) {
    const g = P.SHAPE_GEO[sn], poly = P.interiorPolygon(sn);
    const half = poly.n / 2;
    for (let i = 0; i < half; i++) {
      assert.ok(Math.abs(poly.xs[i] + poly.xs[poly.n - 1 - i]) < 1e-9, sn + ' symmetric');
      assert.equal(poly.ys[i], poly.ys[poly.n - 1 - i]);
      if (i) assert.ok(poly.ys[i] - poly.ys[i - 1] <= 2 + 1e-9, sn + ' step');
    }
    assert.equal(poly.ys[0], g.top);
    assert.ok(Math.abs(poly.ys[half - 1] - g.bottom) < 1e-9);
    assert.ok(Math.abs(poly.xs[0] - P.shapeWidthAt(sn, g.top) / 2) < 1e-9);
  }
});

test('capacity C(theta) never increases with tilt, and the table matches a direct computation', () => {
  for (const sn of SHAPES) {
    const m = P.shapeModel(sn);
    let prev = Infinity;
    for (let d = 0; d <= 110; d += 0.25) {
      const c = P.capacityAt(sn, deg(d));
      assert.ok(c <= prev + 1e-9, sn + ' monotonic at ' + d);
      prev = c;
    }
    for (const d of [0, 20, 45, 70, 90]) {
      const a = deg(d), r = rotated(m.poly, a);
      const direct = P.areaBelow(r.xs, r.ys, r.n, m.lipX * Math.sin(a) + m.lipY * Math.cos(a)) / m.unitA;
      assert.ok(Math.abs(direct - P.capacityAt(sn, a)) < 0.02, sn + ' table at ' + d);
    }
  }
});

test('upright levels match an independent volume integration within 0.5 units', () => {
  for (const sn of SHAPES) {
    const g = P.SHAPE_GEO[sn];
    /* fine trapezoid integration of the width profile from the bottom up */
    const N = 20000, dy = (g.bottom - g.top) / N;
    const cum = [0];
    for (let k = 1; k <= N; k++) {
      const y0 = g.bottom - (k - 1) * dy, y1 = g.bottom - k * dy;
      cum.push(cum[k - 1] + (P.shapeWidthAt(sn, y0) + P.shapeWidthAt(sn, y1)) / 2 * dy);
    }
    const kCap = Math.round((g.bottom - g.cap) / dy), unit = cum[kCap] / 4;
    for (const v of [0.5, 1, 1.7, 2, 3, 4]) {
      let k = 0; while (cum[k] < v * unit) k++;
      const yRef = g.bottom - k * dy;
      const lv = P.levelsFor(sn, 0, [v]).tops[0];
      assert.ok(Math.abs(lv - yRef) < 0.5, `${sn} v=${v}: ${lv.toFixed(2)} vs ${yRef.toFixed(2)}`);
      assert.ok(Math.abs(P.uprightLevel(sn, v) - yRef) < 0.5, `${sn} uprightLevel v=${v}`);
    }
    assert.ok(Math.abs(P.uprightLevel(sn, 4) - g.cap) < 0.5, sn + ' 4 layers fill to cap');
  }
});

test('volume is conserved at any tilt', () => {
  for (const sn of SHAPES) {
    const m = P.shapeModel(sn);
    for (const d of [-80, -35, -5, 0, 12, 47, 88, 104]) {
      const a = deg(d), r = rotated(m.poly, a);
      const total = P.areaBelow(r.xs, r.ys, r.n, -1e9);
      assert.ok(Math.abs(total - m.totalA) / m.totalA < 1e-9, sn + ' polygon area at ' + d);
      const cums = [0.6, 1.5, 3, 4];
      const lv = P.levelsFor(sn, a, cums);
      cums.forEach((v, k) => {
        const got = P.areaBelow(r.xs, r.ys, r.n, lv.tops[k]) / m.unitA;
        assert.ok(Math.abs(got - v) < 1e-3, `${sn} ${d}° v=${v}: ${got}`);
      });
      for (let k = 1; k < cums.length; k++) assert.ok(lv.tops[k] < lv.tops[k - 1], 'bands stack upward');
    }
  }
});

test('a full bottle has headspace: it starts pouring between 60° and 85°', () => {
  for (const sn of SHAPES) {
    const th = P.thetaFor(sn, 4) * 180 / Math.PI;
    assert.ok(th >= 60 && th <= 85, sn + ' starts at ' + th.toFixed(1));
  }
});

test('thetaFor inverts capacity and clamps at 105°', () => {
  for (const sn of SHAPES) {
    for (const v of [3.5, 2.2, 1, 0.4]) {
      const th = P.thetaFor(sn, v);
      if (th < P.THETA_MAX - 1e-9) assert.ok(Math.abs(P.capacityAt(sn, th) - v) < 0.02, sn + ' v=' + v);
    }
    assert.ok(P.thetaFor(sn, 0) <= P.THETA_MAX + 1e-12);
    assert.equal(P.thetaFor(sn, 99), 0);
    assert.ok(P.thetaFor(sn, 1) > P.thetaFor(sn, 3), 'emptier bottles tilt further');
  }
});

test('levelsFor mirrors for left pours and caches by signature', () => {
  const a = P.levelsFor('classic', deg(40), [1, 2.5]);
  const b = P.levelsFor('classic', deg(-40), [1, 2.5]);
  a.tops.forEach((y, k) => assert.ok(Math.abs(y - b.tops[k]) < 1e-6));
  assert.equal(P.levelsFor('classic', deg(40), [1, 2.5]), a);
});

test('simplifyPolygon keeps the exact shape with fewer vertices', () => {
  for (const sn of SHAPES) {
    const full = P.interiorPolygon(sn), simple = P.simplifyPolygon(full);
    assert.ok(simple.n < full.n, sn + ' fewer vertices');
    for (const L of [-1e9, 30, 60, 90, 150, 200, 220]) {
      const a = P.areaBelow(full.xs, full.ys, full.n, L), b = P.areaBelow(simple.xs, simple.ys, simple.n, L);
      assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, a), `${sn} L=${L}`);
    }
  }
});
