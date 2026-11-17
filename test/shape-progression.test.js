'use strict';
/* Bottle shapes unlock with Classic progress; Daily and challenges use all of them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SHAPE_TIERS, shapePool, pickSmallShapes } from '../src/bottle-design.js';
import { SHAPE_GEO } from '../src/pour-physics.js';
import { VesselLogic } from '../src/game-logic.js';
const { mulberry32 } = VesselLogic;

const ALL = SHAPE_TIERS[SHAPE_TIERS.length - 1].shapes;

test('every small bottle design is reachable in play and has physics geometry', () => {
  const small = Object.keys(SHAPES).filter(s => !s.startsWith('tower'));
  assert.deepEqual([...small].sort(), [...ALL].sort());
  for (const s of ALL) assert.ok(SHAPE_GEO[s], s + ' has pour geometry');
});

test('classic levels add one shape per tier, starting with round only', () => {
  assert.deepEqual(shapePool('classic', 1), ['round']);
  let prev = 1;
  for (let level = 1; level <= 30; level++) {
    const n = shapePool('classic', level).length;
    assert.ok(n === prev || n === prev + 1, 'one new shape at a time');
    prev = n;
  }
  assert.deepEqual(shapePool('classic', 30), ALL);
  assert.deepEqual(shapePool('daily', 1), ALL);
  assert.deepEqual(shapePool('challenge', 1), ALL);
});

test('picked shapes come from the pool and include every unlocked shape when there is room', () => {
  for (let seed = 1; seed < 200; seed++) {
    for (const level of [1, 6, 12, 20]) {
      const pool = shapePool('classic', level), count = 4 + (seed % 16);
      const out = pickSmallShapes(count, pool, mulberry32(seed));
      assert.equal(out.length, count);
      assert.ok(out.every(s => pool.includes(s)));
      for (const s of pool) assert.ok(out.includes(s), `${s} missing at level ${level}, seed ${seed}`);
    }
  }
});
