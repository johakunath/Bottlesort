import { BAKED } from './levels-baked.js';
/* ============================================================
   Vessel — pure game logic (no DOM)
   Bottles are arrays of color indices, bottom -> top, with a capacity.
   Small bottles hold 4 segments; mandatory side towers hold 12.
   ============================================================ */
'use strict';

const CAP = 4;
const TOWER_CAP = 12;
const RULES_VERSION = 2;

/* Level definitions: [colors, sets]. Each color has sets*4 units, plus
   eight extra units for colors 0 and 1 to supply the two 12-unit towers.
   Initial small bottles = colors*sets+4; both towers start empty. */
const LEVEL_TABLE = {
  relaxed: { empties: 3, undos: Infinity, mystery: 0, levels: [
    [3,1],[4,1],[4,1],[5,1],[5,1],[6,1],[6,1],[7,1],[7,1],[8,1],
    [5,2],[6,2],[7,2],[8,2],[9,1],[9,2],[6,3],[7,3],[8,2],[6,3],
    [7,2],[8,2],[9,2],[7,3],[8,2],[9,2],[6,3],[7,3],[9,2],[7,3]] },
  normal:  { empties: 2, undos: Infinity, mystery: 0, levels: [
    [4,1],[5,1],[6,1],[7,1],[8,1],[5,2],[6,2],[7,2],[8,2],[6,3],
    [7,2],[8,2],[6,3],[9,2],[7,3],[8,2],[9,2],[6,3],[7,3],[8,2],
    [9,2],[7,3],[8,2],[9,2],[6,3],[7,3],[9,2],[8,2],[7,3],[9,2]] },
  expert:  { empties: 2, undos: 5, mystery: 1, levels: [
    [5,1],[6,1],[7,1],[8,1],[9,1],[6,2],[7,2],[8,2],[6,3],[7,3],
    [8,2],[6,3],[9,2],[7,3],[8,2],[9,2],[7,3],[8,2],[9,2],[6,3],
    [7,3],[9,2],[8,2],[7,3],[9,2],[8,2],[7,3],[9,2],[8,2],[7,3]] }
};
const MAX_LEVEL = 30;

/* Baked seed offsets + par, found at build time so runtime never searches. */


/* ---------- RNG ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

/* ---------- State helpers ---------- */
function capacityOf(b) { return b.capacity || CAP; }
function cloneBottle(b) { const copy = b.slice(); copy.capacity = capacityOf(b); return copy; }
function cloneState(s) { return s.map(cloneBottle); }
function withCapacities(s, capacities) {
  return s.map((b, i) => { const copy = b.slice(); copy.capacity = capacities?.[i] || capacityOf(b); return copy; });
}

function stateKey(s) {
  return s.map(b => capacityOf(b) + ':' + capacityOf(b) + ':' + b.join(',')).sort().join('|');
}

function topRun(bottle) {
  const len = bottle.length;
  if (!len) return { color: -1, count: 0 };
  const c = bottle[len - 1];
  let n = 1;
  for (let i = len - 2; i >= 0 && bottle[i] === c; i--) n++;
  return { color: c, count: n };
}

function isBottleComplete(b) {
  if (b.length !== capacityOf(b)) return false;
  for (let i = 1; i < b.length; i++) if (b[i] !== b[0]) return false;
  return true;
}

function isBottleClear(b) { // empty or complete
  return (b.length === 0 && capacityOf(b) === CAP) || isBottleComplete(b);
}

function isSolved(s) { return s.every(isBottleClear); }
function completionProgress(state) {
  const total = state.reduce((sum,b) => sum + b.length, 0);
  if (!total) return 0;
  const towerGoal = state.filter(b => capacityOf(b) > CAP).reduce((sum,b) => sum + capacityOf(b), 0);
  const complete = state.filter(isBottleComplete);
  const towerDone = complete.filter(b => capacityOf(b) > CAP).reduce((sum,b) => sum + b.length, 0);
  const smallDone = complete.filter(b => capacityOf(b) === CAP).length * CAP;
  return Math.min(1, (towerDone + Math.min(smallDone, Math.max(0, total - towerGoal))) / total);
}

/* A pour is legal if source has liquid, target has space, and the
   target is empty or its top color matches the source top color. */
function canPour(s, i, j) {
  if (i === j) return false;
  const src = s[i], dst = s[j];
  if (src.length === 0) return false;
  if (dst.length >= capacityOf(dst)) return false;
  if (dst.length === 0) return true;
  return dst[dst.length - 1] === src[src.length - 1];
}

function pourAmount(s, i, j) {
  const run = topRun(s[i]);
  return Math.min(run.count, capacityOf(s[j]) - s[j].length);
}

/* Mutates s. Returns number of units moved. */
function applyPour(s, i, j) {
  const n = pourAmount(s, i, j);
  const c = s[i][s[i].length - 1];
  s[i].length -= n;
  for (let k = 0; k < n; k++) s[j].push(c);
  return n;
}

/* ---------- Solver (DFS + memo + move ordering) ----------
   Optional frozenSet: those bottles cannot be poured from or into
   until at least one bottle anywhere is complete (thaw is sticky). */
function solve(initial, budget, frozenSet) {
  budget = budget || 250000;
  const frozen = frozenSet && frozenSet.size ? frozenSet : null;
  const totals = initial.flat().reduce((a,c) => { a[c] = (a[c] || 0) + 1; return a; }, []);
  const visited = new Set();
  let nodes = 0;
  let aborted = false;

  function dfs(s, path, thawed) {
    if (isSolved(s)) return path;
    if (++nodes > budget) { aborted = true; return null; }
    if (!thawed && frozen) thawed = s.some(isBottleComplete);
    const k = frozen && !thawed
      ? 'F' + s.map((b, i) => (frozen.has(i) ? 'locked:' : 'free:') + capacityOf(b) + ':' + b.join(',')).sort().join('|')
      : 'T' + stateKey(s);
    if (visited.has(k)) return null;
    visited.add(k);

    const moves = [];
    for (let i = 0; i < s.length; i++) {
      if (frozen && !thawed && frozen.has(i)) continue;
      const src = s[i];
      if (!src.length) continue;
      const run = topRun(src);
      if (run.count === TOWER_CAP || (run.count === CAP && !s.some(b => capacityOf(b) > CAP))) continue;
      const srcUniform = run.count === src.length;
      for (let j = 0; j < s.length; j++) {
        if (i === j) continue;
        if (frozen && !thawed && frozen.has(j)) continue;
        const dst = s[j];
        if (srcUniform && src.length === capacityOf(src) && capacityOf(dst) <= capacityOf(src)) continue;
        if (dst.length >= capacityOf(dst)) continue;
        if (dst.length === 0) {
          if (srcUniform && capacityOf(src) === capacityOf(dst)) continue;
        } else if (dst[dst.length - 1] !== run.color) continue;

        const space = capacityOf(dst) - dst.length;
        const amount = Math.min(run.count, space);
        let score = 0;
        if (dst.length + amount === capacityOf(dst) && (dst.length ? dst.every(x => x === run.color) : amount === capacityOf(dst))) score += 6;
        if (amount === run.count) score += 3;
        // Collect abundant colors in towers; avoid reserving them for colors
        // whose entire supply cannot fill one. Such moves remain legal buffers.
        if (capacityOf(dst) > CAP) score += totals[run.color] >= TOWER_CAP ? 20 : -20;
        if (srcUniform) score += 2;
        if (capacityOf(src) > CAP && srcUniform) score -= 35;
        if (dst.length === 0) score -= 2;
        if (amount < run.count) score -= 2;
        moves.push({ i, j, score });
      }
    }
    moves.sort((a, b) => b.score - a.score);

    for (let m = 0; m < moves.length; m++) {
      const ns = cloneState(s);
      applyPour(ns, moves[m].i, moves[m].j);
      const r = dfs(ns, path.concat([[moves[m].i, moves[m].j]]), thawed);
      if (r || aborted) return r;
    }
    return null;
  }

  const result = dfs(initial, [], false);
  return { solution: result, nodes, aborted };
}

/* ---------- Level generation ---------- */
function diffSeed(level, difficulty) {
  const d = { relaxed: 11, normal: 23, expert: 47 }[difficulty] || 23;
  return (level * 1000003 + d * 7919 + 12345) >>> 0;
}

function buildState(level, difficulty, attempt) {
  const cfg = LEVEL_TABLE[difficulty] || LEVEL_TABLE.normal;
  const [colors, sets] = cfg.levels[level - 1];
  const rng = mulberry32(diffSeed(level, difficulty) + attempt * 104729);
  const state = mixedBoard(rng, colors, sets, cfg.empties);
  return { state, colors, sets, cfg };
}

function mixedBoard(rng, colors, sets, empties) {
  const units = [];
  for (let c = 0; c < colors; c++) {
    const count = CAP * sets + (c < 2 ? TOWER_CAP - CAP : 0);
    for (let k = 0; k < count; k++) units.push(c);
  }
  shuffleInPlace(units, rng);
  const state = [[]];
  for (let i = 0; i < units.length; i += CAP) state.push(units.slice(i, i + CAP));
  for (let i = 2; i < empties; i++) state.push([]);
  state.push([]);
  return withCapacities(state, state.map((_,i) => i === 0 || i === state.length-1 ? TOWER_CAP : CAP));
}

/* Special bottles, expert only. Disjoint sets over the filled bottles.
   mystery: layers below the top are hidden until exposed.
   veiled:  fully sealed; a free tap unveils it (no solver impact).
   frozen:  unusable until the first bottle is completed (solver-verified). */
function specialsFor(level, difficulty, fillCount, state) {
  const out = { mystery: [], veiled: [], frozen: [] };
  if (difficulty !== 'expert') return out;
  const rng = mulberry32(diffSeed(level, difficulty) + 999);
  const pool = [];
  for (let i = 0; i < state.length; i++) if (state[i].length && capacityOf(state[i]) === CAP) pool.push(i);
  shuffleInPlace(pool, rng);
  const take = n => pool.splice(0, Math.max(0, Math.min(n, pool.length)));
  if (level >= 4) out.mystery = take(Math.min(2 + Math.floor((level - 4) / 2), Math.floor(fillCount / 4)));
  if (level >= 6) out.veiled = take(Math.min(1 + Math.floor((level - 6) / 3), 2));
  if (level >= 7) out.frozen = take(Math.min(1 + Math.floor((level - 7) / 2), 2));
  return out;
}

const GEN_CACHE = {};

function generateLevel(level, difficulty) {
  const ck = difficulty + ':' + level;
  if (GEN_CACHE[ck]) return GEN_CACHE[ck];
  const out = generateLevelUncached(level, difficulty);
  GEN_CACHE[ck] = out;
  return out;
}

function generateLevelUncached(level, difficulty) {
  const baked = BAKED && BAKED[difficulty] && BAKED[difficulty][level - 1];
  if (baked && baked.v === RULES_VERSION) {
    const b = buildState(level, difficulty, baked.o);
    const specials = specialsFor(level, difficulty, b.colors * b.sets, b.state);
    return { rulesVersion: RULES_VERSION, capacities: b.state.map(capacityOf), state: b.state, seedOffset: baked.o, par: baked.p, colors: b.colors, sets: b.sets,
             empties: b.cfg.empties, undos: b.cfg.undos, specials };
  }
  for (let attempt = 0; attempt < 400; attempt++) {
    const b = buildState(level, difficulty, attempt);
    if (b.state.some(isBottleComplete)) continue;
    const specials = specialsFor(level, difficulty, b.colors * b.sets, b.state);
    const res = solve(cloneState(b.state), 400000, new Set(specials.frozen));
    if (res.solution && res.solution.length > 2) {
      return { rulesVersion: RULES_VERSION, capacities: b.state.map(capacityOf), state: b.state, seedOffset: attempt, par: res.solution.length, colors: b.colors, sets: b.sets,
               empties: b.cfg.empties, undos: b.cfg.undos, specials };
    }
  }
  throw new Error('Level generation failed for level ' + level + ' / ' + difficulty);
}

/* ---------- Custom boards (Daily / Rush) ----------
   Seeded, solver-verified boards independent of the classic tables. */
function generateFromSeed(seedBase, colors, sets, empties, maxAttempts) {
  for (let attempt = 0; attempt < (maxAttempts || 200); attempt++) {
    const rng = mulberry32((seedBase + attempt * 104729) >>> 0);
    const state = mixedBoard(rng, colors, sets, empties);
    if (state.some(isBottleComplete)) continue;
    const res = solve(cloneState(state), 300000);
    if (res.solution && res.solution.length > 2) {
      return { rulesVersion: RULES_VERSION, capacities: state.map(capacityOf), state, par: res.solution.length, colors, sets, empties,
               undos: Infinity, specials: { mystery: [], veiled: [], frozen: [] } };
    }
  }
  return null;
}

/* One puzzle per calendar day; weekends run bigger boards. */
function dailyConfig(dateStr) { // dateStr: 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split('-').map(Number);
  const seed = (y * 10000 + m * 100 + d) >>> 0;
  const dow = new Date(y, m - 1, d).getDay();
  const weekend = dow === 0 || dow === 6;
  const colors = 5 + (seed % 4);                 // 5-8
  const sets = weekend ? 2 : 1;
  return { seed: (seed * 2654435761) >>> 0, colors, sets, empties: 2 };
}

/* Rush ladder: shapes grow with the stage number. */
function rushConfig(stage) {
  const s = Math.max(1, stage);
  const colors = Math.min(3 + s, 9);             // 4,5,6,7,8,9,9...
  const sets = s >= 8 ? 2 : 1;
  return { seed: (s * 48271 + 7) >>> 0, colors, sets, empties: 2 };
}

function rushTimeFor(par) { return Math.round(18 + par * 2.4); }

/* ---------- Exports ---------- */
const VesselLogic = {
  CAP, TOWER_CAP, RULES_VERSION, capacityOf, cloneBottle, withCapacities, LEVEL_TABLE, MAX_LEVEL, buildState, diffSeed, specialsFor,
  generateFromSeed, dailyConfig, rushConfig, rushTimeFor,
  mulberry32, cloneState, stateKey, topRun,
  isBottleComplete, isBottleClear, isSolved, completionProgress,
  canPour, pourAmount, applyPour, solve, generateLevel
};
if (typeof window !== 'undefined') Object.assign(window, VesselLogic);
if (typeof module !== 'undefined' && module.exports) module.exports = VesselLogic;
export { VesselLogic };
