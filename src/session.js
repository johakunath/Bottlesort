import { VesselLogic as Logic } from './game-logic.js';
export const SESSION_KEY = 'vessel_session_v2';
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const MAX_BOTTLES = 35;
const board = (s, capacities) => Array.isArray(s) && s.length >= 3 && s.length <= MAX_BOTTLES && s.every((b,i) => Array.isArray(b) && b.length <= (capacities?.[i] || Logic.capacityOf(b)) && b.every(c => integer(c, 0, 8)));
const counts = s => s.flat().reduce((a, c) => { a[c]++; return a; }, Array(9).fill(0)).join(',');
export function validSnapshot(s, initial, capacities) {
  const n = initial.length;
  return s && board(s.state, capacities) && s.state.length === n && counts(s.state) === counts(initial) && integer(s.moves, 0, 1000000)
    && Array.isArray(s.hiddenDepth) && s.hiddenDepth.length === n && s.hiddenDepth.every((h, i) => integer(h, 0, s.state[i].length))
    && Array.isArray(s.veiled) && s.veiled.length === n && s.veiled.every(v => typeof v === 'boolean')
    && Array.isArray(s.frozen) && s.frozen.every(i => integer(i, 0, n - 1));
}
export function readSession(storage) {
  const s = storage.read(SESSION_KEY), g = s?.gen;
  if (!s || s.version !== 2 || !g || !board(g.state, g.capacities) || !integer(g.par, 1, 1000000)
      || !integer(g.colors, 2, 9) || !integer(g.sets, 1, 3) || !integer(g.empties, 0, 4)
      || g.state.length !== Logic.boardSize(g.colors, g.sets, g.empties)
      || g.state.flat().length !== Logic.totalUnits(g.colors, g.sets)
      || !['classic', 'daily', 'rush', 'challenge'].includes(s.mode)
      || !['normal', 'relaxed', 'expert'].includes(s.difficulty)
      || !integer(s.level, 1, s.mode === 'rush' ? 100000 : 30)
      || !integer(s.undosUsed, 0, 1000000) || !integer(s.undosLeft, -1, 1000000)
      || typeof s.usedHint !== 'boolean' || typeof s.usedAuto !== 'boolean'
      || !integer(s.rushStage, 1, 100000) || !integer(s.rushTimeLeft, 0, 1000000)
      || !validSnapshot(s.snapshot, g.state, g.capacities)
      || !Array.isArray(s.history) || s.history.length > 300 || !s.history.every(h => validSnapshot(h, g.state, g.capacities))) return null;
  const expected = Logic.towerCapacities(g.state.length);
  if (g.rulesVersion !== Logic.RULES_VERSION || !Array.isArray(g.capacities) || g.capacities.length !== g.state.length || !g.capacities.every((c,i) => c === expected[i])) return null;
  const units = g.state.flat();
  if (units.some(c => c >= g.colors) || Array.from({length:g.colors}, (_, c) => units.filter(x => x === c).length).some((n,c) => n !== Logic.unitsOfColor(c, g.sets))) return null;
  const sp = g.specials;
  if (!sp || !['mystery', 'veiled', 'frozen'].every(k => Array.isArray(sp[k]) && sp[k].every(i => integer(i, 0, g.state.length - 1)))) return null;
  if (s.mode === 'daily' && !/^\d{4}-\d{2}-\d{2}$/.test(s.dailyDate)) return null;
  if (s.mode === 'challenge' && !validChallenge(s.challenge)) return null;
  if (!(g.undos === null || integer(g.undos, 0, 1000000))) return null;
  s.gen.undos = g.undos === null ? Infinity : g.undos;
  s.gen.state = Logic.withCapacities(s.gen.state, g.capacities);
  s.snapshot.state = Logic.withCapacities(s.snapshot.state, g.capacities);
  s.history.forEach(h => { h.state = Logic.withCapacities(h.state, g.capacities); });
  return s;
}
export function validChallenge(c) { return c && integer(c.seed, 0, 4294967295) && integer(c.colors, 3, 9) && integer(c.sets, 1, 3) && integer(c.empties, 0, 4) && Logic.boardSize(c.colors, c.sets, c.empties) <= MAX_BOTTLES; }
/* Links carry the rules version: an older link would produce a different board
   than the sender played, so it is reported as outdated instead of opened. */
export function isOutdatedChallenge(hash) {
  const v = new URLSearchParams(hash.replace(/^#/, '')).get('v');
  return /^\d+$/.test(v || '') && Number(v) < Logic.RULES_VERSION;
}
export function parseChallenge(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (q.get('v') !== String(Logic.RULES_VERSION)) return null;
  if (q.has('level')) {
    const level = Number(q.get('level')), difficulty = q.get('difficulty');
    return integer(level, 1, 30) && ['relaxed', 'normal', 'expert'].includes(difficulty) ? { level, difficulty } : null;
  }
  if (!['seed','colors','sets','empties'].every(k => /^\d+$/.test(q.get(k) || ''))) return null;
  const c = Object.fromEntries(['seed','colors','sets','empties'].map(k => [k, Number(q.get(k))]));
  return validChallenge(c) ? c : null;
}
export function challengeURL(base, challenge) {
  const url = new URL(base); url.search = ''; url.hash = new URLSearchParams({v: String(Logic.RULES_VERSION), ...challenge}); return url.href;
}
