/* ============================================================
   Vessel — game runtime v2
   Shapes, gravity-true liquid, mystery bottles, ambient magic.
   Requires logic.js loaded first.
   ============================================================ */
'use strict';
import { PourPhysics } from './pour-physics.js';
import { startablePours } from './pour-queue.js';
(function () {

/* ---------------- palette ----------------
   Each entry = [bright face, shadow side]; used as a b→a→b across the band. */
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
/* completion lid colours: [left, mid, right, top face]; wood on Apothecary,
   the skin accent elsewhere (what the old DOM .cap used) */
let LID = ['#c79a5e', '#a9763f', '#7c5026', '#caa06a'];

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
  theme: 'apothecary', mode: 'light', haptics: true, fluid: true,
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
save.fluid = save.fluid !== false;   /* realistic liquid motion — default ON */
delete save.glass;                   /* removed: WebGL glass reflections */
delete save.beat;                    /* removed: Neon rhythm mode */
delete save.symbols;                 /* removed: per-colour liquid symbols */
save.seenSpecials = save.seenSpecials || {};
save.ach = save.ach || {};
save.daily = Object.assign({ streak: 0, lastWin: '' }, save.daily || {});
save.lowPowerEffects = save.lowPowerEffects === true;
if (!['auto', 'low', 'normal', 'pretty'].includes(save.renderQuality)) save.renderQuality = 'auto';
if (save.backgroundQualityUserSet !== true) save.backgroundQuality = 'hifi';
if (!['basic', 'hifi'].includes(save.backgroundQuality)) save.backgroundQuality = 'hifi';
function persist() { store.save(save); }

/* ---------------- audio ----------------
   Aliquot-style graph: every voice → master gain → compressor → out, with a
   short filtered delay send for bells. One shared noise buffer, made once. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
const AudioFX = {
  ctx: null, master: null, wet: null, noiseBuf: null,
  voices: new Set(),
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (e) { return null; }
    const master = ctx.createGain();
    master.gain.value = save.sound ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    const d = ctx.createDelay(0.5); d.delayTime.value = 0.12;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.ctx = ctx; this.master = master; this.wet = wet; this.noiseBuf = buf;
    return ctx;
  },
  /* called from user gestures: creates/unlocks the context */
  ensure() {
    const ctx = this.init();
    if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return save.sound ? ctx : null;
  },
  ok() { return !!this.ctx && save.sound && this.ctx.state === 'running'; },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  /* mute/unmute follows save.sound; the master ramp makes it instant and click-free */
  syncMute() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(save.sound ? 0.9 : 0, this.ctx.currentTime, 0.015);
    if (!save.sound) this.stopAllPours();
  },
  env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  },
  tone(f0, f1, dur, peak, when, send, type) {
    const ctx = this.ctx, t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); this.env(g, t0, 0.004, peak, dur);
    o.connect(g); g.connect(this.master); if (send) g.connect(this.wet);
    o.start(t0); o.stop(t0 + dur + 0.06);
  },
  bell(f, peak, when) {
    this.tone(f, f, 1.1, peak, when, true);
    this.tone(f * 2.76, f * 2.76, 0.45, peak * 0.28, when, true);
    this.tone(f * 5.4, f * 5.4, 0.2, peak * 0.09, when, true);
  },
  /* band-passed slice of the shared noise buffer; optional f1 sweeps the band */
  burst(freq, q, dur, peak, when, f1) {
    const ctx = this.ctx, t0 = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(freq, t0);
    if (f1 && f1 !== freq) bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); this.env(g, t0, 0.003, peak, dur);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.06);
  },
  select()  { if (!this.ok()) return; this.tone(1780, 1960, 0.07, 0.05, 0, true); this.tone(2700, 2700, 0.045, 0.014); },
  swap()    { if (!this.ok()) return; this.tone(1500, 1250, 0.06, 0.03); },
  invalid() { if (!this.ok()) return; this.tone(220, 160, 0.09, 0.12); this.tone(185, 125, 0.11, 0.09, 0.1); },
  land()    { if (!this.ok()) return; this.tone(150, 92, 0.09, 0.1); this.tone(2350, 2350, 0.12, 0.022, 0.004, true); },
  undo()    { if (!this.ok()) return; this.tone(980, 620, 0.09, 0.04); this.burst(3000, 1.2, 0.05, 0.025); },
  /* k = bottles completed this level so far: each cork climbs the pentatonic scale */
  cap(k)    {
    if (!this.ok()) return;
    this.burst(1500, 1.8, 0.045, 0.2); this.tone(950, 320, 0.07, 0.1);
    this.bell(PENTA[(k || 0) % PENTA.length], 0.05, 0.05);
  },
  reveal()  { if (!this.ok()) return; this.tone(980, 1480, 0.14, 0.07, 0, true); this.bell(1975.5, 0.018, 0.08); },
  ice()     { if (!this.ok()) return; this.tone(1850, 1700, 0.07, 0.06, 0, true); this.tone(120, 110, 0.08, 0.025, 0, false, 'square'); },
  thaw()    { if (!this.ok()) return; this.burst(2600, 1.1, 0.3, 0.07, 0, 700); this.tone(1320, 880, 0.22, 0.07, 0.05, true); },
  win(when) { if (!this.ok()) return; [0, 2, 4, 5, 7].forEach((k, i) => this.bell(PENTA[k], 0.07, (when || 0) + i * 0.085)); },
  /* continuous pour voice: noise through a resonant band that rises with the
     receiver's fill, a low body, and random gurgle blips while flow is strong */
  startPour() {
    if (!this.ok()) return null;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g2 = ctx.createGain(); g2.gain.value = 0.0001;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.connect(lp); lp.connect(g2); g2.connect(this.master);
    src.start(t0, Math.random() * 1.5);
    const v = { src, bp, g, g2, blip: 0 };
    this.voices.add(v);
    return v;
  },
  updatePour(v, flow, fill, dt) {
    if (!v || !this.ctx || !this.voices.has(v)) return;
    const t = this.ctx.currentTime;
    fill = Math.max(0, Math.min(1, fill)); flow = Math.max(0, Math.min(1, flow));
    v.bp.frequency.setTargetAtTime(480 + 1500 * Math.pow(fill, 1.25), t, 0.03);
    v.g.gain.setTargetAtTime(0.0001 + 0.17 * flow, t, 0.025);
    v.g2.gain.setTargetAtTime(0.0001 + 0.1 * flow, t, 0.03);
    v.blip -= dt;
    if (v.blip <= 0 && flow > 0.15 && this.ok()) {
      v.blip = 0.05 + Math.random() * 0.09;
      const f = (300 + 650 * fill) * (0.85 + Math.random() * 0.3);
      this.tone(f, f * 1.55, 0.05, 0.045 * flow);
    }
  },
  stopPour(v) {
    if (!v || !this.ctx || !this.voices.has(v)) return;
    this.voices.delete(v);
    const t = this.ctx.currentTime;
    v.g.gain.setTargetAtTime(0.0001, t, 0.03); v.g2.gain.setTargetAtTime(0.0001, t, 0.03);
    try { v.src.stop(t + 0.3); } catch (e) {}
  },
  stopAllPours() { for (const v of [...this.voices]) this.stopPour(v); }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) AudioFX.suspend(); else AudioFX.resume();
});
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

/* mix two #rrggbb colours; t=0 → a, t=1 → b */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/* ---- shared element-emblem geometry (SVG path strings; canvas via Path2D) ---- */
function snowflakePath(cx, cy, r) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + Math.PI / 12;
    const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
    d += `M${cx.toFixed(1)},${cy.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} `;
    const bx = cx + Math.cos(a) * r * 0.62, by = cy + Math.sin(a) * r * 0.62;
    for (const branch of [a + Math.PI / 5, a - Math.PI / 5]) {
      d += `M${bx.toFixed(1)},${by.toFixed(1)} L${(bx + Math.cos(branch) * r * 0.3).toFixed(1)},${(by + Math.sin(branch) * r * 0.3).toFixed(1)} `;
    }
  }
  return d;
}
function boltPath(cx, cy, hh) {
  const w = hh * 0.9;
  return `M${(cx + w * 0.12).toFixed(1)},${(cy - hh / 2).toFixed(1)}` +
    ` L${(cx - w * 0.42).toFixed(1)},${(cy + hh * 0.08).toFixed(1)}` +
    ` L${(cx - w * 0.05).toFixed(1)},${(cy + hh * 0.08).toFixed(1)}` +
    ` L${(cx - w * 0.16).toFixed(1)},${(cy + hh / 2).toFixed(1)}` +
    ` L${(cx + w * 0.44).toFixed(1)},${(cy - hh * 0.10).toFixed(1)}` +
    ` L${(cx + w * 0.02).toFixed(1)},${(cy - hh * 0.10).toFixed(1)} Z`;
}

/* Layout box of `el` relative to `root`, ignoring CSS transforms. Bounding
   rects include in-flight transforms (the slots' entrance animation, a
   selection lift), which made the canvas draw the board at the animation's
   start pose — 26 px low and 8 % small — away from the hit targets and the
   pour geometry. */
function layoutBox(el, root) {
  let x = 0, y = 0, e = el;
  while (e && e !== root) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
  if (e !== root) {   /* root is not in the offsetParent chain: fall back */
    const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
    return { x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height };
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/* ---------------- gameplay renderer quality profiles ---------------- */
const RENDER_PROFILES = {
  low: {
    id: 'low', label: 'Low', targetFps: 30, dprCap: 1,
    fluidSamples: 7, particleScale: 0.45, glowStrength: 0.35,
    idleAnimations: false, celebrationIntensity: 0.45,
    settleMs: 70, streamGlow: false
  },
  normal: {
    id: 'normal', label: 'Normal', targetFps: 60, dprCap: 1.5,
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
    png: '/assets/background-suggestions/apothecary-sunlit-cabinet.png',
    avif960: '/assets/optimized/apothecary-sunlit-cabinet-960.avif',
    avif1365: '/assets/optimized/apothecary-sunlit-cabinet-1365.avif',
    webp960: '/assets/optimized/apothecary-sunlit-cabinet-960.webp',
    webp1365: '/assets/optimized/apothecary-sunlit-cabinet-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 246, 218, 0.16), transparent 74%)'
  },
  apothecaryDark: {
    cssVar: '--apo-hifi-bg',
    png: '/assets/background-suggestions/apothecary-moonlit-alchemy.png',
    avif960: '/assets/optimized/apothecary-moonlit-alchemy-960.avif',
    avif1365: '/assets/optimized/apothecary-moonlit-alchemy-1365.avif',
    webp960: '/assets/optimized/apothecary-moonlit-alchemy-960.webp',
    webp1365: '/assets/optimized/apothecary-moonlit-alchemy-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 184, 104, 0.10), transparent 72%)'
  },
  neon: {
    cssVar: '--neon-hifi-bg',
    png: '/assets/background-suggestions/neon-vaporwave-skyline.png',
    avif960: '/assets/optimized/neon-vaporwave-skyline-960.avif',
    avif1365: '/assets/optimized/neon-vaporwave-skyline-1365.avif',
    webp960: '/assets/optimized/neon-vaporwave-skyline-960.webp',
    webp1365: '/assets/optimized/neon-vaporwave-skyline-1365.webp',
    overlay: 'radial-gradient(74% 62% at 50% 44%, rgba(30, 18, 52, 0.12), transparent 70%)'
  },
  tidepool: {
    cssVar: '--tide-hifi-bg',
    png: '/assets/tidepool-hifi-backdrop.png',
    avif960: '/assets/optimized/tidepool-hifi-backdrop-960.avif',
    avif1365: '/assets/optimized/tidepool-hifi-backdrop-1365.avif',
    webp960: '/assets/optimized/tidepool-hifi-backdrop-960.webp',
    webp1365: '/assets/optimized/tidepool-hifi-backdrop-1365.webp',
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
  fluidRuntimeReason = reason || 'fluid samples already at low profile; user liquid motion remains on';
  return false;
}
function preferredBackgroundQuality() {
  const params = new URLSearchParams(location.search);
  const query = (params.get('background') || '').toLowerCase();
  if (query === 'basic' || query === 'hifi') return query;
  return save.backgroundQualityUserSet === true && save.backgroundQuality === 'basic' ? 'basic' : 'hifi';
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
  if (!p.idleAnimations) { stopAmbient(); MenuLife.stop(); }
  else if (document.body && document.body.dataset.screen === 'menu') { startAmbient(); MenuLife.start(); }
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
  if (!p.idleAnimations) { stopAmbient(); MenuLife.stop(); }
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
  let markCount = 0;

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
      'demote: ' + (snapshot.autoDemotionReason || '—')
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
      /* stats (sort + object build) are throttled — doing them every frame was
         measurable CPU on phones; demotion only needs a periodic look anyway */
      markCount++;
      if (markCount % 30 === 0) {
        const snap = api.snapshot();
        maybeDemote(snap, ts);
        paintOverlay(snap);
      } else if (overlayEnabled && markCount % 10 === 0) {
        paintOverlay(api.snapshot());
      }
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

/* ---------------- Motion: the single rAF loop for board animation ----------------
   Tasks are fn(dt, now) → true while they still need frames. After the tasks
   run, the canvas backend paints once, so every moving thing shares a frame. */
/* ?slowmo=N slows board motion N× (QA aid for inspecting pours frame by frame) */
const SLOWMO = Math.max(1, Number(new URLSearchParams(location.search).get('slowmo')) || 1);
const Motion = {
  tasks: new Set(),
  running: false,
  last: 0,
  add(fn) { this.tasks.add(fn); this.start(); },
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    FrameGate.reset('motion');
    FrameGate.request('motion', now => this.frame(now));
  },
  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000)) / SLOWMO;
    this.last = now;
    PerfMeter.mark(isCanvasMode() ? 'canvas-motion' : 'svg-motion', now);
    for (const fn of [...this.tasks]) {
      let keep = false;
      try { keep = fn(dt, now); } catch (e) { console.error(e); }
      if (!keep) this.tasks.delete(fn);
    }
    if (isCanvasMode() && state.length) renderer.backend.renderNow();
    if (this.tasks.size) FrameGate.request('motion', t => this.frame(t));
    else { this.running = false; FrameGate.reset('motion'); }
  }
};

/* ---------------- shared SVG defs (theme-aware, rebuildable) ---------------- */
function buildDefs() {
  const old = document.getElementById('vessel-defs');
  if (old) old.remove();
  const neon = SKIN === 'neon';
  const svg = svgEl('svg', { id: 'vessel-defs', width: 0, height: 0, style: 'position:absolute' });
  const defs = svgEl('defs', {});
  /* cylinder shading pinned to the glass body (viewBox x 18–82) — the old
     bounding-box gradient stretched across the whole 420-wide band rect, so
     only its flat middle was ever visible and every liquid read washed-out */
  function liquidGrad(id, light, dark) {
    const g = svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 18, y1: 0, x2: 82, y2: 0 });
    const core = mixHex(light, '#ffffff', neon ? 0.26 : 0.15);
    [[0, dark], [0.16, mixHex(dark, light, 0.55)], [0.4, light], [0.56, core], [0.74, light], [1, dark]]
      .forEach(([o, c]) => g.appendChild(svgEl('stop', { offset: String(o), 'stop-color': c })));
    defs.appendChild(g);
  }
  COLORS.forEach((c, i) => liquidGrad('liq' + i, c[0], c[1]));
  liquidGrad('liqH', HIDDEN_FILL[0], HIDDEN_FILL[1]);

  const hl = svgEl('linearGradient', { id: 'hlGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  hl.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.9 }));
  hl.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': 0.05 }));
  defs.appendChild(hl);
  /* glass interior backing — warm for apothecary, cool for neon */
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
  /* gameplay completion lid (colours follow the skin, see LID) */
  const ld = svgEl('linearGradient', { id: 'lidGrad', x1: 0, y1: 0, x2: 1, y2: 0 });
  [[0, LID[0]], [0.42, LID[1]], [1, LID[2]]].forEach(([o, c]) => ld.appendChild(svgEl('stop', { offset: String(o), 'stop-color': c })));
  defs.appendChild(ld);
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
  /* roaming sheen, clipped to the interior — invisible at rest; finite WAAPI
     sweeps play on demand (sweepSheen / MenuLife) so idle boards stay static */
  if (!RM && opts.sheen !== false) {
    const sheenWrap = svgEl('g', { 'clip-path': 'url(#' + id + ')' });
    const sheen = svgEl('rect', { x: -20, y: -20, width: 30, height: sh.vbH + 40, fill: 'url(#sheenGrad)' });
    sheen.setAttribute('class', 'sheenmove');
    sheenWrap.appendChild(sheen);
    svg.appendChild(sheenWrap);
  }
  /* parchment label — always built when requested; CSS hides it on Neon
     (so a runtime Apothecary→Neon switch can't leave a stale label behind) */
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
  /* cork stopper — drawn last so it plugs the mouth opening (over the lip + the
     dark mouth ellipse) instead of floating above a visible hole. Hidden on Neon via CSS. */
  if (opts.cork && sh.cork) {
    svg.appendChild(buildCork(sh.cork));
  }
  /* gameplay completion lid: hidden until a cork animation drives it */
  if (opts.lid && sh.cork) {
    const lid = buildLid(sh.cork);
    lid.setAttribute('opacity', '0');
    svg.appendChild(lid);
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

function buildLid(c) {
  const g = svgEl('g', { class: 'lid-g' });
  g.appendChild(svgEl('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: c.r,
    fill: 'url(#lidGrad)', stroke: 'rgba(60,35,15,0.5)', 'stroke-width': 1 }));
  const top = svgEl('ellipse', { cx: c.x + c.w / 2, cy: c.y + 2.5, rx: (c.w - 5) / 2, ry: 2.4,
    fill: LID[3], stroke: 'rgba(60,35,15,0.35)', 'stroke-width': 0.7 });
  top.setAttribute('class', 'lid-top');
  g.appendChild(top);
  return g;
}

/* ---------------- completion corks ----------------
   corks[i] = null | { t: 0..1, popped, note }. The lid falls into the mouth
   in 340 ms: quadratic drop for 70 %, one small bounce, fade-in over 18 %.
   Contact (70 %) fires the pop sound, haptic, ripple and sparkles. */
let corks = [];
const CORK_MS = 340;
function corkBodyW(sh) { return sh.box[1] - sh.box[0]; }
/* vertical offset (viewBox units) and opacity of a cork at progress t */
function corkPose(t, bodyW) {
  const off = t < 0.7 ? -0.9 * bodyW * (1 - (t / 0.7) * (t / 0.7))
    : -0.07 * bodyW * Math.sin(Math.PI * (t - 0.7) / 0.3);
  return { off, alpha: Math.min(1, t / 0.18) };
}
function corkContact(i) {
  const c = corks[i];
  if (!c || c.popped) return;
  c.popped = true;
  const slot = slots[i];
  slot.el.classList.add('capped');
  AudioFX.cap(c.note); buzz([15, 40, 25]);
  Fluid.drop(i, -1.6); Fluid.start();
  if (!RM) spawnSparkles(slot.el, 8, 0.55);
  if (!isCanvasMode()) sweepSheen(slot.svg);
}
function paintCorkSvg(i) {
  const slot = slots[i], c = corks[i];
  const lid = slot && slot.svg && slot.svg.querySelector('.lid-g');
  if (!lid) return;
  if (!c) { lid.setAttribute('opacity', '0'); lid.removeAttribute('transform'); return; }
  const pose = corkPose(c.t, corkBodyW(slot.sh));
  lid.setAttribute('opacity', pose.alpha.toFixed(3));
  lid.setAttribute('transform', 'translate(0,' + pose.off.toFixed(2) + ')');
}
function startCork(i) {
  corks[i] = { t: RM ? 1 : 0, popped: false, note: capsThisLevel++ };
  if (RM) { corkContact(i); paintCorkSvg(i); renderer.renderAll(); return; }
  Motion.add(dt => {
    const c = corks[i];
    if (!c || c.t >= 1) return false;
    c.t = Math.min(1, c.t + dt * 1000 / CORK_MS);
    if (c.t >= 0.7) corkContact(i);
    paintCorkSvg(i);
    return c.t < 1;
  });
}
/* seat corks on every complete bottle, remove them from broken ones (undo,
   restart, board setup). Instant: no fall, no sound. */
function seatCorkNow(i) {
  corks[i] = { t: 1, popped: true, note: 0 };
  paintCorkSvg(i);
}

/* ---------------- finite sheen sweeps (replaces the always-on CSS loop) ---------------- */
const SHEEN_KEYFRAMES = [
  { transform: 'translateX(-55px) skewX(-13deg)', opacity: 0 },
  { opacity: 0.55, offset: 0.45 },
  { transform: 'translateX(150px) skewX(-13deg)', opacity: 0 }
];
function sweepSheen(svg, delay) {
  if (RM || !svg || typeof svg.querySelector !== 'function') return;
  const sheen = svg.querySelector('.sheenmove');
  if (!sheen || typeof sheen.animate !== 'function') return;
  sheen.animate(SHEEN_KEYFRAMES, { duration: 1700, easing: 'ease-in-out', delay: delay || 0 });
}

/* Occasional life on the menu: a bob + sheen sweep on one hero bottle every
   few seconds. Bounded WAAPI animations from a coarse timer — between ticks
   nothing animates, so the compositor (and the phone) can rest. */
const MenuLife = {
  t: null,
  start() {
    if (RM || this.t || !activeRenderProfile().idleAnimations) return;
    const tick = () => {
      /* quality may have dropped (user choice or auto-demotion) since start */
      if (!activeRenderProfile().idleAnimations) { this.t = null; return; }
      this.t = setTimeout(tick, 6500 + Math.random() * 4000);
      if (document.hidden || document.body.dataset.screen !== 'menu') return;
      const svgs = document.querySelectorAll('.hero-bottles svg');
      if (!svgs.length) return;
      const k = Math.floor(Math.random() * svgs.length);
      const hero = svgs[k];
      if (typeof hero.animate === 'function') {
        hero.animate([
          { transform: 'translateY(0)' },
          { transform: 'translateY(-8px)', offset: 0.5 },
          { transform: 'translateY(0)' }
        ], { duration: 3800, easing: 'ease-in-out' });
      }
      sweepSheen(hero, 350);
    };
    this.t = setTimeout(tick, 1200);
  },
  stop() { clearTimeout(this.t); this.t = null; }
};

/* ---------------- game state ---------------- */
let level = 1, difficulty = save.difficulty || 'normal';
let mode = 'classic';            /* classic | daily | rush */
let rushStage = 1, rushTimeLeft = 0, rushTicker = null, rushNextT = null;
let rushGrace = null;   /* pours the last Rush second is waiting on */
let usedHint = false, usedAuto = false, autoPlaying = false;
let undosUsed = 0, perfectStreak = 0;
let pendingLayout = false;
let state = [], visual = [], par = 0, undosAllowed = Infinity, undosLeft = Infinity;
let moves = 0, undoHistory = [], sel = null;
let shapesByBottle = [], hiddenDepth = [], veiled = [];
let frozen = new Set();
let needCaps = 0;
let capsThisLevel = 0;   /* completions this level — drives the cork pop's rising pitch */
/* bottles claimed by a running or queued pour (refreshBusy keeps it current) */
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
/* interior width + volume maps live in the pure physics module */
const shapeWidthAt = PourPhysics.shapeWidthAt;

/* ---- liquid element visual effects ----
   Purely cosmetic per-colour badges (icy/electric/boiling/toxic) — unrelated
   to the gameplay "frozen bottle" special (the `frozen` Set below, which
   locks a bottle until another one completes). Named 'icy' rather than
   'frozen' to keep the two concepts from being confused in code/search. */
const ELEM_TYPES = ['icy', 'electric', 'boiling', 'toxic'];
function buildElementMap(gen) {
  /* overlays render under reduced motion too — the CSS freezes their animations */
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

/* liquid element badges (SVG twin of CanvasRenderer.drawElement) — legible
   emblems; the elem-* classes carry finite shimmer animations */
function appendElemOverlay(g, elem, y, h, px) {
  const cy = y + h / 2;
  if (elem === 'icy') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(190,238,255,0.22)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-icy');
    g.appendChild(ov);
    g.appendChild(svgEl('line', { x1: -160, y1: y + 0.6, x2: 260, y2: y + 0.6,
      stroke: 'rgba(235,250,255,0.5)', 'stroke-width': 1, 'pointer-events': 'none' }));
    const r = Math.min(h * 0.3, 7);
    const flake = svgEl('path', { d: snowflakePath(px, cy, r), fill: 'none',
      stroke: 'rgba(240,252,255,0.95)', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'pointer-events': 'none' });
    flake.setAttribute('class', 'elem-icy');
    g.appendChild(flake);
    [[-r * 1.9, -r * 0.7, 1.1], [r * 1.8, r * 0.6, 0.9]].forEach(([dx, dy, dr]) =>
      g.appendChild(svgEl('circle', { cx: px + dx, cy: cy + dy, r: dr, fill: 'rgba(255,255,255,0.85)', 'pointer-events': 'none' })));
  } else if (elem === 'electric') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(140,240,255,0.14)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-electric');
    g.appendChild(ov);
    const hh = Math.min(h * 0.62, 13);
    const bolt = svgEl('path', { d: boltPath(px, cy, hh), fill: 'rgba(255,250,190,0.95)',
      stroke: 'rgba(120,235,255,0.9)', 'stroke-width': 0.9, 'stroke-linejoin': 'round', 'pointer-events': 'none' });
    bolt.setAttribute('class', 'elem-electric');
    g.appendChild(bolt);
    g.appendChild(svgEl('path', {
      d: `M${px - hh * 1.7},${cy} L${px - hh * 0.8},${cy} M${px + hh * 0.8},${cy} L${px + hh * 1.7},${cy}`,
      stroke: 'rgba(190,250,255,0.35)', 'stroke-width': 1, fill: 'none', 'pointer-events': 'none'
    }));
  } else if (elem === 'boiling') {
    [[px - 13, y + h - 5, 2.6], [px - 3, y + h - 7.5, 3.4], [px + 8, y + h - 4.5, 2.2], [px + 13, y + h * 0.4, 1.6]].forEach(([bx, by, br], k) => {
      const bub = svgEl('circle', { cx: bx, cy: by, r: br,
        fill: 'rgba(255,255,255,0.30)', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 0.9, 'pointer-events': 'none' });
      bub.setAttribute('class', 'elem-boil b' + (k % 3));
      g.appendChild(bub);
    });
  } else if (elem === 'toxic') {
    const ov = svgEl('rect', { x: -160, y, width: 420, height: h, fill: 'rgba(110,255,140,0.16)', 'pointer-events': 'none' });
    ov.setAttribute('class', 'elem-toxic');
    g.appendChild(ov);
    const cw = Math.min(h * 0.72, 15);
    const chip = svgEl('rect', { x: px - cw / 2, y: cy - cw / 2, width: cw, height: cw, rx: cw * 0.28,
      fill: 'rgba(16,52,28,0.6)', stroke: 'rgba(170,255,190,0.85)', 'stroke-width': 1, 'pointer-events': 'none' });
    chip.setAttribute('class', 'elem-toxic');
    g.appendChild(chip);
    const skull = svgEl('text', {
      x: px, y: cy + cw * 0.22, 'text-anchor': 'middle', 'font-size': Math.round(cw * 0.62), 'font-weight': 700,
      fill: 'rgba(214,255,224,0.95)', 'pointer-events': 'none'
    });
    skull.textContent = '☠';
    g.appendChild(skull);
  }
}

/* ============================================================
   Liquid simulation — per-bottle 1-D shallow-water surface.
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
  /* a splash dropped into the centre — a dip that ripples outward */
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
      if (energy < 0.002) settled.push(i);   /* settled — drop it from the loop */
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
      const edge = Math.abs((k / (n - 1)) * 2 - 1);          /* 0 centre → 1 wall */
      const men = -this.MENISCUS * Math.pow(edge, 2.2);       /* climb up near walls */
      const y = surfY + (s ? s.h[k] : 0) + men;
      d += ' L' + x.toFixed(1) + ',' + y.toFixed(2);
    }
    d += ' L' + right.toFixed(1) + ',' + (bottomY).toFixed(1) + ' Z';
    return d;
  },
  /* stepped by the shared Motion loop; canvas paints there, SVG rewrites paths here */
  start() {
    if (this.running || !this.hasSims()) return;
    this.running = true;
    Motion.add(dt => {
      if (!this.running) return false;
      const sub = 2, h = dt / sub;
      for (let k = 0; k < sub; k++) this.step(h);
      if (!isCanvasMode()) {
        for (let i = 0; i < slots.length; i++) {
          const sl = slots[i]; if (!sl || !sl.surf) continue;
          const m = sl.surf;
          m.path.setAttribute('d', this.pathFor(i, m.surfY, m.halfW, m.bottomY));
          if (m.crest) m.crest.setAttribute('d', this.crestFor(i, m.surfY, m.halfW));
        }
      }
      if (!this.hasSims()) { this.running = false; return false; }
      return true;
    });
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
    const paths = [];
    const mkPath = (stroke, width, opacity) => {
      const path = document.createElementNS(NS, 'path');
      paths.push(path);
      path.setAttribute('d', arcD); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', width);
      path.setAttribute('stroke-linecap', 'round');
      if (opacity !== undefined) path.setAttribute('opacity', opacity);
      return path;
    };
    /* layered wide strokes fake the glow — the blur() filter was a mobile slow path */
    if (activeRenderProfile().streamGlow) {
      pourSVG.appendChild(mkPath(c0, 14, 0.10 * activeRenderProfile().glowStrength));
      pourSVG.appendChild(mkPath(c0, 8, 0.18 * activeRenderProfile().glowStrength));
    }
    pourSVG.appendChild(mkPath('url(#' + gid + ')', 5));
    pourSVG.appendChild(mkPath('rgba(255,255,255,0.4)', 1.6));
    fx.appendChild(pourSVG);
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
    this.pourFxMap.set(si, { pourSVG, paths, grad: pgrad, rippleEls, dropTimer, bubbleTimer });
  },
  /* the source keeps re-aiming during the pour — follow it */
  updatePour(info) {
    const fx = this.pourFxMap && this.pourFxMap.get(info && info.si);
    if (!fx || !fx.paths) return;
    const d = `M ${info.sx.toFixed(1)} ${info.sy.toFixed(1)} Q ${info.cpx.toFixed(1)} ${info.cpy.toFixed(1)} ${info.tx.toFixed(1)} ${info.ty.toFixed(1)}`;
    fx.paths.forEach(p => p.setAttribute('d', d));
    if (fx.grad) { fx.grad.setAttribute('x1', info.sx); fx.grad.setAttribute('y1', info.sy); fx.grad.setAttribute('x2', info.tx); fx.grad.setAttribute('y2', info.ty); }
  },
  endPour(info) {
    if (!this.pourFxMap) return;
    const fx = this.pourFxMap.get(info && info.si);
    if (!fx) return;
    if (fx.dropTimer) clearInterval(fx.dropTimer);
    if (fx.bubbleTimer) clearInterval(fx.bubbleTimer);
    if (fx.pourSVG) fx.pourSVG.remove();
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
      if (fade > 0.04) ellipses.push({ y, c: seg.c });
      cum += seg.u;
    }
    /* Fake-3D meniscus cue: a single concave-arc highlight on the topmost visible
       liquid when fluid animation is off. Walls rise, centre dips — matching the
       settled shape of Fluid.crestFor() so the static and animated states look
       identical. No dark lines; no per-band cost.
       Uses shapeWidthAt (same as the fluid code) so the arc never exceeds the
       interior clip — fixes flask neck / nearly-full bottle cases. */
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
    /* subtle CSS-only per-bottle glow (WebGL bloom removed) — a touch stronger on Neon */
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
  backCache: new Map(),
  glowCache: new Map(),
  PAD: 18,               /* sprite padding so baked shadows/glows aren't clipped */
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
      this.backCache.clear();
    }
    this.canvas.style.width = sr.width + 'px';
    this.canvas.style.height = sr.height + 'px';
    this.rects = slots.map((slot, i) => Object.assign(layoutBox(slot.slot, stage), { shapeName: shapesByBottle[i] }));
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
    this.staticGen++;   /* something outside the animation loop changed: rebuild the idle layer */
    if (this.renderQueued || Motion.running) return this;   /* Motion paints every frame anyway */
    this.renderQueued = true;
    FrameGate.request('canvas-render', () => {
      this.renderQueued = false;
      this.renderNow();
    });
    return this;
  },
  /* Bottles that are not animating are painted once into an offscreen idle
     layer; while pours run, each frame blits that layer and redraws only the
     moving bottles. The layer is rebuilt when the moving set changes or when
     anything outside the animation loop asks for a render. */
  staticGen: 0,
  staticKey: null,
  staticCanvas: null,
  renderNow() {
    if (!this.ensure()) return;
    if (this.rects.length !== slots.length) this.syncLayout();
    this.clear();
    PerfMeter.mark('canvas2d', performance.now());
    const n = state.length;
    /* a bottle that started moving stays in the live set until the whole
       board is still, so the idle layer is rebuilt only when the set grows */
    const live = this._live || (this._live = new Set());
    let any = false;
    for (let i = 0; i < n; i++) if (bottleAnimating(i)) { live.add(i); any = true; }
    if (!any) live.clear();
    const act = this._act || (this._act = []);
    act.length = 0;
    let key = this.staticGen + ':';
    for (let i = 0; i < n; i++) if (live.has(i)) { act.push(i); key += i + ','; }
    if (!act.length) {
      for (let i = 0; i < n; i++) this.drawBottle(i);
      this.staticKey = null;
      return;
    }
    const W = this.canvas.width, H = this.canvas.height;
    if (key !== this.staticKey || !this.staticCanvas || this.staticCanvas.width !== W || this.staticCanvas.height !== H) {
      if (!this.staticCanvas || this.staticCanvas.width !== W || this.staticCanvas.height !== H) this.staticCanvas = this.makeLayer(W, H);
      const sctx = this.staticCanvas.getContext('2d'), main = this.ctx;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, W, H);
      sctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx = sctx;
      try { for (let i = 0; i < n; i++) if (!act.includes(i)) this.drawBottle(i); }
      finally { this.ctx = main; }
      this.staticKey = key;
    }
    const ctx = this.ctx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.staticCanvas, 0, 0); ctx.restore();
    /* bottles in flight are drawn last so they pass over their neighbours */
    for (const i of act) if (!flyingSource(i)) this.drawBottle(i);
    for (const i of act) if (flyingSource(i)) this.drawBottle(i);
  },
  renderAll() {
    return this.requestRender();
  },
  setTheme() { this.staticGen++; this.gradientCache.clear(); this.shellCache.clear(); this.backCache.clear(); this.glowCache.clear(); this.renderAll(); return this; },
  setQuality(q) { this.quality = q || 'auto'; this.shellCache.clear(); this.backCache.clear(); return this; },
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
  liquidGradient(ctx, c, shapeName) {
    const key = SKIN + ':' + MODE + ':' + c + ':' + shapeName;
    const cached = this.gradientCache.get(key);
    if (cached) return cached;
    const sh = SHAPES[shapeName];
    /* span the actual glass body, not the full band rect — the old 0–100 span
       kept the dark cylinder edges outside the visible interior */
    const xl = sh.box[0] - 4, xr = sh.box[1] + 4;
    const g = ctx.createLinearGradient(xl, 0, xr, 0);
    const pair = c === 'hidden' ? HIDDEN_FILL : COLORS[c];
    const dark = pair[1], light = pair[0];
    const core = mixHex(light, '#ffffff', SKIN === 'neon' ? 0.26 : 0.15);
    g.addColorStop(0, dark);
    g.addColorStop(0.16, mixHex(dark, light, 0.55));
    g.addColorStop(0.4, light);
    g.addColorStop(0.56, core);
    g.addColorStop(0.74, light);
    g.addColorStop(1, dark);
    this.gradientCache.set(key, g);
    return g;
  },
  /* vertical depth: liquid reads deeper toward the base — cached per shape */
  depthOverlay(ctx, shapeName) {
    const key = 'depth:' + shapeName + ':' + SKIN;
    const cached = this.gradientCache.get(key);
    if (cached) return cached;
    const sh = SHAPES[shapeName];
    const g = ctx.createLinearGradient(0, sh.T, 0, sh.B);
    const tint = SKIN === 'neon' ? '18,8,42' : '38,22,10';
    g.addColorStop(0, 'rgba(' + tint + ',0)');
    g.addColorStop(0.62, 'rgba(' + tint + ',0.05)');
    g.addColorStop(1, 'rgba(' + tint + ',0.20)');
    this.gradientCache.set(key, g);
    return g;
  },
  makeLayer(w, h) {
    const cv = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(Math.ceil(w), Math.ceil(h))
      : document.createElement('canvas');
    cv.width = Math.ceil(w);
    cv.height = Math.ceil(h);
    return cv;
  },
  /* baked under-layer: drop shadow + glass backing tint. Rendered once per
     shape × theme × dpr; per-frame cost is a single drawImage instead of the
     shadowBlur slow path every bottle every frame. */
  backLayer(shapeName) {
    const sh = SHAPES[shapeName];
    const key = [shapeName, SKIN, MODE, this.dpr].join(':');
    const cached = this.backCache.get(key);
    if (cached) return cached;
    const P = this.PAD;
    const scale = Math.max(1, Math.min(2, this.dpr || 1));
    const cv = this.makeLayer((100 + 2 * P) * scale, (sh.vbH + 2 * P) * scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.translate(P, P);
    ctx.shadowColor = 'rgba(4,8,26,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 7;
    ctx.fillStyle = SKIN === 'neon' ? 'rgba(127,208,255,0.10)' : 'rgba(255,233,200,0.12)';
    ctx.fill(this.paths(shapeName).interior);
    ctx.shadowColor = 'transparent';
    /* pooled scene light beneath the bottle ties it to the backdrop
       (Neon skips this — it gets a per-colour bloom in drawBottle) */
    if (SKIN !== 'neon') {
      const tone = SKIN === 'tidepool' ? '224,255,246' : MODE === 'dark' ? '255,176,92' : '255,219,150';
      const alpha = MODE === 'dark' ? 0.26 : 0.20;
      const glow = ctx.createRadialGradient(50, sh.vbH - 4, 2, 50, sh.vbH - 4, 42);
      glow.addColorStop(0, 'rgba(' + tone + ',' + alpha + ')');
      glow.addColorStop(1, 'rgba(' + tone + ',0)');
      ctx.fillStyle = glow;
      ctx.save();
      ctx.scale(1, 0.3);
      ctx.beginPath();
      ctx.arc(50, (sh.vbH - 4) / 0.3, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.backCache.set(key, cv);
    return cv;
  },
  /* soft radial glow dot, cached per colour — replaces per-particle shadowBlur */
  glowDot(color) {
    const cached = this.glowCache.get(color);
    if (cached) return cached;
    const cv = this.makeLayer(32, 32);
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, color + 'cc');
    g.addColorStop(0.55, color + '55');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.glowCache.set(color, cv);
    return cv;
  },
  shellLayer(shapeName) {
    const sh = SHAPES[shapeName];
    const key = [shapeName, SKIN, MODE, RIM_COLOR, this.dpr].join(':');
    const cached = this.shellCache.get(key);
    if (cached) return cached;
    const scale = Math.max(1, Math.min(2, this.dpr || 1));
    const cv = this.makeLayer(100 * scale, sh.vbH * scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const paths = this.paths(shapeName);
    const [xl, xr, , yb] = sh.box;
    const shadowRgb = parseInt(GLASS_SHADOW.slice(1), 16);
    const shadowTint = ((shadowRgb >> 16) & 255) + ',' + ((shadowRgb >> 8) & 255) + ',' + (shadowRgb & 255);
    /* cylinder side shade pinned to the glass body span */
    const shade = ctx.createLinearGradient(xl - 4, 0, xr + 4, 0);
    shade.addColorStop(0, 'rgba(' + shadowTint + ',0.34)');
    shade.addColorStop(0.16, 'rgba(' + shadowTint + ',0.06)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0)');
    shade.addColorStop(0.86, 'rgba(' + shadowTint + ',0.10)');
    shade.addColorStop(1, 'rgba(' + shadowTint + ',0.38)');
    ctx.fillStyle = shade;
    ctx.fill(paths.interior);
    /* refractive inner edge: bright line hugging the inside of the walls */
    ctx.save();
    ctx.clip(paths.interior);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 3.4;
    ctx.stroke(paths.interior);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    (sh.gloss || []).forEach(g => { this.roundRect(ctx, g.x, g.y, g.w, g.h, g.rx); ctx.globalAlpha = g.o; ctx.fill(); ctx.globalAlpha = 1; });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    /* soft theme-tinted halo under the crisp rim gives the glass weight */
    ctx.strokeStyle = SKIN === 'neon' ? 'rgba(150,90,255,0.30)'
      : SKIN === 'tidepool' ? 'rgba(24,110,120,0.28)'
      : MODE === 'dark' ? 'rgba(255,176,96,0.30)' : 'rgba(120,78,38,0.26)';
    ctx.lineWidth = 4.6;
    ctx.stroke(paths.outline);
    ctx.strokeStyle = RIM_COLOR;
    ctx.lineWidth = 2.4;
    ctx.stroke(paths.outline);
    /* key light: brighter rim on the left, candle-amber on the right in the dark */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 42, sh.vbH); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3.2;
    ctx.stroke(paths.outline);
    ctx.restore();
    if (SKIN === 'apothecary' && MODE === 'dark') {
      ctx.save();
      ctx.beginPath(); ctx.rect(58, 0, 42, sh.vbH); ctx.clip();
      ctx.strokeStyle = 'rgba(255,178,92,0.55)';
      ctx.lineWidth = 3;
      ctx.stroke(paths.outline);
      ctx.restore();
    }
    /* bottom rim light (the SVG renderer always had this; canvas was missing it) */
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xl + 9, yb - 4);
    ctx.quadraticCurveTo(50, yb + 5, xr - 9, yb - 4);
    ctx.stroke();
    if (SKIN === 'tidepool') { /* pearl specular */
      const px2 = xl + (xr - xl) * 0.24, py2 = sh.vbH * 0.30;
      const pearl = ctx.createRadialGradient(px2, py2, 0, px2, py2, 5);
      pearl.addColorStop(0, 'rgba(255,255,255,0.85)');
      pearl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = pearl;
      ctx.beginPath(); ctx.arc(px2, py2, 5, 0, Math.PI * 2); ctx.fill();
    }
    const lip = sh.lip;
    const lipG = ctx.createLinearGradient(0, lip.y, 0, lip.y + lip.h);
    lipG.addColorStop(0, 'rgba(255,255,255,0.5)');
    lipG.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = lipG;
    this.roundRect(ctx, lip.x, lip.y, lip.w, lip.h, lip.rx);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,14,36,0.55)';
    ctx.beginPath();
    ctx.ellipse(50, lip.mouthCy, lip.mouthRx, lip.mouthRy, 0, 0, Math.PI * 2);
    ctx.fill();
    /* inner neck shadow just below the mouth reads as glass thickness */
    const neckG = ctx.createLinearGradient(0, lip.mouthCy, 0, lip.mouthCy + 9);
    neckG.addColorStop(0, 'rgba(8,10,28,0.28)');
    neckG.addColorStop(1, 'rgba(8,10,28,0)');
    ctx.fillStyle = neckG;
    ctx.fillRect(lip.x + 3, lip.mouthCy, lip.w - 6, 9);
    this.shellCache.set(key, cv);
    return cv;
  },
  /* completion lid in bottle-local viewBox units, so it follows lift and tilt */
  drawCork(ctx, sh, c) {
    if (c.t <= 0) return;
    const k = sh.cork, pose = corkPose(c.t, corkBodyW(sh));
    const key = 'lid:' + LID.join(',') + ':' + k.x + ':' + k.w;
    let wood = this.gradientCache.get(key);
    if (!wood) {
      wood = ctx.createLinearGradient(k.x, 0, k.x + k.w, 0);
      wood.addColorStop(0, LID[0]); wood.addColorStop(0.42, LID[1]); wood.addColorStop(1, LID[2]);
      this.gradientCache.set(key, wood);
    }
    ctx.save();
    ctx.globalAlpha = pose.alpha;
    ctx.translate(0, pose.off);
    ctx.fillStyle = wood;
    this.roundRect(ctx, k.x, k.y, k.w, k.h, k.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,15,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = LID[3];
    ctx.beginPath(); ctx.ellipse(k.x + k.w / 2, k.y + 2.5, (k.w - 5) / 2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  /* liquid element badges — small legible emblems instead of the old scribbles */
  drawElement(ctx, elem, y, h) {
    ctx.save();
    const cx = 50, cy = y + h / 2;
    if (elem === 'icy') {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(205,242,255,0.30)');
      g.addColorStop(1, 'rgba(160,220,250,0.12)');
      ctx.fillStyle = g; ctx.fillRect(-160, y, 420, h);
      ctx.strokeStyle = 'rgba(235,250,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-160, y + 0.6); ctx.lineTo(260, y + 0.6); ctx.stroke();
      const r = Math.min(h * 0.3, 7);
      ctx.strokeStyle = 'rgba(240,252,255,0.95)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.stroke(new Path2D(snowflakePath(cx, cy, r)));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx2, dy2, dr] of [[-r * 1.9, -r * 0.7, 1.1], [r * 1.8, r * 0.6, 0.9]]) {
        ctx.beginPath(); ctx.arc(cx + dx2, cy + dy2, dr, 0, Math.PI * 2); ctx.fill();
      }
    } else if (elem === 'electric') {
      ctx.fillStyle = 'rgba(140,240,255,0.14)'; ctx.fillRect(-160, y, 420, h);
      const hh = Math.min(h * 0.62, 13);
      const bolt = new Path2D(boltPath(cx, cy, hh));
      ctx.fillStyle = 'rgba(255,250,190,0.95)'; ctx.fill(bolt);
      ctx.strokeStyle = 'rgba(120,235,255,0.9)'; ctx.lineWidth = 0.9; ctx.lineJoin = 'round'; ctx.stroke(bolt);
      ctx.strokeStyle = 'rgba(190,250,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - hh * 1.7, cy); ctx.lineTo(cx - hh * 0.8, cy);
      ctx.moveTo(cx + hh * 0.8, cy); ctx.lineTo(cx + hh * 1.7, cy);
      ctx.stroke();
    } else if (elem === 'boiling') {
      for (const [bx, by, br] of [[cx - 13, y + h - 5, 2.6], [cx - 3, y + h - 7.5, 3.4], [cx + 8, y + h - 4.5, 2.2], [cx + 13, y + h * 0.4, 1.6], [cx - 8, y + h * 0.28, 1.3]]) {
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.beginPath(); ctx.arc(bx - br * 0.35, by - br * 0.35, br * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      }
    } else if (elem === 'toxic') {
      ctx.fillStyle = 'rgba(110,255,140,0.16)'; ctx.fillRect(-160, y, 420, h);
      const cw = Math.min(h * 0.72, 15);
      this.roundRect(ctx, cx - cw / 2, cy - cw / 2, cw, cw, cw * 0.28);
      ctx.fillStyle = 'rgba(16,52,28,0.6)'; ctx.fill();
      ctx.strokeStyle = 'rgba(170,255,190,0.85)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(214,255,224,0.95)';
      ctx.font = '700 ' + Math.round(cw * 0.62) + 'px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☠', cx, cy + 0.5);
    }
    ctx.restore();
  },
  effectsEnabled() { return !RM && activeRenderProfile().id !== 'low'; },
  prettyEffectsEnabled() { return !RM && activeRenderProfile().id === 'pretty'; },
  /* Aliquot stream: quadratic bezier from the source rim to the receiver
     surface; width follows the flow that left the lip tf·sqrt(u) earlier,
     so the head falls and the tail detaches. Stage coordinates. */
  drawStream(ctx, job) {
    const st = job.streamFx;
    if (!st) return;
    const sx = st.sx, sy = st.sy, ex = st.tx, ey = st.ty;
    if (ey <= sy) return;
    const s = job.s, tp = job.t - job.T1;
    const cx = sx + s * job.w * 0.16, cy = sy + (ey - sy) * 0.08;
    const N = 16, L = this._sL || (this._sL = new Float64Array(2 * N + 2)), Rr = this._sR || (this._sR = new Float64Array(2 * N + 2));
    const Cx = this._sC || (this._sC = new Float64Array(2 * N + 2));
    let any = false;
    for (let k = 0; k <= N; k++) {
      const u = k / N, iu = 1 - u;
      const x = iu * iu * sx + 2 * iu * u * cx + u * u * ex, y = iu * iu * sy + 2 * iu * u * cy + u * u * ey;
      let dx = 2 * iu * (cx - sx) + 2 * u * (ex - cx), dy = 2 * iu * (cy - sy) + 2 * u * (ey - cy);
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const e = tp - job.tf * Math.sqrt(u);
      const f = e > 0 && e < job.T2 ? flowN(e / job.T2) : 0;
      const hw = f > 0 ? job.maxW * Math.sqrt(f) * (1 - 0.3 * u) * 0.5 : 0;
      if (hw > 0.2) any = true;
      L[2 * k] = x - dy * hw; L[2 * k + 1] = y + dx * hw;
      Rr[2 * k] = x + dy * hw; Rr[2 * k + 1] = y - dx * hw;
      Cx[2 * k] = x; Cx[2 * k + 1] = y;
    }
    if (!any) return;
    const c0 = COLORS[job.color][0], c1 = COLORS[job.color][1];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    /* theme glow: wide soft strokes along the centreline (no blur filter) */
    const prof = activeRenderProfile();
    if (prof.streamGlow) {
      ctx.strokeStyle = c0;
      ctx.beginPath(); ctx.moveTo(Cx[0], Cx[1]);
      for (let k = 1; k <= N; k++) ctx.lineTo(Cx[2 * k], Cx[2 * k + 1]);
      ctx.globalAlpha = 0.10 * prof.glowStrength; ctx.lineWidth = job.maxW * 1.9; ctx.stroke();
      ctx.globalAlpha = 0.18 * prof.glowStrength; ctx.lineWidth = job.maxW * 1.15; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const grad = ctx.createLinearGradient(sx, sy, ex, ey); grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(L[0], L[1]);
    for (let k = 1; k <= N; k++) ctx.lineTo(L[2 * k], L[2 * k + 1]);
    for (let k = N; k >= 0; k--) ctx.lineTo(Rr[2 * k], Rr[2 * k + 1]);
    ctx.closePath(); ctx.fill();
    /* highlight streak on the lit edge, only where the stream is wide */
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, job.maxW * 0.14);
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= N; k++) {
      const x = L[2 * k] * 0.7 + Rr[2 * k] * 0.3, y = L[2 * k + 1] * 0.7 + Rr[2 * k + 1] * 0.3;
      if (Math.hypot(L[2 * k] - Rr[2 * k], L[2 * k + 1] - Rr[2 * k + 1]) > 3) { if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } }
      else started = false;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const fl = job.flowD || 0;
    if (fl > 0.05) {
      /* impact glint + expanding rings where the stream meets the surface */
      ctx.globalAlpha = 0.6 * Math.min(1, fl * 2);
      ctx.drawImage(this.glowDot('#ffffff'), ex - 8, ey - 5, 16, 10);
      if (this.effectsEnabled()) {
        const age = job.t - job.T1 - job.tf;
        for (let r = 0; r < 2; r++) {
          const u = (age * 1.35 - r * 0.34) % 1; if (u < 0) continue;
          ctx.globalAlpha = (1 - u) * 0.55 * Math.min(1, fl * 2); ctx.strokeStyle = c0; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(ex, ey, job.wD * (0.12 + u * 0.3), job.wD * (0.035 + u * 0.08), 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (prettyTidepoolEffects()) {
          ctx.strokeStyle = 'rgba(255,255,255,0.76)'; ctx.fillStyle = 'rgba(210,255,248,0.16)'; ctx.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            const u = (age * 0.9 + k * 0.31) % 1; if (u < 0) continue;
            const bx = ex + Math.sin(age * 1.7 + k * 2.1) * job.wD * 0.16;
            const by = ey + job.wD * 0.08 - u * job.wD * 0.62;
            ctx.globalAlpha = (1 - u) * 0.58;
            ctx.beginPath(); ctx.arc(bx, by, job.wD * (0.045 + u * 0.045), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
        }
      }
    }
    /* splash droplets (stepped in stepJob) */
    if (job.drops.length) {
      ctx.fillStyle = c0;
      for (const d of job.drops) { ctx.globalAlpha = Math.min(1, d.life * 5); ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  },
  drawBottle(i) {
    const r = this.rects[i], slot = slots[i];
    if (!r || !slot) return;
    const ctx = this.ctx, shapeName = r.shapeName, sh = SHAPES[shapeName];
    const sx = r.w / 100, sy = r.h / sh.vbH;
    const pose = poses[i];
    const tx = pose ? pose.tx : 0;
    const selectedLift = !pose && slot.el.classList.contains('selected') && !locked.has(i) ? -r.w * 0.22 : 0;
    const ty = (pose ? pose.ty : 0) + selectedLift;
    const rot = pose ? pose.a : 0;
    ctx.save();
    ctx.translate(r.x + tx, r.y + ty);
    if (rot) { ctx.translate(r.w / 2, r.h / 2); ctx.rotate(rot); ctx.translate(-r.w / 2, -r.h / 2); }
    ctx.scale(sx, sy);
    const paths = this.paths(shapeName), interior = paths.interior;
    const P = this.PAD;
    const segs = visual[i] || [];
    /* Neon: additive bloom tinted by the top liquid + a shelf reflection —
       two drawImages of a cached sprite, only when the bottle repaints anyway */
    if (SKIN === 'neon' && segs.length) {
      const units = segs.reduce((s, x) => s + x.u, 0);
      if (units > 0.01) {
        const hid0 = hiddenDepth[i] || 0;
        const col = hid0 >= units ? HIDDEN_FILL[0] : COLORS[segs[segs.length - 1].c][0];
        const bloom = this.glowDot(col);
        const gs = activeRenderProfile().glowStrength;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.26 * gs;
        ctx.drawImage(bloom, -12, sh.vbH * 0.34 - 62, 124, 150);
        ctx.globalAlpha = 0.5 * gs;
        ctx.drawImage(bloom, 4, sh.vbH - 13, 92, 24);
        ctx.restore();
      }
    }
    ctx.drawImage(this.backLayer(shapeName), -P, -P, 100 + 2 * P, sh.vbH + 2 * P);
    ctx.save(); ctx.clip(interior);
    this.drawLiquid(ctx, i, shapeName, sh, segs, rot);
    ctx.restore();
    /* streams pour between the receiver's liquid and its glass */
    const jobs = jobsInto(i);
    if (jobs) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      for (const job of jobs) this.drawStream(ctx, job);
      ctx.restore();
    }
    ctx.drawImage(this.shellLayer(shapeName), 0, 0, 100, sh.vbH);
    if (corks[i] && sh.cork) this.drawCork(ctx, sh, corks[i]);
    if (veiled[i]) { ctx.fillStyle = 'rgba(48,25,90,0.35)'; ctx.fill(interior); ctx.fillStyle = '#e2d2ff'; ctx.font = '34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 50, sh.vbH * 0.38); }
    if (frozen.has(i)) { ctx.fillStyle = 'rgba(170,225,255,0.32)'; ctx.fill(interior); ctx.fillStyle = '#f0faff'; ctx.font = '30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('❄', 50, sh.vbH * 0.72); }
    ctx.restore();
  },
  /* Volume-true liquid (Aliquot method). The interior polygon is rotated by
     alpha = bottle tilt − slosh; cut lines come from area, so volume is
     conserved and the surface meets the lip. Fills are built in the surface
     frame and mapped back to the bottle frame, so the cylinder gradients stay
     on the glass; glyphs are drawn upright in the surface frame. Bands are
     painted top-down, each from its top line to the bottom (no seams). */
  drawLiquid(ctx, i, shapeName, sh, segs, rot) {
    const cums = this._cums || (this._cums = []);
    cums.length = 0;
    const cols = this._cols || (this._cols = []);
    cols.length = 0;
    let total = 0;
    for (const seg of segs) { if (seg.u <= 0.001) continue; total += seg.u; cums.push(total); cols.push(seg.c); }
    const m = cums.length;
    if (!m) return;
    const body = bodies[i];
    const alpha = rot - (body ? body.phi : 0);
    const lv = PourPhysics.levelsFor(shapeName, alpha, cums);
    const c = Math.cos(alpha), s = Math.sin(alpha);
    const x0 = lv.x0, x1 = lv.x1, yb = lv.yb;
    const topY = lv.tops[m - 1];
    /* surface-frame (x, y) → bottle viewBox (pivot at (50, 0)) */
    const lineTo = (x, y, move) => { const bx = 50 + c * x + s * y, by = -s * x + c * y; if (move) ctx.moveTo(bx, by); else ctx.lineTo(bx, by); };
    const quad = (yTop) => { ctx.beginPath(); lineTo(x0, yTop, true); lineTo(x1, yTop); lineTo(x1, yb); lineTo(x0, yb); ctx.closePath(); };
    /* top surface: the Fluid wave + wall meniscus fade out as the bottle
       tilts (0 → 20°); a decaying sine ripple rides on top */
    const span = lv.span || { xl: x0, xr: x1 };
    const upright = Math.max(0, Math.min(1, 1 - Math.abs(rot) / 0.35));
    const sample = upright > 0 && Fluid.active() ? Fluid.sample(i) : null;
    const N = Math.max(6, (sample ? sample.h.length : Fluid.N) - 1);
    const bodyW = corkBodyW(sh);
    const amp = body ? Math.min(body.ripple, Math.max(0, (yb - 2 - topY) * 0.3)) : 0;
    const kx = 2 * Math.PI / (bodyW * 0.85), ph = body ? body.rphase : 0;
    const SX = this._sx || (this._sx = new Float64Array(40)), SY = this._sy || (this._sy = new Float64Array(40));
    const wallsOnly = span.xr - span.xl < 3;   /* nearly empty: no meniscus to speak of */
    for (let k = 0; k <= N; k++) {
      const x = span.xl + (span.xr - span.xl) * k / N;
      const edge = Math.abs(2 * k / N - 1);
      let y = topY;
      if (!wallsOnly) y += upright * ((sample ? sample.h[k] : 0) - Fluid.MENISCUS * Math.pow(edge, 2.2));
      if (amp > 0.05) y += amp * Math.sin(kx * x - ph);
      SX[k] = x; SY[k] = y;
    }
    const allHidden = (hiddenDepth[i] || 0) >= total - 1e-6;
    ctx.fillStyle = this.liquidGradient(ctx, allHidden ? 'hidden' : cols[m - 1], shapeName);
    ctx.beginPath();
    lineTo(x0, yb, true); lineTo(x0, SY[0]);
    for (let k = 0; k <= N; k++) lineTo(SX[k], SY[k]);
    lineTo(x1, SY[N]); lineTo(x1, yb); ctx.closePath(); ctx.fill();
    for (let j = allHidden ? -1 : m - 2; j >= 0; j--) {
      ctx.fillStyle = this.liquidGradient(ctx, cols[j], shapeName);
      quad(lv.tops[j]); ctx.fill();
    }
    /* mystery bottles: the bottom `hid` layers read as one hidden fill */
    const hid = Math.min(hiddenDepth[i] || 0, total);
    let unitLv = null;
    if (hid > 0.001) {
      if (!allHidden) {
        const units = this._units || (this._units = []);
        units.length = 0;
        for (let u = 1; u <= Math.ceil(hid - 1e-6); u++) units.push(Math.min(u, hid));
        unitLv = PourPhysics.levelsFor(shapeName, alpha, units);
        ctx.fillStyle = this.liquidGradient(ctx, 'hidden', shapeName);
        quad(unitLv.tops[unitLv.tops.length - 1]); ctx.fill();
      } else {
        const units = [];
        for (let u = 1; u <= Math.ceil(hid - 1e-6); u++) units.push(Math.min(u, hid));
        unitLv = PourPhysics.levelsFor(shapeName, alpha, units);
      }
    }
    /* vertical depth shading over the whole column (bottle-frame gradient) */
    ctx.fillStyle = this.depthOverlay(ctx, shapeName);
    ctx.beginPath(); lineTo(x0, yb, true); lineTo(x0, SY[0]);
    for (let k = 0; k <= N; k++) lineTo(SX[k], SY[k]);
    lineTo(x1, SY[N]); lineTo(x1, yb); ctx.closePath(); ctx.fill();
    /* meniscus highlight along the live surface */
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let k = 0; k <= N; k++) lineTo(SX[k], SY[k] + 0.4, k === 0);
    ctx.stroke();
    /* glyphs (element emblems, '?' marks): upright in the surface frame, on
       the bottle axis, fading out between 0° and 20° of tilt */
    const gA = upright;
    if (gA > 0.01) {
      const ta = Math.tan(alpha);
      ctx.save();
      ctx.translate(50, 0); ctx.rotate(-alpha);
      ctx.globalAlpha = gA;
      /* hidden units keep their secrets: emblems cover only the visible part */
      const hidTop = unitLv ? unitLv.tops[unitLv.tops.length - 1] : Infinity;
      for (let j = 0; j < m; j++) {
        const elem = ELEMENT_MAP[cols[j]];
        if (!elem || cums[j] <= hid + 1e-6) continue;
        const yT = lv.tops[j], yB = Math.min(j ? lv.tops[j - 1] : yb - 2, hidTop);
        const my = (yT + yB) / 2;
        ctx.save(); ctx.translate(-my * ta - 50, 0);
        this.drawElement(ctx, elem, yT, yB - yT);
        ctx.restore();
      }
      if (unitLv) {
        ctx.fillStyle = '#cdd5f2'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let u = 0; u < unitLv.tops.length; u++) {
          const yT = unitLv.tops[u], yB = u ? unitLv.tops[u - 1] : yb - 2;
          if (yB - yT < 6) continue;
          const my = (yT + yB) / 2;
          ctx.fillText('?', -my * ta, my);
        }
      }
      ctx.restore();
    }
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
    cacheBodyPx();
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

function revealMystery(i, len) {
  const maxHid = Math.max(0, (len == null ? state[i].length : len) - 1);
  if ((hiddenDepth[i] || 0) > maxHid) {
    hiddenDepth[i] = maxHid;
    if (slots[i] && explicitPrettyEffects()) spawnSparkles(slots[i].el, 5, 0.4);
    AudioFX.reveal();
  }
}

function syncCaps() {
  state.forEach((b, i) => {
    const capped = window.isBottleComplete(b) && !locked.has(i);
    if (capped && hiddenDepth[i]) { hiddenDepth[i] = 0; renderer.renderBottle(i, 0); }
    if (capped && !corks[i]) seatCorkNow(i);
    else if (!capped && corks[i]) { corks[i] = null; paintCorkSvg(i); }
    const has = slots[i].el.classList.contains('capped');
    if (capped && !has) slots[i].el.classList.add('capped');
    else if (!capped && has) slots[i].el.classList.remove('capped');
  });
  if (isCanvasMode()) renderer.renderAll();
}

/* Undo snapshot of the logical board. Specials resolve when a pour's job
   completes, so fold in the effects of pours that are still animating or
   queued — otherwise undo could re-hide a layer or re-freeze a bottle. */
function snapshotBoard() {
  const hd = hiddenDepth.slice();
  let fr = [...frozen];
  const pending = jobs.map(j => j.entry).filter(Boolean).concat(queue);
  for (const e of pending) {
    hd[e.si] = Math.min(hd[e.si] || 0, Math.max(0, e.srcAfter.length - 1));
    if (window.isBottleComplete(e.dstAfter)) { hd[e.di] = 0; fr = []; }
  }
  return {
    state: window.cloneState(state),
    moves,
    hiddenDepth: hd,
    veiled: veiled.slice(),
    frozen: fr
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
  if (veiled[i]) ensureSlotMarker(slotEl, 'seal', '✦');
  else slotEl.querySelectorAll('.seal').forEach(seal => seal.remove());

  slotEl.classList.toggle('frozen', frozen.has(i));
  if (frozen.has(i)) ensureSlotMarker(slotEl, 'ice', '❄');
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
    toastMsg(msgs.join('  ·  '), 5200);
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
    if (!autoPlaying && confirm('Restart this level?')) { flushAll(); restartCurrent(); }
  } else if (k.toLowerCase() === 'h') { e.preventDefault(); showHint(); }
}

function setupBoard(gen) {
  /* boards can come from a cache — never mutate the generated original */
  state = gen.state.map(b => b.slice());
  par = gen.par;
  undosAllowed = gen.undos; undosLeft = gen.undos;
  visual = state.map(mergeRuns);
  discardPours();
  moves = 0; undoHistory = []; sel = null; locked.clear();
  usedHint = false; usedAuto = false; autoPlaying = false; undosUsed = 0;
  capsThisLevel = 0;
  corks = state.map(() => null);
  jobs = []; poses = []; bodies = state.map((b, i) => makeBody(i));
  AudioFX.stopAllPours();
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
    /* no decorative cork in gameplay — an upright open bottle reads as unsolved;
       completion is shown by the cork lid (see startCork / syncCaps). Canvas mode keeps the
       SVG as an invisible proxy, so skip building sheen DOM for it. */
    const svg = buildBottleSVG(shapeName, { cork: false, lid: true, label: true, sheen: !isCanvasMode() });
    btn.appendChild(svg);
    const ring = document.createElement('span'); ring.className = 'ring';
    ring.style.top = (sh.mouthFrac * 100).toFixed(1) + '%';
    btn.appendChild(ring);
    slot.appendChild(glow); slot.appendChild(shadow); slot.appendChild(btn);
    if (frozen.has(i)) {
      slot.classList.add('frozen');
      const ice = document.createElement('span'); ice.className = 'ice'; ice.textContent = '❄';
      slot.appendChild(ice);
    }
    if (veiled[i]) {
      slot.classList.add('veiled');
      const seal = document.createElement('span'); seal.className = 'seal'; seal.textContent = '✦';
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
  if (!gen) { toastMsg('Today’s puzzle would not mix — try Classic'); return; }
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
  if (!gen) { toastMsg('Rush hit a wall — try Classic'); return; }
  level = rushStage;
  setupBoard(gen);
  startRushTimer(window.rushTimeFor(gen.par));
}

function startRushTimer(sec) {
  rushTimeLeft = sec;
  clearInterval(rushTicker);
  rushGrace = null;
  rushTicker = setInterval(() => {
    if (document.hidden) return;
    /* last-second grace: the clock waits only for pours committed before it
       reached the final second — pours queued after that do not stop it */
    if (rushTimeLeft <= 1 && rushGrace && rushGrace.some(e => !e.finished)) return;
    rushTimeLeft--;
    if (rushTimeLeft === 1) rushGrace = jobs.map(j => j.entry).filter(Boolean).concat(queue);
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
  $('#win-title').textContent = 'Time’s up!';
  $('#win-stars').innerHTML = '<span>⏱️</span>';
  $('#win-meta').textContent = 'Cleared ' + cleared + (cleared === 1 ? ' stage' : ' stages') + ' · best ' + save.rushBest;
  $('#btn-next').classList.add('hidden');
  $('#overlay').classList.add('show');
  AudioFX.invalid(); buzz([30, 60, 30]);
}

function onRushStageClear() {
  stopRushTimer();
  if (rushStage > save.rushBest) { save.rushBest = rushStage; persist(); }
  if (rushStage >= 5) unlockAch('rush5');
  toastMsg('Stage ' + rushStage + ' clear! ⚡ +next', 1400);
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
  /* compact copy — the old three-part line wrapped on phone widths */
  if (mode === 'daily') {
    lvlEl.textContent = 'Daily Challenge';
    subEl.textContent = todayStr().slice(5).replace('-', '/') + ' · Moves ' + moves;
  } else if (mode === 'rush') {
    lvlEl.textContent = 'Rush · Stage ' + rushStage;
    subEl.textContent = '⏱ ' + Math.max(0, rushTimeLeft) + 's · Moves ' + moves;
  } else {
    lvlEl.textContent = 'Level ' + level;
    subEl.textContent = 'Moves ' + moves + ' · Par ' + par;
  }
  subEl.classList.toggle('warn', mode === 'rush' && rushTimeLeft <= 10);
  const undoBtn = $('#btn-undo');
  undoBtn.disabled = undoHistory.length === 0 || undosLeft <= 0 || autoPlaying;
  const badge = $('#undo-badge');
  if (undosAllowed !== Infinity) { badge.classList.remove('hidden'); badge.textContent = undosLeft; }
  else badge.classList.add('hidden');
  $('#btn-restart').disabled = autoPlaying;
  $('#btn-hint').disabled = autoPlaying || solutionPending;
  updateBottleLabels();
}
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------------- interaction ---------------- */
function setSelected(i) {
  if (sel !== null && slots[sel]) slots[sel].el.classList.remove('selected');
  sel = i;
  if (i !== null) {
    slots[i].el.classList.add('selected'); Fluid.slosh(i, 2.2); Fluid.start();   /* lift sloshes the liquid */
    kickSlosh(i, (Math.random() < 0.5 ? -1 : 1) * 0.9);
    if (!isCanvasMode()) sweepSheen(slots[i].svg);
  }
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
  const gen = boardGen;
  /* the thaw plays out over timers: skip any bottle that undo re-froze (or a
     board that was replaced) before its timer fired */
  const stale = i => gen !== boardGen || frozen.has(i) || !slots[i];
  list.forEach((i, k) => setTimeout(() => {
    if (stale(i)) return;
    const s = slots[i];
    s.el.classList.remove('frozen');
    const ice = s.el.querySelector('.ice');
    if (ice) { ice.classList.add('shatter'); setTimeout(() => { if (!stale(i)) ice.remove(); }, 600); }
    if (explicitPrettyEffects()) spawnSparkles(s.el, 8, 0.5);
    renderer.renderAll();   /* canvas draws the frost overlay from `frozen` */
  }, RM ? 0 : 160 + k * 140));
  renderer.renderAll();
  updateBottleLabels();
}

function onTap(i) {
  AudioFX.ensure();
  if (autoPlaying) return;
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
    commitMove(s, i, !locked.has(s));
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

/* ---------------- pour choreography (Aliquot port) ----------------
   A pour is a job stepped by the Motion loop:
     travel T1 — lip eases to the pour point on an arc while the bottle tips
                 to thStart (the angle where its liquid just meets the lip)
     pour   T2 — the source drains; its angle follows thetaFor(volume) and
                 the pose is solved every frame so the lip stays on target
     return T3 — back home, touchdown thud + slosh
   The receiver fills at the same rate, delayed by the stream's fall time tf.
   Poses are written as CSS translate+rotate on the bottle button (rotation
   about the element centre), which the canvas renderer reads back. */
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
const lerpN = (a, b, t) => a + (b - a) * t;
const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const smoothstep = t => { t = clampN(t, 0, 1); return t * t * (3 - 2 * t); };
const flowN = t => (t > 0 && t < 1) ? 4 * t * (1 - t) : 0;

let jobs = [];            /* running pour jobs */
let bodies = [];          /* per-bottle slosh oscillator + surface ripple */
let bodyPx = [];          /* per-bottle glass body width in px (cached at layout) */
let poses = [];           /* per-bottle live pose { tx, ty, a } while a job moves it */
function makeBody(i) {
  return { phi: 0, phiV: 0, px: null, pvx: 0, pang: 0, pangV: 0, ripple: 0, rphase: i * 1.7, pouring: false };
}
/* does bottle i change from frame to frame right now? (canvas idle-layer split) */
function bottleAnimating(i) {
  if (locked.has(i) || poses[i]) return true;
  const c = corks[i];
  if (c && c.t < 1) return true;
  if (Fluid.sims[i]) return true;
  const b = bodies[i];
  return !!b && (Math.abs(b.phi) > 0.0015 || Math.abs(b.phiV) > 0.015 || b.ripple > 0.05);
}
function flyingSource(i) { for (const j of jobs) if (j.si === i && !j.srcDone) return true; return false; }
function jobsInto(i) {
  let out = null;
  for (const j of jobs) if (j.di === i && !j.dstDone && j.streamFx) (out || (out = [])).push(j);
  return out;
}
function cacheBodyPx() {
  bodyPx = slots.map(sl => sl ? sl.slot.offsetWidth * corkBodyW(sl.sh) / 100 : 40);
}

/* per-shape pour geometry in viewBox units: lip corner, rim, outline samples
   for clearance, and the receiver's outer top profile (topAt[|dx|]) */
const pourGeoCache = {};
function pourGeo(sn) {
  if (pourGeoCache[sn]) return pourGeoCache[sn];
  const sh = SHAPES[sn], g = PourPhysics.SHAPE_GEO[sn];
  const lipHalf = shapeWidthAt(sn, g.top) / 2;
  const rimHalf = sh.lip.w / 2, rimTop = sh.lip.y, rimBot = sh.lip.y + sh.lip.h;
  const bodyW = corkBodyW(sh);
  const outer = y => shapeWidthAt(sn, y) / 2 + 3;
  const S = [];
  for (let y = rimBot; y <= g.bottom; y += 6) S.push(50 - outer(y), y, 50 + outer(y), y);
  S.push(sh.lip.x, rimTop, sh.lip.x + sh.lip.w, rimTop, sh.lip.x, rimBot, sh.lip.x + sh.lip.w, rimBot);
  for (let x = -bodyW / 2 + 6; x <= bodyW / 2 - 6; x += 6) S.push(50 + x, g.bottom + 3);
  const topAt = new Float64Array(61);
  for (let d = 0; d <= 60; d++) {
    if (d <= rimHalf) { topAt[d] = rimTop; continue; }
    let y = Infinity;
    for (let yy = rimBot; yy <= g.bottom; yy += 1) if (outer(yy) >= d) { y = yy; break; }
    topAt[d] = y;
  }
  return (pourGeoCache[sn] = { top: g.top, lipHalf, rimHalf, rimTop, rimBot, bodyW, samples: S, topAt });
}
function receiverTop(gD, du) {
  if (du <= 0) return gD.topAt[0];
  if (du >= 60) return Infinity;
  return gD.topAt[Math.ceil(du)];
}

/* where the lip must sit at tilt th: over the receiver mouth, high enough
   that no part of the tilted source dips into the receiver's outline */
function pourPoint(job, th, s) {
  s = s == null ? job.s : s;
  const { hd, kD, kS, gD, gS, w } = job;
  const dCx = hd.x + hd.w / 2, rimTop = hd.y + gD.rimTop * kD;
  const px = dCx - s * w * 0.14;
  let py = rimTop - w * 0.2;
  const a = s * th, c = Math.cos(a), sn = Math.sin(a);
  const lipU = 50 + s * gS.lipHalf, lipV = gS.top;
  const margin = w * 0.08 / kD, gap = w * 0.1, S = gS.samples;
  for (let i = 0; i < S.length; i += 2) {
    const dx = (S[i] - lipU) * kS, dy = (S[i + 1] - lipV) * kS;
    const wx = px + dx * c - dy * sn;
    const topU = receiverTop(gD, Math.abs(wx - dCx) / kD - margin);
    if (!isFinite(topU)) continue;
    const req = hd.y + topU * kD - gap - (dx * sn + dy * c);
    if (req < py) py = req;
  }
  return { x: px, y: Math.max(py, 6 - job.stageTop) };
}
/* how far the tilted source would stick out of the stage when pouring to side s */
function overflowFor(job, s) {
  const { kS, gS } = job;
  const lipU = 50 + s * gS.lipHalf, lipV = gS.top, S = gS.samples;
  let worst = 0;
  for (const th of [job.thStart, job.thEnd]) {
    const P = pourPoint(job, th, s), a = s * th, c = Math.cos(a), sn = Math.sin(a);
    for (let i = 0; i < S.length; i += 2) {
      const wx = P.x + (S[i] - lipU) * kS * c - (S[i + 1] - lipV) * kS * sn;
      if (wx < 2) worst = Math.max(worst, 2 - wx);
      if (wx > job.stageW - 2) worst = Math.max(worst, wx - job.stageW + 2);
    }
  }
  return worst;
}

/* bottle-local viewBox point (u, v) → stage px under pose (tx, ty, a) */
function worldPt(h, k, tx, ty, a, u, v) {
  const cx = h.w / 2, cy = h.h / 2, lx = u * k - cx, ly = v * k - cy, c = Math.cos(a), s = Math.sin(a);
  return { x: h.x + tx + cx + lx * c - ly * s, y: h.y + ty + cy + lx * s + ly * c };
}
function setPose(i, tx, ty, a) {
  poses[i] = { tx, ty, a };
  /* canvas reads poses[] directly; only the SVG fallback moves the DOM
     (keeps the invisible hit targets home and skips per-frame style work) */
  if (!isCanvasMode()) slots[i].btn.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) rotate(' + (a * 180 / Math.PI).toFixed(3) + 'deg)';
}
function clearPose(i) {
  poses[i] = null;
  if (!slots[i]) return;
  slots[i].btn.style.transform = '';
  slots[i].btn.style.transition = '';
  slots[i].el.classList.remove('pouring');
}
/* pose that puts the source's lip corner at (lipX, lipY) with angle a */
function poseSourceLip(job, lipX, lipY, a) {
  const h = job.hs, k = job.kS, cx = h.w / 2, cy = h.h / 2;
  const lx = job.lipU * k - cx, ly = job.lipV * k - cy, c = Math.cos(a), s = Math.sin(a);
  const tx = lipX - (h.x + cx + lx * c - ly * s), ty = lipY - (h.y + cy + lx * s + ly * c);
  setPose(job.si, tx, ty, a);
  job.pose = { tx, ty, a };
}

function createJob(si, di, n, color, srcBefore, dstBefore, srcAfter, dstAfter, lifted) {
  const stage = $('#stage'), sr = stage.getBoundingClientRect();
  const home = i => layoutBox(slots[i].slot, stage);
  const hs = home(si), hd = home(di);
  const snS = shapesByBottle[si], snD = shapesByBottle[di];
  const gS = pourGeo(snS), gD = pourGeo(snD);
  const kS = hs.w / 100, kD = hd.w / 100;
  const job = {
    si, di, n, color, snS, snD, gS, gD, hs, hd, kS, kD,
    w: gS.bodyW * kS, wD: gD.bodyW * kD, stageW: sr.width, stageTop: sr.top,
    V0: srcBefore.length, dstUnits0: dstBefore.length,
    snapS: mergeRuns(srcBefore), snapD: mergeRuns(dstBefore),
    afterS: mergeRuns(srcAfter), afterD: mergeRuns(dstAfter),
    dstComplete: window.isBottleComplete(dstAfter),
    t: 0, srcDone: false, dstDone: false, retStarted: false, voice: null,
    streamOrigin: null, streamFx: null, svgStream: false, drops: [], flowD: 0, done: false
  };
  job.maxW = 0.55 * Math.min(gS.lipHalf * 2 * kS, gD.lipHalf * 2 * kD);
  job.thStart = PourPhysics.thetaFor(snS, job.V0);
  job.thEnd = PourPhysics.thetaFor(snS, job.V0 - n);
  const sCx = hs.x + hs.w / 2, dCx = hd.x + hd.w / 2;
  let s = dCx >= sCx ? 1 : -1;
  if (Math.abs(dCx - sCx) < 1) s = dCx < sr.width / 2 ? -1 : 1;
  const o1 = overflowFor(job, s), o2 = overflowFor(job, -s);
  if (o1 > 0 && o2 < o1) s = -s;
  job.s = s;
  job.lipU = 50 + s * gS.lipHalf; job.lipV = gS.top;
  job.lip0 = { x: hs.x + job.lipU * kS, y: hs.y + job.lipV * kS + (lifted ? -0.22 * hs.w : 0) };
  const P = pourPoint(job, job.thStart);
  const dist = Math.hypot(P.x - job.lip0.x, P.y - job.lip0.y);
  job.T1 = clampN(0.2 + dist / (job.w * 22), 0.24, 0.42);
  job.T2 = 0.16 + 0.1 * n;
  const fall = (hd.y + PourPhysics.uprightLevel(snD, job.dstUnits0) * kD) - P.y;
  job.tf = clampN(0.045 + fall / (job.w * 18), 0.07, 0.15);
  job.T3 = 0.28;
  job.arc = Math.min(job.w * 0.55, dist * 0.12);
  job.lipEnd = null; job.angEnd = s * job.thEnd;
  return job;
}

function streamTarget(job) {
  let units = 0;
  for (const seg of visual[job.di]) units += seg.u;
  return {
    x: job.hd.x + job.hd.w / 2 + job.s * job.w * 0.03,
    y: job.hd.y + PourPhysics.uprightLevel(job.snD, units) * job.kD + 1
  };
}

function stepJob(job, dt) {
  job.t += dt;
  const { si, di, s, w } = job, t = job.t;
  const bS = bodies[si], bD = bodies[di];
  const svg = !isCanvasMode();
  if (!job.srcDone) {
    let lipX = 0, lipY = 0, ang = 0;
    if (t < job.T1) {
      const u = t / job.T1, e = ease3(u);
      ang = s * job.thStart * easeSine(u);
      const P = pourPoint(job, job.thStart);
      lipX = lerpN(job.lip0.x, P.x, e);
      lipY = lerpN(job.lip0.y, P.y, e) - Math.sin(Math.PI * e) * job.arc;
      if (bS) bS.pouring = false;
    } else if (t < job.T1 + job.T2) {
      const E = smoothstep((t - job.T1) / job.T2);
      visual[si] = drainSnapshot(job.snapS, job.n * E);
      ang = s * PourPhysics.thetaFor(job.snS, job.V0 - job.n * E);
      const P = pourPoint(job, Math.abs(ang));
      lipX = P.x; lipY = P.y;
      if (bS) bS.pouring = true;
      job.lipEnd = { x: lipX, y: lipY }; job.angEnd = ang;
    } else {
      if (!job.retStarted) {
        job.retStarted = true;
        if (bS) bS.pouring = false;
        visual[si] = job.afterS.map(x => ({ c: x.c, u: x.u }));
        if (!job.lipEnd) { const P = pourPoint(job, job.thEnd); job.lipEnd = { x: P.x, y: P.y }; }
      }
      const u = (t - job.T1 - job.T2) / job.T3;
      if (u >= 1) {
        job.srcDone = true;
        clearPose(si);
        if (bS) { bS.ripple = Math.max(bS.ripple, job.gS.bodyW * 0.06); bS.phiV -= s * 0.55; }
        AudioFX.land();
        if (svg) renderer.renderBottle(si, 0);
      } else {
        const e = ease3(u);
        ang = job.angEnd * (1 - easeSine(u));
        const lift = sel === si ? -0.22 * job.hs.w : 0;
        const hx = job.hs.x + job.lipU * job.kS, hy = job.hs.y + job.lipV * job.kS + lift;
        lipX = lerpN(job.lipEnd.x, hx, e);
        lipY = lerpN(job.lipEnd.y, hy, e) - Math.sin(Math.PI * e) * w * 0.25;
      }
    }
    if (!job.srcDone) {
      poseSourceLip(job, lipX, lipY, ang);
      /* the stream leaves from the outer rim; it freezes once the source
         stops pouring so the tail falls straight */
      if (t >= job.T1 && !job.retStarted) {
        job.streamOrigin = worldPt(job.hs, job.kS, job.pose.tx, job.pose.ty, ang, 50 + s * job.gS.rimHalf, job.gS.rimBot);
      }
      if (svg) renderer.renderBottle(si, ang * 180 / Math.PI);
    }
  }
  if (!job.dstDone) {
    const td = t - job.T1 - job.tf;
    if (td > 0) {
      const u = td / job.T2, E = smoothstep(u), fl = flowN(u);
      visual[di] = fillSnapshot(job.snapD, job.color, job.n * E);
      job.flowD = fl;
      if (bD) bD.ripple = Math.max(bD.ripple, job.gD.bodyW * (0.018 + 0.05 * fl));
      if (!job.voice && u < 0.9) { job.voice = AudioFX.startPour(); buzz(12); }
      if (job.voice) AudioFX.updatePour(job.voice, fl, (job.dstUnits0 + job.n * E) / 4, dt);
      if (fl > 0.3 && CanvasRenderer.effectsEnabled() && Math.random() < dt * 26 * fl) spawnDrop(job);
      if (u >= 1) {
        job.dstDone = true;
        visual[di] = job.afterD.map(x => ({ c: x.c, u: x.u }));
        AudioFX.stopPour(job.voice); job.voice = null;
        job.flowD = 0;
        if (bD) bD.phiV += s * 0.5;
        if (job.svgStream) { renderer.endPour({ si, di }); job.svgStream = false; }
        if (explicitPrettyEffects()) spawnSparkles(slots[di].el, 4, 0.25);
        if (job.dstComplete) completeReceiver(di);
      }
    }
    if (job.streamOrigin && !job.dstDone) {
      const tg = streamTarget(job);
      job.streamFx = { sx: job.streamOrigin.x, sy: job.streamOrigin.y, tx: tg.x, ty: tg.y };
      if (svg) {
        const info = {
          si, di, color: job.color, c0: COLORS[job.color][0], c1: COLORS[job.color][1],
          sx: job.streamOrigin.x, sy: job.streamOrigin.y, tx: tg.x, ty: tg.y,
          cpx: job.streamOrigin.x + s * w * 0.16, cpy: job.streamOrigin.y + (tg.y - job.streamOrigin.y) * 0.08,
          side: s, receiverW: job.hd.w
        };
        if (!job.svgStream) { renderer.beginPour(info); job.svgStream = true; }
        else renderer.updatePour(info);
      }
    }
    if (svg) renderer.renderBottle(di, 0);
  }
  for (const d of job.drops) { d.life -= dt; d.vy += w * 38 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
  if (job.drops.length) job.drops = job.drops.filter(d => d.life > 0);
  if (job.srcDone && job.dstDone && !job.drops.length) job.done = true;
}
function spawnDrop(job) {
  const tg = streamTarget(job), w = job.w;
  job.drops.push({
    x: tg.x + (Math.random() - 0.5) * w * 0.1, y: tg.y - 1,
    vx: (Math.random() - 0.5) * w * 2.2, vy: -w * (2 + Math.random() * 2.2),
    life: 0.22 + Math.random() * 0.1, r: Math.max(1, w * 0.035)
  });
}
/* the receiver just finished filling and is complete: reveal, then cork it */
function completeReceiver(di, quiet) {
  if (hiddenDepth[di]) { hiddenDepth[di] = 0; if (!quiet) AudioFX.reveal(); }
  if (quiet) { seatCorkNow(di); slots[di].el.classList.add('capped'); }
  else startCork(di);
  if (!isCanvasMode()) renderer.renderBottle(di, 0);
}
/* jump a job to its end state (reduced motion, fast-forward) */
function finishJob(job, quiet) {
  AudioFX.stopPour(job.voice); job.voice = null;
  if (job.svgStream) { renderer.endPour({ si: job.si, di: job.di }); job.svgStream = false; }
  if (!job.srcDone) {
    job.srcDone = true;
    visual[job.si] = job.afterS.map(x => ({ c: x.c, u: x.u }));
    clearPose(job.si);
    if (!quiet) AudioFX.land();
  }
  if (!job.dstDone) {
    job.dstDone = true;
    visual[job.di] = job.afterD.map(x => ({ c: x.c, u: x.u }));
    if (job.dstComplete) completeReceiver(job.di, quiet);
  }
  job.streamFx = null; job.drops = [];
  job.done = true;
  if (bodies[job.si]) bodies[job.si].pouring = false;
}

/* one Motion task steps every pour job and every bottle's slosh */
let boardTicking = false;
function ensureBoardTick() {
  if (boardTicking || !state.length) return;
  boardTicking = true;
  Motion.add(dt => {
    const alive = boardTick(dt);
    if (!alive) boardTicking = false;
    return alive;
  });
}
const SLOSH_K = 230;
function boardTick(dt) {
  let active = jobs.length > 0;
  for (const job of jobs) {
    try { stepJob(job, dt); }
    catch (e) { console.error(e); finishJob(job, true); }   /* never leave a pour hanging */
  }
  if (afterJobsStep()) active = true;
  /* slosh: the surface is a damped oscillator driven by the bottle's
     horizontal and angular acceleration */
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b) continue;
    const p = poses[i], x = p ? p.tx : 0, ang = p ? p.a : 0;
    if (b.px === null) { b.px = x; b.pvx = 0; b.pang = ang; b.pangV = 0; }
    const vx = (x - b.px) / dt, ax = (vx - b.pvx) / dt; b.px = x; b.pvx = vx;
    const av = (ang - b.pang) / dt, aa = (av - b.pangV) / dt; b.pang = ang; b.pangV = av;
    const axn = clampN(ax / (bodyPx[i] || 40), -70, 70), aan = clampN(aa, -120, 120);
    const damp = b.pouring ? 16 : 6.2, sub = 3, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      const acc = -SLOSH_K * b.phi - damp * b.phiV + 0.42 * axn - 0.08 * aan;
      b.phiV += acc * h; b.phi += b.phiV * h;
    }
    b.phi = clampN(b.phi, -0.2, 0.2);
    b.ripple *= Math.exp(-dt * 2.8); b.rphase += dt * 15;
    if (Math.abs(b.phi) > 0.0015 || Math.abs(b.phiV) > 0.015 || b.ripple > 0.05) active = true;
    else if (!p) { b.phi = 0; b.phiV = 0; if (b.ripple <= 0.05) b.ripple = 0; }
  }
  return active || pendingCount() > 0;
}
function kickSlosh(i, v) {
  if (RM || !bodies[i]) return;
  bodies[i].phiV += v;
  ensureBoardTick();
}

/* ---------------- instant-commit input queue ----------------
   A legal tap commits the move to `state` at once (undo snapshot, moves,
   HUD) and queues its animation. A queued pour starts when neither of its
   bottles is claimed by a running pour or an earlier queued one, so each
   bottle's pours play in order and independent pours run side by side.
   Specials (mystery reveal, orb, thaw) fire when the pour's job completes. */
let queue = [];
let settleArmed = false;   /* a pour finished since the board last settled */
let boardGen = 0;          /* bumps on every board setup; stale timers check it */
function pendingCount() { return jobs.length + queue.length; }
function refreshBusy() {
  locked.clear();
  for (const j of jobs) { locked.add(j.si); locked.add(j.di); }
  for (const q of queue) { locked.add(q.si); locked.add(q.di); }
  slots.forEach((sl, i) => { if (sl) sl.el.classList.toggle('busy', locked.has(i)); });
}

function commitMove(si, di, lifted) {
  undoHistory.push(snapshotBoard());
  if (undoHistory.length > 300) undoHistory.shift();
  const n = window.pourAmount(state, si, di);
  const color = state[si][state[si].length - 1];
  const srcBefore = state[si].slice(), dstBefore = state[di].slice();
  window.applyPour(state, si, di);
  moves++;
  if (!save.seenHint) { save.seenHint = true; persist(); $('#hint').style.opacity = 0; }
  const entry = {
    si, di, n, color, srcBefore, dstBefore, srcAfter: state[si].slice(), dstAfter: state[di].slice(),
    lifted: !!lifted, at: performance.now()
  };
  entry.done = new Promise(r => { entry.resolve = () => { entry.finished = true; r(); }; });
  queue.push(entry);
  AudioFX.swap();
  pumpQueue();
  refreshBusy();
  updateHUD();
  ensureBoardTick();   /* also runs the settle check when reduced motion finished the pour already */
  return entry.done;
}

function pumpQueue() {
  let progressed = true;
  while (progressed && queue.length) {
    progressed = false;
    const start = new Set(startablePours(jobs, queue));
    const ready = queue.filter((q, k) => start.has(k));
    queue = queue.filter((q, k) => !start.has(k));
    /* reduced motion finishes pours synchronously, which can free later ones */
    for (const q of ready) if (startEntry(q)) progressed = true;
  }
}

/* start a queued pour; returns true when it finished synchronously (reduced motion) */
function startEntry(q) {
  /* the source only starts lifted if it was still up from its selection */
  const lifted = q.lifted && performance.now() - q.at < 40;
  const job = createJob(q.si, q.di, q.n, q.color, q.srcBefore, q.dstBefore, q.srcAfter, q.dstAfter, lifted);
  job.entry = q;
  visual[job.si] = job.snapS.map(x => ({ c: x.c, u: x.u }));
  visual[job.di] = job.snapD.map(x => ({ c: x.c, u: x.u }));
  slots[job.si].el.classList.add('pouring');
  slots[job.si].btn.style.transition = 'none';
  if (RM) {
    finishJob(job, false);
    postJob(job, false);
    renderer.renderAll();
    return true;
  }
  jobs.push(job);
  ensureBoardTick();
  return false;
}

/* bookkeeping when a pour's animation is over (or fast-forwarded) */
function postJob(job, quiet) {
  if (job.posted) return;
  job.posted = true;
  const { si, di } = job;
  revealMystery(si, job.entry ? job.entry.srcAfter.length : state[si].length);
  if (job.dstComplete) {
    orbUpdate(!quiet);
    if (frozen.size) thawAll();
  }
  if (!quiet) { sloshBottle(di, Math.min(2, job.n)); sloshBottle(si, 0.5); }
  if (!isCanvasMode()) { renderer.renderBottle(si, 0); renderer.renderBottle(di, 0); }
  settleArmed = true;
  if (job.entry) job.entry.resolve();
}

/* called by boardTick every frame: finished jobs → post, start what can start */
function afterJobsStep() {
  if (jobs.some(j => j.done)) {
    const done = jobs.filter(j => j.done);
    jobs = jobs.filter(j => !j.done);
    refreshBusy();
    for (const j of done) postJob(j, false);
    pumpQueue();
    refreshBusy();
    updateHUD();
    updateBottleLabels();
  }
  if (settleArmed && !pendingCount() && corks.every(c => !c || c.t >= 1)) {
    settleArmed = false;
    onBoardSettled();
  }
  return settleArmed;
}

/* nothing running, nothing queued, every cork seated: layout, win, stuck */
function onBoardSettled() {
  visual = state.map(mergeRuns);
  renderer.renderAll();
  if (pendingLayout) { pendingLayout = false; renderer.syncLayout(); }
  if (window.isSolved(state)) {
    const gen = boardGen;
    wait(RM ? 100 : 350).then(() => {
      if (gen !== boardGen || pendingCount() || !window.isSolved(state) || $('#overlay').classList.contains('show')) return;
      onWin();
    });
  } else if (!autoPlaying && !anyUsefulMove()) {
    toastMsg('No moves left — undo ↩ or restart ⟳', 3200);
    AudioFX.invalid();
  }
}

/* fast-forward every running and queued pour to its end state (visual =
   state), stop pour voices, seat corks — before undo, restart, hint, menu */
function flushAll() {
  const had = pendingCount() > 0 || corks.some(c => c && c.t < 1);
  for (const job of jobs) { finishJob(job, true); postJob(job, true); }
  jobs = [];
  for (const q of queue) {
    revealMystery(q.si, q.srcAfter.length);
    if (window.isBottleComplete(q.dstAfter)) {
      hiddenDepth[q.di] = 0;
      if (frozen.size) thawAll();
    }
    q.resolve();
  }
  queue = [];
  corks.forEach((c, i) => { if (c && c.t < 1) { c.t = 1; c.popped = true; paintCorkSvg(i); if (slots[i]) slots[i].el.classList.add('capped'); } });
  AudioFX.stopAllPours();
  settleArmed = false;
  if (!had) return;
  slots.forEach((sl, i) => clearPose(i));
  visual = state.map(mergeRuns);
  refreshBusy();
  syncCaps();
  orbUpdate(false);
  renderer.renderAll();
  updateHUD();
}

/* board teardown (new level): drop everything without effects */
function discardPours() {
  for (const job of jobs) AudioFX.stopPour(job.voice);
  for (const job of jobs) if (job.entry) job.entry.resolve();
  for (const q of queue) q.resolve();
  jobs = []; queue = []; settleArmed = false; boardGen++;
  AudioFX.stopAllPours();
  if (SvgRenderer.pourFxMap) for (const si of [...SvgRenderer.pourFxMap.keys()]) SvgRenderer.endPour({ si });
}

/* autoplay (and QA) path: commit a pour and resolve when its animation ends */
function doPour(si, di) {
  return commitMove(si, di, false);
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
  if (!undoHistory.length || undosLeft <= 0 || autoPlaying) return;
  flushAll();
  const snap = undoHistory.pop();
  undosUsed++;
  if (undosAllowed !== Infinity) undosLeft--;
  setSelected(null);
  AudioFX.stopAllPours();
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


function solveOnMainThread(requestedState, requestedFrozen, budget) {
  return new Promise(resolve => {
    setTimeout(() => {
      const frozenSet = requestedFrozen && requestedFrozen.size ? new Set(requestedFrozen) : null;
      const res = window.solve(window.cloneState(requestedState || []), budget || 250000, frozenSet);
      resolve({ solution: res.solution || null, nodes: res.nodes || 0, aborted: !!res.aborted });
    }, 0);
  });
}

function requestSolution({ state: requestedState, frozen: requestedFrozen, budget }) {
  cancelSolution('cancelled');
  solutionPending = true;
  updateHUD();
  const id = ++solverRequestId;
  let worker;
  try {
    worker = getSolverWorker();
  } catch (err) {
    return solveOnMainThread(requestedState, requestedFrozen, budget).finally(() => {
      if (id === solverRequestId) { solutionPending = false; updateHUD(); }
    });
  }
  return new Promise((resolve, reject) => {
    const finish = fn => value => {
      clearTimeout(solverTimer);
      solverTimer = null;
      solverReject = null;
      solutionPending = false;
      updateHUD();
      fn(value);
    };
    const resolveDone = finish(resolve);
    const rejectDone = finish(reject);
    const fallback = () => {
      if (id !== solverRequestId) return;
      if (solverWorker) { solverWorker.terminate(); solverWorker = null; }
      solveOnMainThread(requestedState, requestedFrozen, Math.min(budget || 250000, 180000)).then(resolveDone, rejectDone);
    };
    solverReject = rejectDone;
    solverTimer = setTimeout(fallback, SOLVER_WORKER_TIMEOUT);
    worker.onmessage = e => {
      if (!e.data || e.data.id !== id) return;
      clearTimeout(solverTimer);
      solverTimer = null;
      solverReject = null;
      solutionPending = false;
      updateHUD();
      if (e.data.error) fallback();
      else resolve(e.data);
    };
    worker.onerror = () => fallback();
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
  if (autoPlaying || solutionPending || !state.length) return;
  flushAll();
  if (window.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Hints are paused in Rush for timer fairness ⚡', 2200); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinking…', 1200);
  let res;
  try {
    res = await requestSolution({ state, frozen, budget: 250000 });
  } catch (err) {
    toastMsg((err && err.message === 'timeout') ? 'Still thinking — try a smaller board or undo ↩' : 'Could not find a hint yet — try again or undo ↩', 3000);
    AudioFX.invalid();
    return;
  }
  if (res.aborted) { toastMsg('Ran out of search budget — undo ↩ a little', 3000); AudioFX.invalid(); return; }
  const sol = res.solution && res.solution.length ? res.solution : null;
  if (!sol) { toastMsg('No solution found from here — undo ↩ a little', 3000); AudioFX.invalid(); return; }
  const [i, j] = sol[0];
  clearHintGlow();
  slots[i].el.classList.add('hint-src');
  slots[j].el.classList.add('hint-dst');
  clearTimeout(hintGlowT);
  hintGlowT = setTimeout(clearHintGlow, 2400);
  const c = state[i][state[i].length - 1];
  const what = veiled[i] || (hiddenDepth[i] || 0) >= state[i].length ? 'that bottle' : 'the ' + COLOR_NAMES[c];
  toastMsg('Hint: pour ' + what + ' into the glowing bottle — ' + sol.length + ' to go');
  usedHint = true;
  unlockAch('oracle');
  AudioFX.reveal(); buzz(8);
}

/* No UI button calls this — it's reachable only via window.__vessel.autoSolve()
   (see the export at the bottom of this file). That's intentional: it exists
   for solver verification / manual QA of a board, not as a player-facing
   "skip the puzzle" feature. Keep it that way unless a deliberate design
   decision adds an auto-solve control to the HUD. */
async function autoSolve() {
  if (autoPlaying || solutionPending || !state.length) return;
  flushAll();
  if (window.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Auto-solve is paused in Rush for timer fairness ⚡', 2400); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinking…', 1200);
  let res;
  try {
    res = await requestSolution({ state, frozen, budget: 350000 });
  } catch (err) {
    toastMsg((err && err.message === 'timeout') ? 'Timed out searching — control is back' : 'Could not find a hint yet — try again or undo ↩', 3200);
    AudioFX.invalid();
    return;
  }
  if (res.aborted) { toastMsg('Hit the search budget — undo ↩ a few moves first', 3200); AudioFX.invalid(); return; }
  const sol = res.solution && res.solution.length ? res.solution : null;
  if (!sol) { toastMsg('No solution found from here — undo ↩ a few moves first', 3200); AudioFX.invalid(); return; }
  autoPlaying = true; usedAuto = true;
  setSelected(null); clearHintGlow();
  updateHUD();
  toastMsg('Auto-solving — watch the ' + sol.length + '-move solve ✨', 2400);
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
  { id: 'first',    icon: '🍾', name: 'First pour',       desc: 'Complete your first level' },
  { id: 'triple',   icon: '🌟', name: 'Flawless',         desc: 'Earn 3 stars on a level' },
  { id: 'perfect3', icon: '👑', name: 'Hat trick',        desc: '3-star three levels in a row' },
  { id: 'stars25',  icon: '✨', name: 'Constellation',    desc: 'Collect 25 stars in Classic' },
  { id: 'stars60',  icon: '🌌', name: 'Galaxy brain',     desc: 'Collect 60 stars in Classic' },
  { id: 'expert',   icon: '🧠', name: 'Master mixer',     desc: 'Beat an Expert level' },
  { id: 'pure',     icon: '🎯', name: 'No takebacks',     desc: 'Beat Normal or Expert without undo' },
  { id: 'daily',    icon: '📅', name: 'Fresh squeeze',    desc: 'Complete a Daily Challenge' },
  { id: 'streak3',  icon: '🔥', name: 'On a roll',        desc: 'Reach a 3-day Daily streak' },
  { id: 'rush5',    icon: '⚡', name: 'Quicksilver',      desc: 'Clear stage 5 in Rush' },
  { id: 'oracle',   icon: '💡', name: 'Ask the oracle',   desc: 'Use one of your hints' }
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
  if (SKIN === 'apothecary') LID = ['#c79a5e', '#a9763f', '#7c5026', '#caa06a'];
  else {
    const cs = getComputedStyle(document.body);
    const acc = (cs.getPropertyValue('--accent') || '#f0c074').trim();
    const deep = (cs.getPropertyValue('--accent-deep') || '#d18b34').trim();
    const ok = c => /^#[0-9a-f]{6}$/i.test(c);
    const a = ok(acc) ? acc : '#f0c074', d = ok(deep) ? deep : '#d18b34';
    LID = [mixHex(a, '#ffffff', 0.45), a, d, mixHex(a, '#ffffff', 0.6)];
  }
  document.querySelectorAll('.lid-top').forEach(el => el.setAttribute('fill', LID[3]));
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
  setSwitch('#sw-fluid', !!save.fluid);
  setSwitch('#sw-dark', save.mode === 'dark');
  const rq = $('#render-quality');
  if (rq) rq.value = save.renderQuality;
  const bq = $('#background-quality');
  if (bq) bq.value = save.backgroundQuality;
  renderThemeGrid();
}

/* ---------------- win ---------------- */
function starsFor(m) { return m <= par ? 3 : m <= Math.ceil(par * 1.5) ? 2 : 1; }

function onWin() {
  if (mode === 'rush') return onRushStageClear();
  const st = usedAuto ? 1 : starsFor(moves);
  let meta = moves + ' moves · par ' + par;

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
    meta += ' · 🔥 ' + save.daily.streak + '-day streak';
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
    if (best < moves) meta += ' · best ' + best;
    $('#btn-next').classList.toggle('hidden', level >= window.MAX_LEVEL);
  }

  if (usedAuto) meta += ' · auto-solved ✨';
  $('#win-stars').innerHTML = [1, 2, 3].map(k => '<span class="' + (k <= st ? '' : 'off') + '">★</span>').join('');
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
let ambientOn = false;
let ambientGen = 0;     /* invalidates callbacks already handed to rAF on stop/restart */
let ambientRaf = 0;
let ambientResize = null;

function clearAmbientCanvas() {
  const cv = $('#ambient');
  const ctx = cv && cv.getContext && cv.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
}

function startAmbient() {
  if (RM || ambientOn || document.hidden || document.body.dataset.screen !== 'menu' || !activeRenderProfile().idleAnimations) return;
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
  ambientOn = true;
  const gen = ++ambientGen;
  FrameGate.reset('ambient');
  function frame(now) {
    /* the gen check drops stale callbacks that were already queued in rAF when
       a stop/restart pair (e.g. theme switch on the menu) raced past the
       clearTimeout — otherwise a second dust loop joins the new session */
    if (!ambientOn || gen !== ambientGen) return;
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
    ambientRaf = FrameGate.request('ambient', frame, 30);   /* dust reads fine at 30 FPS */
  }
  ambientRaf = FrameGate.request('ambient', frame, 30);
}

function stopAmbient() {
  ambientOn = false;
  ambientGen++;
  if (ambientRaf) {
    clearTimeout(ambientRaf);
    ambientRaf = 0;
  }
  FrameGate.reset('ambient');
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
  if (name === 'menu' && !RM && !document.hidden) { startAmbient(); MenuLife.start(); }
  else { stopAmbient(); MenuLife.stop(); }
  /* push one history entry on entering gameplay so the device/browser Back
     button returns to the menu instead of leaving the page (window.history is
     the browser API; the game's undo stack is the separate `undoHistory`) */
  if (name === 'game' && (!window.history.state || window.history.state.screen !== 'game')) {
    window.history.pushState({ screen: 'game' }, '');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopAmbient(); MenuLife.stop(); }
  else if (document.body.dataset.screen === 'menu') { startAmbient(); MenuLife.start(); }
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
  $('#chip-stars').textContent = '★ ' + totalStars();
  $('#chip-streak').textContent = '🔥 ' + (save.daily.streak || 0) + ' day streak';
  const doneToday = save.daily.lastWin === todayStr();
  $('#card-daily').classList.toggle('done', doneToday);
  $('#daily-sub').textContent = doneToday ? '✓ Done · back tomorrow' : 'Play today’s puzzle';
  $('#rush-sub').textContent = save.rushBest > 0 ? 'Best · stage ' + save.rushBest : 'Race the clock';
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
    if (p) starsHTML = [1, 2, 3].map(k => '<span class="' + (k <= p.stars ? '' : 'off') + '">★</span>').join('');
    t.innerHTML = '<div class="num">' + l + '</div>' +
      (open ? '<div class="stars">' + starsHTML + '</div>' : '<div class="lock">🔒</div>');
    if (open) t.addEventListener('click', () => { AudioFX.select(); loadLevel(l); });
    else t.addEventListener('click', () => { AudioFX.invalid(); });
    t.setAttribute('aria-label', 'Level ' + l + (open ? '' : ' locked'));
    grid.appendChild(t);
  }
  $('#btn-sound-menu').textContent = save.sound ? '🔊 Sound on' : '🔇 Sound off';
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
  flushAll();
  stopRushTimer();
  AudioFX.stopAllPours();
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
    /* liquid spans the interior bottom up to the capacity line (physics module) */
    const geo = PourPhysics.SHAPE_GEO[k];
    SHAPES[k].B = geo.bottom; SHAPES[k].T = geo.cap;
    SHAPES[k].unit = (SHAPES[k].B - SHAPES[k].T) / 4;
    SHAPES[k].volToY = frac => PourPhysics.uprightLevel(k, frac * 4);
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
    save.sound = !save.sound; persist(); AudioFX.syncMute(); renderMenu(); AudioFX.select();
  });
  $('#btn-back').addEventListener('click', () => { AudioFX.swap(); exitToMenu(); });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-restart').addEventListener('click', () => { if (!autoPlaying) { AudioFX.swap(); flushAll(); restartCurrent(); } });
  $('#btn-sound').addEventListener('click', () => {
    save.sound = !save.sound; persist(); AudioFX.syncMute();
    $('#btn-sound').textContent = save.sound ? '🔊' : '🔇';
    AudioFX.select();
  });
  $('#btn-sound').textContent = save.sound ? '🔊' : '🔇';

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
  $('#sw-sound').addEventListener('click', () => { save.sound = !save.sound; persist(); AudioFX.syncMute(); renderSettings(); AudioFX.select(); });
  $('#sw-haptics').addEventListener('click', () => { save.haptics = !save.haptics; persist(); renderSettings(); buzz(15); });
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
  $('#background-quality').addEventListener('change', e => {
    save.backgroundQuality = e.target.value === 'basic' ? 'basic' : 'hifi';
    save.backgroundQualityUserSet = true;
    try { localStorage.setItem('vessel_background', save.backgroundQuality); } catch (err) {}
    persist();
    applyBackgroundQuality();
    renderSettings();
    AudioFX.select();
  });
  $('#sw-dark').addEventListener('click', () => { toggleMode(); renderSettings(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Erase all progress, stars and achievements?')) return;
    save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    persist();
    AudioFX.syncMute();
    applyRenderQuality();
    applyTheme();
    renderSettings();
    renderMenu();
    AudioFX.undo();
  });

  let rT;
  const relayout = () => { clearTimeout(rT); rT = setTimeout(() => { if (pendingCount() === 0) renderer.syncLayout(); else pendingLayout = true; }, 120); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  $('#game').addEventListener('keydown', handleGameKey);
  /* every gesture may (re)unlock audio — iOS suspends the context after interruptions */
  document.addEventListener('pointerdown', () => AudioFX.ensure(), true);
  document.addEventListener('keydown', () => AudioFX.ensure(), true);
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
  get activePours() { return pendingCount(); },
  get queued() { return queue.length; },
  get slots() { return slots; },
  get hiddenDepth() { return hiddenDepth; },
  get shapes() { return shapesByBottle; },
  get veiled() { return veiled; },
  get frozen() { return frozen; },
  get orbFrac() { return orbFrac; },
  get corks() { return corks; },
  get jobs() { return jobs; }
};

window.__vesselRenderer = renderer;

/* tiny QA surface — one low-power profile, mobile-first (no profiler) */
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
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.opacity !== '0' && cs.backgroundImage !== 'none';
  },
  get activeRenderer() { return renderer.active; },
  get rendererBackend() { return renderer.active; },
  get fluidEnabled() { return !!save.fluid; },
  get fluidRuntimeEnabled() { return !!(Fluid.enabled && Fluid.runtimeEnabled); },
  get fluidRuntimeReason() { return fluidRuntimeReason; },
  get backgroundQuality() { return backgroundQualityEffective; },
  get activeBackgroundAsset() { return activeBackgroundAsset ? activeBackgroundAsset.webp960 : null; },
  get backgroundAsset() { return activeBackgroundAsset ? {
    key: activeBackgroundAsset.key,
    png: activeBackgroundAsset.png,
    avif960: activeBackgroundAsset.avif960,
    avif1365: activeBackgroundAsset.avif1365,
    webp960: activeBackgroundAsset.webp960,
    webp1365: activeBackgroundAsset.webp1365
  } : null; },
  get ambientEnabled() { return document.body.dataset.screen === 'menu' && !RM && !document.hidden && ambientOn; },
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
