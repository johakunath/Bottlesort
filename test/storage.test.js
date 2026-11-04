import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSave, normalizeSave, createStorage } from '../src/storage.js';

test('fresh-player progress and awards never mutate reset defaults', () => {
  const save = normalizeSave(null);
  save.progress.normal[1] = { stars: 3, best: 14 }; save.ach.first = true;
  const reset = createDefaultSave();
  assert.deepEqual(reset.progress.normal, {}); assert.deepEqual(reset.ach, {});
});
test('normalization rejects malformed nested saves and detaches valid records', () => {
  const input = { progress: {normal: {1: {stars: 3, best: 14}, 2: {stars: '3', best: 2}}, expert: null}, ach: [], sound: 'yes', symbols: true, difficulty: 'invalid' };
  const save = normalizeSave(input);
  assert.equal(save.sound, true); assert.equal(save.difficulty, 'normal'); assert.equal(save.symbols, true);
  assert.deepEqual(save.progress.normal, {1: {stars: 3, best: 14}});
  save.progress.normal[1].stars = 1; assert.equal(input.progress.normal[1].stars, 3);
  for (const x of [null, [], true, 4, 'bad']) assert.deepEqual(normalizeSave(x), createDefaultSave());
});
test('denied storage and quota failures retain session data without throwing', () => {
  const storage = createStorage(() => { throw new Error('Denied'); });
  assert.equal(storage.get('x'), null); storage.write('x', {value: 2});
  assert.deepEqual(storage.read('x'), {value:2}); storage.remove('x'); assert.equal(storage.read('x'), null);
  storage.set('broken', '{'); assert.equal(storage.read('broken'), null);
});
test('failed overwrite or removal never resurrects an older persisted value', () => {
  const st = createStorage(() => ({getItem:()=> 'old',setItem(){throw new Error('Quota');},removeItem(){throw new Error('Denied');}}));
  assert.equal(st.get('x'),'old'); st.set('x','new'); assert.equal(st.get('x'),'new');
  st.remove('x'); assert.equal(st.get('x'),null);
});
test('achievement unlock timestamps survive a save round trip', () => {
  const stamp = 1762230000000;
  const save = normalizeSave(JSON.parse(JSON.stringify({ ach: { first: stamp, legacy: true, bad: -1, odd: 'x' }, seenSpecials: { frozen: 1 } })));
  assert.deepEqual(save.ach, { first: stamp, legacy: true });
  assert.deepEqual(save.seenSpecials, { frozen: true });
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(save))).ach, save.ach);
});
