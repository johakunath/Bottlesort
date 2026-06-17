/* ============================================================
   Vessel â€” game runtime v2
   Shapes, gravity-true liquid, mystery bottles, ambient magic.
   Requires logic.js loaded first.
   ============================================================ */
'use strict';
(function () {

/* ---------------- palette ----------------
   Each entry = [bright face, shadow side]; used as a bâ†’aâ†’b across the band. */
/* palettes retuned for mobile legibility: each colour sits on a distinct hue with
   varied lightness so neighbours never read as the same colour on a small screen */
const APO_COLORS = [
  ['#ff7a85', '#d4263d'], // cherry  (red)
  ['#ffb24d', '#e0710f'], // tangerine (orange)
  ['#ffe24d', '#d6ad00'], // lemon   (yellow)
  ['#7fd96a', '#2f9e3f'], // lime    (green)
  ['#4fd6c4', '#0e9488'], // teal    (cyan)
  ['#6aa8ff', '#2459d6'], // blue
  ['#b98cff', '#6a2fd6'], // violet  (purple)
  ['#ff8fd6', '#d63f97'], // pink    (magenta)
  ['#c98f5e', '#7c4a26']  // mocha   (brown)
];
const NEON_COLORS = [
  ['#ff5d6c', '#c8102e'], // cherry  (red)
  ['#ff9f3a', '#d65a00'], // tangerine (orange)
  ['#ffe23d', '#c9a200'], // lemon   (yellow)
  ['#5de86a', '#109a2f'], // lime    (green)
  ['#2fe0d0', '#058a80'], // teal    (cyan)
  ['#4f9bff', '#1043d6'], // blue
  ['#b46bff', '#6a1fd6'], // violet  (purple)
  ['#ff5db8', '#c8127a'], // pink    (magenta)
  ['#d8a76a', '#8a5a2c']  // sand    (brown)
];
const TIDE_COLORS = [
  ['#ff7f73', '#c63f45'], // coral   (red)
  ['#ffbd67', '#d46a24'], // amber   (orange)
  ['#f7e978', '#c9a93b'], // shell   (yellow)
  ['#84d86d', '#2f9a55'], // kelp    (green)
  ['#54d9c5', '#138b84'], // glass   (cyan)
  ['#69b8ff', '#2a66c7'], // lagoon  (blue)
  ['#b28dff', '#6650c6'], // lilac   (purple)
  ['#ff91b7', '#c94678'], // anemone (pink)
  ['#c8a06a', '#74603f']  // drift   (brown)
];
let COLORS = APO_COLORS;
let HIDDEN_FILL = ['#cbb186', '#8a6a3e']; /* parchment-gray mystery fill (apothecary) */
const COLOR_NAMES = ['cherry', 'tangerine', 'lemon', 'lime', 'teal', 'blue', 'violet', 'pink', 'mocha'];
/* one distinct glyph per liquid color, for colorblind-friendly play */
const COLOR_GLYPHS = ['â™¥', 'â–²', 'â—', 'âœ¿', 'â—†', 'â˜…', 'âœš', 'â™ª', 'â¬£'];

/* ---------------- bottle shapes ----------------
   Every shape: viewBox 100 x vbH. pivot = element center (CSS rotate origin).
   B/T = liquid bottom/top, box = interior bounds for tilt pooling. */
const SHAPES = {
  classic: {
    vbH: 240, aspect: 2.4, mouthFrac: 20 / 240, surfRx: 26,
    interior: 'M38,26 L38,54 C38,64 22,68 22,84 L22,204 Q22,224 42,224 L58,224 Q78,224 78,204 L78,84 C78,68 62,64 62,54 L62,26 Z',
    outline: 'M35,22 L35,53 C35,63 19,67 19,84 L19,205 Q19,227 42,227 L58,227 Q81,227 81,205 L81,84 C81,67 65,63 65,53 L65,22',
    lip: { x: 31, y: 14, w: 38, h: 12, rx: 6, mouthRx: 14, mouthRy: 3.4, mouthCy: 20 },
    B: 221, T: 30, box: [22, 78, 26, 224],
    gloss: [
      { x: 27, y: 92, w: 9, h: 110, rx: 4.5, o: 0.55 },
      { x: 68, y: 96, w: 3.5, h: 92, rx: 1.7, o: 0.25 },
      { x: 40, y: 30, w: 5, h: 22, rx: 2.5, o: 0.5 }
    ]
  },
  tall: {
    vbH: 320, aspect: 3.2, mouthFrac: 18 / 320, surfRx: 21,
    interior: 'M40,24 L40,50 C40,58 30,62 30,74 L30,286 Q30,304 50,304 Q70,304 70,286 L70,74 C70,62 60,58 60,50 L60,24 Z',
    outline: 'M37,20 L37,49 C37,57 27,61 27,74 L27,287 Q27,307 50,307 Q73,307 73,287 L73,74 C73,61 63,57 63,49 L63,20',
    lip: { x: 34, y: 12, w: 32, h: 11, rx: 5.5, mouthRx: 12, mouthRy: 3, mouthCy: 18 },
    B: 301, T: 28, box: [30, 70, 24, 304],
    gloss: [
      { x: 34, y: 84, w: 8, h: 190, rx: 4, o: 0.55 },
      { x: 61, y: 90, w: 3, h: 160, rx: 1.5, o: 0.25 },
      { x: 42, y: 28, w: 4.5, h: 18, rx: 2.2, o: 0.5 }
    ]
  },
  flask: {
    vbH: 240, aspect: 2.4, mouthFrac: 20 / 240, surfRx: 30, magic: true,
    interior: 'M42,26 L42,131 A40,40 0 1,0 58,131 L58,26 Z',
    outline: 'M39,22 L39,129 A43,43 0 1,0 61,129 L61,22',
    lip: { x: 35, y: 14, w: 30, h: 12, rx: 6, mouthRx: 11, mouthRy: 3, mouthCy: 20 },
    B: 208, T: 32, box: [10, 90, 26, 210],
    cork: { x: 35, y: 12, w: 30, h: 16, r: 5 },
    label: { x: 30, y: 150, w: 40, h: 42, rx: 18 },
    gloss: [
      { x: 26, y: 150, w: 10, h: 44, rx: 5, o: 0.5 },
      { x: 44, y: 32, w: 5, h: 60, rx: 2.5, o: 0.45 }
    ],
    sparkle: [[33, 146], [70, 186], [58, 158]]
  }
};
/* cork + parchment-label furniture per shape (Apothecary skin) */
SHAPES.classic.cork = { x: 33, y: 13, w: 34, h: 18, r: 6 };
SHAPES.classic.label = { x: 29, y: 150, w: 42, h: 54, rx: 4 };
SHAPES.tall.cork = { x: 34, y: 11, w: 32, h: 16, r: 5 };
SHAPES.tall.label = { x: 34, y: 196, w: 32, h: 76, rx: 4 };

/* live theme-visual state, updated by applyTheme() */
let SKIN = 'apothecary', MODE = 'light';
let RIM_COLOR = 'rgba(255,255,255,0.95)';
let GLASS_SHADOW = '#3a2410';

const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- storage ---------------- */
const KEY = 'vessel_save_v1';
const mem = {};
const store = {
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return mem[KEY] ? JSON.parse(mem[KEY]) : null;
  },
  save(data) {
    const raw = JSON.stringify(data);
    mem[KEY] = raw;
    try { localStorage.setItem(KEY, raw); } catch (e) {}
  }
};
const DEFAULT_SAVE = {
  progress: { relaxed: {}, normal: {}, expert: {} },
  sound: true, difficulty: 'normal', seenHint: false, seenSpecials: {},
  theme: 'apothecary', mode: 'light', symbols: false, haptics: true, fluid: true,
  ach: {}, daily: { streak: 0, lastWin: '' }, rushBest: 0, lowPowerEffects: false, renderQuality: 'auto', backgroundQuality: 'hifi'
};
let save = Object.assign({}, DEFAULT_SAVE, store.load() || {});
save.progress = Object.assign({}, DEFAULT_SAVE.progress, save.progress || {});
if (!['relaxed', 'normal', 'expert'].includes(save.difficulty)) save.difficulty = 'normal';
/* migrate old colour-theme saves (dusk/ocean/candy/galaxy) to the new skins */
if (!['apothecary', 'neon', 'tidepool'].includes(save.theme)) save.theme = 'apothecary';
if (!['light', 'dark'].includes(save.mode)) save.mode = 'light';
/* normalise visual toggles to explicit booleans (pre-fluid saves lack the key:
   the DEFAULT_SAVE merge already defaults it, this pins the schema) */
save.fluid = save.fluid !== false;   /* realistic liquid motion â€” default ON */
delete save.glass;                   /* removed: WebGL glass reflections */
delete save.beat;                    /* removed: Neon rhythm mode */
save.seenSpecials = save.seenSpecials || {};
save.ach = save.ach || {};
save.daily = Object.assign({ streak: 0, lastWin: '' }, save.daily || {});
save.lowPowerEffects = save.lowPowerEffects === true;
if (!['auto', 'low', 'normal', 'pretty'].includes(save.renderQuality)) save.renderQuality = 'auto';
if (!['basic', 'hifi'].includes(save.backgroundQuality)) save.backgroundQuality = 'hifi';
function persist() { store.save(save); }

/* ---------------- audio ---------------- */
const AudioFX = {
  ctx: null,
  ensure() {
    if (!save.sound) return null;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  tone(freq, dur, type, vol, slideTo, delay) {
    const ctx = this.ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },
  noise(dur, f0, f1, vol) {
    const ctx = this.ensure(); if (!ctx) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.05);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  select()  { this.tone(520, 0.08, 'sine', 0.10, 660); },
  swap()    { this.tone(440, 0.07, 'sine', 0.08, 520); },
  invalid() { this.tone(150, 0.13, 'square', 0.05, 110); },
  pour(dur) { this.noise(dur, 950, 380, 0.085); },
  cap()     { this.tone(640, 0.10, 'triangle', 0.18, 330); this.tone(1280, 0.05, 'sine', 0.08, 1180, 0.02); },
  undo()    { this.tone(360, 0.09, 'sine', 0.08, 300); },
  reveal()  { this.tone(980, 0.14, 'sine', 0.09, 1480); },
  ice()     { this.tone(1850, 0.07, 'sine', 0.07, 1700); this.tone(120, 0.08, 'square', 0.03); },
  thaw()    { this.noise(0.3, 2600, 700, 0.07); this.tone(1320, 0.22, 'sine', 0.08, 880, 0.05); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.13, f, i * 0.11));
    this.tone(1568, 0.5, 'sine', 0.06, 1568, 0.46);
  }
};
function buzz(p) { try { if (save.haptics && navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- gameplay renderer quality profiles ---------------- */
const RENDER_PROFILES = {
  low: {
    id: 'low', label: 'Low', targetFps: 30, dprCap: 1,
    fluidSamples: 7, particleScale: 0.45, glowStrength: 0.35,
    idleAnimations: false, celebrationIntensity: 0.45,
    settleMs: 70, streamGlow: false
  },
  normal: {
    id: 'normal', label: 'Normal', targetFps: 30, dprCap: 1.5,
    fluidSamples: 11, particleScale: 0.75, glowStrength: 0.75,
    idleAnimations: true, celebrationIntensity: 0.75,
    settleMs: 120, streamGlow: true
  },
  pretty: {
    id: 'pretty', label: 'Pretty', targetFps: 60, dprCap: 2,
    fluidSamples: 17, particleScale: 1, glowStrength: 1,
    idleAnimations: true, celebrationIntensity: 1,
    settleMs: 180, streamGlow: true
  }
};
const QUALITY_ORDER = ['low', 'normal', 'pretty'];
let renderQualityEffective = 'normal';
let renderQualityDemotionReason = '';
let renderQualityUser = save.renderQuality;
let fluidRuntimeReason = '';
let backgroundQualityEffective = 'hifi';
let activeBackgroundAsset = null;

const HIFI_BACKGROUNDS = {
  apothecaryLight: {
    cssVar: '--apo-hifi-bg',
    png: 'assets/background-suggestions/apothecary-sunlit-cabinet.png',
    avif960: 'assets/optimized/apothecary-sunlit-cabinet-960.avif',
    avif1365: 'assets/optimized/apothecary-sunlit-cabinet-1365.avif',
    webp960: 'assets/optimized/apothecary-sunlit-cabinet-960.webp',
    webp1365: 'assets/optimized/apothecary-sunlit-cabinet-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 246, 218, 0.16), transparent 74%)'
  },
  apothecaryDark: {
    cssVar: '--apo-hifi-bg',
    png: 'assets/background-suggestions/apothecary-moonlit-alchemy.png',
    avif960: 'assets/optimized/apothecary-moonlit-alchemy-960.avif',
    avif1365: 'assets/optimized/apothecary-moonlit-alchemy-1365.avif',
    webp960: 'assets/optimized/apothecary-moonlit-alchemy-960.webp',
    webp1365: 'assets/optimized/apothecary-moonlit-alchemy-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 184, 104, 0.10), transparent 72%)'
  },
  neon: {
    cssVar: '--neon-hifi-bg',
    png: 'assets/background-suggestions/neon-vaporwave-skyline.png',
    avif960: 'assets/optimized/neon-vaporwave-skyline-960.avif',
    avif1365: 'assets/optimized/neon-vaporwave-skyline-1365.avif',
    webp960: 'assets/optimized/neon-vaporwave-skyline-960.webp',
    webp1365: 'assets/optimized/neon-vaporwave-skyline-1365.webp',
    overlay: 'radial-gradient(74% 62% at 50% 44%, rgba(30, 18, 52, 0.12), transparent 70%)'
  },
  tidepool: {
    cssVar: '--tide-hifi-bg',
    png: 'assets/tidepool-hifi-backdrop.png',
    avif960: 'assets/optimized/tidepool-hifi-backdrop-960.avif',
    avif1365: 'assets/optimized/tidepool-hifi-backdrop-1365.avif',
    webp960: 'assets/optimized/tidepool-hifi-backdrop-960.webp',
    webp1365: 'assets/optimized/tidepool-hifi-backdrop-1365.webp',
    overlay: 'radial-gradient(78% 60% at 50% 40%, rgba(227, 255, 247, 0.12), transparent 72%)'
  }
};

function chooseAutoRenderQuality() {
  const area = innerWidth * innerHeight;
  const cores = navigator.hardwareConcurrency || 4;
  const touch = isTouchDevice();
  if (RM || save.lowPowerEffects) return 'low';
  if (touch) return 'normal';
  if (cores <= 4 || area < 520000) return 'low';
  if (cores <= 6 || area < 850000) return 'normal';
  return 'pretty';
}
function isTouchDevice() {
  return (navigator.maxTouchPoints || 0) > 1 || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}
function activeRenderProfile() {
  return RENDER_PROFILES[renderQualityEffective] || RENDER_PROFILES.normal;
}
function explicitPrettyEffects() {
  return !RM && save.renderQuality === 'pretty' && activeRenderProfile().id === 'pretty';
}
function prettyTidepoolEffects() {
  return SKIN === 'tidepool' && explicitPrettyEffects();
}
function resetFluidRuntime() {
  const p = activeRenderProfile();
  Fluid.N = p.fluidSamples;
  Fluid.runtimeEnabled = save.fluid !== false;
  fluidRuntimeReason = '';
  Fluid.resetAll();
}
function throttleFluidRuntime(reason) {
  if (!Fluid.enabled || !Fluid.runtimeEnabled || !['auto', 'normal'].includes(save.renderQuality)) return false;
  const lowSamples = RENDER_PROFILES.low.fluidSamples;
  if (Fluid.N > lowSamples) {
    Fluid.N = lowSamples;
    Fluid.resetAll();
    fluidRuntimeReason = reason || 'fluid samples reduced after slow frames';
    return true;
  }
  Fluid.runtimeEnabled = false;
  Fluid.resetAll();
  fluidRuntimeReason = reason || 'fluid motion paused after slow frames';
  return true;
}
function preferredBackgroundQuality() {
  const raw = (new URLSearchParams(location.search).get('background') || localStorage.getItem('vessel_background') || save.backgroundQuality || 'hifi').toLowerCase();
  return raw === 'basic' ? 'basic' : 'hifi';
}
function activeBackgroundKey() {
  if (SKIN === 'apothecary') return MODE === 'dark' ? 'apothecaryDark' : 'apothecaryLight';
  return SKIN === 'tidepool' ? 'tidepool' : 'neon';
}
function backgroundImageValue(asset) {
  return asset.overlay + ', image-set(' +
    'url("' + asset.avif960 + '") type("image/avif") 1x, ' +
    'url("' + asset.avif1365 + '") type("image/avif") 2x, ' +
    'url("' + asset.webp960 + '") type("image/webp") 1x, ' +
    'url("' + asset.webp1365 + '") type("image/webp") 2x, ' +
    'url("' + asset.png + '") type("image/png") 2x)';
}
function applyBackgroundQuality() {
  backgroundQualityEffective = preferredBackgroundQuality();
  activeBackgroundAsset = null;
  if (document.body) document.body.dataset.backgroundQuality = backgroundQualityEffective;
  ['--apo-hifi-bg', '--neon-hifi-bg', '--tide-hifi-bg'].forEach(name => document.documentElement.style.setProperty(name, 'none'));
  if (backgroundQualityEffective !== 'hifi') return;
  const asset = HIFI_BACKGROUNDS[activeBackgroundKey()];
  if (!asset) return;
  document.documentElement.style.setProperty(asset.cssVar, backgroundImageValue(asset));
  activeBackgroundAsset = Object.assign({ key: activeBackgroundKey() }, asset);
}
function applyRenderQuality(reason) {
  renderQualityUser = save.renderQuality;
  renderQualityEffective = save.renderQuality === 'auto' ? chooseAutoRenderQuality() : save.renderQuality;
  renderQualityDemotionReason = reason || (save.renderQuality === 'auto' ? 'auto device baseline' : '');
  const p = activeRenderProfile();
  if (document.body) document.body.dataset.renderQuality = renderQualityEffective;
  if (document.body) document.body.dataset.prettyExplicit = explicitPrettyEffects() ? 'true' : 'false';
  resetFluidRuntime();
  document.documentElement.style.setProperty('--render-glow', String(p.glowStrength));
  applyBackgroundQuality();
  if (renderer && renderer.setQuality) renderer.setQuality(renderQualityEffective);
  if (renderer && renderer.active === 'canvas2d' && renderer.backend.syncLayout) renderer.backend.syncLayout();
  if (state.length && slots.length) renderer.renderAll();
  if (!p.idleAnimations) stopAmbient();
  else if (document.body && document.body.dataset.screen === 'menu') startAmbient();
}
function demoteRenderQuality(reason) {
  const idx = QUALITY_ORDER.indexOf(renderQualityEffective);
  if (idx <= 0) return false;
  renderQualityEffective = QUALITY_ORDER[idx - 1];
  renderQualityDemotionReason = reason || ('frame time exceeded ' + activeRenderProfile().targetFps + ' FPS budget');
  const p = activeRenderProfile();
  if (document.body) document.body.dataset.renderQuality = renderQualityEffective;
  if (document.body) document.body.dataset.prettyExplicit = explicitPrettyEffects() ? 'true' : 'false';
  resetFluidRuntime();
  document.documentElement.style.setProperty('--render-glow', String(p.glowStrength));
  if (renderer && renderer.setQuality) renderer.setQuality(renderQualityEffective);
  if (renderer && renderer.active === 'canvas2d' && renderer.backend.syncLayout) renderer.backend.syncLayout();
  if (state.length && slots.length) renderer.renderAll();
  if (!p.idleAnimations) stopAmbient();
  return true;
}

/* ---------------- renderer-driven performance meter ---------------- */
const PerfMeter = (() => {
  const maxSamples = 180;
  const deltas = [];
  const lastTsMap = new Map();
  let droppedFrames = 0;
  let renderer = 'idle';
  let overlay = null;
  let overlayEnabled = false;
  let lastDemoteAt = 0;

  function rounded(n, digits) {
    const m = Math.pow(10, digits || 1);
    return Math.round(n * m) / m;
  }
  function stats() {
    const count = deltas.length;
    if (!count) return { avgFrameTime: 0, averageFrameTime: 0, averageFps: 0, p95FrameTime: 0 };
    const sum = deltas.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const sorted = deltas.slice().sort((a, b) => a - b);
    return {
      avgFrameTime: rounded(avg, 1),
      averageFrameTime: rounded(avg, 1),
      averageFps: rounded(1000 / avg, 1),
      p95FrameTime: rounded(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], 1)
    };
  }
  function qualityProfile() {
    try { return activeRenderProfile().id; }
    catch (e) { return 'unknown'; }
  }
  function targetFps() { return activeRenderProfile().targetFps; }
  function targetFrameMs() { return 1000 / targetFps(); }
  function maybeDemote(s, ts) {
    if (!['auto', 'normal'].includes(save.renderQuality) || deltas.length < 45 || ts - lastDemoteAt < 5000) return;
    const profile = activeRenderProfile();
    const budget = 1000 / profile.targetFps;
    const unhealthy = s.p95FrameTime > budget * 1.55 || s.averageFrameTime > budget * 1.25;
    if (unhealthy && save.renderQuality === 'auto' && demoteRenderQuality(profile.id + ' exceeded frame budget: avg ' + s.averageFrameTime + 'ms, p95 ' + s.p95FrameTime + 'ms')) {
      lastDemoteAt = ts;
      deltas.length = 0;
    } else if (unhealthy && throttleFluidRuntime('fluid reduced after frame budget miss: avg ' + s.averageFrameTime + 'ms, p95 ' + s.p95FrameTime + 'ms')) {
      lastDemoteAt = ts;
      deltas.length = 0;
    }
  }
  function ensureOverlay() {
    if (overlay || !document.body) return overlay;
    overlay = document.createElement('pre');
    overlay.id = 'perf-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;border-radius:10px;background:rgba(8,12,20,.82);color:#dff;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.28);white-space:pre;text-align:left';
    document.body.appendChild(overlay);
    return overlay;
  }
  function paintOverlay(snapshot) {
    if (!overlayEnabled) return;
    const el = ensureOverlay();
    if (!el) return;
    el.textContent = [
      'Vessel perf',
      'renderer: ' + snapshot.currentRenderer,
      'fps: ' + snapshot.averageFps + ' / ' + snapshot.targetFps,
      'frame avg/p95: ' + snapshot.averageFrameTime + ' / ' + snapshot.p95FrameTime + ' ms',
      'dropped: ' + snapshot.droppedFrames,
      'dpr: ' + snapshot.dpr,
      'quality: ' + snapshot.qualityProfile,
      'demote: ' + (snapshot.autoDemotionReason || 'â€”')
    ].join('\n');
  }
  const api = {
    mark(frameRenderer, now) {
      const ts = typeof now === 'number' ? now : performance.now();
      renderer = frameRenderer || renderer || 'unknown';
      const lastTs = lastTsMap.get(renderer) || 0;
      if (lastTs) {
        const delta = ts - lastTs;
        if (delta > 0 && delta < 250) {
          deltas.push(delta);
          if (deltas.length > maxSamples) deltas.shift();
          const budget = targetFrameMs();
          if (delta > budget * 1.5) droppedFrames += Math.max(1, Math.round(delta / budget) - 1);
        }
      }
      lastTsMap.set(renderer, ts);
      const snap = api.snapshot();
      maybeDemote(snap, ts);
      paintOverlay(api.snapshot());
    },
    reset() { deltas.length = 0; lastTsMap.clear(); droppedFrames = 0; renderer = 'idle'; paintOverlay(api.snapshot()); },
    enableOverlay(on) {
      overlayEnabled = on !== false;
      if (overlayEnabled) paintOverlay(api.snapshot());
      else if (overlay) overlay.remove(), overlay = null;
    },
    snapshot() {
      const s = stats();
      return {
        averageFps: s.averageFps,
        avgFrameTime: s.avgFrameTime,
        averageFrameTime: s.averageFrameTime,
        p95FrameTime: s.p95FrameTime,
        droppedFrames,
        currentRenderer: renderer,
        targetFps: targetFps(),
        dpr: rounded(Math.min(window.devicePixelRatio || 1, activeRenderProfile().dprCap), 2),
        qualityProfile: qualityProfile(),
        renderQuality: renderQualityEffective,
        renderQualitySetting: save.renderQuality,
        autoDemotionReason: renderQualityDemotionReason,
        sampleCount: deltas.length,
        overlayEnabled
      };
    }
  };
  if (/[?&]perf=1(?:&|$)/.test(location.search)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.enableOverlay(true), { once: true });
    else api.enableOverlay(true);
  }
  return api;
})();

const FrameGate = (() => {
  const last = new Map();
  function frameMs(fps) { return 1000 / (fps || activeRenderProfile().targetFps || 60); }
  return {
    reset(key) { if (key) last.delete(key); else last.clear(); },
    remaining(key, now, fps) {
      const prev = last.get(key) || 0;
      if (!prev) return 0;
      return Math.max(0, frameMs(fps) - (now - prev));
    },
    note(key, now) { last.set(key, now); },
    request(key, cb, fps) {
      const now = performance.now();
      const delay = this.remaining(key, now, fps);
      return setTimeout(() => requestAnimationFrame(ts => {
        this.note(key, ts);
        cb(ts);
      }), delay);
    }
  };
})();

function tween(dur, fn) {
  return new Promise(res => {
    if (RM || dur <= 0) { fn(1); return res(); }
    const t0 = performance.now();
    const key = 'tween-' + Math.random().toString(36).slice(2);
    FrameGate.reset(key);
    (function step(now) {
      PerfMeter.mark('dom-tween', now);
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      fn(e);
      if (p < 1) FrameGate.request(key, step);
      else { FrameGate.reset(key); res(); }
    })(t0);
  });
}

/* ---------------- shared SVG defs (theme-aware, rebuildable) ---------------- */
function buildDefs() {
  const old = document.getElementById('vessel-defs');
  if (old) old.remove();
  const neon = SKIN === 'neon';
  const svg = svgEl('svg', { id: 'vessel-defs', width: 0, height: 0, style: 'position:absolute' });
  const defs = svgEl('defs', {});
  function liquidGrad(id, light, dark) {
    const g = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 });
    g.appendChild(svgEl('stop', { offset: '0', 'stop-color': dark }));
    g.appendChild(svgEl('stop', { offset: '0.3', 'stop-color': light }));
    g.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': light }));
    g.appendChild(svgEl('stop', { offset: '0.7', 'stop-color': light }));
    g.appendChild(svgEl('stop', { offset: '1', 'stop-color': dark }));
    defs.appendChild(g);
  }
  COLORS.forEach((c, i) => liquidGrad('liq' + i, c[0], c[1]));
  liquidGrad('liqH', HIDDEN_FILL[0], HIDDEN_FILL[1]);

  const hl = svgEl('linearGradient', { id: 'hlGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  hl.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.9 }));
  hl.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': 0.05 }));
  defs.appendChild(hl);
  /* glass interior backing â€” warm for apothecary, cool for neon */
  const backTint = neon ? '#7fd0ff' : '#ffe9c8';
  const gb = svgEl('linearGradient', { id: 'glassBack', x1: 0, y1: 0, x2: 0, y2: 1 });
  gb.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': 0.12 }));
  gb.appendChild(svgEl('stop', { offset: '0.6', 'stop-color': '#ffffff', 'stop-opacity': 0.04 }));
  gb.appendChild(svgEl('stop', { offset: '1', 'stop-color': backTint, 'stop-opacity': neon ? 0.14 : 0.16 }));
  defs.appendChild(gb);
  /* cylindrical depth over the liquid: dark edges, clear centre */
  const gs = svgEl('linearGradient', { id: 'glassSide', x1: 0, y1: 0, x2: 1, y2: 0 });
  const edge = neon ? 0.34 : 0.30;
  [['0', edge], ['0.16', 0.05], ['0.5', 0], ['0.84', edge * 0.3], ['1', edge + 0.06]].forEach(([o, a]) =>
    gs.appendChild(svgEl('stop', { offset: o, 'stop-color': GLASS_SHADOW, 'stop-opacity': a })));
  defs.appendChild(gs);
  const shn = svgEl('linearGradient', { id: 'sheenGrad', x1: 0, y1: 0, x2: 1, y2: 0 });
  shn.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0 }));
  shn.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': '#fff', 'stop-opacity': neon ? 0.5 : 0.34 }));
  shn.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': 0 }));
  defs.appendChild(shn);
  const lipG = svgEl('linearGradient', { id: 'lipGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  lipG.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.55 }));
  lipG.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': 0.12 }));
  defs.appendChild(lipG);
  /* cork (vertical wood gradient) */
  const ck = svgEl('linearGradient', { id: 'corkGrad', x1: 0, y1: 0, x2: 1, y2: 0 });
  ck.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#c79a5e' }));
  ck.appendChild(svgEl('stop', { offset: '0.42', 'stop-color': '#a9763f' }));
  ck.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#7c5026' }));
  defs.appendChild(ck);
  /* parchment label */
  const lb = svgEl('linearGradient', { id: 'lblGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  lb.appendChild(svgEl('stop', { offset: '0', 'stop-color': MODE === 'dark' ? '#e8dcc2' : '#f7ecd3' }));
  lb.appendChild(svgEl('stop', { offset: '1', 'stop-color': MODE === 'dark' ? '#d8c8a6' : '#e9d6b0' }));
  defs.appendChild(lb);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

let uid = 0;
function buildBottleSVG(shapeName, opts) {
  opts = opts || {};
  const sh = SHAPES[shapeName];
  const id = 'vclip' + (uid++);
  const svg = svgEl('svg', { viewBox: '0 0 100 ' + sh.vbH });
  const defs = svgEl('defs', {});
  const clip = svgEl('clipPath', { id });
  clip.appendChild(svgEl('path', { d: sh.interior }));
  defs.appendChild(clip);
  svg.appendChild(defs);
  svg.appendChild(svgEl('path', { d: sh.interior, fill: 'url(#glassBack)' }));
  const liquids = svgEl('g', { 'clip-path': 'url(#' + id + ')' });
  liquids.setAttribute('class', 'liquids');
  svg.appendChild(liquids);
  /* cylinder shading sits over the liquid, under the gloss */
  svg.appendChild(svgEl('path', { d: sh.interior, fill: 'url(#glassSide)', 'pointer-events': 'none' }));
  /* roaming sheen, clipped to the interior, desynced per bottle */
  if (!RM) {
    const sheenWrap = svgEl('g', { 'clip-path': 'url(#' + id + ')' });
    const sheen = svgEl('rect', { x: -20, y: -20, width: 30, height: sh.vbH + 40, fill: 'url(#sheenGrad)' });
    sheen.setAttribute('class', 'sheenmove');
    sheen.style.animationDelay = (-Math.random() * 8).toFixed(2) + 's';
    sheenWrap.appendChild(sheen);
    svg.appendChild(sheenWrap);
  }
  /* parchment label â€” always built when requested; CSS hides it on Neon
     (so a runtime Apothecaryâ†’Neon switch can't leave a stale label behind) */
  if (opts.label && sh.label) {
    svg.appendChild(buildLabel(sh.label));
  }
  const gloss = svgEl('g', {});
  (sh.gloss || []).forEach(r =>
    gloss.appendChild(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.rx, fill: 'url(#hlGrad)', opacity: r.o })));
  gloss.appendChild(svgEl('path', { d: sh.outline, fill: 'none', stroke: RIM_COLOR, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  /* bottom rim light */
  const bb = sh.box;
  gloss.appendChild(svgEl('path', {
    d: 'M' + (bb[0] + 9) + ',' + (bb[3] - 4) + ' Q50,' + (bb[3] + 5) + ' ' + (bb[1] - 9) + ',' + (bb[3] - 4),
    fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 4, 'stroke-linecap': 'round'
  }));
  const lip = sh.lip;
  gloss.appendChild(svgEl('rect', { x: lip.x, y: lip.y, width: lip.w, height: lip.h, rx: lip.rx, fill: 'url(#lipGrad)', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 1.4 }));
  gloss.appendChild(svgEl('ellipse', { cx: 50, cy: lip.mouthCy, rx: lip.mouthRx, ry: lip.mouthRy, fill: 'rgba(10,14,36,0.55)' }));
  if (sh.sparkle) sh.sparkle.forEach(([x, y], k) => {
    const s = svgEl('path', { d: 'M' + x + ',' + (y - 4) + ' L' + (x + 1.4) + ',' + (y - 1.4) + ' L' + (x + 4) + ',' + y + ' L' + (x + 1.4) + ',' + (y + 1.4) + ' L' + x + ',' + (y + 4) + ' L' + (x - 1.4) + ',' + (y + 1.4) + ' L' + (x - 4) + ',' + y + ' L' + (x - 1.4) + ',' + (y - 1.4) + ' Z', fill: '#fff', opacity: 0.8 });
    s.setAttribute('class', 'twinkle t' + (k % 3));
    gloss.appendChild(s);
  });
  svg.appendChild(gloss);
  /* cork stopper â€” drawn last so it plugs the mouth opening (over the lip + the
     dark mouth ellipse) instead of floating above a visible hole. Hidden on Neon via CSS. */
  if (opts.cork && sh.cork) {
    svg.appendChild(buildCork(sh.cork));
  }
  return svg;
}

function buildLabel(L) {
  const g = svgEl('g', { opacity: 0.96, class: 'label-g' });
  const cx = L.x + L.w / 2;
  g.appendChild(svgEl('rect', { x: L.x, y: L.y, width: L.w, height: L.h, rx: L.rx,
    fill: 'url(#lblGrad)', stroke: 'rgba(120,90,55,0.35)', 'stroke-width': 0.8 }));
  g.appendChild(svgEl('circle', { cx, cy: L.y + 12, r: 5, fill: 'none', stroke: '#9a6a32', 'stroke-width': 0.9, opacity: 0.7 }));
  g.appendChild(svgEl('circle', { cx, cy: L.y + 12, r: 1.8, fill: '#9a6a32', opacity: 0.6 }));
  for (let i = 0; i < 3; i++)
    g.appendChild(svgEl('line', { x1: L.x + 7, y1: L.y + 26 + i * 6, x2: L.x + L.w - 7, y2: L.y + 26 + i * 6,
      stroke: 'rgba(120,90,55,0.4)', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: 0.8 - i * 0.18 }));
  return g;
}

function buildCork(c) {
  const g = svgEl('g', { class: 'cork-g' });
  g.appendChild(svgEl('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: c.r,
    fill: 'url(#corkGrad)', stroke: 'rgba(90,55,25,0.5)', 'stroke-width': 1 }));
  g.appendChild(svgEl('ellipse', { cx: c.x + c.w / 2, cy: c.y + 2.5, rx: (c.w - 5) / 2, ry: 2.4,
    fill: '#caa06a', stroke: 'rgba(90,55,25,0.4)', 'stroke-width': 0.7 }));
  [0.45, 0.72].forEach(f =>
    g.appendChild(svgEl('line', { x1: c.x + 3, y1: c.y + c.h * f, x2: c.x + c.w - 3, y2: c.y + c.h * f,
      stroke: 'rgba(90,55,25,0.28)', 'stroke-width': 0.7 })));
  return g;
}

/* ---------------- game state ---------------- */
let level = 1, difficulty = save.difficulty || 'normal';
let mode = 'classic';            /* classic | daily | rush */
let rushStage = 1, rushTimeLeft = 0, rushTicker = null, rushNextT = null;
let usedHint = false, usedAuto = false, autoPlaying = false;
let undosUsed = 0, perfectStreak = 0;
let pendingLayout = false;
let state = [], visual = [], par = 0, undosAllowed = Infinity, undosLeft = Infinity;
let moves = 0, undoHistory = [], sel = null, activePours = 0;
let shapesByBottle = [], hiddenDepth = [], veiled = [];
let frozen = new Set();
let needCaps = 0;
const locked = new Set();
let ELEMENT_MAP = {};
let slots = [];
let focusedBottle = 0;
let showBottleKeyboardFocus = false;

function mergeRuns(bottle) {
  const out = [];
  for (const c of bottle) {
    if (out.length && out[out.length - 1].c === c) out[out.length - 1].u++;
    else out.push({ c, u: 1 });
  }
  return out;
}

/* ---- volume-realistic liquid heights ---- */
function shapeWidthAt(sn, y) {
  if (sn === 'classic') {
    if (y <= 54) return 24;
    if (y <= 84) return 24 + (y - 54) / 30 * 32;
    if (y <= 204) return 56;
    return Math.max(4, 56 - (y - 204) / 17 * 36);
  } else if (sn === 'tall') {
    if (y <= 50) return 20;
    if (y <= 74) return 20 + (y - 50) / 24 * 20;
    if (y <= 286) return 40;
    return Math.max(4, 40 - (y - 286) / 15 * 30);
  } else if (sn === 'flask') {
    if (y <= 131) return 16;
    const dy = y - 170.2;
    return 2 * Math.sqrt(Math.max(0, 1600 - dy * dy));
  }
  return 50;
}

function buildVolMap(sn, sh) {
  const N = 400, yB = sh.B, yT = sh.T, step = (yB - yT) / N;
  const ys = [], cv = [0];
  for (let k = 0; k <= N; k++) {
    const y = yB - k * step;
    ys.push(y);
    if (k > 0) cv.push(cv[k - 1] + (shapeWidthAt(sn, ys[k - 1]) + shapeWidthAt(sn, y)) * 0.5 * step);
  }
  const tot = cv[N];
  return function(frac) {
    if (frac <= 0) return yB;
    if (frac >= 1) return yT;
    const target = frac * tot;
    let lo = 0, hi = N;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cv[m] <= target) lo = m; else hi = m; }
    return ys[lo] + ((target - cv[lo]) / (cv[hi] - cv[lo])) * (ys[hi] - ys[lo]);
  };
}

/* ---- liquid element visual effects ---- */
const ELEM_TYPES = ['frozen', 'electric', 'boiling', 'toxic'];
function buildElementMap(gen) {
  /* overlays render under reduced motion too â€” the CSS freezes their animations */
  ELEMENT_MAP = {};
  const stateHash = gen.state.reduce((s, b, i) => (s ^ b.reduce((x, c) => (x * 31 + c) | 0, i * 997)) | 0, 0);
  const rng = window.mulberry32(((stateHash >>> 0) ^ (gen.par * 1234567)) >>> 0);
  for (let c = 0; c < gen.colors; c++) {
    if (rng() < 0.45) ELEMENT_MAP[c] = ELEM_TYPES[Math.floor(rng() * ELEM_TYPES.length)];
    else rng(); // consume RNG slot
  }
  /* every board features at least one element */
  if (!Object.keys(ELEMENT_MAP).length && gen.colors > 0) {
    ELEMENT_MAP[Math.floor(rng() * gen.colors)] = ELEM_TYPES[Math.floor(rng() * ELEM_TYPES.length)];
  }
}

function appendElemOverlay(g, elem, y, h, px) {
  if (elem === 'frozen') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(190,235,255,0.30)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-frozen');
    g.appendChild(ov);
    for (let k = 0; k < 3; k++) {
      const sx = px - 16 + k * 16, sy = y + h * (0.2 + k * 0.3);
      const cross = svgEl('path', {
        d: `M${sx},${sy - 5} L${sx},${sy + 5} M${sx - 5},${sy} L${sx + 5},${sy} M${sx - 3.5},${sy - 3.5} L${sx + 3.5},${sy + 3.5} M${sx + 3.5},${sy - 3.5} L${sx - 3.5},${sy + 3.5}`,
        stroke: 'rgba(220,250,255,0.95)', 'stroke-width': 1.2, fill: 'none', 'pointer-events': 'none'
      });
      cross.setAttribute('class', 'elem-frozen');
      cross.style.animationDelay = (-k * 1.07).toFixed(2) + 's';
      g.appendChild(cross);
    }
  } else if (elem === 'electric') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(140,255,248,0.20)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-electric');
    g.appendChild(ov);
    const zx = px - 5, zy = y + 3, zd = h - 6, steps = 6;
    let d = `M${zx},${zy}`;
    for (let k = 0; k < steps; k++) d += ` L${zx + (k % 2 === 0 ? 10 : -10)},${zy + (k + 1) * zd / steps}`;
    const bolt = svgEl('path', { d, fill: 'none', stroke: 'rgba(220,255,255,0.95)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' });
    bolt.setAttribute('class', 'elem-electric');
    bolt.style.animationDelay = '-0.7s';
    g.appendChild(bolt);
  } else if (elem === 'boiling') {
    for (let k = 0; k < 4; k++) {
      const bub = svgEl('circle', {
        cx: px - 15 + k * 10, cy: y + h - 4, r: 3.2 - k * 0.4, fill: 'rgba(255,255,255,0.65)', 'pointer-events': 'none'
      });
      bub.setAttribute('class', 'elem-boil b' + (k % 3));
      g.appendChild(bub);
    }
  } else if (elem === 'toxic') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(80,255,120,0.26)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-toxic');
    g.appendChild(ov);
    const glow = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'none', stroke: 'rgba(120,255,160,0.5)', 'stroke-width': 3, 'pointer-events': 'none' });
    glow.setAttribute('class', 'elem-toxic');
    glow.style.animationDelay = '-1.25s';
    g.appendChild(glow);
    const skull = svgEl('text', {
      x: px + 14, y: y + h / 2 + 4, 'text-anchor': 'middle', 'font-size': 10,
      fill: 'rgba(180,255,200,0.9)', 'pointer-events': 'none'
    });
    skull.textContent = 'â˜ ';
    skull.setAttribute('class', 'elem-toxic');
    g.appendChild(skull);
  }
}

/* ============================================================
   Liquid simulation â€” per-bottle 1-D shallow-water surface.
   Each active bottle keeps a height-field (offsets + velocities)
   across its width. A single rAF loop integrates every sim with
   wave propagation + damping so disturbances *settle* instead of
   looping, then rewrites the top surface <path> for that bottle.
   The static colour bands below come from renderBottle; this only
   animates the meniscus/surface. Falls back to a plain ellipse
   when reduced-motion is on or liquid motion is disabled.
   ============================================================ */
const Fluid = {
  enabled: true,
  runtimeEnabled: true,
  N: 15,                 /* samples across the surface */
  AMP: 3.1,              /* max wave offset (viewBox units) */
  MENISCUS: 2.4,         /* wall climb */
  sims: {},              /* index -> { h, v } */
  running: false,
  active() { return this.enabled && this.runtimeEnabled && !RM; },
  hasSims() { for (const i in this.sims) return true; return false; },
  get(i) {
    let s = this.sims[i];
    if (!s) { s = this.sims[i] = { h: new Float32Array(this.N), v: new Float32Array(this.N) }; }
    return s;
  },
  reset(i) { delete this.sims[i]; },
  sample(i) { return this.sims[i] || null; },
  resetAll() { this.sims = {}; },
  /* tilt-style slosh: push one wall up, the other down (dir in [-1,1]) */
  slosh(i, mag, dir) {
    if (!this.active()) return;
    const s = this.get(i), n = this.N;
    dir = dir == null ? (Math.random() < 0.5 ? -1 : 1) : dir;
    for (let k = 0; k < n; k++) {
      const x = (k / (n - 1)) * 2 - 1;     /* -1..1 across width */
      s.v[k] += mag * dir * x;
    }
  },
  /* a splash dropped into the centre â€” a dip that ripples outward */
  drop(i, mag) {
    if (!this.active()) return;
    const s = this.get(i), n = this.N, c = (n - 1) / 2;
    for (let k = 0; k < n; k++) {
      const d = (k - c) / c;
      s.v[k] += mag * Math.exp(-d * d * 5);
    }
  },
  step(dt) {
    const C = 220, DAMP = 2.6, REST = 9, n = this.N, cap = this.AMP;
    const settled = [];
    for (const i in this.sims) {
      const s = this.sims[i], h = s.h, v = s.v;
      let energy = 0;
      for (let k = 0; k < n; k++) {
        const hl = h[k > 0 ? k - 1 : 0], hr = h[k < n - 1 ? k + 1 : n - 1];
        const lap = hl - 2 * h[k] + hr;
        v[k] += (C * lap - REST * h[k] - DAMP * v[k]) * dt;
      }
      for (let k = 0; k < n; k++) {
        h[k] += v[k] * dt;
        if (h[k] > cap) { h[k] = cap; v[k] *= -0.3; }
        else if (h[k] < -cap) { h[k] = -cap; v[k] *= -0.3; }
        energy += h[k] * h[k] + v[k] * v[k] * 0.01;
      }
      if (energy < 0.002) settled.push(i);   /* settled â€” drop it from the loop */
    }
    for (const i of settled) this.reset(i);
  },
  /* build the surface <path> d-string for bottle i at mean surface y */
  pathFor(i, surfY, halfW, bottomY) {
    const s = this.sample(i), n = this.N;
    const left = 50 - halfW, right = 50 + halfW, span = right - left;
    let d = 'M' + left.toFixed(1) + ',' + (bottomY).toFixed(1) +
            ' L' + left.toFixed(1) + ',' + (surfY + (s ? s.h[0] : 0)).toFixed(2);
    for (let k = 0; k < n; k++) {
      const x = left + (k / (n - 1)) * span;
      const edge = Math.abs((k / (n - 1)) * 2 - 1);          /* 0 centre â†’ 1 wall */
      const men = -this.MENISCUS * Math.pow(edge, 2.2);       /* climb up near walls */
      const y = surfY + (s ? s.h[k] : 0) + men;
      d += ' L' + x.toFixed(1) + ',' + y.toFixed(2);
    }
    d += ' L' + right.toFixed(1) + ',' + (bottomY).toFixed(1) + ' Z';
    return d;
  },
  start() {
    if (this.running || !this.hasSims()) return;
    this.running = true;
    let last = performance.now();
    const key = 'fluid';
    FrameGate.reset(key);
    const loop = (now) => {
      if (!this.running) return;
      if (document.hidden) { last = now; FrameGate.request(key, loop); return; }
      PerfMeter.mark(isCanvasMode() ? 'canvas-fluid' : 'svg-fluid', now);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05;                               /* clamp after stalls */
      /* sub-step for stability */
      const sub = 2; dt /= sub;
      for (let s = 0; s < sub; s++) this.step(dt);
      /* paint: SVG rewrites surface paths; Canvas reads samples during render. */
      if (isCanvasMode()) {
        renderer.renderAll();
      } else {
        for (let i = 0; i < slots.length; i++) {
          const sl = slots[i]; if (!sl || !sl.surf) continue;
          const m = sl.surf;
          const d = this.pathFor(i, m.surfY, m.halfW, m.bottomY);
          m.path.setAttribute('d', d);
          if (m.crest) m.crest.setAttribute('d', this.crestFor(i, m.surfY, m.halfW));
        }
      }
      if (!this.hasSims()) { this.running = false; FrameGate.reset(key); return; }
      FrameGate.request(key, loop);
    };
    FrameGate.request(key, loop);
  },
  crestFor(i, surfY, halfW) {
    const s = this.sample(i), n = this.N;
    const left = 50 - halfW, span = 2 * halfW;
    let d = '';
    for (let k = 0; k < n; k++) {
      const x = left + (k / (n - 1)) * span;
      const edge = Math.abs((k / (n - 1)) * 2 - 1);
      const y = surfY + (s ? s.h[k] : 0) - this.MENISCUS * Math.pow(edge, 2.2) + 0.4;
      d += (k ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(2);
    }
    return d;
  }
};


/* ---------------- liquid rendering (gravity-true) ----------------
   The liquid group is counter-rotated against the bottle's tilt, so
   bands and surfaces stay horizontal in world space; the interior
   clip (in bottle space) shapes the pool. */
const SvgRenderer = {
  backend: 'svg',
  beginPour(info) {
    const fx = $('#fx');
    const { si, c0, c1, sx, sy, tx, ty, cpx, cpy, side, receiverW } = info;
    const arcD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    const pourSVG = document.createElementNS(NS, 'svg');
    pourSVG.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:71';
    const gid = 'ps_' + si;
    const pdefs = document.createElementNS(NS, 'defs');
    const pgrad = document.createElementNS(NS, 'linearGradient');
    pgrad.setAttribute('id', gid); pgrad.setAttribute('gradientUnits', 'userSpaceOnUse');
    pgrad.setAttribute('x1', sx); pgrad.setAttribute('y1', sy);
    pgrad.setAttribute('x2', tx); pgrad.setAttribute('y2', ty);
    [[0, c0], [1, c1]].forEach(([off, col]) => {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', off); stop.setAttribute('stop-color', col);
      pgrad.appendChild(stop);
    });
    pdefs.appendChild(pgrad); pourSVG.appendChild(pdefs);
    const mkPath = (stroke, width, opacity, blur) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', arcD); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', width);
      path.setAttribute('stroke-linecap', 'round');
      if (opacity !== undefined) path.setAttribute('opacity', opacity);
      if (blur) path.style.filter = 'blur(' + blur + 'px)';
      return path;
    };
    if (activeRenderProfile().streamGlow) pourSVG.appendChild(mkPath(c0, 9, 0.28 * activeRenderProfile().glowStrength, 3));
    pourSVG.appendChild(mkPath('url(#' + gid + ')', 5));
    pourSVG.appendChild(mkPath('rgba(255,255,255,0.4)', 1.6));
    fx.appendChild(pourSVG);
    let steamEl = null;
    if (!RM && SKIN === 'apothecary') {
      steamEl = document.createElement('div');
      steamEl.className = 'steam-wisp';
      steamEl.style.left = (sx - 7 + side * 6) + 'px';
      steamEl.style.top = (sy - 30) + 'px';
      fx.appendChild(steamEl);
    }
    const rippleEls = [];
    if (!RM) {
      for (let r = 0; r < 2; r++) {
        const rip = document.createElement('div');
        rip.className = 'pour-ripple';
        rip.style.cssText = `width:${receiverW * 0.48}px;height:${receiverW * 0.15}px;border-color:${c0};` +
          `left:${tx}px;top:${ty}px;animation-delay:${r * 0.24}s`;
        fx.appendChild(rip);
        rippleEls.push(rip);
      }
      Fluid.drop(info.di, -1.8);
      Fluid.start();
    }
    const dropTimer = (!explicitPrettyEffects()) ? null : setInterval(() => {
      const d = document.createElement('span');
      d.className = 'droplet';
      d.style.background = c0;
      d.style.boxShadow = '0 0 6px ' + c0 + '88';
      d.style.left = (tx + (Math.random() * 14 - 7)).toFixed(1) + 'px';
      d.style.top = ty.toFixed(1) + 'px';
      d.style.setProperty('--dx', (Math.random() * 44 - 22).toFixed(0) + 'px');
      d.style.setProperty('--dy', (-(10 + Math.random() * 30)).toFixed(0) + 'px');
      fx.appendChild(d);
      setTimeout(() => d.remove(), 600);
    }, 120);
    const spawnPearlBubble = () => {
      const b = document.createElement('span');
      b.className = 'pearl-bubble';
      b.style.left = (tx + (Math.random() * receiverW * 0.32 - receiverW * 0.16)).toFixed(1) + 'px';
      b.style.top = (ty + receiverW * (0.02 + Math.random() * 0.12)).toFixed(1) + 'px';
      b.style.setProperty('--dx', (Math.random() * 22 - 11).toFixed(0) + 'px');
      b.style.setProperty('--dy', (-(24 + Math.random() * 34)).toFixed(0) + 'px');
      fx.appendChild(b);
      setTimeout(() => b.remove(), 1000);
    };
    let bubbleTimer = null;
    if (prettyTidepoolEffects()) {
      spawnPearlBubble();
      bubbleTimer = setInterval(spawnPearlBubble, 180);
    }
    if (!this.pourFxMap) this.pourFxMap = new Map();
    this.pourFxMap.set(si, { pourSVG, steamEl, rippleEls, dropTimer, bubbleTimer });
  },
  updatePour() {},
  endPour(info) {
    if (!this.pourFxMap) return;
    const fx = this.pourFxMap.get(info && info.si);
    if (!fx) return;
    if (fx.dropTimer) clearInterval(fx.dropTimer);
    if (fx.bubbleTimer) clearInterval(fx.bubbleTimer);
    if (fx.pourSVG) fx.pourSVG.remove();
    if (fx.steamEl) fx.steamEl.remove();
    fx.rippleEls.forEach(e => e.remove());
    this.pourFxMap.delete(info.si);
  },
  renderBottle(i, opts = {}) {
    const tiltDeg = typeof opts === 'number' ? opts : (opts.tiltDeg || 0);
    const wob = typeof opts === 'object' ? opts.wob : null;
    const slot = slots[i];
    const sh = slot.sh;
    const segs = visual[i];
    const g = slot.liquidGroup;
    while (g.firstChild) g.removeChild(g.firstChild);
    const t = tiltDeg || 0;
    const a = t * Math.PI / 180;
    const px = 50, py = sh.vbH / 2;
    const inner = svgEl('g', t ? { transform: 'rotate(' + (-t).toFixed(2) + ' ' + px + ' ' + py + ')' } : {});

    /* lowest interior point in world space */
    let low = sh.B;
    if (t) {
      const cs = Math.cos(a), sn = Math.sin(a);
      low = -1e9;
      const [xl, xr, yt, yb] = sh.box;
      [[xl, yt], [xr, yt], [xl, yb], [xr, yb]].forEach(([x, y]) => {
        const wy = py + sn * (x - px) + cs * (y - py);
        if (wy > low) low = wy;
      });
      low -= 2;
    }
    const hUnit = sh.unit * (0.55 + 0.45 * Math.cos(a));
    const fade = Math.max(0, 1 - Math.abs(t) / 32);

    const shapeName = shapesByBottle[i];
    const WAVECUT = Fluid.AMP + Fluid.MENISCUS + 1;
    const waveMode = !t && Fluid.active() && !locked.has(i);
    const lastSeg = segs.length ? segs[segs.length - 1] : null;
    let topWave = null;

    let cum = 0;
    const ellipses = [];
    for (const seg of segs) {
      if (seg.u <= 0.01) continue;
      let y, h;
      if (!t && sh.volToY) {
        const yBot = sh.volToY(cum / 4);
        const yTop = sh.volToY((cum + seg.u) / 4);
        y = yTop; h = yBot - yTop;
      } else {
        h = seg.u * hUnit;
        y = low - (cum + seg.u) * hUnit;
      }
      let rectY = y, rectH = h;
      /* the top band's flat lid becomes the animated wave surface */
      if (seg === lastSeg && waveMode && h > WAVECUT + 6) {
        rectY = y + WAVECUT; rectH = h - WAVECUT;
        topWave = { surfY: y, bottomY: rectY, c: seg.c };
      }
      inner.appendChild(svgEl('rect', { x: -160, y: rectY, width: 420, height: rectH + 1.4, fill: 'url(#liq' + seg.c + ')' }));
      if (!t && ELEMENT_MAP[seg.c]) appendElemOverlay(inner, ELEMENT_MAP[seg.c], y, h, px);
      if (save.symbols && fade > 0.3 && seg.u >= 0.8) {
        const gl = svgEl('text', {
          x: px, y: y + h / 2 + 5, 'text-anchor': 'middle',
          'font-size': 13, fill: 'rgba(255,255,255,0.85)', opacity: fade,
          style: 'paint-order:stroke; stroke:rgba(0,0,0,0.25); stroke-width:2px;'
        });
        gl.textContent = COLOR_GLYPHS[seg.c];
        inner.appendChild(gl);
      }
      if (fade > 0.04) ellipses.push({ y, c: seg.c });
      cum += seg.u;
    }
    /* Fake-3D meniscus cue: a single concave-arc highlight on the topmost visible
       liquid when fluid animation is off. Walls rise, centre dips â€” matching the
       settled shape of Fluid.crestFor() so the static and animated states look
       identical. No dark lines; no per-band cost.
       Uses shapeWidthAt (same as the fluid code) so the arc never exceeds the
       interior clip â€” fixes flask neck / nearly-full bottle cases. */
    if (ellipses.length && !topWave) {
      const e = ellipses[ellipses.length - 1];
      const wdy = wob ? wob.dy : 0;
      const halfW = Math.max(5, shapeWidthAt(shapeName, e.y) / 2);
      const MEN = Fluid.MENISCUS;
      const sy = e.y + wdy + 0.4;          /* +0.4 matches crestFor baseline offset */
      inner.appendChild(svgEl('path', {
        d: `M${(px - halfW).toFixed(1)},${(sy - MEN).toFixed(2)} Q${px},${(sy + MEN).toFixed(2)} ${(px + halfW).toFixed(1)},${(sy - MEN).toFixed(2)}`,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.7)', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        opacity: fade
      }));
    }

    /* animated wave surface for the top band */
    if (topWave) {
      const halfW = Math.max(5, shapeWidthAt(shapeName, topWave.surfY) / 2);
      const path = svgEl('path', { fill: 'url(#liq' + topWave.c + ')', d: Fluid.pathFor(i, topWave.surfY, halfW, topWave.bottomY) });
      inner.appendChild(path);
      const crest = svgEl('path', { d: Fluid.crestFor(i, topWave.surfY, halfW), fill: 'none',
        stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      inner.appendChild(crest);
      slot.surf = { path, crest, surfY: topWave.surfY, halfW, bottomY: topWave.bottomY };
      Fluid.start();
    } else {
      slot.surf = null;
    }

    /* mystery overlay: unit bands counted from the bottom */
    const hid = hiddenDepth[i] || 0;
    for (let u = 0; u < hid && u < cum; u++) {
      let hy, hh;
      if (!t && sh.volToY) {
        const hBot = sh.volToY(u / 4);
        const hTop = sh.volToY((u + 1) / 4);
        hy = hTop; hh = hBot - hTop;
      } else {
        hh = hUnit;
        hy = low - (u + 1) * hUnit;
      }
      inner.appendChild(svgEl('rect', { x: -160, y: hy, width: 420, height: hh + 1.2, fill: 'url(#liqH)' }));
      if (fade > 0.3) {
        const txt = svgEl('text', {
          x: px, y: hy + hh / 2 + 5.5, 'text-anchor': 'middle',
          'font-size': 15, 'font-weight': 700, fill: '#cdd5f2', opacity: 0.85 * fade
        });
        txt.textContent = '?';
        txt.setAttribute('font-family', "system-ui, sans-serif");
        inner.appendChild(txt);
      }
    }

    g.appendChild(inner);
    const top = segs.length && cum > 0.01 ? segs[segs.length - 1] : null;
    const glowColor = top ? (hid >= cum ? HIDDEN_FILL[1] : COLORS[top.c][1]) : null;
    /* subtle CSS-only per-bottle glow (WebGL bloom removed) â€” a touch stronger on Neon */
    const glowAlpha = Math.round((SKIN === 'neon' ? 0.40 : 0.20) * activeRenderProfile().glowStrength * 255);
    const ga = Math.max(0, Math.min(255, glowAlpha)).toString(16).padStart(2, '0');
    slot.glow.style.background = glowColor
      ? 'radial-gradient(50% 60% at 50% 50%, ' + glowColor + ga + ', transparent 70%)'
      : 'none';
  }
};


const CanvasRenderer = {
  backend: 'canvas2d',
  canvas: null,
  ctx: null,
  dpr: 1,
  rects: [],
  ok: false,
  renderQueued: false,
  pathCache: new Map(),
  gradientCache: new Map(),
  shellCache: new Map(),
  ensure() {
    this.canvas = this.canvas || document.getElementById('board-canvas');
    if (!this.canvas) return false;
    if (!this.ctx) this.ctx = this.canvas.getContext('2d');
    this.ok = !!this.ctx && typeof Path2D === 'function';
    return this.ok;
  },
  syncLayout() {
    if (!this.ensure()) return false;
    const stage = $('#stage');
    const sr = stage.getBoundingClientRect();
    this.dpr = Math.max(1, Math.min(activeRenderProfile().dprCap, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(sr.width * this.dpr));
    const h = Math.max(1, Math.round(sr.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.gradientCache.clear();
      this.shellCache.clear();
    }
    this.canvas.style.width = sr.width + 'px';
    this.canvas.style.height = sr.height + 'px';
    this.rects = slots.map((slot, i) => {
      const r = slot.btn.getBoundingClientRect();
      return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height, shapeName: shapesByBottle[i] };
    });
    return true;
  },
  clear() {
    if (!this.ensure()) return;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  },
  renderBottle() { return this.requestRender(); },
  requestRender() {
    if (!this.ensure()) return this;
    if (this.renderQueued) return this;
    this.renderQueued = true;
    FrameGate.request('canvas-render', () => {
      this.renderQueued = false;
      this.renderNow();
    });
    return this;
  },
  renderNow() {
    if (!this.ensure()) return;
    if (this.rects.length !== slots.length) this.syncLayout();
    this.clear();
    PerfMeter.mark('canvas2d', performance.now());
    state.forEach((b, i) => this.drawBottle(i));
    this.drawPourEffects(this.ctx);
  },
  renderAll() {
    return this.requestRender();
  },
  setTheme() { this.gradientCache.clear(); this.shellCache.clear(); this.renderAll(); return this; },
  setQuality(q) { this.quality = q || 'auto'; this.shellCache.clear(); return this; },
  destroy() { this.renderQueued = false; this.clear(); return this; },
  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  },
  paths(shapeName) {
    let cached = this.pathCache.get(shapeName);
    if (!cached) {
      const sh = SHAPES[shapeName];
      cached = { interior: new Path2D(sh.interior), outline: new Path2D(sh.outline) };
      this.pathCache.set(shapeName, cached);
    }
    return cached;
  },
  liquidGradient(ctx, c) {
    const key = SKIN + ':' + MODE + ':' + c;
    const cached = this.gradientCache.get(key);
    if (cached) return cached;
    const g = ctx.createLinearGradient(0, 0, 100, 0);
    const pair = c === 'hidden' ? HIDDEN_FILL : COLORS[c];
    g.addColorStop(0, pair[1]); g.addColorStop(0.3, pair[0]); g.addColorStop(0.7, pair[0]); g.addColorStop(1, pair[1]);
    this.gradientCache.set(key, g);
    return g;
  },
  shellLayer(shapeName, complete) {
    const sh = SHAPES[shapeName];
    const key = [shapeName, SKIN, MODE, RIM_COLOR, complete ? 'cap' : 'open', this.dpr].join(':');
    const cached = this.shellCache.get(key);
    if (cached) return cached;
    const scale = Math.max(1, Math.min(2, this.dpr || 1));
    const cv = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(Math.ceil(100 * scale), Math.ceil(sh.vbH * scale))
      : document.createElement('canvas');
    cv.width = Math.ceil(100 * scale);
    cv.height = Math.ceil(sh.vbH * scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const paths = this.paths(shapeName);
    const shade = ctx.createLinearGradient(0, 0, 100, 0);
    shade.addColorStop(0, 'rgba(58,36,16,0.32)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(58,36,16,0.34)');
    ctx.fillStyle = shade;
    ctx.fill(paths.interior);
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    (sh.gloss || []).forEach(g => { this.roundRect(ctx, g.x, g.y, g.w, g.h, g.rx); ctx.globalAlpha = g.o; ctx.fill(); ctx.globalAlpha = 1; });
    ctx.strokeStyle = RIM_COLOR;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke(paths.outline);
    const lip = sh.lip;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    this.roundRect(ctx, lip.x, lip.y, lip.w, lip.h, lip.rx);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,14,36,0.55)';
    ctx.beginPath();
    ctx.ellipse(50, lip.mouthCy, lip.mouthRx, lip.mouthRy, 0, 0, Math.PI * 2);
    ctx.fill();
    if (complete && sh.cork) {
      const c = sh.cork;
      ctx.fillStyle = '#a9763f';
      this.roundRect(ctx, c.x, c.y, c.w, c.h, c.r);
      ctx.fill();
    }
    this.shellCache.set(key, cv);
    return cv;
  },
  drawElement(ctx, elem, y, h) {
    ctx.save();
    if (elem === 'frozen') {
      ctx.fillStyle = 'rgba(190,235,255,0.30)'; ctx.fillRect(-160, y, 420, h);
      ctx.strokeStyle = 'rgba(220,250,255,0.95)'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { const x = 34 + k * 16, cy = y + h * (0.2 + k * 0.3); ctx.beginPath(); ctx.moveTo(x, cy - 5); ctx.lineTo(x, cy + 5); ctx.moveTo(x - 5, cy); ctx.lineTo(x + 5, cy); ctx.moveTo(x - 3.5, cy - 3.5); ctx.lineTo(x + 3.5, cy + 3.5); ctx.moveTo(x + 3.5, cy - 3.5); ctx.lineTo(x - 3.5, cy + 3.5); ctx.stroke(); }
    } else if (elem === 'electric') {
      ctx.fillStyle = 'rgba(140,255,248,0.20)'; ctx.fillRect(-160, y, 420, h); ctx.strokeStyle = 'rgba(220,255,255,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(45, y + 3); for (let k = 0; k < 6; k++) ctx.lineTo(45 + (k % 2 === 0 ? 10 : -10), y + 3 + (k + 1) * (h - 6) / 6); ctx.stroke();
    } else if (elem === 'boiling') {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(35 + k * 10, y + h - 8 - k * 2, 3.2 - k * 0.4, 0, Math.PI * 2); ctx.fill(); }
    } else if (elem === 'toxic') {
      ctx.fillStyle = 'rgba(80,255,120,0.26)'; ctx.fillRect(-160, y, 420, h); ctx.fillStyle = 'rgba(180,255,200,0.9)'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('â˜ ', 64, y + h / 2 + 4);
    }
    ctx.restore();
  },
  beginPour(info) {
    if (!this.pourMap) this.pourMap = new Map();
    this.pourMap.set(info.si, Object.assign({ t: 0, particles: [], rippleAge: 0 }, info));
    if (!RM && this.effectsEnabled()) {
      Fluid.drop(info.di, -1.8);
      Fluid.start();
    }
    this.renderAll();
  },
  updatePour(info = {}) {
    if (!this.pourMap) return;
    const p = this.pourMap.get(info.si);
    if (!p) return;
    Object.assign(p, info);
    const now = performance.now();
    if (!RM && this.effectsEnabled() && (!p.lastParticle || now - p.lastParticle > 70)) {
      p.lastParticle = now;
      for (let k = 0; k < 2; k++) p.particles.push({
        x: p.tx + (Math.random() * 14 - 7), y: p.ty,
        vx: Math.random() * 70 - 35, vy: -(35 + Math.random() * 60),
        age: 0, life: 0.52 + Math.random() * 0.18, r: 2 + Math.random() * 2
      });
    }
    this.requestRender();
  },
  endPour(info) {
    if (this.pourMap) { this.pourMap.delete(info && info.si); }
    this.renderAll();
  },
  effectsEnabled() { return explicitPrettyEffects(); },
  drawPourEffects(ctx) {
    if (!this.pourMap || !this.pourMap.size) return;
    for (const p of this.pourMap.values()) this._drawOnePour(ctx, p);
  },
  _drawOnePour(ctx, p) {
    ctx.save();
    const t = Math.max(0, Math.min(1, p.progress == null ? 1 : p.progress));
    const sx = p.sx, sy = p.sy, tx = p.tx, ty = p.ty, cpx = p.cpx, cpy = p.cpy;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const grad = ctx.createLinearGradient(sx, sy, tx, ty); grad.addColorStop(0, p.c0); grad.addColorStop(1, p.c1);
    const drawArc = (w, stroke, alpha, blur) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = stroke; ctx.lineWidth = w; if (blur) ctx.filter = 'blur(' + blur + 'px)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cpx, cpy, sx + (tx - sx) * t, sy + (ty - sy) * t); ctx.stroke(); ctx.restore();
    };
    drawArc(9, p.c0, 0.28, 3); drawArc(5, grad, 1, 0); drawArc(1.6, 'rgba(255,255,255,0.42)', 1, 0);
    if (!RM && this.effectsEnabled()) {
      const age = ((performance.now() - (p.started || performance.now())) / 1000);
      for (let r = 0; r < 2; r++) {
        const u = (age * 1.35 - r * 0.34) % 1; if (u < 0) continue;
        ctx.globalAlpha = (1 - u) * 0.65; ctx.strokeStyle = p.c0; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(tx, ty, p.receiverW * (0.12 + u * 0.45), p.receiverW * (0.04 + u * 0.12), 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (prettyTidepoolEffects()) {
        ctx.strokeStyle = 'rgba(255,255,255,0.76)';
        ctx.fillStyle = 'rgba(210,255,248,0.16)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const u = (age * 0.9 + k * 0.31) % 1;
          const bx = tx + Math.sin(age * 1.7 + k * 2.1) * p.receiverW * 0.16;
          const by = ty + p.receiverW * 0.08 - u * p.receiverW * 0.62;
          const br = p.receiverW * (0.045 + u * 0.045);
          ctx.globalAlpha = (1 - u) * 0.58;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      if (SKIN === 'apothecary') {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = 'rgba(240,245,255,0.75)'; ctx.lineWidth = 2;
        for (let k = 0; k < 2; k++) { const u = (age * 0.8 + k * 0.45) % 1; ctx.beginPath(); ctx.moveTo(sx + p.side * 6, sy - 12 - u * 28); ctx.bezierCurveTo(sx + 10, sy - 20 - u * 30, sx - 8, sy - 26 - u * 36, sx + 6, sy - 38 - u * 40); ctx.stroke(); }
      }
      const dt = 1 / 60; p.particles = (p.particles || []).filter(d => { d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 190 * dt; const a = 1 - d.age / d.life; if (a <= 0) return false; ctx.globalAlpha = a; ctx.fillStyle = p.c0; ctx.shadowColor = p.c0 + '88'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); return true; });
    }
    ctx.restore();
  },
  drawBottle(i) {
    const r = this.rects[i], slot = slots[i];
    if (!r || !slot) return;
    const ctx = this.ctx, shapeName = r.shapeName, sh = SHAPES[shapeName];
    const sx = r.w / 100, sy = r.h / sh.vbH;
    const inline = slot.btn.style.transform || '';
    const tMatch = inline.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    const rMatch = inline.match(/rotate\((-?[\d.]+)deg\)/);
    const tx = tMatch ? parseFloat(tMatch[1]) : 0;
    const selectedLift = !tMatch && slot.el.classList.contains('selected') ? -r.w * 0.22 : 0;
    const ty = (tMatch ? parseFloat(tMatch[2]) : 0) + selectedLift;
    const rot = rMatch ? parseFloat(rMatch[1]) * Math.PI / 180 : 0;
    ctx.save();
    ctx.translate(r.x + tx, r.y + ty);
    if (rot) { ctx.translate(r.w / 2, r.h / 2); ctx.rotate(rot); ctx.translate(-r.w / 2, -r.h / 2); }
    ctx.scale(sx, sy);
    ctx.shadowColor = 'rgba(4,8,26,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 7;
    const paths = this.paths(shapeName), interior = paths.interior;
    ctx.fillStyle = SKIN === 'neon' ? 'rgba(127,208,255,0.10)' : 'rgba(255,233,200,0.12)'; ctx.fill(interior); ctx.shadowColor = 'transparent';
    ctx.save(); ctx.clip(interior);
    let cum = 0;
    const segs = visual[i] || [];
    for (const seg of segs) {
      const yBot = sh.volToY ? sh.volToY(cum / 4) : sh.B - cum * sh.unit;
      const yTop = sh.volToY ? sh.volToY((cum + seg.u) / 4) : sh.B - (cum + seg.u) * sh.unit;
      const h = yBot - yTop;
      const isTop = seg === segs[segs.length - 1] && !rot && Fluid.active() && !locked.has(i) && h > Fluid.AMP + Fluid.MENISCUS + 7;
      ctx.fillStyle = this.liquidGradient(ctx, seg.c);
      if (isTop) {
        const halfW = Math.max(5, shapeWidthAt(shapeName, yTop) / 2);
        const sample = Fluid.sample(i);
        const n = Fluid.N, left = 50 - halfW, span = 2 * halfW;
        ctx.beginPath(); ctx.moveTo(-160, yBot + 1.2); ctx.lineTo(-160, yTop);
        for (let k = 0; k < n; k++) {
          const x = left + (k / (n - 1)) * span;
          const edge = Math.abs((k / (n - 1)) * 2 - 1);
          const y = yTop + (sample ? sample.h[k] : 0) - Fluid.MENISCUS * Math.pow(edge, 2.2);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(260, yTop); ctx.lineTo(260, yBot + 1.2); ctx.closePath(); ctx.fill();
      } else ctx.fillRect(-160, yTop, 420, h + 1.2);
      if (ELEMENT_MAP[seg.c]) this.drawElement(ctx, ELEMENT_MAP[seg.c], yTop, h);
      if (save.symbols && seg.u >= 0.8) { ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(COLOR_GLYPHS[seg.c], 50, yTop + h / 2); ctx.fillText(COLOR_GLYPHS[seg.c], 50, yTop + h / 2); }
      cum += seg.u;
    }
    if (segs.length) {
      const topY = sh.volToY ? sh.volToY(cum / 4) : sh.B - cum * sh.unit;
      const halfW = Math.max(5, shapeWidthAt(shapeName, topY) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(50 - halfW, topY - Fluid.MENISCUS + 0.4); ctx.quadraticCurveTo(50, topY + Fluid.MENISCUS + 0.4, 50 + halfW, topY - Fluid.MENISCUS + 0.4); ctx.stroke();
    }
    const hid = hiddenDepth[i] || 0;
    for (let u = 0; u < hid && u < cum; u++) {
      const yBot = sh.volToY ? sh.volToY(u / 4) : sh.B - u * sh.unit;
      const yTop = sh.volToY ? sh.volToY((u + 1) / 4) : sh.B - (u + 1) * sh.unit;
      ctx.fillStyle = this.liquidGradient(ctx, 'hidden'); ctx.fillRect(-160, yTop, 420, yBot - yTop + 1.2);
      ctx.fillStyle = '#cdd5f2'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 50, (yTop + yBot) / 2);
    }
    ctx.restore();
    ctx.drawImage(this.shellLayer(shapeName, window.isBottleComplete(state[i])), 0, 0, 100, sh.vbH);
    if (veiled[i]) { ctx.fillStyle = 'rgba(48,25,90,0.35)'; ctx.fill(interior); ctx.fillStyle = '#e2d2ff'; ctx.font = '34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('âœ¦', 50, sh.vbH * 0.38); }
    if (frozen.has(i)) { ctx.fillStyle = 'rgba(170,225,255,0.32)'; ctx.fill(interior); ctx.fillStyle = '#f0faff'; ctx.font = '30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('â„', 50, sh.vbH * 0.72); }
    ctx.restore();
  }
};

function preferredRendererMode() {
  const raw = (new URLSearchParams(location.search).get('renderer') || localStorage.getItem('vessel_renderer') || window.__vesselRendererMode || 'canvas2d').toLowerCase();
  return raw === 'canvas' ? 'canvas2d' : raw;
}

function isCanvasMode() {
  return typeof renderer !== 'undefined' && (renderer.active === 'canvas' || renderer.active === 'canvas2d' || (renderer.backend && (renderer.backend.backend === 'canvas' || renderer.backend.backend === 'canvas2d')));
}

const renderer = {
  active: 'svg',
  backend: SvgRenderer,
  quality: 'auto',
  setBoard(nextSlots) {
    if (nextSlots) slots = nextSlots;
    return this;
  },
  chooseBackend() {
    const mode = preferredRendererMode();
    const stage = $('#stage');
    if (mode === 'canvas2d' && CanvasRenderer.ensure()) {
      this.active = 'canvas2d'; this.backend = CanvasRenderer; stage.classList.add('canvas-active');
    } else {
      this.active = 'svg'; this.backend = SvgRenderer; stage.classList.remove('canvas-active');
      if (mode === 'canvas2d') console.warn('Canvas 2D renderer unavailable; falling back to SVG.');
    }
    slots.forEach(slot => slot && slot.el && slot.el.classList.toggle('canvas-dom-proxy', this.active === 'canvas2d'));
    return this;
  },
  syncLayout() {
    layoutStage();
    this.chooseBackend();
    if (this.backend.syncLayout) this.backend.syncLayout();
    return this;
  },
  renderBottle(i, opts = {}, wob = null) {
    const renderOpts = typeof opts === 'number' ? { tiltDeg: opts, wob } : opts;
    return this.backend.renderBottle(i, renderOpts);
  },
  renderAll() {
    if (this.active === 'canvas2d') this.backend.renderAll();
    else state.forEach((b, i) => this.renderBottle(i, { tiltDeg: 0 }));
    return this;
  },
  beginPour(info) { if (this.backend.beginPour) this.backend.beginPour(info); return this; },
  updatePour(info) { if (this.backend.updatePour) this.backend.updatePour(info); return this; },
  endPour(info) { if (this.backend.endPour) this.backend.endPour(info); return this; },
  setTheme() {
    if (state.length && slots.length) this.renderAll();
    return this;
  },
  setQuality(q) {
    this.quality = q || 'auto';
    if (window.__vesselPerf) window.__vesselPerf.rendererQuality = this.quality;
    return this;
  },
  destroy() {
    slots.forEach(slot => { if (slot) slot.surf = null; });
    return this;
  }
};

function revealMystery(i) {
  const maxHid = Math.max(0, state[i].length - 1);
  if ((hiddenDepth[i] || 0) > maxHid) {
    hiddenDepth[i] = maxHid;
    if (slots[i] && explicitPrettyEffects()) spawnSparkles(slots[i].el, 5, 0.4);
    AudioFX.reveal();
  }
}

function syncCaps() {
  state.forEach((b, i) => {
    const capped = window.isBottleComplete(b);
    if (capped && hiddenDepth[i]) { hiddenDepth[i] = 0; renderer.renderBottle(i, 0); }
    const has = slots[i].el.classList.contains('capped');
    if (capped && !has) slots[i].el.classList.add('capped');
    else if (!capped && has) slots[i].el.classList.remove('capped');
  });
}

function snapshotBoard() {
  return {
    state: window.cloneState(state),
    moves,
    hiddenDepth: hiddenDepth.slice(),
    veiled: veiled.slice(),
    frozen: [...frozen]
  };
}

function ensureSlotMarker(slotEl, className, text) {
  let marker = slotEl.querySelector('.' + className);
  if (!marker) {
    marker = document.createElement('span');
    marker.className = className;
    marker.textContent = text;
    slotEl.appendChild(marker);
  } else {
    marker.classList.remove('off', 'shatter');
  }
}

function rebuildSlotSpecialClasses(i) {
  if (!slots[i]) return;
  const slotEl = slots[i].el;

  slotEl.classList.toggle('veiled', !!veiled[i]);
  if (veiled[i]) ensureSlotMarker(slotEl, 'seal', 'âœ¦');
  else slotEl.querySelectorAll('.seal').forEach(seal => seal.remove());

  slotEl.classList.toggle('frozen', frozen.has(i));
  if (frozen.has(i)) ensureSlotMarker(slotEl, 'ice', 'â„');
  else slotEl.querySelectorAll('.ice').forEach(ice => ice.remove());

  slotEl.classList.toggle('capped', window.isBottleComplete(state[i]));
}

function restoreBoardSnapshot(snap) {
  state = window.cloneState(snap.state);
  moves = snap.moves;
  hiddenDepth = snap.hiddenDepth.slice();
  veiled = snap.veiled.slice();
  frozen = new Set(snap.frozen);
  visual = state.map(mergeRuns);

  state.forEach((b, i) => rebuildSlotSpecialClasses(i));
  renderer.renderAll();
  syncCaps();
  orbUpdate(false);
  updateHUD();
}

/* ---------------- layout (1-3 rows + shelves) ---------------- */
function layoutStage() {
  const stage = $('#stage');
  const n = state.length;
  if (!n) return;
  const hasTall = shapesByBottle.includes('tall');
  const W = stage.clientWidth - 14, H = stage.clientHeight - 10;
  function bwFor(r) {
    const per = Math.ceil(n / r);
    const bwW = W / (per + (per + 1) * 0.2);
    const hUnits = (hasTall ? 3.2 : 2.4) + (r - 1) * 2.4 + (r - 1) * 0.5 + 0.65;
    return Math.min(bwW, H / hUnits);
  }
  let rows = 1, best = bwFor(1);
  const maxRows = hasTall ? 1 : 4;
  for (let r = 2; r <= maxRows && r <= n; r++) {
    const v = bwFor(r);
    if (v > best * 1.04) { rows = r; best = v; }
  }
  const bw = Math.max(30, Math.min(100, Math.floor(best)));
  document.documentElement.style.setProperty('--bw', bw + 'px');

  if (Number(stage.dataset.rows) !== rows || stage.dataset.n !== String(n)) {
    stage.querySelectorAll('.row').forEach(r => r.remove());
    const rowEls = [];
    for (let r = 0; r < rows; r++) {
      const el = document.createElement('div'); el.className = 'row';
      stage.insertBefore(el, $('#fx'));
      rowEls.push(el);
    }
    const base = Math.floor(n / rows), extra = n % rows;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const count = base + (r < extra ? 1 : 0);
      for (let k = 0; k < count; k++) rowEls[r].appendChild(slots[idx++].slot);
    }
    stage.dataset.rows = rows; stage.dataset.n = String(n);
  }
}

/* ---------------- level lifecycle ---------------- */
function assignShapes(n, fillCount, gen) {
  const rng = window.mulberry32(window.diffSeed(level, difficulty) + 777);
  const out = [];
  for (let i = 0; i < n; i++) out.push(rng() < (n > 9 ? 0.18 : 0.3) ? 'flask' : 'classic');
  if (n <= 7) { /* dramatic tall bottles on small boards */
    const a = Math.floor(rng() * n);
    let b = Math.floor(rng() * n);
    if (b === a) b = (b + 1) % n;
    out[a] = 'tall'; if (n >= 5) out[b] = 'tall';
  }
  return out;
}

function applySpecials(gen) {
  const sp = gen.specials || { mystery: [], veiled: [], frozen: [] };
  hiddenDepth = state.map(() => 0);
  veiled = state.map(() => false);
  frozen = new Set(sp.frozen);
  sp.mystery.forEach(i => { hiddenDepth[i] = Math.max(0, state[i].length - 1); });
  sp.veiled.forEach(i => { veiled[i] = true; hiddenDepth[i] = state[i].length; });
  /* first-time explainer toasts */
  const msgs = [];
  if (sp.mystery.length && !save.seenSpecials.m) { msgs.push('Hidden layers reveal as you pour'); save.seenSpecials.m = 1; }
  if (sp.veiled.length && !save.seenSpecials.v) { msgs.push('Tap a sealed bottle to unveil it'); save.seenSpecials.v = 1; }
  if (sp.frozen.length && !save.seenSpecials.f) { msgs.push('Ice thaws when you complete a bottle'); save.seenSpecials.f = 1; }
  if (msgs.length) {
    persist();
    toastMsg(msgs.join('  Â·  '), 5200);
  }
  return sp;
}

let toastT = null;
function toastMsg(msg, ms) {
  const h = $('#hint');
  h.textContent = msg;
  h.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => { h.style.opacity = 0; }, ms || 2600);
}


function visibleLayerCount(i) {
  return Math.max(0, state[i].length - (hiddenDepth[i] || 0));
}
function layerWord(n) { return n === 1 ? 'one layer' : n === 2 ? 'two layers' : n === 3 ? 'three layers' : n === 4 ? 'four layers' : n + ' layers'; }
function bottleAriaLabel(i) {
  const parts = ['Bottle ' + (i + 1)];
  if (frozen.has(i)) parts.push('frozen');
  if (veiled[i]) parts.push('sealed');
  if (!state[i] || state[i].length === 0) parts.push('empty');
  else {
    parts.push(layerWord(visibleLayerCount(i)));
    if (hiddenDepth[i] >= state[i].length) parts.push('contents hidden');
    else parts.push('top ' + COLOR_NAMES[state[i][state[i].length - 1]]);
  }
  if (window.isBottleComplete(state[i])) parts.push('complete');
  if (sel === i) parts.push('selected');
  return parts.join(', ');
}
function updateBottleLabels() {
  slots.forEach((slot, i) => slot.btn.setAttribute('aria-label', bottleAriaLabel(i)));
}
function applyBottleFocus(i, moveDomFocus) {
  if (!slots.length) return;
  focusedBottle = Math.max(0, Math.min(i, slots.length - 1));
  slots.forEach((slot, idx) => {
    slot.el.classList.toggle('keyboard-focus', showBottleKeyboardFocus && idx === focusedBottle);
    slot.btn.tabIndex = idx === focusedBottle ? 0 : -1;
  });
  if (moveDomFocus) slots[focusedBottle].btn.focus({ preventScroll: true });
}
function closeTopLayer() {
  const modal = document.querySelector('.modal:not(.hidden)');
  if (modal) { modal.classList.add('hidden'); renderMenu(); return true; }
  const overlay = $('#overlay');
  if (overlay.classList.contains('show')) { overlay.classList.remove('show'); return true; }
  return false;
}
function handleGameKey(e) {
  if ($('#game').classList.contains('hidden')) return;
  const k = e.key;
  if (k === 'Escape') {
    e.preventDefault();
    if (!closeTopLayer()) exitToMenu();
    return;
  }
  if (closeTopLayer && (document.querySelector('.modal:not(.hidden)') || $('#overlay').classList.contains('show'))) return;
  if (!slots.length) return;
  const onBottleBtn = (k === 'Enter' || k === ' ') && slots.some(s => s.btn === e.target);
  if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(k) || onBottleBtn) e.preventDefault();
  else if (k === 'Enter' || k === ' ') return;
  if (k === 'ArrowLeft' || k === 'ArrowUp') { showBottleKeyboardFocus = true; applyBottleFocus(focusedBottle - 1, true); }
  else if (k === 'ArrowRight' || k === 'ArrowDown') { showBottleKeyboardFocus = true; applyBottleFocus(focusedBottle + 1, true); }
  else if (k === 'Enter' || k === ' ') { showBottleKeyboardFocus = true; applyBottleFocus(focusedBottle, false); onTap(focusedBottle); }
  else if (k.toLowerCase() === 'u') { e.preventDefault(); undo(); }
  else if (k.toLowerCase() === 'r') {
    e.preventDefault();
    if (activePours === 0 && !autoPlaying && confirm('Restart this level?')) restartCurrent();
  } else if (k.toLowerCase() === 'h') { e.preventDefault(); showHint(); }
}

function setupBoard(gen) {
  /* boards can come from a cache â€” never mutate the generated original */
  state = gen.state.map(b => b.slice());
  par = gen.par;
  undosAllowed = gen.undos; undosLeft = gen.undos;
  visual = state.map(mergeRuns);
  moves = 0; undoHistory = []; sel = null; locked.clear(); activePours = 0;
  usedHint = false; usedAuto = false; autoPlaying = false; undosUsed = 0;
  Fluid.resetAll();
  clearHintGlow();
  shapesByBottle = assignShapes(state.length, gen.colors * gen.sets, gen);
  const specials = applySpecials(gen);
  needCaps = gen.colors * gen.sets;
  buildElementMap(gen);

  const stage = $('#stage');
  stage.querySelectorAll('.row').forEach(r => r.remove());
  stage.dataset.n = ''; stage.dataset.rows = '';
  $('#fx').innerHTML = '';
  slots = state.map((b, i) => {
    const shapeName = shapesByBottle[i];
    const sh = SHAPES[shapeName];
    const slot = document.createElement('div');
    slot.className = 'slot s-' + shapeName + (shapeName === 'tall' ? ' tall' : '');
    slot.classList.toggle('canvas-dom-proxy', isCanvasMode());
    slot.style.setProperty('--d', (i * 45) + 'ms');
    const glow = document.createElement('span'); glow.className = 'glow';
    const shadow = document.createElement('span'); shadow.className = 'shadow';
    const btn = document.createElement('button');
    btn.className = 'bottle';
    btn.type = 'button';
    /* no decorative cork in gameplay â€” an upright open bottle reads as unsolved;
       completion is shown by the .cap drop (see syncCaps) */
    const svg = buildBottleSVG(shapeName, { cork: false, label: true });
    btn.appendChild(svg);
    const cap = document.createElement('span'); cap.className = 'cap';
    const ring = document.createElement('span'); ring.className = 'ring';
    btn.appendChild(cap); btn.appendChild(ring);
    slot.appendChild(glow); slot.appendChild(shadow); slot.appendChild(btn);
    if (frozen.has(i)) {
      slot.classList.add('frozen');
      const ice = document.createElement('span'); ice.className = 'ice'; ice.textContent = 'â„';
      slot.appendChild(ice);
    }
    if (veiled[i]) {
      slot.classList.add('veiled');
      const seal = document.createElement('span'); seal.className = 'seal'; seal.textContent = 'âœ¦';
      slot.appendChild(seal);
    }
    btn.addEventListener('pointerdown', () => { showBottleKeyboardFocus = false; applyBottleFocus(i, false); });
    btn.addEventListener('click', () => onTap(i));
    return { slot, el: slot, glow, btn, sh, liquidGroup: svg.querySelector('.liquids'), svg };
  });
  showScreen('game');
  showBottleKeyboardFocus = false;
  focusedBottle = Math.min(focusedBottle, Math.max(0, slots.length - 1));
  renderer.setBoard(slots);
  renderer.syncLayout();
  renderer.renderAll();
  syncCaps();
  applyBottleFocus(focusedBottle, false);
  orbUpdate(false);
  updateHUD();
  $('#overlay').classList.remove('show');
  updateBottleLabels();
}


function loadLevel(lvl) {
  mode = 'classic';
  stopRushTimer();
  level = lvl;
  setupBoard(window.generateLevel(lvl, difficulty));
  if (!save.seenHint && lvl === 1) { $('#hint').textContent = 'Tap a bottle, then tap where to pour'; $('#hint').style.opacity = 1; }
}

/* ---------------- daily challenge ---------------- */
function todayStr(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function loadDaily() {
  mode = 'daily';
  stopRushTimer();
  const cfg = window.dailyConfig(todayStr());
  const gen = window.generateFromSeed(cfg.seed, cfg.colors, cfg.sets, cfg.empties);
  if (!gen) { toastMsg('Todayâ€™s puzzle would not mix â€” try Classic'); return; }
  level = 1;
  setupBoard(gen);
}

/* ---------------- rush mode ---------------- */
function startRush() {
  rushStage = 1;
  loadRushStage();
}

function loadRushStage() {
  mode = 'rush';
  clearTimeout(rushNextT);
  const cfg = window.rushConfig(rushStage);
  const gen = window.generateFromSeed(cfg.seed, cfg.colors, cfg.sets, cfg.empties);
  if (!gen) { toastMsg('Rush hit a wall â€” try Classic'); return; }
  level = rushStage;
  setupBoard(gen);
  startRushTimer(window.rushTimeFor(gen.par));
}

function startRushTimer(sec) {
  rushTimeLeft = sec;
  clearInterval(rushTicker);
  rushTicker = setInterval(() => {
    if (document.hidden || activePours > 0 && rushTimeLeft <= 1) return;
    rushTimeLeft--;
    if (rushTimeLeft === 10) AudioFX.ice();
    updateHUD();
    if (rushTimeLeft <= 0) { stopRushTimer(); rushFail(); }
  }, 1000);
  updateHUD();
}

function stopRushTimer() {
  clearInterval(rushTicker); rushTicker = null;
  clearTimeout(rushNextT);
}

function rushFail() {
  setSelected(null);
  const cleared = rushStage - 1;
  if (cleared > save.rushBest) { save.rushBest = cleared; persist(); }
  $('#win-title').textContent = 'Timeâ€™s up!';
  $('#win-stars').innerHTML = '<span>â±ï¸</span>';
  $('#win-meta').textContent = 'Cleared ' + cleared + (cleared === 1 ? ' stage' : ' stages') + ' Â· best ' + save.rushBest;
  $('#btn-next').classList.add('hidden');
  $('#overlay').classList.add('show');
  AudioFX.invalid(); buzz([30, 60, 30]);
}

function onRushStageClear() {
  stopRushTimer();
  if (rushStage > save.rushBest) { save.rushBest = rushStage; persist(); }
  if (rushStage >= 5) unlockAch('rush5');
  toastMsg('Stage ' + rushStage + ' clear! âš¡ +next', 1400);
  AudioFX.win(); buzz([20, 50, 40]);
  if (!RM) confetti();
  rushNextT = setTimeout(() => {
    if (mode === 'rush') { rushStage++; loadRushStage(); }
  }, RM ? 250 : 1300);
}

/* ---------------- magic orb (fills as bottles complete) ---------------- */
let orbFill = null, orbSurf = null, orbFrac = 0;
function buildOrb() {
  const host = $('#orb');
  if (!host) return;
  const svg = svgEl('svg', { viewBox: '0 0 60 64' });
  const defs = svgEl('defs', {});
  const clip = svgEl('clipPath', { id: 'orbClip' });
  clip.appendChild(svgEl('circle', { cx: 30, cy: 36, r: 23 }));
  defs.appendChild(clip);
  const og = svgEl('linearGradient', { id: 'orbGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  og.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#ffe2b3' }));
  og.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#e8893a' }));
  defs.appendChild(og);
  svg.appendChild(defs);
  svg.appendChild(svgEl('circle', { cx: 30, cy: 36, r: 23, fill: 'rgba(255,255,255,0.06)' }));
  const lg = svgEl('g', { 'clip-path': 'url(#orbClip)' });
  orbFill = svgEl('rect', { x: 2, y: 59, width: 56, height: 0, fill: 'url(#orbGrad)' });
  orbSurf = svgEl('ellipse', { cx: 30, cy: 59, rx: 22, ry: 3, fill: '#ffe9c4', opacity: 0.8 });
  lg.appendChild(orbFill); lg.appendChild(orbSurf);
  svg.appendChild(lg);
  svg.appendChild(svgEl('circle', { cx: 30, cy: 36, r: 23, fill: 'none', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 2.2 }));
  svg.appendChild(svgEl('ellipse', { cx: 22, cy: 26, rx: 6, ry: 9, fill: 'rgba(255,255,255,0.35)', transform: 'rotate(-24 22 26)' }));
  svg.appendChild(svgEl('rect', { x: 24, y: 4, width: 12, height: 9, rx: 4, fill: 'url(#lipGrad)', stroke: 'rgba(255,255,255,0.4)', 'stroke-width': 1.2 }));
  host.appendChild(svg);
}
function orbUpdate(pulse) {
  if (!orbFill) return;
  const capped = state.filter(b => window.isBottleComplete(b)).length;
  orbFrac = needCaps ? capped / needCaps : 0;
  const h = 46 * orbFrac;
  orbFill.setAttribute('y', 59 - h);
  orbFill.setAttribute('height', h + 1);
  orbSurf.setAttribute('cy', 59 - h);
  orbSurf.setAttribute('opacity', orbFrac > 0.01 ? 0.8 : 0);
  const host = $('#orb');
  if (pulse && host) { host.classList.remove('pulse'); void host.offsetWidth; host.classList.add('pulse'); }
}

function updateHUD() {
  const lvlEl = $('#hud-level'), subEl = $('#hud-sub');
  if (mode === 'daily') {
    lvlEl.textContent = 'Daily Challenge';
    subEl.textContent = todayStr().slice(5).replace('-', '/') + ' Â· Moves ' + moves + ' Â· Par ' + par;
  } else if (mode === 'rush') {
    lvlEl.textContent = 'Rush Â· Stage ' + rushStage;
    subEl.textContent = 'â± ' + Math.max(0, rushTimeLeft) + 's Â· Moves ' + moves;
  } else {
    lvlEl.textContent = 'Level ' + level;
    subEl.textContent = cap1(difficulty) + ' Â· Moves ' + moves + ' Â· Par ' + par;
  }
  subEl.classList.toggle('warn', mode === 'rush' && rushTimeLeft <= 10);
  const undoBtn = $('#btn-undo');
  undoBtn.disabled = undoHistory.length === 0 || activePours > 0 || undosLeft <= 0 || autoPlaying;
  const badge = $('#undo-badge');
  if (undosAllowed !== Infinity) { badge.classList.remove('hidden'); badge.textContent = undosLeft; }
  else badge.classList.add('hidden');
  $('#btn-restart').disabled = activePours > 0 || autoPlaying;
  $('#btn-hint').disabled = autoPlaying || solutionPending;
  updateBottleLabels();
}
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------------- interaction ---------------- */
function setSelected(i) {
  if (sel !== null && slots[sel]) slots[sel].el.classList.remove('selected');
  sel = i;
  if (i !== null) { slots[i].el.classList.add('selected'); Fluid.slosh(i, 2.2); Fluid.start(); }  /* lift sloshes the liquid */
  updateBottleLabels();
  if (renderer.active === 'canvas2d') renderer.renderAll();
}
function shake(i) {
  const el = slots[i].el;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  Fluid.slosh(i, 3.4);   /* invalid jab rocks the surface */
  Fluid.start();
}
function canBeSource(i) { return state[i].length > 0 && !window.isBottleComplete(state[i]); }

function unveil(i) {
  veiled[i] = false;
  hiddenDepth[i] = Math.max(0, state[i].length - 1);
  const slot = slots[i];
  slot.el.classList.remove('veiled');
  const seal = slot.el.querySelector('.seal');
  if (seal) { seal.classList.add('off'); setTimeout(() => seal.remove(), 500); }
  if (explicitPrettyEffects()) spawnSparkles(slot.el, 7, 0.45);
  AudioFX.reveal(); buzz(10);
  renderer.renderBottle(i, 0);
  updateBottleLabels();
}

function thawAll() {
  const list = [...frozen];
  frozen.clear();
  AudioFX.thaw();
  list.forEach((i, k) => setTimeout(() => {
    const s = slots[i];
    s.el.classList.remove('frozen');
    const ice = s.el.querySelector('.ice');
    if (ice) { ice.classList.add('shatter'); setTimeout(() => ice.remove(), 600); }
    if (explicitPrettyEffects()) spawnSparkles(s.el, 8, 0.5);
  }, RM ? 0 : 160 + k * 140));
  updateBottleLabels();
}

function onTap(i) {
  AudioFX.ensure();
  if (autoPlaying) return;
  if (locked.has(i)) return;
  if (frozen.has(i)) { shake(i); AudioFX.ice(); buzz([8, 20, 8]); return; }
  if (veiled[i]) { unveil(i); return; }
  if (sel === null) {
    if (canBeSource(i)) { setSelected(i); AudioFX.select(); buzz(8); }
    else { shake(i); AudioFX.invalid(); }
    return;
  }
  if (sel === i) { setSelected(null); AudioFX.swap(); return; }
  if (window.canPour(state, sel, i)) {
    const s = sel; setSelected(null);
    doPour(s, i);
  } else if (canBeSource(i)) {
    setSelected(i); AudioFX.swap();
  } else {
    shake(i); AudioFX.invalid(); buzz([12, 30, 12]);
  }
}

/* ---------------- visual drain helpers ---------------- */
function drainSnapshot(snap, q) {
  const out = snap.map(s => ({ c: s.c, u: s.u }));
  let r = q;
  while (r > 0.001 && out.length) {
    const t = out[out.length - 1];
    const take = Math.min(t.u, r);
    t.u -= take; r -= take;
    if (t.u <= 0.001) out.pop();
  }
  return out;
}
function fillSnapshot(snap, color, q) {
  const out = snap.map(s => ({ c: s.c, u: s.u }));
  if (q <= 0.001) return out;
  if (out.length && out[out.length - 1].c === color) out[out.length - 1].u += q;
  else out.push({ c: color, u: q });
  return out;
}

/* ---------------- pour choreography (rAF-driven) ---------------- */
async function doPour(si, di) {
  locked.add(si); locked.add(di); activePours++;
  undoHistory.push(snapshotBoard());
  if (undoHistory.length > 300) undoHistory.shift();
  const n = window.pourAmount(state, si, di);
  const color = state[si][state[si].length - 1];
  window.applyPour(state, si, di);
  moves++;
  if (!save.seenHint) { save.seenHint = true; persist(); $('#hint').style.opacity = 0; }
  updateHUD();

  const stage = $('#stage');
  const stageRect = stage.getBoundingClientRect();
  const sRect = slots[si].slot.getBoundingClientRect();
  const dRect = slots[di].slot.getBoundingClientRect();
  const shS = slots[si].sh, shD = slots[di].sh;
  const bwS = sRect.width, bhS = sRect.height;
  const bwD = dRect.width, bhD = dRect.height;
  const side = dRect.left + bwD / 2 >= sRect.left + bwS / 2 ? 1 : -1;
  const A = side * (78 + Math.random() * 6);
  const aR = A * Math.PI / 180;

  const Pm = { x: dRect.left + bwD / 2, y: dRect.top + shD.mouthFrac * bhD };
  const Q = { x: Pm.x, y: Pm.y - bwS * 0.6 };
  const C = { x: bwS / 2, y: bhS / 2 };
  const M = { x: bwS / 2, y: shS.mouthFrac * bhS };
  const rx = Math.cos(aR) * (M.x - C.x) - Math.sin(aR) * (M.y - C.y);
  const ry = Math.sin(aR) * (M.x - C.x) + Math.cos(aR) * (M.y - C.y);
  const dxF = Q.x - (sRect.left + C.x + rx);
  const dyF = Q.y - (sRect.top + C.y + ry);
  const lift = bwS * 0.3;

  const slotEl = slots[si].el, bottleEl = slots[si].btn;
  slotEl.classList.add('pouring');
  bottleEl.style.transition = 'none';

  /* phase 1: lift, travel, tilt â€” carry-acceleration slosh */
  if (!RM) {
    setTimeout(() => { Fluid.slosh(si, 1.4, -side); Fluid.start(); }, 60);  /* initial surge backward */
    setTimeout(() => { Fluid.slosh(si, 0.9, side); Fluid.start(); }, 210);   /* arc-peak settles forward */
  }
  AudioFX.swap();
  await tween(RM ? 0 : 360, p => {
    const ang = A * p;
    const arc = -Math.sin(p * Math.PI) * lift;
    bottleEl.style.transform = 'translate(' + (dxF * p).toFixed(1) + 'px,' + (dyF * p + arc).toFixed(1) + 'px) rotate(' + ang.toFixed(2) + 'deg)';
    renderer.renderBottle(si, ang);
  });
  bottleEl.style.transform = 'translate(' + dxF.toFixed(1) + 'px,' + dyF.toFixed(1) + 'px) rotate(' + A.toFixed(2) + 'deg)';
  renderer.renderBottle(si, A);

  /* phase 2: arc stream + drain */
  const dur = RM ? 40 : 260 + activeRenderProfile().settleMs + 150 * n;
  const dstUnits0 = visual[di].reduce((s, x) => s + x.u, 0);
  const surfaceY = dRect.top + ((shD.B - dstUnits0 * shD.unit) / shD.vbH) * bhD;
  const c0 = COLORS[color][0], c1 = COLORS[color][1];

  /* Gravity arc metadata for the active renderer. */
  const sx = Q.x - stageRect.left, sy = Q.y - stageRect.top;
  const tx = Pm.x - stageRect.left, ty = surfaceY - stageRect.top;
  const cpx = sx + (tx - sx) * 0.35 + side * 8;
  const cpy = Math.min(sy, ty) - Math.abs(tx - sx) * 0.12 - 6;
  renderer.beginPour({ si, di, color, c0, c1, sx, sy, tx, ty, cpx, cpy, side, receiverW: bwD, progress: 0, started: performance.now() });
  AudioFX.pour(dur / 1000 + 0.1);
  buzz(12);

  const snapS = visual[si].map(s => ({ c: s.c, u: s.u }));
  const snapD = visual[di].map(s => ({ c: s.c, u: s.u }));
  await tween(dur, p => {
    visual[si] = drainSnapshot(snapS, n * p);
    visual[di] = fillSnapshot(snapD, color, n * p);
    renderer.updatePour({ si, progress: p, sx, sy, tx, ty, cpx, cpy });
    renderer.renderBottle(si, A);
    renderer.renderBottle(di, 0);
  });
  renderer.endPour({ si, di });
  if (explicitPrettyEffects()) spawnSparkles(slots[di].el, 4, 0.25);

  /* phase 3: return */
  await tween(RM ? 0 : activeRenderProfile().settleMs + 160, p => {
    const q = 1 - p;
    const ang = A * q;
    const arc = -Math.sin(p * Math.PI) * lift * 0.5;
    bottleEl.style.transform = 'translate(' + (dxF * q).toFixed(1) + 'px,' + (dyF * q + arc).toFixed(1) + 'px) rotate(' + ang.toFixed(2) + 'deg)';
    renderer.renderBottle(si, ang);
  });
  bottleEl.style.transform = '';
  bottleEl.style.transition = '';
  slotEl.classList.remove('pouring');

  visual[si] = mergeRuns(state[si]);
  visual[di] = mergeRuns(state[di]);
  revealMystery(si);
  renderer.renderBottle(si, 0); renderer.renderBottle(di, 0);

  if (window.isBottleComplete(state[di])) {
    /* a complete bottle holds no secrets â€” reveal any hidden bands under the cap */
    if (hiddenDepth[di]) { hiddenDepth[di] = 0; renderer.renderBottle(di, 0); AudioFX.reveal(); }
    slots[di].el.classList.add('capped');
    if (!RM) spawnSparkles(slots[di].el, 8, 0.55);
    AudioFX.cap(); buzz([15, 40, 25]);
    orbUpdate(true);
    if (frozen.size) thawAll();
  }

  locked.delete(si); locked.delete(di); activePours--;
  sloshBottle(di, Math.min(2, n));
  sloshBottle(si, 0.5);
  updateHUD();
  updateBottleLabels();
  if (pendingLayout && activePours === 0) { pendingLayout = false; renderer.syncLayout(); }
  if (activePours === 0 && window.isSolved(state)) {
    await wait(RM ? 100 : 550);
    onWin();
  } else if (activePours === 0 && !autoPlaying && !anyUsefulMove()) {
    toastMsg('No moves left â€” undo â†© or restart âŸ³', 3200);
    AudioFX.invalid();
  }
}

/* a position is stuck when no pour between usable bottles is legal */
function anyUsefulMove() {
  for (let i = 0; i < state.length; i++) {
    if (frozen.has(i) || !state[i].length || window.isBottleComplete(state[i])) continue;
    for (let j = 0; j < state.length; j++) {
      if (i === j || frozen.has(j)) continue;
      if (window.canPour(state, i, j)) return true;
    }
  }
  return false;
}

/* ---------------- liquid slosh (settling surface after a pour) ---------------- */
function sloshBottle(i, amp) {
  if (!slots[i]) return;
  if (Fluid.active()) {            /* the height-field sim settles it for real */
    if (!locked.has(i)) renderer.renderBottle(i, 0);   /* register the (now upright) wave surface */
    Fluid.drop(i, -(amp || 1) * 3.2);
    Fluid.start();
    return;
  }
  if (RM) return;
  const a0 = amp || 1;
  const t0 = performance.now();
  tween(700, p => {
    if (!slots[i] || locked.has(i)) return; /* a new pour owns this bottle now */
    const decay = (1 - p) * a0;
    const t = (performance.now() - t0) / 1000;
    renderer.renderBottle(i, 0, decay > 0.02
      ? { dy: Math.sin(t * 19) * 2.4 * decay, rot: Math.sin(t * 19 + 1.3) * 4.5 * decay }
      : null);
  });
}

/* ---------------- sparkles ---------------- */
function spawnSparkles(host, count, spread) {
  count = Math.max(0, Math.round(count * activeRenderProfile().particleScale));
  for (let k = 0; k < count; k++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const ang = Math.random() * Math.PI * 2;
    const dist = (0.4 + Math.random() * 0.9) * 100 * (spread + 0.4);
    s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * dist - 30).toFixed(0) + 'px');
    s.style.animationDelay = (Math.random() * 0.12) + 's';
    host.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

/* ---------------- undo / restart ---------------- */
function undo() {
  if (!undoHistory.length || activePours > 0 || undosLeft <= 0 || autoPlaying) return;
  const snap = undoHistory.pop();
  undosUsed++;
  if (undosAllowed !== Infinity) undosLeft--;
  setSelected(null);
  restoreBoardSnapshot(snap);
  AudioFX.undo();
  updateBottleLabels();
}

/* ---------------- AI assistant (hints & autoplay) ----------------
   The same solver that verifies every level also plays it: hints show
   the first move of a fresh optimal-ish solution from the current
   position; autoplay performs the whole line with real pours. */
const SOLVER_WORKER_TIMEOUT = 4500;
let solverWorker = null;
let solverRequestId = 0;
let solverReject = null;
let solverTimer = null;
let solutionPending = false;

function solverWorkerSource() {
  return `'use strict';
const CAP = ${window.CAP};
const cloneState = ${window.cloneState.toString()};
const stateKey = ${window.stateKey.toString()};
const topRun = ${window.topRun.toString()};
const isBottleComplete = ${window.isBottleComplete.toString()};
const isBottleClear = ${window.isBottleClear.toString()};
const isSolved = ${window.isSolved.toString()};
const pourAmount = ${window.pourAmount.toString()};
const applyPour = ${window.applyPour.toString()};
const solve = ${window.solve.toString()};
self.onmessage = e => {
  const { id, state, frozen, budget } = e.data || {};
  try {
    const frozenSet = frozen && frozen.length ? new Set(frozen) : null;
    const res = solve(cloneState(state || []), budget || 250000, frozenSet);
    self.postMessage({ id, solution: res.solution || null, nodes: res.nodes || 0, aborted: !!res.aborted });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};`;
}

function getSolverWorker() {
  if (solverWorker) return solverWorker;
  const blob = new Blob([solverWorkerSource()], { type: 'application/javascript' });
  solverWorker = new Worker(URL.createObjectURL(blob));
  return solverWorker;
}

function cancelSolution(reason) {
  if (solverReject) solverReject(new Error(reason || 'cancelled'));
  solverReject = null;
  clearTimeout(solverTimer);
  solverTimer = null;
  if (solverWorker) {
    solverWorker.terminate();
    solverWorker = null;
  }
  solutionPending = false;
  updateHUD();
}

function requestSolution({ state: requestedState, frozen: requestedFrozen, budget }) {
  cancelSolution('cancelled');
  solutionPending = true;
  updateHUD();
  const id = ++solverRequestId;
  const worker = getSolverWorker();
  return new Promise((resolve, reject) => {
    solverReject = reject;
    solverTimer = setTimeout(() => {
      if (id === solverRequestId) cancelSolution('timeout');
    }, SOLVER_WORKER_TIMEOUT);
    worker.onmessage = e => {
      if (!e.data || e.data.id !== id) return;
      clearTimeout(solverTimer);
      solverTimer = null;
      solverReject = null;
      solutionPending = false;
      updateHUD();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    worker.onerror = e => {
      clearTimeout(solverTimer);
      solverTimer = null;
      solverReject = null;
      solutionPending = false;
      updateHUD();
      reject(new Error(e.message || 'worker error'));
    };
    worker.postMessage({
      id,
      state: window.cloneState(requestedState),
      frozen: requestedFrozen ? Array.from(requestedFrozen) : [],
      budget: budget || 250000
    });
  });
}

function clearHintGlow() {
  document.querySelectorAll('.hint-src, .hint-dst').forEach(el => el.classList.remove('hint-src', 'hint-dst'));
}

let hintGlowT = null;
async function showHint() {
  if (activePours > 0 || autoPlaying || solutionPending || !state.length || window.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Hints are paused in Rush for timer fairness âš¡', 2200); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinkingâ€¦', 1200);
  let res;
  try {
    res = await requestSolution({ state, frozen, budget: 250000 });
  } catch (err) {
    toastMsg((err && err.message === 'timeout') ? 'Still thinking â€” try a smaller board or undo â†©' : 'Search interrupted â€” try again', 3000);
    AudioFX.invalid();
    return;
  }
  if (res.aborted) { toastMsg('Ran out of search budget â€” undo â†© a little', 3000); AudioFX.invalid(); return; }
  const sol = res.solution && res.solution.length ? res.solution : null;
  if (!sol) { toastMsg('No solution found from here â€” undo â†© a little', 3000); AudioFX.invalid(); return; }
  const [i, j] = sol[0];
  clearHintGlow();
  slots[i].el.classList.add('hint-src');
  slots[j].el.classList.add('hint-dst');
  clearTimeout(hintGlowT);
  hintGlowT = setTimeout(clearHintGlow, 2400);
  const c = state[i][state[i].length - 1];
  const what = veiled[i] || (hiddenDepth[i] || 0) >= state[i].length ? 'that bottle' : 'the ' + COLOR_NAMES[c];
  toastMsg('Hint: pour ' + what + ' into the glowing bottle â€” ' + sol.length + ' to go');
  usedHint = true;
  unlockAch('oracle');
  AudioFX.reveal(); buzz(8);
}

async function autoSolve() {
  if (activePours > 0 || autoPlaying || solutionPending || !state.length || window.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Auto-solve is paused in Rush for timer fairness âš¡', 2400); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinkingâ€¦', 1200);
  let res;
  try {
    res = await requestSolution({ state, frozen, budget: 350000 });
  } catch (err) {
    toastMsg((err && err.message === 'timeout') ? 'Timed out searching â€” control is back' : 'Search interrupted â€” try again', 3200);
    AudioFX.invalid();
    return;
  }
  if (res.aborted) { toastMsg('Hit the search budget â€” undo â†© a few moves first', 3200); AudioFX.invalid(); return; }
  const sol = res.solution && res.solution.length ? res.solution : null;
  if (!sol) { toastMsg('No solution found from here â€” undo â†© a few moves first', 3200); AudioFX.invalid(); return; }
  autoPlaying = true; usedAuto = true;
  setSelected(null); clearHintGlow();
  updateHUD();
  toastMsg('Auto-solving â€” watch the ' + sol.length + '-move solve âœ¨', 2400);
  for (const [i, j] of sol) {
    if (!autoPlaying) break;
    if (veiled[i]) unveil(i);
    if (veiled[j]) unveil(j);
    await doPour(i, j);
    await wait(RM ? 30 : 140);
  }
  autoPlaying = false;
  updateHUD();
}

/* ---------------- achievements ---------------- */
const ACHIEVEMENTS = [
  { id: 'first',    icon: 'ðŸ¾', name: 'First pour',       desc: 'Complete your first level' },
  { id: 'triple',   icon: 'ðŸŒŸ', name: 'Flawless',         desc: 'Earn 3 stars on a level' },
  { id: 'perfect3', icon: 'ðŸ‘‘', name: 'Hat trick',        desc: '3-star three levels in a row' },
  { id: 'stars25',  icon: 'âœ¨', name: 'Constellation',    desc: 'Collect 25 stars in Classic' },
  { id: 'stars60',  icon: 'ðŸŒŒ', name: 'Galaxy brain',     desc: 'Collect 60 stars in Classic' },
  { id: 'expert',   icon: 'ðŸ§ ', name: 'Master mixer',     desc: 'Beat an Expert level' },
  { id: 'pure',     icon: 'ðŸŽ¯', name: 'No takebacks',     desc: 'Beat Normal or Expert without undo' },
  { id: 'daily',    icon: 'ðŸ“…', name: 'Fresh squeeze',    desc: 'Complete a Daily Challenge' },
  { id: 'streak3',  icon: 'ðŸ”¥', name: 'On a roll',        desc: 'Reach a 3-day Daily streak' },
  { id: 'rush5',    icon: 'âš¡', name: 'Quicksilver',      desc: 'Clear stage 5 in Rush' },
  { id: 'oracle',   icon: 'ðŸ’¡', name: 'Ask the oracle',   desc: 'Use one of your hints' }
];

let achToastT = null;
function unlockAch(id) {
  if (save.ach[id]) return;
  save.ach[id] = Date.now();
  persist();
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  const t = $('#ach-toast');
  t.querySelector('.at-icon').textContent = a.icon;
  t.querySelector('.at-name').textContent = a.name;
  t.classList.add('show');
  AudioFX.cap(); buzz([10, 30, 10]);
  clearTimeout(achToastT);
  achToastT = setTimeout(() => t.classList.remove('show'), 3200);
}

function renderAchList() {
  const list = $('#ach-list');
  list.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const row = document.createElement('div');
    row.className = 'ach-row' + (save.ach[a.id] ? ' got' : '');
    row.innerHTML = '<span class="ai">' + a.icon + '</span><span><div class="an">' + a.name + '</div><div class="ad">' + a.desc + '</div></span>';
    list.appendChild(row);
  });
}

/* ---------------- themes (art directions) ---------------- */
const THEMES = [
  { id: 'apothecary', name: 'Apothecary', palette: APO_COLORS, hidden: ['#cbb186', '#8a6a3e'],
    modes: true, kicker: 'The Apothecary', tag: 'Decant, settle, set in order.',
    rim: { light: 'rgba(255,255,255,0.95)', dark: 'rgba(225,240,255,0.82)' }, shadow: '#3a2410',
    preview: 'radial-gradient(125% 85% at 50% -10%, #fff8ea, #e7cf9f 68%, #caa46a)' },
  { id: 'neon', name: 'Neon Arcade', palette: NEON_COLORS, hidden: ['#5a4b86', '#2e2550'],
    modes: false, kicker: 'Arcade', tag: 'Sort to the beat.',
    rim: { light: 'rgba(190,240,255,0.9)', dark: 'rgba(190,240,255,0.9)' }, shadow: '#06021a',
    preview: 'radial-gradient(circle at 50% 78%, rgba(255,76,198,0.85), transparent 58%), linear-gradient(#160a28, #1d0c33)' },
  { id: 'tidepool', name: 'Tidepool Glass', palette: TIDE_COLORS, hidden: ['#d8f3ee', '#4d7f86'],
    modes: false, kicker: 'Tidepool Glass', tag: 'Sort in the shallows.',
    rim: { light: 'rgba(245,255,250,0.96)', dark: 'rgba(245,255,250,0.96)' }, shadow: '#144d55',
    preview: 'radial-gradient(circle at 34% 24%, rgba(255,255,220,0.9), transparent 34%), radial-gradient(circle at 78% 74%, rgba(240,123,99,0.7), transparent 34%), linear-gradient(140deg, #dff8ee, #71c5c1 62%, #477f92)' }
];

function totalStars() {
  let t = 0;
  for (const d of ['relaxed', 'normal', 'expert']) {
    const p = save.progress[d] || {};
    for (const k in p) t += p[k].stars || 0;
  }
  return t;
}

/* rebuild palette-/furniture-dependent SVG when the skin or mode changes */
function refreshBottles() {
  const hb = $('.hero-bottles');
  if (hb && hb.children.length) { hb.innerHTML = ''; buildHeroBottles(); }
  if (typeof state !== 'undefined' && state.length && slots && slots.length
      && !$('#game').classList.contains('hidden')) {
    renderer.setTheme();
  }
}

function applyTheme() {
  const t = THEMES.find(x => x.id === save.theme) || THEMES[0];
  SKIN = t.id;
  MODE = t.modes ? (save.mode === 'dark' ? 'dark' : 'light') : (t.id === 'neon' ? 'dark' : 'light');
  document.body.dataset.skin = SKIN;
  document.body.dataset.mode = MODE;
  COLORS = t.palette;
  HIDDEN_FILL = t.hidden;
  RIM_COLOR = t.modes ? t.rim[MODE] : t.rim.light;
  GLASS_SHADOW = t.shadow;
  applyBackgroundQuality();
  buildDefs();
  const k = $('#brand-kicker'), tg = $('#brand-tag');
  if (k) k.textContent = t.kicker;
  if (tg) tg.textContent = t.tag;
  refreshBottles();
  if (document.body.dataset.screen === 'menu' && ambientRaf) {
    stopAmbient();
    startAmbient();
  }
}

function toggleMode() {
  save.mode = save.mode === 'dark' ? 'light' : 'dark';
  persist();
  applyTheme();
  AudioFX.select();
}

function renderThemeGrid() {
  const grid = $('#theme-grid');
  grid.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'theme-card' + (save.theme === t.id ? ' on' : '');
    b.setAttribute('aria-pressed', save.theme === t.id ? 'true' : 'false');
    b.style.background = t.preview;
    b.innerHTML = '<span>' + t.name + '</span>';
    b.addEventListener('click', () => {
      save.theme = t.id;
      persist();
      applyTheme();
      renderSettings();   /* refresh switches (incl. Neon-gated dark row) + theme grid */
      AudioFX.select();
    });
    grid.appendChild(b);
  });
}

function renderSettings() {
  const setSwitch = (sel, on) => {
    const sw = $(sel);
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  setSwitch('#sw-sound', !!save.sound);
  setSwitch('#sw-haptics', !!save.haptics);
  setSwitch('#sw-symbols', !!save.symbols);
  setSwitch('#sw-fluid', !!save.fluid);
  setSwitch('#sw-dark', save.mode === 'dark');
  const rq = $('#render-quality');
  if (rq) rq.value = save.renderQuality;
  renderThemeGrid();
}

/* ---------------- win ---------------- */
function starsFor(m) { return m <= par ? 3 : m <= Math.ceil(par * 1.5) ? 2 : 1; }

function onWin() {
  if (mode === 'rush') return onRushStageClear();
  const st = usedAuto ? 1 : starsFor(moves);
  let meta = moves + ' moves Â· par ' + par;

  if (mode === 'daily') {
    const today = todayStr();
    if (save.daily.lastWin !== today) {
      save.daily.streak = save.daily.lastWin === todayStr(-1) ? save.daily.streak + 1 : 1;
      save.daily.lastWin = today;
    }
    persist();
    unlockAch('daily');
    if (save.daily.streak >= 3) unlockAch('streak3');
    $('#win-title').textContent = 'Daily complete!';
    meta += ' Â· ðŸ”¥ ' + save.daily.streak + '-day streak';
    $('#btn-next').classList.add('hidden');
  } else {
    const prev = save.progress[difficulty][level];
    save.progress[difficulty][level] = {
      stars: Math.max(st, prev ? prev.stars : 0),
      best: Math.min(moves, prev ? prev.best : Infinity)
    };
    persist();
    unlockAch('first');
    if (difficulty === 'expert') unlockAch('expert');
    if (!undosUsed && !usedAuto && difficulty !== 'relaxed') unlockAch('pure');
    if (st === 3) { unlockAch('triple'); perfectStreak++; if (perfectStreak >= 3) unlockAch('perfect3'); }
    else perfectStreak = 0;
    const ts = totalStars();
    if (ts >= 25) unlockAch('stars25');
    if (ts >= 60) unlockAch('stars60');
    $('#win-title').textContent = 'Level complete';
    const best = save.progress[difficulty][level].best;
    if (best < moves) meta += ' Â· best ' + best;
    $('#btn-next').classList.toggle('hidden', level >= window.MAX_LEVEL);
  }

  if (usedAuto) meta += ' Â· auto-solved âœ¨';
  $('#win-stars').innerHTML = [1, 2, 3].map(k => '<span class="' + (k <= st ? '' : 'off') + '">â˜…</span>').join('');
  $('#win-meta').textContent = meta;
  $('#overlay').classList.add('show');
  const orbHost = $('#orb');
  if (orbHost && !RM) { orbHost.classList.add('burst'); spawnSparkles(orbHost, 10, 0.7); setTimeout(() => orbHost.classList.remove('burst'), 900); }
  AudioFX.win(); buzz([20, 50, 20, 50, 60]);
  if (!RM) {
    confetti();
    const fl = $('#flash');
    fl.style.background = SKIN === 'neon'
      ? 'radial-gradient(60% 60% at 50% 40%, rgba(255,76,198,0.45), transparent 70%)'
      : SKIN === 'tidepool'
        ? 'radial-gradient(60% 60% at 50% 40%, rgba(255,220,184,0.48), transparent 66%), radial-gradient(42% 42% at 50% 50%, rgba(91,218,198,0.26), transparent 72%)'
      : MODE === 'dark'
        ? 'radial-gradient(60% 60% at 50% 40%, rgba(255,180,90,0.50), transparent 70%)'
        : 'radial-gradient(60% 60% at 50% 40%, rgba(255,245,224,0.55), transparent 70%)';
    fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  }
}

/* ---------------- celebration: confetti + firework bursts ---------------- */
function celebrationQuality() {
  const area = innerWidth * innerHeight;
  const cores = navigator.hardwareConcurrency || 4;
  const profile = activeRenderProfile();
  const savedLowPower = !!(save && save.lowPowerEffects);
  const lowPower = profile.id === 'low' || savedLowPower || cores <= 4 || area < 520000;
  const small = area < 420000 || Math.min(innerWidth, innerHeight) < 420;
  const quality = profile.id;
  const intensity = profile.celebrationIntensity;
  return {
    quality, lowPower, savedLowPower, cores, area, intensity,
    confettiCount: Math.max(18, Math.round((lowPower ? (small ? 50 : 70) : (quality === 'normal' ? 95 : 110)) * intensity)),
    fireworkCount: Math.max(8, Math.round((lowPower ? 18 : (quality === 'normal' ? 28 : 38)) * intensity))
  };
}

function confetti() {
  const cv = $('#confetti');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  cv.width = innerWidth; cv.height = innerHeight;
  const q = celebrationQuality();
  if (window.__vesselPerf) window.__vesselPerf.selectedCelebrationQuality = q;
  const maxParts = q.confettiCount + q.fireworkCount * 3;
  const parts = new Array(maxParts);
  let partCount = 0;
  function alloc(part) {
    if (partCount < maxParts) parts[partCount++] = part;
  }
  for (let i = 0; i < q.confettiCount; i++) {
    const c = COLORS[i % COLORS.length];
    alloc({
      kind: 'c',
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.5,
      y: innerHeight * 0.28 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 3,
      s: 5 + Math.random() * 7,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      col: Math.random() < 0.5 ? c[0] : c[1]
    });
  }
  /* timed firework shells, each exploding into glowing sparks with trails */
  const bursts = [
    { x: innerWidth * 0.26, y: innerHeight * 0.30, at: 0.12 },
    { x: innerWidth * 0.74, y: innerHeight * 0.24, at: 0.48 },
    { x: innerWidth * 0.50, y: innerHeight * 0.16, at: 0.86 }
  ];
  function explode(b) {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    const n = q.fireworkCount;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + Math.random() * 0.18;
      const sp = 3.2 + Math.random() * 4.6;
      alloc({
        kind: 'f', x: b.x, y: b.y, px: b.x, py: b.y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, fade: 0.014 + Math.random() * 0.012,
        col: Math.random() < 0.7 ? c[0] : '#ffffff'
      });
    }
  }
  const t0 = performance.now();
  (function frame(now) {
    PerfMeter.mark('canvas-confetti', now);
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    bursts.forEach(b => { if (!b.done && t >= b.at) { b.done = true; explode(b); } });
    for (let i = 0; i < partCount; i++) {
      const p = parts[i];
      if (p.kind === 'c') {
        p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= 0.992;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 2.6);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        ctx.restore();
      } else {
        if (p.life <= 0) continue;
        p.px = p.x; p.py = p.y;
        p.vy += 0.075; p.vx *= 0.975; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy;
        p.life -= p.fade;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.px - p.vx * 1.6, p.py - p.vy * 1.6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (t < 3.1) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

/* ---------------- ambient dust ---------------- */
let ambientRaf = 0;
let ambientResize = null;

function clearAmbientCanvas() {
  const cv = $('#ambient');
  const ctx = cv && cv.getContext && cv.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
}

function startAmbient() {
  if (RM || ambientRaf || document.hidden || document.body.dataset.screen !== 'menu' || !activeRenderProfile().idleAnimations) return;
  const cv = $('#ambient');
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;
  let W, H, parts = [];
  function size() {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    parts = [];
    const count = Math.max(4, Math.round(Math.min(44, Math.floor(W * H / 38000)) * activeRenderProfile().particleScale));
    const hues = SKIN === 'tidepool'
      ? ['226,255,247', '255,184,154', '196,242,222']
      : SKIN === 'neon'
        ? ['255,76,198', '80,220,255', '180,120,255']
        : ['255,220,170', '160,200,255'];
    for (let i = 0; i < count; i++) parts.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.7 + Math.random() * 1.9,
      vy: -(0.06 + Math.random() * 0.16),
      vx: (Math.random() - 0.5) * 0.06,
      ph: Math.random() * Math.PI * 2,
      big: Math.random() < 0.12,
      hue: hues[Math.floor(Math.random() * hues.length)]
    });
  }
  size();
  ambientResize = size;
  window.addEventListener('resize', ambientResize);
  function frame(now) {
    PerfMeter.mark('canvas-ambient', now);
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y += p.vy; p.x += p.vx + Math.sin(now / 2400 + p.ph) * 0.05;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      const tw = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(now / 700 + p.ph * 3));
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + p.hue + ',' + tw.toFixed(2) + ')';
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
      if (p.big) { /* four-point twinkle on the brightest motes */
        ctx.strokeStyle = 'rgba(' + p.hue + ',' + (tw * 0.7).toFixed(2) + ')';
        ctx.lineWidth = 0.8;
        const e = p.r * (2.2 + tw * 2);
        ctx.beginPath();
        ctx.moveTo(p.x - e, p.y); ctx.lineTo(p.x + e, p.y);
        ctx.moveTo(p.x, p.y - e); ctx.lineTo(p.x, p.y + e);
        ctx.stroke();
      }
    }
    ambientRaf = requestAnimationFrame(frame);
  }
  ambientRaf = requestAnimationFrame(frame);
}

function stopAmbient() {
  if (ambientRaf) {
    cancelAnimationFrame(ambientRaf);
    ambientRaf = 0;
  }
  if (ambientResize) {
    window.removeEventListener('resize', ambientResize);
    ambientResize = null;
  }
  clearAmbientCanvas();
}

/* ---------------- screens / menu ---------------- */
function showScreen(name) {
  $('#menu').classList.toggle('hidden', name !== 'menu');
  $('#game').classList.toggle('hidden', name !== 'game');
  document.body.dataset.screen = name;
  if (name === 'menu' && !RM && !document.hidden) startAmbient();
  else stopAmbient();
  /* push one history entry on entering gameplay so the device/browser Back
     button returns to the menu instead of leaving the page (window.history is
     the browser API; the game's undo stack is the separate `undoHistory`) */
  if (name === 'game' && (!window.history.state || window.history.state.screen !== 'game')) {
    window.history.pushState({ screen: 'game' }, '');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAmbient();
  else if (document.body.dataset.screen === 'menu') startAmbient();
});

/* in-app back: consume the gameplay history entry so the stack stays in sync */
function exitToMenu() {
  if (window.history.state && window.history.state.screen === 'game') window.history.back();
  else goMenu();
}

function unlockedUpTo() {
  let u = Math.min(10, window.MAX_LEVEL);
  while (u < window.MAX_LEVEL && save.progress[difficulty][u]) u++;
  return u;
}

function renderMenu() {
  document.querySelectorAll('#diff-seg button').forEach(b => b.classList.toggle('on', b.dataset.d === difficulty));
  $('#chip-stars').textContent = 'â˜… ' + totalStars();
  $('#chip-streak').textContent = 'ðŸ”¥ ' + (save.daily.streak || 0) + ' day streak';
  const doneToday = save.daily.lastWin === todayStr();
  $('#card-daily').classList.toggle('done', doneToday);
  $('#daily-sub').textContent = doneToday ? 'âœ“ Done Â· back tomorrow' : 'Play todayâ€™s puzzle';
  $('#rush-sub').textContent = save.rushBest > 0 ? 'Best Â· stage ' + save.rushBest : 'Race the clock';
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const maxOpen = unlockedUpTo();
  for (let l = 1; l <= window.MAX_LEVEL; l++) {
    const t = document.createElement('button');
    t.className = 'tile';
    const p = save.progress[difficulty][l];
    const open = l <= maxOpen;
    if (!open) t.classList.add('locked');
    if (p) t.classList.add('done');
    let starsHTML = '';
    if (p) starsHTML = [1, 2, 3].map(k => '<span class="' + (k <= p.stars ? '' : 'off') + '">â˜…</span>').join('');
    t.innerHTML = '<div class="num">' + l + '</div>' +
      (open ? '<div class="stars">' + starsHTML + '</div>' : '<div class="lock">ðŸ”’</div>');
    if (open) t.addEventListener('click', () => { AudioFX.select(); loadLevel(l); });
    else t.addEventListener('click', () => { AudioFX.invalid(); });
    t.setAttribute('aria-label', 'Level ' + l + (open ? '' : ' locked'));
    grid.appendChild(t);
  }
  $('#btn-sound-menu').textContent = save.sound ? 'ðŸ”Š Sound on' : 'ðŸ”‡ Sound off';
}

function buildHeroBottles() {
  const wrap = $('.hero-bottles');
  const demos = [
    ['classic', [{ c: 4, u: 4 }]],
    ['flask', [{ c: 6, u: 2 }, { c: 7, u: 2 }]],
    ['tall', [{ c: 1, u: 1 }, { c: 2, u: 2 }, { c: 5, u: 1 }]]
  ];
  demos.forEach(([shapeName, segs]) => {
    const sh = SHAPES[shapeName];
    const svg = buildBottleSVG(shapeName, { cork: true, label: true });
    const g = svg.querySelector('.liquids');
    let cum = 0;
    segs.forEach(seg => {
      const yBot = sh.volToY ? sh.volToY(cum / 4) : sh.B - cum * sh.unit;
      const yTop = sh.volToY ? sh.volToY((cum + seg.u) / 4) : sh.B - (cum + seg.u) * sh.unit;
      const h = yBot - yTop;
      g.appendChild(svgEl('rect', { x: -50, y: yTop, width: 220, height: h + 1.2, fill: 'url(#liq' + seg.c + ')' }));
      g.appendChild(svgEl('ellipse', { cx: 50, cy: yTop + 0.7, rx: sh.surfRx, ry: 4, fill: COLORS[seg.c][0], opacity: 0.5 }));
      cum += seg.u;
    });
    wrap.appendChild(svg);
  });
}

/* ---------------- wiring ---------------- */
function goMenu() {
  stopRushTimer();
  autoPlaying = false;
  setSelected(null);
  $('#overlay').classList.remove('show');
  renderMenu();
  showScreen('menu');
}

function restartCurrent() {
  if (mode === 'daily') loadDaily();
  else if (mode === 'rush') loadRushStage();
  else loadLevel(level);
}

const modalState = new WeakMap();
const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function actionableControls(modalEl) {
  return Array.from(modalEl.querySelectorAll(FOCUSABLE))
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

function openModal(modalEl, initialFocusEl) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(modalEl);
      if (modalEl.id === 'settings-modal') renderMenu();
      return;
    }
    if (e.key !== 'Tab') return;
    const controls = actionableControls(modalEl);
    if (!controls.length) {
      e.preventDefault();
      modalEl.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  modalEl.classList.remove('hidden');
  modalEl.setAttribute('tabindex', '-1');
  modalState.set(modalEl, { previousFocus, onKeyDown });
  modalEl.addEventListener('keydown', onKeyDown);
  const target = initialFocusEl || actionableControls(modalEl)[0] || modalEl;
  target.focus();
}

function closeModal(modalEl) {
  const state = modalState.get(modalEl);
  if (state && state.onKeyDown) modalEl.removeEventListener('keydown', state.onKeyDown);
  modalEl.classList.add('hidden');
  modalState.delete(modalEl);
  if (state && state.previousFocus && typeof state.previousFocus.focus === 'function') {
    state.previousFocus.focus();
  }
}

function init() {
  for (const k in SHAPES) {
    SHAPES[k].unit = (SHAPES[k].B - SHAPES[k].T) / 4;
    SHAPES[k].volToY = buildVolMap(k, SHAPES[k]);
  }
  Fluid.enabled = save.fluid !== false;
  applyRenderQuality();
  applyTheme();
  buildDefs();
  buildOrb();
  buildHeroBottles();
  renderMenu();
  window.history.replaceState({ screen: 'menu' }, '');   /* seed a clean base entry for Back handling */
  showScreen('menu');

  document.querySelectorAll('#diff-seg button').forEach(b =>
    b.addEventListener('click', () => {
      difficulty = b.dataset.d; save.difficulty = difficulty; persist();
      AudioFX.select(); renderMenu();
    }));
  $('#btn-sound-menu').addEventListener('click', () => {
    save.sound = !save.sound; persist(); renderMenu(); AudioFX.select();
  });
  $('#btn-back').addEventListener('click', () => { AudioFX.swap(); exitToMenu(); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-restart').addEventListener('click', () => { if (activePours === 0 && !autoPlaying) { AudioFX.swap(); restartCurrent(); } });
  $('#btn-sound').addEventListener('click', () => {
    save.sound = !save.sound; persist();
    $('#btn-sound').textContent = save.sound ? 'ðŸ”Š' : 'ðŸ”‡';
    AudioFX.select();
  });
  $('#btn-sound').textContent = save.sound ? 'ðŸ”Š' : 'ðŸ”‡';

  $('#btn-replay').addEventListener('click', () => {
    $('#overlay').classList.remove('show');
    if (mode === 'rush') startRush();      /* a fresh run after Time's up */
    else restartCurrent();
  });
  $('#btn-menu').addEventListener('click', () => { exitToMenu(); });
  $('#btn-next').addEventListener('click', () => { $('#overlay').classList.remove('show'); if (level < window.MAX_LEVEL) loadLevel(level + 1); });

  /* modes */
  $('#card-daily').addEventListener('click', () => { AudioFX.select(); loadDaily(); });
  $('#card-rush').addEventListener('click', () => { AudioFX.select(); startRush(); });

  /* AI assistant */
  $('#btn-hint').addEventListener('click', showHint);

  /* settings & achievements */
  $('#btn-settings').addEventListener('click', () => { AudioFX.select(); renderSettings(); openModal($('#settings-modal'), $('#sw-sound')); });
  $('#settings-close').addEventListener('click', () => { AudioFX.swap(); closeModal($('#settings-modal')); renderMenu(); });
  $('#btn-ach').addEventListener('click', () => { AudioFX.select(); renderAchList(); openModal($('#ach-modal'), $('#ach-close')); });
  $('#ach-close').addEventListener('click', () => { AudioFX.swap(); closeModal($('#ach-modal')); });
  [['#settings-modal'], ['#ach-modal']].forEach(([sel2]) => {
    const m = $(sel2);
    m.addEventListener('click', e => {
      if (e.target !== m) return;
      closeModal(m);
      if (m.id === 'settings-modal') renderMenu();
    });
  });
  $('#sw-sound').addEventListener('click', () => { save.sound = !save.sound; persist(); renderSettings(); AudioFX.select(); });
  $('#sw-haptics').addEventListener('click', () => { save.haptics = !save.haptics; persist(); renderSettings(); buzz(15); });
  $('#sw-symbols').addEventListener('click', () => {
    save.symbols = !save.symbols; persist(); renderSettings(); AudioFX.select();
    if (state.length && slots.length) renderer.renderAll();
  });
  $('#sw-fluid').addEventListener('click', () => {
    save.fluid = !save.fluid; Fluid.enabled = !!save.fluid; resetFluidRuntime(); persist(); renderSettings(); AudioFX.select();
    if (state.length && slots.length) renderer.renderAll();
  });
  $('#render-quality').addEventListener('change', e => {
    save.renderQuality = e.target.value;
    persist();
    applyRenderQuality(save.renderQuality === 'auto' ? 'auto profile selected' : '');
    renderSettings();
    AudioFX.select();
  });
  $('#sw-dark').addEventListener('click', () => { toggleMode(); renderSettings(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Erase all progress, stars and achievements?')) return;
    save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    persist();
    applyRenderQuality();
    applyTheme();
    renderSettings();
    renderMenu();
    AudioFX.undo();
  });

  let rT;
  const relayout = () => { clearTimeout(rT); rT = setTimeout(() => { if (activePours === 0) renderer.syncLayout(); else pendingLayout = true; }, 120); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  $('#game').addEventListener('keydown', handleGameKey);
  window.addEventListener('pointerdown', () => AudioFX.ensure(), { once: true });
  /* device/browser Back while in a level returns to the menu, never off-page */
  window.addEventListener('popstate', () => {
    if (!$('#game').classList.contains('hidden')) goMenu();
  });
}

window.__vessel = {
  loadLevel, onTap, undo, loadDaily, startRush, showHint, autoSolve, requestSolution, cancelSolution, totalStars,
  get mode() { return mode; },
  get rushStage() { return rushStage; },
  get rushTimeLeft() { return rushTimeLeft; },
  get autoPlaying() { return autoPlaying; },
  get state() { return state; },
  get moves() { return moves; },
  get activePours() { return activePours; },
  get slots() { return slots; },
  get hiddenDepth() { return hiddenDepth; },
  get shapes() { return shapesByBottle; },
  get veiled() { return veiled; },
  get frozen() { return frozen; },
  get orbFrac() { return orbFrac; }
};

window.__vesselRenderer = renderer;

/* tiny QA surface â€” one low-power profile, mobile-first (no profiler) */
window.__vesselPerf = {
  selectedCelebrationQuality: null,
  get celebrationQuality() { return this.selectedCelebrationQuality || celebrationQuality(); },
  get lowPower() { return this.celebrationQuality.lowPower; },
  glowEnabled: false,    /* WebGL glow removed; per-bottle glow is CSS-only */
  glassEnabled: false,   /* WebGL glass reflections removed */
  beatEnabled: false,    /* rhythm mode removed */
  get bubblesEnabled() { return prettyTidepoolEffects(); },
  get causticsEnabled() { return prettyTidepoolEffects(); },
  get hifiBackdropEnabled() {
    const cls = SKIN === 'apothecary' ? 'apo' : (SKIN === 'tidepool' ? 'tide' : SKIN);
    const el = document.querySelector('.' + cls + '.hifi');
    return !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0';
  },
  get activeRenderer() { return renderer.active; },
  get rendererBackend() { return renderer.active; },
  get fluidEnabled() { return !!save.fluid; },
  get fluidRuntimeEnabled() { return !!(Fluid.enabled && Fluid.runtimeEnabled); },
  get fluidRuntimeReason() { return fluidRuntimeReason; },
  get backgroundQuality() { return backgroundQualityEffective; },
  get backgroundAsset() { return activeBackgroundAsset ? {
    key: activeBackgroundAsset.key,
    png: activeBackgroundAsset.png,
    avif960: activeBackgroundAsset.avif960,
    avif1365: activeBackgroundAsset.avif1365,
    webp960: activeBackgroundAsset.webp960,
    webp1365: activeBackgroundAsset.webp1365
  } : null; },
  get ambientEnabled() { return document.body.dataset.screen === 'menu' && !RM && !document.hidden && !!ambientRaf; },
  get activeAnimations() {
    return (Fluid.running && Fluid.active() && Fluid.hasSims() ? 1 : 0) +   /* liquid surface loop */
           (this.ambientEnabled ? 1 : 0);                /* menu dust loop */
  },
  get metrics() { return PerfMeter.snapshot(); },
  get averageFps() { return PerfMeter.snapshot().averageFps; },
  get avgFrameTime() { return PerfMeter.snapshot().avgFrameTime; },
  get averageFrameTime() { return PerfMeter.snapshot().averageFrameTime; },
  get p95FrameTime() { return PerfMeter.snapshot().p95FrameTime; },
  get droppedFrames() { return PerfMeter.snapshot().droppedFrames; },
  get currentRenderer() { return PerfMeter.snapshot().currentRenderer; },
  get targetFps() { return PerfMeter.snapshot().targetFps; },
  get currentQuality() { return renderQualityEffective; },
  get renderQuality() { return renderQualityEffective; },
  get renderQualitySetting() { return save.renderQuality; },
  get renderProfile() { return Object.assign({}, activeRenderProfile()); },
  get autoDemotionReason() { return renderQualityDemotionReason; },
  get dprCap() { return activeRenderProfile().dprCap; },
  get dpr() { return PerfMeter.snapshot().dpr; },
  get qualityProfile() { return PerfMeter.snapshot().qualityProfile; },
  get perfSampleCount() { return PerfMeter.snapshot().sampleCount; },
  get perfOverlayEnabled() { return PerfMeter.snapshot().overlayEnabled; },
  resetPerf() { PerfMeter.reset(); },
  setPerfOverlay(on) { PerfMeter.enableOverlay(on); }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
