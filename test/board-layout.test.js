import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout, TOWER_ASPECT } from '../src/board-layout.js';
import { SHAPES } from '../src/bottle-design.js';
import { PourPhysics as P, SHAPE_GEO, simplifyPolygon, interiorPolygon, areaBelow } from '../src/pour-physics.js';

test('towers use the small-bottle scale and fit beside the grid', () => {
  for (const [w,h] of [[390,750],[320,640],[844,300],[1280,700],[820,1100],[1180,740]]) {
    const shapes = ['tower', ...Array(20).fill('round'), 'tower'];
    const layout = boardLayout(shapes,w,h);
    assert.deepEqual(layout.towers,[0,21]);
    assert.deepEqual(layout.grid.flat(),Array.from({length:20},(_,i)=>i+1));
    assert.equal(layout.towerWidth, layout.bottleWidth);
    assert.equal(layout.towerHeight, Math.round(layout.bottleWidth*TOWER_ASPECT));
    assert.ok(layout.towerHeight <= h-96+1, 'tower fits the stage height');
    for(const row of layout.grid) {
      const width = layout.bottleWidth*(row.length+0.6)+(row.length-1)*Math.max(6,layout.bottleWidth*.2);
      assert.ok(width + 2*(layout.towerWidth+layout.towerGap) <= w-14+1, 'grid plus towers fit the width');
    }
  }
});
test('one tower segment holds the same liquid area as one round-bottle segment', () => {
  const unit = s => { const poly = simplifyPolygon(interiorPolygon(s,2)); return areaBelow(poly.xs,poly.ys,poly.n,SHAPE_GEO[s].cap)/(SHAPE_GEO[s].capacity||4); };
  assert.ok(Math.abs(unit('tower')/unit('round')-1) < 0.005);
  assert.equal(SHAPES.tower.vbH/100, TOWER_ASPECT);
  assert.equal(SHAPES.tower.B, SHAPE_GEO.tower.bottom);
  assert.ok(P.uprightLevel('tower',12) < P.uprightLevel('tower',4));
});
