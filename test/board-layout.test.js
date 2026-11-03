import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout } from '../src/board-layout.js';
import { SHAPES } from '../src/bottle-design.js';
import { SHAPE_GEO, unitArea, volumeScale, uprightLevel } from '../src/pour-physics.js';

test('towers use the small-bottle scale and the board fits the stage', () => {
  for (const tower of ['tower','tower8']) for (const [w,h] of [[390,750],[320,640],[844,300],[1280,700],[820,1100],[1180,740]]) {
    const shapes = [tower, ...Array.from({length:20},(_,i)=>i%4 ? 'round' : 'flask'), tower];
    const layout = boardLayout(shapes,w,h);
    assert.deepEqual(layout.towers,[0,21]);
    assert.deepEqual(layout.grid.flat(),Array.from({length:20},(_,i)=>i+1));
    assert.equal(layout.towerWidth, layout.bottleWidth);
    assert.equal(layout.towerHeight, Math.round(layout.bottleWidth*SHAPES[tower].aspect));
    assert.ok(layout.towerHeight <= h-96+1, 'tower fits the stage height');
    for(const row of layout.grid) {
      const widths = row.reduce((s,i)=>s+layout.scale[i],0)*layout.bottleWidth;
      const width = widths + layout.bottleWidth*0.6 + (row.length-1)*Math.max(6,layout.bottleWidth*.2);
      assert.ok(width + 2*(layout.towerWidth+layout.towerGap) <= w-14+1, 'grid plus towers fit the width');
    }
  }
});
test('every bottle shape shows the same liquid area per segment on screen', () => {
  const round = unitArea('round');
  for (const s of ['classic','tall','flask','tower','tower8']) {
    const onScreen = unitArea(s) * volumeScale(s) ** 2;
    assert.ok(Math.abs(onScreen/round-1) < 0.005, s);
  }
  assert.equal(volumeScale('tower'),1); assert.equal(volumeScale('tower8'),1);
  for (const t of ['tower','tower8']) {
    assert.equal(SHAPES[t].B, SHAPE_GEO[t].bottom);
    assert.ok(uprightLevel(t,SHAPE_GEO[t].capacity) < uprightLevel(t,4));
  }
});
