import test from 'node:test';
import assert from 'node:assert/strict';
import { BAKED } from '../src/levels-baked.js';
import { VesselLogic as L } from '../src/game-logic.js';
test('all 90 classic levels have baked seed offsets and exact verified par', () => {
  for (const d of ['relaxed','normal','expert']) {
    assert.equal(BAKED[d].length, L.MAX_LEVEL);
    for (let i=0;i<L.MAX_LEVEL;i++) {
      assert.ok(Number.isInteger(BAKED[d][i].o));
      const gen = L.generateLevel(i+1,d), result = L.solve(gen.state,400000,new Set(gen.specials.frozen));
      assert.equal(result.solution.length, BAKED[d][i].p);
    }
  }
});
