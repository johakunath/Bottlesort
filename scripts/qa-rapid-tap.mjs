/* Manual QA: rapid-tap a full solution, with an undo mid-pour.
   Not part of `npm test` (needs Playwright + Chromium, which are not repo deps).
     npx vite --host 127.0.0.1 --port 5173 &
     node scripts/qa-rapid-tap.mjs [reduce|no-preference] [canvas2d|svg] [level] [difficulty] [tapGapMs]
   Pass criteria printed as JSON: undoOk, rejected (taps dropped; only a tap on a
   bottle that is still frozen may be rejected), solved, win, poses (must be 0). */
import { chromium } from 'playwright';
const [rm = 'no-preference', renderer = 'canvas2d', lvl = '14', diff = 'normal', gap = '16'] = process.argv.slice(2);
const url = (process.env.VESSEL_URL || 'http://127.0.0.1:5173/') + '?renderer=' + renderer;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 400, height: 850 }, reducedMotion: rm });
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url);
await pg.evaluate(d => localStorage.setItem('vessel_save_v1', JSON.stringify({ renderQuality: 'normal', seenHint: true, difficulty: d, seenSpecials: { m: 1, v: 1, f: 1 } })), diff);
await pg.reload();
await pg.evaluate(l => window.__vessel.loadLevel(+l), lvl);
await pg.waitForTimeout(800);
const r = await pg.evaluate(async gap => {
  const V = window.__vessel, sleep = ms => new Promise(r => setTimeout(r, ms));
  const sol = (await V.requestSolution({ state: V.state, frozen: V.frozen, budget: 250000 })).solution;
  const snap = () => JSON.stringify(V.state);
  const before = [];
  for (const [i, j] of sol.slice(0, 3)) { before.push(snap()); V.onTap(i); V.onTap(j); await sleep(+gap); }
  const pendingAtUndo = V.activePours;
  V.undo();
  const undoOk = snap() === before[2] && V.activePours === 0;
  let rejected = 0, frozenRetries = 0;
  for (const [i, j] of sol.slice(2)) {
    const m0 = V.moves;
    if (V.veiled[i]) V.onTap(i);
    if (V.veiled[j]) V.onTap(j);
    V.onTap(i); V.onTap(j);
    if (V.moves !== m0 + 1) {
      if (V.frozen.has(i) || V.frozen.has(j)) {   /* ice thaws when the completing pour lands */
        frozenRetries++;
        while (V.activePours) await sleep(20);
        V.onTap(i); V.onTap(j);
      }
      if (V.moves !== m0 + 1) rejected++;
    }
    await sleep(+gap);
  }
  while (V.activePours) await sleep(30);
  await sleep(1200);
  return {
    moves: sol.length, pendingAtUndo, undoOk, rejected, frozenRetries,
    solved: window.isSolved(V.state), win: document.querySelector('#overlay').classList.contains('show'),
    poses: V.slots.filter(s => s.btn.style.transform).length
  };
}, gap);
console.log(JSON.stringify(r), errs.length ? errs : 'no console errors');
await b.close();
process.exit(r.undoOk && !r.rejected && r.solved && r.win && !r.poses && !errs.length ? 0 : 1);
