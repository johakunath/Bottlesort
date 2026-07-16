'use strict';
/* Node's built-in test runner — no extra dependency. Run with `npm test`.
   Covers the pure logic layer (src/game-logic.js): pour rules, state
   invariants, the solver, and — most importantly — that every classic
   level, plus a spread of Daily/Rush seeds, is actually solvable. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { VesselLogic } from '../src/game-logic.js';

const {
  CAP, MAX_LEVEL, cloneState, isBottleComplete, isBottleClear, isSolved,
  canPour, pourAmount, applyPour, solve, generateLevel, generateFromSeed,
  dailyConfig, rushConfig
} = VesselLogic;

/* ---------- pour rules ---------- */

test('canPour rejects pouring a bottle into itself', () => {
  const s = [[0, 0], []];
  assert.equal(canPour(s, 0, 0), false);
});

test('canPour rejects an empty source', () => {
  const s = [[], [1]];
  assert.equal(canPour(s, 0, 1), false);
});

test('canPour rejects a full destination', () => {
  const s = [[0], [1, 1, 1, 1]];
  assert.equal(canPour(s, 0, 1), false);
});

test('canPour allows pouring into an empty destination', () => {
  const s = [[0, 0], []];
  assert.equal(canPour(s, 0, 1), true);
});

test('canPour matches on top color only, not full contents', () => {
  const s = [[1, 0], [2, 0]];
  assert.equal(canPour(s, 0, 1), true);   // tops both 0
});

test('canPour rejects a mismatched top color', () => {
  const s = [[0, 1], [0, 2]];
  assert.equal(canPour(s, 0, 1), false);  // tops 1 vs 2
});

test('applyPour moves the whole top run when space allows', () => {
  const s = [[3, 5, 5, 5], []];
  const n = applyPour(s, 0, 1);
  assert.equal(n, 3);
  assert.deepEqual(s[0], [3]);
  assert.deepEqual(s[1], [5, 5, 5]);
});

test('applyPour is capped by destination space, not just the run length', () => {
  const s = [[5, 5, 5, 5], [5, 5]]; // dst has room for 2 more
  const n = applyPour(s, 0, 1);
  assert.equal(n, 2);
  assert.deepEqual(s[0], [5, 5]);
  assert.deepEqual(s[1], [5, 5, 5, 5]);
});

test('pourAmount matches the number applyPour actually moves', () => {
  const s = [[2, 2, 2, 2], [2]];
  assert.equal(pourAmount(s, 0, 1), 3);
});

/* ---------- state invariants ---------- */

test('isBottleComplete requires a full bottle of one color', () => {
  assert.equal(isBottleComplete([1, 1, 1, 1]), true);
  assert.equal(isBottleComplete([1, 1, 1]), false);       // not full
  assert.equal(isBottleComplete([1, 1, 1, 2]), false);    // mixed
  assert.equal(isBottleComplete([]), false);
});

test('isBottleClear accepts empty or complete, nothing else', () => {
  assert.equal(isBottleClear([]), true);
  assert.equal(isBottleClear([1, 1, 1, 1]), true);
  assert.equal(isBottleClear([1]), false);
});

test('isSolved requires every bottle to be clear', () => {
  assert.equal(isSolved([[1, 1, 1, 1], [], [2, 2, 2, 2]]), true);
  assert.equal(isSolved([[1, 1, 1, 1], [2], []]), false);
});

/* ---------- solver ---------- */

test('solve finds a solution for a simple two-color board', () => {
  const state = [[0, 0, 1, 1], [1, 1, 0, 0], []];
  const res = solve(cloneState(state), 50000);
  assert.ok(res.solution, 'expected a solution');
  assert.ok(res.solution.length > 0);
  // replaying the solution must actually solve the board
  const s = cloneState(state);
  for (const [i, j] of res.solution) applyPour(s, i, j);
  assert.equal(isSolved(s), true);
});

test('solve returns no solution (not a crash) for an already-stuck board', () => {
  // two full bottles with mismatched, non-uniform tops and no empty bottle:
  // no legal pour exists anywhere.
  const state = [[0, 1], [1, 0]];
  const res = solve(cloneState(state), 1000);
  assert.equal(res.solution, null);
  assert.equal(res.aborted, false);
});

test('solve does not mutate the state it was given', () => {
  const state = [[0, 0, 1, 1], [1, 1, 0, 0], []];
  const before = JSON.stringify(state);
  solve(state, 50000);
  assert.equal(JSON.stringify(state), before);
});

/* ---------- level generation: every classic level must be solvable ---------- */

for (const diff of ['relaxed', 'normal', 'expert']) {
  test('every ' + diff + ' level (1-' + MAX_LEVEL + ') is verified solvable with the stated par', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const gen = generateLevel(level, diff);
      const fillCount = gen.colors * gen.sets;
      assert.equal(gen.state.length, fillCount + gen.empties, diff + ' L' + level + ' bottle count');
      assert.equal(gen.state.some(isBottleComplete), false, diff + ' L' + level + ' should not start pre-solved');

      const frozen = new Set(gen.specials.frozen);
      const res = solve(cloneState(gen.state), 400000, frozen);
      assert.ok(res.solution, diff + ' L' + level + ' has no solution');
      assert.equal(res.solution.length, gen.par, diff + ' L' + level + ' par mismatch');

      // replaying the solver's own line must actually clear the board,
      // respecting frozen bottles until something completes (sticky thaw)
      const s = cloneState(gen.state);
      let thawed = false;
      for (const [i, j] of res.solution) {
        if (frozen.size && !thawed) thawed = s.some(isBottleComplete);
        if (frozen.size && !thawed) {
          assert.ok(!frozen.has(i) && !frozen.has(j), diff + ' L' + level + ' pours a frozen bottle before any thaw');
        }
        assert.ok(canPour(s, i, j), diff + ' L' + level + ' solver produced an illegal pour');
        applyPour(s, i, j);
      }
      assert.equal(isSolved(s), true, diff + ' L' + level + ' replay did not solve the board');
    }
  });
}

/* ---------- Daily / Rush: representative seeds must also be solvable ---------- */

test('Daily boards are solvable across a spread of dates (incl. weekend/weekday)', () => {
  const dates = ['2026-01-01', '2026-03-14', '2026-07-16', '2026-11-28', '2026-12-25', '2026-06-06', '2026-06-07'];
  for (const d of dates) {
    const cfg = dailyConfig(d);
    const gen = generateFromSeed(cfg.seed, cfg.colors, cfg.sets, cfg.empties);
    assert.ok(gen, 'Daily ' + d + ' failed to generate');
    const res = solve(cloneState(gen.state), 400000);
    assert.ok(res.solution, 'Daily ' + d + ' has no solution');
    assert.equal(res.solution.length, gen.par);
  }
});

test('Rush stages 1-10 are solvable as the ladder grows', () => {
  for (let stage = 1; stage <= 10; stage++) {
    const cfg = rushConfig(stage);
    const gen = generateFromSeed(cfg.seed, cfg.colors, cfg.sets, cfg.empties);
    assert.ok(gen, 'Rush stage ' + stage + ' failed to generate');
    const res = solve(cloneState(gen.state), 400000);
    assert.ok(res.solution, 'Rush stage ' + stage + ' has no solution');
    assert.equal(res.solution.length, gen.par);
  }
});

/* ---------- CAP sanity ---------- */

test('bottle capacity is 4', () => {
  assert.equal(CAP, 4);
});
