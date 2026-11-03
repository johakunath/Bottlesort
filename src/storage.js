// Storage is optional: denied access and quota errors retain a session copy.
export function createStorage(getStorage = () => globalThis.localStorage) {
  const memory = new Map();
  return {
    get(key) { if (memory.has(key)) return memory.get(key); try { return getStorage()?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { memory.set(key, value); try { getStorage()?.setItem(key, value); } catch {} },
    remove(key) { memory.set(key, null); try { getStorage()?.removeItem(key); } catch {} },
    read(key) { try { return JSON.parse(this.get(key)); } catch { return null; } },
    write(key, value) { this.set(key, JSON.stringify(value)); }
  };
}
export const storage = createStorage();
export const SAVE_KEY = 'vessel_save_v1';
export function createDefaultSave() {
  return {
    progress: { relaxed: {}, normal: {}, expert: {} }, sound: true, difficulty: 'normal',
    seenHint: false, seenSpecials: {}, theme: 'apothecary', mode: 'light', haptics: true,
    fluid: true, symbols: false, bottleCollection: 'mixed', ach: {},
    daily: { streak: 0, lastWin: '' }, rushBest: 0, lowPowerEffects: false,
    renderQuality: 'auto', backgroundQuality: 'hifi', backgroundQualityUserSet: false
  };
}
const record = x => x && typeof x === 'object' && !Array.isArray(x);
export function normalizeSave(input) {
  const out = createDefaultSave();
  if (!record(input)) return out;
  for (const key of ['sound', 'haptics', 'fluid', 'symbols', 'seenHint', 'lowPowerEffects', 'backgroundQualityUserSet']) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  for (const [key, values] of Object.entries({ difficulty: ['relaxed', 'normal', 'expert'], theme: ['apothecary', 'neon', 'tidepool'], mode: ['light', 'dark'], renderQuality: ['auto', 'low', 'normal', 'pretty'], backgroundQuality: ['basic', 'hifi'], bottleCollection: ['mixed', 'round', 'tall', 'flask'] })) {
    if (values.includes(input[key])) out[key] = input[key];
  }
  if (!out.backgroundQualityUserSet) out.backgroundQuality = 'hifi';
  for (const d of Object.keys(out.progress)) {
    if (!record(input.progress?.[d])) continue;
    for (const [level, p] of Object.entries(input.progress[d])) {
      if (!/^(?:[1-9]|[12][0-9]|30)$/.test(level) || !record(p)) continue;
      if (Number.isInteger(p.stars) && p.stars >= 1 && p.stars <= 3 && Number.isInteger(p.best) && p.best >= 0) out.progress[d][level] = { stars: p.stars, best: p.best };
    }
  }
  for (const key of ['ach', 'seenSpecials']) {
    if (record(input[key])) for (const [k, v] of Object.entries(input[key])) {
      if (/^[a-z][a-z0-9_-]{0,40}$/i.test(k) && (v === true || v === 1)) out[key][k] = true;
    }
  }
  if (Number.isInteger(input.rushBest) && input.rushBest >= 0) out.rushBest = input.rushBest;
  if (record(input.daily) && Number.isInteger(input.daily.streak) && input.daily.streak >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(input.daily.lastWin)) out.daily = { streak: input.daily.streak, lastWin: input.daily.lastWin };
  return out;
}
export function preferredRenderer(search = '', override) {
  const raw = new URLSearchParams(search).get('renderer') || storage.get('vessel_renderer') || override;
  return raw === 'svg' ? 'svg' : 'canvas2d';
}
