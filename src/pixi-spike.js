import './pixi-spike.css';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture
} from 'pixi.js';

const TARGET_FPS = new URLSearchParams(location.search).get('pretty') === '1' ? 60 : 30;
const DPR_CAP = TARGET_FPS === 60 ? 2 : 1.5;
const COLORS = [
  0xff7a85,
  0xffb24d,
  0xffe24d,
  0x7fd96a,
  0x4fd6c4,
  0x6aa8ff
];

const LEVEL = [
  [0, 1, 2, 3],
  [3, 4, 5, 0],
  [1, 5, 4, 2],
  [5, 2, 3, 1],
  [],
  []
];

const metrics = {
  renderer: 'pixi-webgl',
  targetFps: TARGET_FPS,
  averageFps: 0,
  averageFrameTime: 0,
  p95FrameTime: 0,
  sampleCount: 0,
  batteryDrain: 'measure-on-device',
  heatAfter10Minutes: 'measure-on-device'
};

window.__vesselPixiSpike = { metrics };

const app = new Application();
await app.init({
  canvas: document.getElementById('pixi-canvas'),
  resizeTo: window,
  backgroundAlpha: 1,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, DPR_CAP),
  autoDensity: true,
  powerPreference: 'high-performance'
});
app.ticker.maxFPS = TARGET_FPS;

const root = new Container();
const bgLayer = new Container();
const boardLayer = new Container();
const fxLayer = new Container();
app.stage.addChild(root);
root.addChild(bgLayer, boardLayer, fxLayer);

const bg = new Sprite(Texture.WHITE);
bg.tint = 0x2b1a0b;
bgLayer.addChild(bg);

try {
  const texture = await Assets.load('/assets/optimized/apothecary-sunlit-cabinet-1365.webp');
  bg.texture = texture;
  bg.tint = 0xffffff;
} catch (err) {
  bg.tint = 0x6c4b24;
}

const shade = new Graphics();
bgLayer.addChild(shade);

const title = new Text({
  text: 'PixiJS spike · one test board',
  style: {
    fill: 0xf8ead4,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    fontWeight: '700'
  }
});
title.alpha = 0.82;
app.stage.addChild(title);

const bottles = LEVEL.map((layers, index) => ({
  index,
  layers: layers.slice(),
  currentLayers: layers.slice(),
  x: 0,
  y: 0,
  w: 78,
  h: 188,
  tilt: 0,
  lift: 0,
  g: new Container(),
  glass: new Graphics(),
  inner: new Graphics(),
  shine: new Graphics()
}));

bottles.forEach(b => {
  b.g.addChild(b.inner, b.glass, b.shine);
  boardLayer.addChild(b.g);
});

const pour = {
  active: false,
  from: 0,
  to: 4,
  color: COLORS[3],
  t: 0,
  phase: 0
};

function resizeScene() {
  const w = app.screen.width;
  const h = app.screen.height;
  bg.width = w;
  bg.height = h;
  shade.clear()
    .rect(0, 0, w, h)
    .fill({ color: 0x170d05, alpha: 0.1 })
    .rect(0, h * 0.78, w, h * 0.22)
    .fill({ color: 0x2a1607, alpha: 0.18 });
  title.x = 14;
  title.y = 12;

  const minDim = Math.min(w, h);
  const bottleW = Math.max(48, Math.min(82, minDim * 0.14));
  const bottleH = bottleW * 2.42;
  const gap = bottleW * 0.32;
  const totalW = bottles.length * bottleW + (bottles.length - 1) * gap;
  const startX = (w - totalW) / 2 + bottleW / 2;
  const y = h * 0.67;
  bottles.forEach((b, i) => {
    b.w = bottleW;
    b.h = bottleH;
    b.x = startX + i * (bottleW + gap);
    b.y = y;
  });
}

function drawBottle(b) {
  b.g.x = b.x;
  b.g.y = b.y - b.lift;
  b.g.rotation = b.tilt;

  const w = b.w;
  const h = b.h;
  const glass = b.glass.clear();
  const inner = b.inner.clear();
  const shine = b.shine.clear();

  glass.roundRect(-w * 0.34, -h * 0.92, w * 0.68, h * 0.86, w * 0.18)
    .fill({ color: 0xffffff, alpha: 0.10 })
    .stroke({ width: 2.5, color: 0xfff1d4, alpha: 0.82 });
  glass.roundRect(-w * 0.18, -h, w * 0.36, h * 0.22, w * 0.08)
    .fill({ color: 0xffffff, alpha: 0.08 })
    .stroke({ width: 2.5, color: 0xfff1d4, alpha: 0.82 });

  const capacity = 4;
  const bandH = h * 0.17;
  const baseY = -h * 0.11;
  b.currentLayers.forEach((color, idx) => {
    const y = baseY - (idx + 1) * bandH;
    inner.roundRect(-w * 0.28, y, w * 0.56, bandH + 1, w * 0.08)
      .fill({ color, alpha: 0.92 });
  });
  if (b.currentLayers.length < capacity) {
    inner.roundRect(-w * 0.28, baseY - capacity * bandH, w * 0.56, (capacity - b.currentLayers.length) * bandH, w * 0.08)
      .fill({ color: 0xffffff, alpha: 0.04 });
  }

  shine.roundRect(-w * 0.19, -h * 0.78, w * 0.06, h * 0.45, w * 0.03)
    .fill({ color: 0xffffff, alpha: 0.38 });
}

function drawShelf() {
  const g = new Graphics();
  const y = bottles[0].y + 10;
  g.ellipse(app.screen.width / 2, y, Math.min(app.screen.width * 0.38, 360), 9)
    .fill({ color: 0xfff0d0, alpha: 0.20 });
  boardLayer.addChildAt(g, 0);
}

function drawPour() {
  fxLayer.removeChildren();
  if (!pour.active) return;
  const from = bottles[pour.from];
  const to = bottles[pour.to];
  const t = Math.min(1, pour.t);
  const sx = from.x + from.w * 0.27;
  const sy = from.y - from.h * 0.82 - from.lift;
  const tx = to.x;
  const ty = to.y - to.currentLayers.length * to.h * 0.17 - to.h * 0.14;
  const cx = sx + (tx - sx) * 0.42;
  const cy = Math.min(sy, ty) - 36;
  const ex = sx + (tx - sx) * t;
  const ey = sy + (ty - sy) * t;
  const stream = new Graphics();
  stream.moveTo(sx, sy)
    .quadraticCurveTo(cx, cy, ex, ey)
    .stroke({ width: 6, color: pour.color, alpha: 0.95, cap: 'round' })
    .moveTo(sx, sy)
    .quadraticCurveTo(cx, cy, ex, ey)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.42, cap: 'round' });
  fxLayer.addChild(stream);
}

function resetPour() {
  bottles.forEach((b, i) => {
    b.currentLayers = LEVEL[i].slice();
    b.tilt = 0;
    b.lift = 0;
  });
  pour.active = true;
  pour.t = 0;
  pour.phase = 0;
}

function updatePour(deltaMs) {
  pour.t += deltaMs / 1450;
  const p = Math.min(1, pour.t);
  const from = bottles[pour.from];
  const to = bottles[pour.to];
  from.lift = Math.sin(Math.min(1, p * 1.25) * Math.PI) * from.w * 0.42;
  from.tilt = -Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.64;
  if (p > 0.42 && to.currentLayers.length === 0) {
    from.currentLayers = LEVEL[pour.from].slice(0, 3);
    to.currentLayers = [pour.color];
  }
  if (p >= 1) {
    pour.active = false;
    setTimeout(resetPour, 700);
  }
}

function updateMetrics(deltaMs) {
  if (deltaMs <= 0 || deltaMs > 250) return;
  samples.push(deltaMs);
  if (samples.length > 180) samples.shift();
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const sorted = samples.slice().sort((a, b) => a - b);
  metrics.averageFrameTime = Math.round(avg * 10) / 10;
  metrics.averageFps = Math.round((1000 / avg) * 10) / 10;
  metrics.p95FrameTime = Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10;
  metrics.sampleCount = samples.length;
  document.getElementById('pixi-metrics').textContent = [
    'Vessel Pixi spike',
    'renderer: ' + metrics.renderer,
    'fps: ' + metrics.averageFps + ' / ' + metrics.targetFps,
    'frame avg/p95: ' + metrics.averageFrameTime + ' / ' + metrics.p95FrameTime + ' ms',
    'dpr: ' + app.renderer.resolution,
    'scope: one board + pour only'
  ].join('\n');
}

let lastW = 0;
let lastH = 0;
const samples = [];
resetPour();

app.ticker.add(ticker => {
  if (lastW !== app.screen.width || lastH !== app.screen.height) {
    lastW = app.screen.width;
    lastH = app.screen.height;
    resizeScene();
    boardLayer.removeChildren();
    bottles.forEach(b => boardLayer.addChild(b.g));
    drawShelf();
  }
  const deltaMs = ticker.elapsedMS;
  if (pour.active) updatePour(deltaMs);
  bottles.forEach(drawBottle);
  drawPour();
  updateMetrics(deltaMs);
});
