import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout } from '../src/board-layout.js';
test('tower rails span the play area without shrinking the center grid to a single row', () => {
  for (const [w,h] of [[390,750],[320,640],[844,300],[1280,700]]) {
    const shapes = ['tower', ...Array(20).fill('round'), 'tower'];
    const layout = boardLayout(shapes,w,h);
    assert.deepEqual(layout.towers,[0,21]);
    assert.deepEqual(layout.grid.flat(),Array.from({length:20},(_,i)=>i+1));
    assert.equal(layout.towerHeight,h-72);
    assert.equal(layout.towerWidth * 10,layout.towerHeight);
    assert.ok(layout.grid.length > 1);
    for(const row of layout.grid) {
      const width = layout.bottleWidth*(row.length+0.6)+(row.length-1)*Math.max(6,layout.bottleWidth*.2);
      assert.ok(width <= w-layout.towerWidth*1.7-16+1, 'center stays between rails');
    }
  }
});
