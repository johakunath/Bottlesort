import { VesselLogic as Logic } from './game-logic.js';
export const SESSION_KEY = 'vessel_session_v2';
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
const board = (s, capacities) => Array.isArray(s) && s.length >= 3 && s.length <= 35 && s.every((b,i) => Array.isArray(b) && b.length <= (capacities?.[i] || Logic.capacityOf(b)) && b.every(c => integer(c, 0, 8)));
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
      || !integer(g.colors, 3, 9) || !integer(g.sets, 1, 3) || !integer(g.empties, 1, 4)
      || g.state.length !== g.colors * g.sets + g.empties + 4
      || g.state.flat().length !== g.colors * g.sets * 4 + 16
      || !['classic', 'daily', 'rush', 'challenge'].includes(s.mode)
      || !['normal', 'relaxed', 'expert'].includes(s.difficulty)
      || !integer(s.level, 1, s.mode === 'rush' ? 100000 : 30)
      || !integer(s.undosUsed, 0, 1000000) || !integer(s.undosLeft, -1, 1000000)
      || typeof s.usedHint !== 'boolean' || typeof s.usedAuto !== 'boolean'
      || !integer(s.rushStage, 1, 100000) || !integer(s.rushTimeLeft, 0, 1000000)
      || !validSnapshot(s.snapshot, g.state, g.capacities)
      || !Array.isArray(s.history) || s.history.length > 300 || !s.history.every(h => validSnapshot(h, g.state, g.capacities))) return null;
  if (g.rulesVersion !== 2 || !Array.isArray(g.capacities) || g.capacities.length !== g.state.length || !g.capacities.every((c,i) => c === (i === 0 || i === g.state.length - 1 ? 12 : 4))) return null;
  const units = g.state.flat();
  if (units.some(c => c >= g.colors) || Array.from({length:g.colors}, (_, c) => units.filter(x => x === c).length).some((n,c) => n !== g.sets * 4 + (c < 2 ? 8 : 0))) return null;
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
export function validChallenge(c) { return c && integer(c.seed, 0, 4294967295) && integer(c.colors, 3, 9) && integer(c.sets, 1, 3) && integer(c.empties, 2, 4) && c.colors * c.sets + c.empties + 4 <= 35; }
export function parseChallenge(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (!['1','2'].includes(q.get('v'))) return null;
  if (q.has('level')) {
    const level = Number(q.get('level')), difficulty = q.get('difficulty');
    return integer(level, 1, 30) && ['relaxed', 'normal', 'expert'].includes(difficulty) ? { level, difficulty } : null;
  }
  if (!['seed','colors','sets','empties'].every(k => /^\d+$/.test(q.get(k) || ''))) return null;
  const c = Object.fromEntries(['seed','colors','sets','empties'].map(k => [k, Number(q.get(k))]));
  return validChallenge(c) ? c : null;
}
export function challengeURL(base, challenge) {
  const url = new URL(base); url.search = ''; url.hash = new URLSearchParams({v: '2', ...challenge}); return url.href;
}
