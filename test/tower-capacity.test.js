import test from 'node:test';
import assert from 'node:assert/strict';
import { VesselLogic as L } from '../src/game-logic.js';
import { PourPhysics as P } from '../src/pour-physics.js';

test('towers accept three normal bottles, and only twelve equal segments complete them', () => {
  const state=L.withCapacities([[],Array(4).fill(0),Array(4).fill(0),Array(4).fill(0)],[12,4,4,4]);
  for(let i=1;i<=3;i++) {
    assert.equal(L.canPour(state,i,0),true); assert.equal(L.applyPour(state,i,0),4);
    assert.equal(L.isBottleComplete(state[0]),i===3);
  }
  assert.equal(L.isSolved(state),true);
  const partial=L.withCapacities([Array(11).fill(0),Array(4).fill(0)],[12,4]);
  assert.equal(L.applyPour(partial,1,0),1);assert.equal(partial[1].length,3);
});
test('empty towers cannot satisfy a win and capacity is part of the solver key', () => {
  assert.equal(L.isSolved(L.withCapacities([[],Array(4).fill(0)],[12,4])),false);
  const a=L.withCapacities([[0],[1]],[12,4]),b=L.withCapacities([[0],[1]],[4,12]);
  assert.notEqual(L.stateKey(a),L.stateKey(b));assert.equal(L.capacityOf(L.cloneState(a)[0]),12);
});
test('all classic modes have permanent towers and sufficient liquid for both', () => {
  for(const d of ['relaxed','normal','expert']) for(let level=1;level<=30;level++) {
    const g=L.generateLevel(level,d);
    assert.equal(g.capacities.filter(c=>c===12).length,2);
    for(const color of [0,1]) assert.equal(g.state.flat().filter(c=>c===color).length,4*g.sets+8);
    assert.ok(g.state.filter(b=>b.length===4).length>=7);
  }
});
test('tower liquid volume scales through all twelve segments, not four', () => {
  const bottom=P.uprightLevel('tower',0), full=P.uprightLevel('tower',12);
  const four=P.uprightLevel('tower',4);
  assert.ok(four>full+(bottom-full)*.5);
  for(const angle of [0,.4,1,1.6]) {
    const levels=P.levelsFor('tower',angle,[4,8,12]);
    assert.ok(levels.tops[0]>levels.tops[1]&&levels.tops[1]>levels.tops[2]);
  }
});
test('completion meter reserves progress for filling the mandatory towers', () => {
  const s=L.withCapacities([[],...Array.from({length:6},(_,i)=>Array(4).fill(i<3?0:1)),[]],[12,4,4,4,4,4,4,12]);
  assert.equal(L.completionProgress(s),0);
  for(let i=1;i<=3;i++) L.applyPour(s,i,0);
  assert.equal(L.completionProgress(s),.5);
  for(let i=4;i<=6;i++) L.applyPour(s,i,7);
  assert.equal(L.completionProgress(s),1);
});
