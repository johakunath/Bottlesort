import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { SESSION_KEY, readSession, parseChallenge, challengeURL, isOutdatedChallenge } from '../src/session.js';
import { VesselLogic as L } from '../src/game-logic.js';
const storage = () => createStorage(() => null);
function fixture() {
  const gen = L.generateLevel(1, 'normal');
  const snapshot = {state: L.cloneState(gen.state), moves:0, hiddenDepth:gen.state.map(()=>0), veiled:gen.state.map(()=>false), frozen:[]};
  return {version:2, gen, mode:'classic', level:1, difficulty:'normal', snapshot, history:[], undosUsed:0, undosLeft:-1, usedHint:false, usedAuto:false, rushStage:1, rushTimeLeft:0};
}
test('session roundtrip keeps undo history and unlimited undos', () => {
  const st = storage(), data = fixture(); data.history.push(structuredClone(data.snapshot));
  st.write(SESSION_KEY, data); const restored = readSession(st);
  assert.equal(restored.gen.undos, Infinity); assert.deepEqual(restored.history, data.history);
});
test('invalid board data, changed volume, bad history and special indices are rejected', () => {
  for (const mutate of [s=>s.snapshot.state[0].push(9), s=>s.snapshot.state[1].pop(), s=>s.history.push({}), s=>s.gen.specials.frozen.push(99), s=>s.gen.state=null]) {
    const st=storage(), s=structuredClone(fixture()); mutate(s); st.write(SESSION_KEY,s); assert.equal(readSession(st),null);
  }
});
test('challenge links roundtrip reproducibly and reject invalid inputs', () => {
  for (const c of [{level:12,difficulty:'expert'}, {seed:4294967295,colors:5,sets:1,empties:2}]) {
    const url = new URL(challengeURL('https://example.com/?renderer=svg#old',c));
    assert.equal(url.search,''); assert.deepEqual(parseChallenge(url.hash), c);
  }
  const v = L.RULES_VERSION;
  for (const hash of [`#v=${v+1}&level=1&difficulty=normal`, `#v=${v}&level=31&difficulty=normal`, `#v=${v}&seed=-1&colors=5&sets=1&empties=2`, `#v=${v}&seed=1&colors=999&sets=1&empties=2`]) assert.equal(parseChallenge(hash),null);
});
test('links from older rules are reported as outdated, not opened', () => {
  for (const old of ['#v=1&level=3&difficulty=normal', `#v=${L.RULES_VERSION-1}&seed=1&colors=5&sets=1&empties=2`]) {
    assert.equal(parseChallenge(old), null); assert.equal(isOutdatedChallenge(old), true);
  }
  assert.equal(isOutdatedChallenge(`#v=${L.RULES_VERSION}&level=3&difficulty=normal`), false);
});
test('a tower containing more than four segments survives JSON save and restore', () => {
  const st=storage(), data=fixture();
  const solution=L.solve(data.snapshot.state,400000).solution;
  for(const [i,j] of solution) {
    L.applyPour(data.snapshot.state,i,j); data.snapshot.moves++;
    if(data.snapshot.state.some(b=>b.length>4)) break;
  }
  st.write(SESSION_KEY,data);
  const restored=readSession(st), tower=restored.snapshot.state.find(b=>b.length>4);
  assert.ok(tower);assert.equal(L.capacityOf(tower),data.gen.towerCap);
  assert.equal(L.isBottleComplete(tower),false);
  assert.deepEqual(restored.snapshot.state,data.snapshot.state);
});
