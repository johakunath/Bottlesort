import { setCompletion } from './completion-effect.js';
import { boardLayout } from './board-layout.js';
import { createSvgRenderer } from './svg-renderer.js';
import { createCanvasRenderer } from './canvas-renderer.js';
import { SESSION_KEY, readSession, parseChallenge, isOutdatedChallenge, challengeURL } from './session.js';
import { WorkerClient } from './worker-client.js';
import { storage, SAVE_KEY, createDefaultSave, normalizeSave, preferredRenderer } from './storage.js';
import { APO_COLORS, NEON_COLORS, TIDE_COLORS, COLOR_NAMES, SHAPES, towerShapeName, isTowerShape } from './bottle-design.js';
import { createAudio } from './audio.js';
import { VesselLogic as Logic } from './game-logic.js';
/* ============================================================
   Vessel — game runtime v2
   Shapes, gravity-true liquid, mystery bottles, ambient magic.
   Coordinates board lifecycle and motion; pure logic and renderers are imported modules.
   ============================================================ */
'use strict';
import { PourPhysics } from './pour-physics.js';
import { startablePours } from './pour-queue.js';
(function () {

let COLORS = APO_COLORS;
let HIDDEN_FILL = ['#cbb186', '#8a6a3e'];

/* live theme-visual state, updated by applyTheme() */
let SKIN = 'apothecary', MODE = 'light';
let RIM_COLOR = 'rgba(255,255,255,0.95)';
let GLASS_SHADOW = '#3a2410';
/* completion lid colours: [left, mid, right, top face]; wood on Apothecary,
   the skin accent elsewhere (what the old DOM .cap used) */
let LID = ['#c79a5e', '#a9763f', '#7c5026', '#caa06a'];

const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- storage ---------------- */
let save = normalizeSave(storage.read(SAVE_KEY));
function persist() { storage.write(SAVE_KEY, save); }

/* ---------------- audio ----------------
   Aliquot-style graph: every voice → master gain → compressor → out, with a
   short filtered delay send for bells. One shared noise buffer, made once. */
const AudioFX = createAudio(() => save);
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
    fallback: '/assets/optimized/apothecary-sunlit-cabinet-1365.webp',
    avif960: '/assets/optimized/apothecary-sunlit-cabinet-960.avif',
    avif1365: '/assets/optimized/apothecary-sunlit-cabinet-1365.avif',
    webp960: '/assets/optimized/apothecary-sunlit-cabinet-960.webp',
    webp1365: '/assets/optimized/apothecary-sunlit-cabinet-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 246, 218, 0.16), transparent 74%)'
  },
  apothecaryDark: {
    cssVar: '--apo-hifi-bg',
    fallback: '/assets/optimized/apothecary-moonlit-alchemy-1365.webp',
    avif960: '/assets/optimized/apothecary-moonlit-alchemy-960.avif',
    avif1365: '/assets/optimized/apothecary-moonlit-alchemy-1365.avif',
    webp960: '/assets/optimized/apothecary-moonlit-alchemy-960.webp',
    webp1365: '/assets/optimized/apothecary-moonlit-alchemy-1365.webp',
    overlay: 'radial-gradient(76% 62% at 50% 40%, rgba(255, 184, 104, 0.10), transparent 72%)'
  },
  neon: {
    cssVar: '--neon-hifi-bg',
    fallback: '/assets/optimized/neon-vaporwave-skyline-1365.webp',
    avif960: '/assets/optimized/neon-vaporwave-skyline-960.avif',
    avif1365: '/assets/optimized/neon-vaporwave-skyline-1365.avif',
    webp960: '/assets/optimized/neon-vaporwave-skyline-960.webp',
    webp1365: '/assets/optimized/neon-vaporwave-skyline-1365.webp',
    overlay: 'radial-gradient(74% 62% at 50% 44%, rgba(30, 18, 52, 0.12), transparent 70%)'
  },
  tidepool: {
    cssVar: '--tide-hifi-bg',
    fallback: '/assets/optimized/tidepool-hifi-backdrop-1365.webp',
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
    'url("' + asset.fallback + '") type("image/webp") 2x)';
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
  setCompletion(slot, true, !RM, {
    color: COLORS[state[i][0]], mouth: slot.sh.mouthFrac, surface: slot.sh.T / slot.sh.vbH
  });
  AudioFX.cap(c.note); buzz([15, 40, 25]);
  Fluid.drop(i, -1.6); Fluid.start();
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
  setCompletion(slots[i], true);
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
let currentGen = null;
let challengeConfig = null;
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
  const rng = Logic.mulberry32(((stateHash >>> 0) ^ (gen.par * 1234567)) >>> 0);
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
const SvgRenderer = createSvgRenderer({
  get $() { return $; },
  get COLORS() { return COLORS; },
  get ELEMENT_MAP() { return ELEMENT_MAP; },
  get Fluid() { return Fluid; },
  get HIDDEN_FILL() { return HIDDEN_FILL; },
  get NS() { return NS; },
  get RM() { return RM; },
  get SKIN() { return SKIN; },
  get activeRenderProfile() { return activeRenderProfile; },
  get appendElemOverlay() { return appendElemOverlay; },
  get explicitPrettyEffects() { return explicitPrettyEffects; },
  get hiddenDepth() { return hiddenDepth; },
  get locked() { return locked; },
  get prettyTidepoolEffects() { return prettyTidepoolEffects; },
  get save() { return save; },
  get shapeWidthAt() { return shapeWidthAt; },
  get shapesByBottle() { return shapesByBottle; },
  get slots() { return slots; },
  get svgEl() { return svgEl; },
  get visual() { return visual; }
});

const CanvasRenderer = createCanvasRenderer({
  get $() { return $; },
  get COLORS() { return COLORS; },
  get ELEMENT_MAP() { return ELEMENT_MAP; },
  get Fluid() { return Fluid; },
  get FrameGate() { return FrameGate; },
  get GLASS_SHADOW() { return GLASS_SHADOW; },
  get HIDDEN_FILL() { return HIDDEN_FILL; },
  get LID() { return LID; },
  get MODE() { return MODE; },
  get Motion() { return Motion; },
  get PerfMeter() { return PerfMeter; },
  get PourPhysics() { return PourPhysics; },
  get RIM_COLOR() { return RIM_COLOR; },
  get RM() { return RM; },
  get SHAPES() { return SHAPES; },
  get SKIN() { return SKIN; },
  get activeRenderProfile() { return activeRenderProfile; },
  get bodies() { return bodies; },
  get boltPath() { return boltPath; },
  get bottleAnimating() { return bottleAnimating; },
  get corkBodyW() { return corkBodyW; },
  get corkPose() { return corkPose; },
  get corks() { return corks; },
  get flowN() { return flowN; },
  get flyingSource() { return flyingSource; },
  get frozen() { return frozen; },
  get hiddenDepth() { return hiddenDepth; },
  get jobsInto() { return jobsInto; },
  get layoutBox() { return layoutBox; },
  get locked() { return locked; },
  get mixHex() { return mixHex; },
  get poses() { return poses; },
  get prettyTidepoolEffects() { return prettyTidepoolEffects; },
  get save() { return save; },
  get shapesByBottle() { return shapesByBottle; },
  get slots() { return slots; },
  get snowflakePath() { return snowflakePath; },
  get state() { return state; },
  get veiled() { return veiled; },
  get visual() { return visual; }
});

function preferredRendererMode() { return preferredRenderer(location.search, window.__vesselRendererMode); }

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
    const capped = Logic.isBottleComplete(b) && !locked.has(i);
    if (capped && hiddenDepth[i]) { hiddenDepth[i] = 0; renderer.renderBottle(i, 0); }
    if (capped && !corks[i]) seatCorkNow(i);
    else if (!capped && corks[i]) { corks[i] = null; paintCorkSvg(i); }
    setCompletion(slots[i], capped);
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
    if (Logic.isBottleComplete(e.dstAfter)) { hd[e.di] = 0; fr = []; }
  }
  return {
    state: Logic.cloneState(state),
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

  slotEl.classList.toggle('capped', Logic.isBottleComplete(state[i]));
  setCompletion(slots[i], Logic.isBottleComplete(state[i]));
}

function restoreBoardSnapshot(snap) {
  state = Logic.withCapacities(snap.state, currentGen.capacities);
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
  if (!state.length) return;
  const layout = boardLayout(shapesByBottle, stage.clientWidth, stage.clientHeight);
  document.documentElement.style.setProperty('--bw', layout.bottleWidth + 'px');
  stage.style.setProperty('--tower-width', layout.towerWidth + 'px');
  stage.style.setProperty('--tower-height', layout.towerHeight + 'px');
  stage.style.setProperty('--tower-gap', layout.towerGap + 'px');
  stage.classList.toggle('with-towers', layout.towers.length > 0);
  const key = JSON.stringify([layout.grid, layout.towers]);
  if (stage.dataset.layout !== key) {
    stage.querySelectorAll('.board').forEach(r => r.remove());
    // [tower][rows][tower] as one flex row: CSS keeps the towers beside the
    // grid with their bottoms on the lowest shelf line, at any viewport size.
    const board = document.createElement('div'); board.className = 'board';
    const rows = document.createElement('div'); rows.className = 'board-rows';
    layout.grid.forEach(indices => {
      const row = document.createElement('div'); row.className = 'row';
      indices.forEach(i => row.appendChild(slots[i].slot));
      rows.appendChild(row);
    });
    const rail = (i, side) => {
      const el = document.createElement('div');
      el.className = 'tower-rail ' + side; el.appendChild(slots[i].slot); return el;
    };
    if (layout.towers[0] !== undefined) board.appendChild(rail(layout.towers[0], 'left'));
    board.appendChild(rows);
    if (layout.towers[1] !== undefined) board.appendChild(rail(layout.towers[1], 'right'));
    stage.insertBefore(board, $('#fx'));
    stage.dataset.layout = key;
    stage.dataset.rows = layout.grid.length; stage.dataset.n = String(state.length);
  }
}

/* Session snapshots contain committed state, including queued pours' reveals. */
function saveSession() {
  if (!currentGen || !state.length || Logic.isSolved(state) || (mode === 'rush' && rushTimeLeft <= 0)) return;
  storage.write(SESSION_KEY, {
    version: 2, gen: currentGen, mode, level, difficulty, dailyDate, challenge: challengeConfig,
    snapshot: snapshotBoard(), history: undoHistory, undosLeft: undosLeft === Infinity ? -1 : undosLeft,
    undosUsed, usedHint, usedAuto, rushStage, rushTimeLeft
  });
}
function resumeSession() {
  const session = readSession(storage);
  if (!session) { renderMenu(); return; }
  cancelGeneration(); stopRushTimer();
  mode = session.mode; level = session.level; difficulty = session.difficulty;
  dailyDate = session.dailyDate || ''; challengeConfig = session.challenge;
  rushStage = session.rushStage; rushTimeLeft = session.rushTimeLeft;
  setupBoard(session.gen);
  undoHistory = session.history; undosLeft = session.undosLeft === -1 ? Infinity : session.undosLeft;
  undosUsed = session.undosUsed; usedHint = session.usedHint; usedAuto = session.usedAuto;
  restoreBoardSnapshot(session.snapshot);
  if (mode === 'rush') startRushTimer(session.rushTimeLeft);
  saveSession(); updateHUD();
}
function loadChallenge(config) {
  return generateBoard(config, gen => {
    mode = 'challenge'; challengeConfig = config; level = 1; stopRushTimer(); setupBoard(gen);
  });
}
function openSharedChallenge() {
  const config = parseChallenge(location.hash);
  if (!config) {
    if (isOutdatedChallenge(location.hash)) {
      window.history.replaceState(window.history.state, '', location.pathname + location.search);
      $('#loading-status').textContent = 'This puzzle link was made for older rules. Ask for a new link.';
    }
    return;
  }
  // Consume the import link so a reload offers Resume instead of overwriting it.
  window.history.replaceState(window.history.state, '', location.pathname + location.search);
  if (config.level) { difficulty = config.difficulty; loadLevel(config.level); }
  else loadChallenge(config);
}
function sharePuzzle() {
  if (!currentGen) return;
  const config = mode === 'classic' ? { level, difficulty }
    : mode === 'daily' ? Logic.dailyConfig(dailyDate)
    : mode === 'rush' ? Logic.rushConfig(rushStage) : challengeConfig;
  const url = challengeURL(location.href, config);
  $('#share-copy').textContent = 'Copy link and result';
  $('#share-link').value = url;
  $('#share-result').textContent = Logic.isSolved(state) ? 'Vessel · ' + moves + ' moves · ' + starsFor(moves) + ' stars' : 'Can you sort this puzzle?';
  openModal($('#share-modal'), $('#share-link'));
}

/* ---------------- level lifecycle ---------------- */
function assignShapes(n) {
  const rng = Logic.mulberry32(Logic.diffSeed(level, difficulty) + 777);
  return Array.from({length:n}, (_, i) => {
    if (Logic.capacityOf(state[i]) > Logic.CAP) return towerShapeName(Logic.capacityOf(state[i]));
    if (save.bottleCollection !== 'mixed') return save.bottleCollection;
    return rng() < 0.22 ? 'flask' : 'round';
  });
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
  const parts = ['Bottle ' + (i + 1), state[i].length + ' of ' + Logic.capacityOf(state[i]) + ' segments'];
  if (frozen.has(i)) parts.push('frozen');
  if (veiled[i]) parts.push('sealed');
  if (!state[i] || state[i].length === 0) parts.push('empty');
  else {
    parts.push(layerWord(visibleLayerCount(i)));
    if (hiddenDepth[i] >= state[i].length) parts.push('contents hidden');
    else parts.push('visible bottom to top: ' + state[i].slice(hiddenDepth[i] || 0).map(c => COLOR_NAMES[c] + (save.symbols ? ' ' + (c + 1) : '')).join(', '));
  }
  if (Logic.isBottleComplete(state[i])) parts.push('complete');
  if (sel === i) parts.push('selected');
  return parts.join(', ');
}
function updateBottleLabels() {
  slots.forEach((slot, i) => {
    slot.btn.setAttribute('aria-label', bottleAriaLabel(i));
    const count = slot.el.querySelector('.capacity-label');
    if (count) count.textContent = state[i].length + ' / ' + Logic.capacityOf(state[i]);
  });
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
  boardRevision++; cancelSolution();
  /* boards can come from a cache — never mutate the generated original */
  currentGen = structuredClone(gen);
  state = Logic.withCapacities(gen.state, gen.capacities);
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
  buildElementMap(gen);

  const stage = $('#stage');
  stage.querySelectorAll('.board').forEach(r => r.remove());
  delete stage.dataset.layout;
  stage.dataset.n = ''; stage.dataset.rows = '';
  $('#fx').innerHTML = '';
  slots = state.map((b, i) => {
    const shapeName = shapesByBottle[i];
    const sh = SHAPES[shapeName];
    const slot = document.createElement('div');
    slot.className = 'slot s-' + shapeName + (shapeName === 'tall' ? ' tall' : '') + (isTowerShape(shapeName) && shapeName !== 'tower' ? ' s-tower' : '');
    slot.classList.toggle('canvas-dom-proxy', isCanvasMode());
    slot.style.setProperty('--d', (i * 45) + 'ms');
    slot.style.setProperty('--s', PourPhysics.volumeScale(shapeName).toFixed(4));
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
    if (isTowerShape(shapeName)) {
      const count = document.createElement('span'); count.className = 'capacity-label'; count.setAttribute('aria-hidden', 'true'); slot.appendChild(count);
      const ticks = svgEl('path', { fill: 'none', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 2, d: Array.from({length:sh.capacity-1},(_,u) => 'M73,' + sh.volToY((u+1)/sh.capacity) + ' h8').join(' ') });
      svg.appendChild(ticks);
    }
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
  saveSession();
}


function loadLevel(lvl) {
  cancelGeneration();
  mode = 'classic';
  stopRushTimer();
  level = lvl;
  setupBoard(Logic.generateLevel(lvl, difficulty));
  if (!save.seenHint && lvl === 1) { $('#hint').textContent = 'Tap a bottle, then tap where to pour'; $('#hint').style.opacity = 1; }
}

/* ---------------- daily challenge ---------------- */
function todayStr(offsetDays) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const generatorClient = new WorkerClient();
let generationId = 0;
let generationPending = false;
let dailyDate = '';
function cancelGeneration() {
  generationId++; generatorClient.cancel(); generationPending = false;
  document.body.classList.remove('generating');
}
async function generateBoard(config, prepare) {
  cancelGeneration();
  const id = generationId;
  generationPending = true;
  document.body.classList.add('generating');
  $('#loading-status').textContent = 'Mixing your puzzle…';
  try {
    const gen = await generatorClient.run('generate', config, 15000);
    if (id !== generationId) return;
    if (!gen) throw new Error('Could not mix this puzzle. Please try another.');
    $('#loading-status').textContent = '';
    prepare(gen);
  } catch (error) {
    if (error.name !== 'AbortError' && id === generationId) {
      $('#loading-status').textContent = error.message;
      toastMsg(error.message, 3500);
    }
  } finally {
    if (id === generationId) { generationPending = false; document.body.classList.remove('generating'); }
  }
}
function loadDaily() {
  stopRushTimer();
  const date = todayStr();
  return generateBoard(Logic.dailyConfig(date), gen => {
    mode = 'daily'; dailyDate = date; level = 1; setupBoard(gen);
  });
}

/* ---------------- rush mode ---------------- */
function startRush() { rushStage = 1; return loadRushStage(); }
function loadRushStage() {
  stopRushTimer();
  return generateBoard(Logic.rushConfig(rushStage), gen => {
    mode = 'rush'; level = rushStage; setupBoard(gen);
    startRushTimer(Logic.rushTimeFor(gen.par));
  });
}

function startRushTimer(sec) {
  rushTimeLeft = sec;
  saveSession();
  clearInterval(rushTicker);
  rushGrace = null;
  rushTicker = setInterval(() => {
    if (document.hidden) return;
    /* last-second grace: the clock waits only for pours committed before it
       reached the final second — pours queued after that do not stop it */
    if (rushTimeLeft <= 1 && rushGrace && rushGrace.some(e => !e.finished)) return;
    rushTimeLeft--;
    saveSession();
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
  storage.remove(SESSION_KEY);
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
  orbFrac = Logic.completionProgress(state);
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
  if (mode === 'challenge') {
    lvlEl.textContent = 'Shared Challenge';
    subEl.textContent = 'Moves ' + moves + ' · Par ' + par;
  } else if (mode === 'daily') {
    lvlEl.textContent = 'Daily Challenge';
    subEl.textContent = dailyDate.slice(5).replace('-', '/') + ' · Moves ' + moves;
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
function canBeSource(i) { return state[i].length > 0; }

function unveil(i) {
  boardRevision++; cancelSolution();
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
  saveSession();
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
  if (autoPlaying || generationPending) return;
  if (frozen.has(i)) { shake(i); AudioFX.ice(); buzz([8, 20, 8]); return; }
  if (veiled[i]) { unveil(i); return; }
  if (sel === null) {
    if (canBeSource(i)) { setSelected(i); AudioFX.select(); buzz(8); }
    else { shake(i); AudioFX.invalid(); }
    return;
  }
  if (sel === i) { setSelected(null); AudioFX.swap(); return; }
  if (Logic.canPour(state, sel, i)) {
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
function worldPt(h, k, tx, ty, a, u, v, scale = 1) {
  const cx = h.w / 2, cy = h.h / 2, lx = (u * k - cx) * scale, ly = (v * k - cy) * scale, c = Math.cos(a), s = Math.sin(a);
  return { x: h.x + tx + cx + lx * c - ly * s, y: h.y + ty + cy + lx * s + ly * c };
}
function setPose(i, tx, ty, a, scale = 1) {
  poses[i] = { tx, ty, a, scale };
  /* canvas reads poses[] directly; only the SVG fallback moves the DOM
     (keeps the invisible hit targets home and skips per-frame style work) */
  if (!isCanvasMode()) slots[i].btn.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) rotate(' + (a * 180 / Math.PI).toFixed(3) + 'deg) scale(' + scale.toFixed(5) + ')';
}
function clearPose(i) {
  poses[i] = null;
  if (!slots[i]) return;
  slots[i].btn.style.transform = '';
  slots[i].btn.style.transition = '';
  slots[i].el.classList.remove('pouring');
}
/* pose that puts the source's lip corner at (lipX, lipY) with angle a */
function poseSourceLip(job, lipX, lipY, a, scale = 1) {
  const h = job.hs, k = job.baseKS, cx = h.w / 2, cy = h.h / 2;
  const lx = (job.lipU * k - cx) * scale, ly = (job.lipV * k - cy) * scale, c = Math.cos(a), s = Math.sin(a);
  const tx = lipX - (h.x + cx + lx * c - ly * s), ty = lipY - (h.y + cy + lx * s + ly * c);
  setPose(job.si, tx, ty, a, scale);
  job.pose = { tx, ty, a, scale };
}

function createJob(si, di, n, color, srcBefore, dstBefore, srcAfter, dstAfter, lifted) {
  const stage = $('#stage'), sr = stage.getBoundingClientRect();
  const home = i => layoutBox(slots[i].slot, stage);
  const hs = home(si), hd = home(di);
  const snS = shapesByBottle[si], snD = shapesByBottle[di];
  const gS = pourGeo(snS), gD = pourGeo(snD);
  // Screen-height bottles briefly scale down for transfer so their tilted
  // bodies remain visible on a narrow phone, then return to full height.
  const pourScale = isTowerShape(snS) ? Math.min(1, sr.width * 0.46 / hs.h, sr.height * 0.5 / hs.h) : 1;
  const baseKS = hs.w / 100, kS = baseKS * pourScale, kD = hd.w / 100;
  const job = {
    si, di, n, color, snS, snD, gS, gD, hs, hd, kS, kD, baseKS, pourScale,
    w: gS.bodyW * kS, wD: gD.bodyW * kD, stageW: sr.width, stageTop: sr.top,
    V0: srcBefore.length, dstUnits0: dstBefore.length,
    snapS: mergeRuns(srcBefore), snapD: mergeRuns(dstBefore),
    afterS: mergeRuns(srcAfter), afterD: mergeRuns(dstAfter),
    dstComplete: Logic.isBottleComplete(dstAfter),
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
  job.lip0 = { x: hs.x + job.lipU * baseKS, y: hs.y + job.lipV * baseKS + (lifted ? -0.22 * hs.w : 0) };
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
    let lipX = 0, lipY = 0, ang = 0, scale = job.pourScale;
    if (t < job.T1) {
      const u = t / job.T1, e = ease3(u);
      scale = lerpN(1, job.pourScale, smoothstep(Math.min(1, u * 3)));
      const turn = job.pourScale < 1 ? Math.max(0, (u - 0.25) / 0.75) : u;
      ang = s * job.thStart * easeSine(turn);
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
        const turn = job.pourScale < 1 ? Math.min(1, u / 0.55) : u;
        ang = job.angEnd * (1 - easeSine(turn));
        scale = lerpN(job.pourScale, 1, ease3(Math.max(0, (u - 0.55) / 0.45)));
        const lift = sel === si ? -0.22 * job.hs.w : 0;
        const hx = job.hs.x + job.lipU * job.baseKS, hy = job.hs.y + job.lipV * job.baseKS + lift;
        lipX = lerpN(job.lipEnd.x, hx, e);
        lipY = lerpN(job.lipEnd.y, hy, e) - Math.sin(Math.PI * e) * w * 0.25;
      }
    }
    if (!job.srcDone) {
      poseSourceLip(job, lipX, lipY, ang, scale);
      /* the stream leaves from the outer rim; it freezes once the source
         stops pouring so the tail falls straight */
      if (t >= job.T1 && !job.retStarted) {
        job.streamOrigin = worldPt(job.hs, job.baseKS, job.pose.tx, job.pose.ty, ang, 50 + s * job.gS.rimHalf, job.gS.rimBot, scale);
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
      if (job.voice) AudioFX.updatePour(job.voice, fl, (job.dstUnits0 + job.n * E) / Logic.capacityOf(state[di]), dt);
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
let boardRevision = 0;
let boardGen = 0;          /* bumps on every board setup; stale timers check it */
function pendingCount() { return jobs.length + queue.length; }
function refreshBusy() {
  locked.clear();
  for (const j of jobs) { locked.add(j.si); locked.add(j.di); }
  for (const q of queue) { locked.add(q.si); locked.add(q.di); }
  slots.forEach((sl, i) => { if (sl) sl.el.classList.toggle('busy', locked.has(i)); });
}

function commitMove(si, di, lifted) {
  boardRevision++; cancelSolution();
  undoHistory.push(snapshotBoard());
  if (undoHistory.length > 300) undoHistory.shift();
  const n = Logic.pourAmount(state, si, di);
  const color = state[si][state[si].length - 1];
  const srcBefore = Logic.cloneBottle(state[si]), dstBefore = Logic.cloneBottle(state[di]);
  corks[si] = null; paintCorkSvg(si); setCompletion(slots[si], false);
  slots[si].el.classList.remove('capped');
  Logic.applyPour(state, si, di);
  moves++;
  if (!save.seenHint) { save.seenHint = true; persist(); $('#hint').style.opacity = 0; }
  const entry = {
    si, di, n, color, srcBefore, dstBefore, srcAfter: Logic.cloneBottle(state[si]), dstAfter: Logic.cloneBottle(state[di]),
    lifted: !!lifted, at: performance.now()
  };
  entry.done = new Promise(r => { entry.resolve = () => { entry.finished = true; r(); }; });
  queue.push(entry);
  saveSession();
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
  corks[q.si] = null; paintCorkSvg(q.si); setCompletion(slots[q.si], false);
  slots[q.si].el.classList.remove('capped');
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
  if (Logic.isSolved(state)) {
    const gen = boardGen;
    wait(RM ? 100 : 350).then(() => {
      if (gen !== boardGen || pendingCount() || !Logic.isSolved(state) || $('#overlay').classList.contains('show')) return;
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
    if (Logic.isBottleComplete(q.dstAfter)) {
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
    if (frozen.has(i) || !state[i].length) continue;
    for (let j = 0; j < state.length; j++) {
      if (i === j || frozen.has(j)) continue;
      if (Logic.canPour(state, i, j)) return true;
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
  boardRevision++; cancelSolution();
  flushAll();
  const snap = undoHistory.pop();
  undosUsed++;
  if (undosAllowed !== Infinity) undosLeft--;
  setSelected(null);
  AudioFX.stopAllPours();
  restoreBoardSnapshot(snap);
  saveSession();
  AudioFX.undo();
  updateBottleLabels();
}

/* ---------------- AI assistant (hints & autoplay) ----------------
   The same solver that verifies every level also plays it: hints show
   the first move of a fresh optimal-ish solution from the current
   position; autoplay performs the whole line with real pours. */
const solverClient = new WorkerClient();
let solverRequestId = 0;
let solutionPending = false;
function cancelSolution() {
  solverRequestId++;
  solverClient.cancel();
  solutionPending = false;
}
async function requestSolution({ state: requestedState, frozen: requestedFrozen, budget }) {
  cancelSolution();
  const id = solverRequestId;
  solutionPending = true;
  updateHUD();
  try {
    const result = await solverClient.run('solve', { state: Logic.cloneState(requestedState), capacities: requestedState.map(Logic.capacityOf), frozen: [...(requestedFrozen || [])], budget: budget || 250000 }, 4500);
    if (id !== solverRequestId) throw new DOMException('Cancelled', 'AbortError');
    return result;
  } finally {
    if (id === solverRequestId) { solutionPending = false; updateHUD(); }
  }
}

function clearHintGlow() {
  document.querySelectorAll('.hint-src, .hint-dst').forEach(el => el.classList.remove('hint-src', 'hint-dst'));
}

let hintGlowT = null;
async function showHint() {
  if (autoPlaying || solutionPending || !state.length) return;
  flushAll();
  if (Logic.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Hints are paused in Rush for timer fairness ⚡', 2200); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinking…', 1200);
  let res;
  const revision = boardRevision;
  try {
    res = await requestSolution({ state, frozen, budget: 250000 });
  } catch (err) {
    if (err.name === 'AbortError' || revision !== boardRevision) return;
    toastMsg((err && err.message === 'timeout') ? 'Still thinking — try a smaller board or undo ↩' : 'Could not find a hint yet — try again or undo ↩', 3000);
    AudioFX.invalid();
    return;
  }
  if (revision !== boardRevision) return;
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
  saveSession();
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
  if (Logic.isSolved(state)) return;
  if (mode === 'rush') { toastMsg('Auto-solve is paused in Rush for timer fairness ⚡', 2400); AudioFX.invalid(); return; }
  AudioFX.ensure();
  toastMsg('Thinking…', 1200);
  let res;
  const revision = boardRevision;
  try {
    res = await requestSolution({ state, frozen, budget: 350000 });
  } catch (err) {
    if (err.name === 'AbortError' || revision !== boardRevision) return;
    toastMsg((err && err.message === 'timeout') ? 'Timed out searching — control is back' : 'Could not find a hint yet — try again or undo ↩', 3200);
    AudioFX.invalid();
    return;
  }
  if (revision !== boardRevision) return;
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
    modes: false, kicker: 'Arcade', tag: 'Find your flow.',
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
  setSwitch('#sw-symbols', save.symbols);
  $('#bottle-collection').value = save.bottleCollection;
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
  storage.remove(SESSION_KEY);
  if (mode === 'rush') return onRushStageClear();
  const st = usedAuto ? 1 : starsFor(moves);
  let meta = moves + ' moves · par ' + par;

  if (mode === 'daily') {
    const today = dailyDate;
    if (today === todayStr() && save.daily.lastWin !== today) {
      save.daily.streak = save.daily.lastWin === todayStr(-1) ? save.daily.streak + 1 : 1;
      save.daily.lastWin = today;
    }
    persist();
    unlockAch('daily');
    if (save.daily.streak >= 3) unlockAch('streak3');
    $('#win-title').textContent = 'Daily complete!';
    meta += ' · 🔥 ' + save.daily.streak + '-day streak';
    $('#btn-next').classList.add('hidden');
  } else if (mode === 'challenge') {
    $('#win-title').textContent = 'Challenge complete!';
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
    $('#btn-next').classList.toggle('hidden', level >= Logic.MAX_LEVEL);
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
  let u = Math.min(10, Logic.MAX_LEVEL);
  while (u < Logic.MAX_LEVEL && save.progress[difficulty][u]) u++;
  return u;
}

function renderMenu() {
  $('#btn-resume').classList.toggle('hidden', !readSession(storage));
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
  for (let l = 1; l <= Logic.MAX_LEVEL; l++) {
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
    ['round', [{ c: 0, u: 1 }, { c: 2, u: 1 }, { c: 5, u: 1 }, { c: 2, u: 1 }]],
    ['flask', [{ c: 6, u: 2 }, { c: 7, u: 2 }]],
    ['tall', [{ c: 1, u: 1 }, { c: 2, u: 2 }, { c: 5, u: 1 }]]
  ];
  demos.forEach(([shapeName, segs]) => {
    shapeName = save.bottleCollection === 'mixed' ? shapeName : save.bottleCollection;
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
  saveSession();
  cancelGeneration();
  boardRevision++; cancelSolution();
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
  if (mode === 'challenge') loadChallenge(challengeConfig);
  else if (mode === 'daily') loadDaily();
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
    SHAPES[k].capacity = geo.capacity || Logic.CAP;
    SHAPES[k].unit = (SHAPES[k].B - SHAPES[k].T) / SHAPES[k].capacity;
    SHAPES[k].volToY = frac => PourPhysics.uprightLevel(k, frac * SHAPES[k].capacity);
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
  $('#btn-next').addEventListener('click', () => { $('#overlay').classList.remove('show'); if (level < Logic.MAX_LEVEL) loadLevel(level + 1); });

  /* modes */
  $('#card-daily').addEventListener('click', () => { AudioFX.select(); loadDaily(); });
  $('#card-rush').addEventListener('click', () => { AudioFX.select(); startRush(); });

  /* AI assistant */
  $('#btn-hint').addEventListener('click', showHint);

  $('#btn-resume').addEventListener('click', resumeSession);
  $('#btn-challenge').addEventListener('click', () => loadChallenge({ seed: crypto.getRandomValues(new Uint32Array(1))[0], colors: 5, sets: 1, empties: 1 }));
  $('#btn-share').addEventListener('click', sharePuzzle);
  $('#btn-share-win').addEventListener('click', sharePuzzle);
  $('#share-close').addEventListener('click', () => closeModal($('#share-modal')));
  $('#share-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#share-result').textContent + '\n' + $('#share-link').value); $('#share-copy').textContent = 'Copied!'; }
    catch { $('#share-link').focus(); $('#share-link').select(); $('#share-copy').textContent = 'Select and copy the link'; }
  });
  $('#bottle-collection').addEventListener('change', e => { save.bottleCollection = e.target.value; persist(); refreshBottles(); });
  $('#sw-symbols').addEventListener('click', () => { save.symbols = !save.symbols; persist(); renderSettings(); });
  window.addEventListener('hashchange', openSharedChallenge);
  window.addEventListener('pagehide', saveSession);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
  if (storage.read('vessel_session_v1') && !storage.get('vessel_tower_upgrade_seen')) {
    $('#loading-status').textContent = 'Towers now hold 12 segments. Start a fresh puzzle; your earned progress is saved.';
    storage.set('vessel_tower_upgrade_seen', '1');
  }
  openSharedChallenge();
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
    storage.set('vessel_background', save.backgroundQuality);
    persist();
    applyBackgroundQuality();
    renderSettings();
    AudioFX.select();
  });
  $('#sw-dark').addEventListener('click', () => { toggleMode(); renderSettings(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Erase all progress, stars and achievements?')) return;
    save = createDefaultSave();
    difficulty = save.difficulty;
    Fluid.enabled = save.fluid;
    storage.remove(SESSION_KEY);
    currentGen = null; state = []; undoHistory = [];
    stopRushTimer(); cancelGeneration(); cancelSolution();
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
    fallback: activeBackgroundAsset.fallback,
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
