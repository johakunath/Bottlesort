// Rendering reads live board state through the explicit runtime adapter.
export function createCanvasRenderer(env) {
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
    const stage = env.$('#stage');
    const sr = stage.getBoundingClientRect();
    this.dpr = Math.max(1, Math.min(env.activeRenderProfile().dprCap, window.devicePixelRatio || 1));
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
    this.rects = env.slots.map((slot, i) => Object.assign(env.layoutBox(slot.slot, stage), { shapeName: env.shapesByBottle[i] }));
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
    if (this.renderQueued || env.Motion.running) return this;   /* Motion paints every frame anyway */
    this.renderQueued = true;
    env.FrameGate.request('canvas-render', () => {
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
    if (this.rects.length !== env.slots.length) this.syncLayout();
    this.clear();
    env.PerfMeter.mark('canvas2d', performance.now());
    const n = env.state.length;
    /* a bottle that started moving stays in the live set until the whole
       board is still, so the idle layer is rebuilt only when the set grows */
    const live = this._live || (this._live = new Set());
    let any = false;
    for (let i = 0; i < n; i++) if (env.bottleAnimating(i)) { live.add(i); any = true; }
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
    for (const i of act) if (!env.flyingSource(i)) this.drawBottle(i);
    for (const i of act) if (env.flyingSource(i)) this.drawBottle(i);
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
      const sh = env.SHAPES[shapeName];
      cached = { interior: new Path2D(sh.interior), outline: new Path2D(sh.outline) };
      this.pathCache.set(shapeName, cached);
    }
    return cached;
  },
  liquidGradient(ctx, c, shapeName) {
    const key = env.SKIN + ':' + env.MODE + ':' + c + ':' + shapeName;
    const cached = this.gradientCache.get(key);
    if (cached) return cached;
    const sh = env.SHAPES[shapeName];
    /* span the actual glass body, not the full band rect — the old 0–100 span
       kept the dark cylinder edges outside the visible interior */
    const xl = sh.box[0] - 4, xr = sh.box[1] + 4;
    const g = ctx.createLinearGradient(xl, 0, xr, 0);
    const pair = c === 'hidden' ? env.HIDDEN_FILL : env.COLORS[c];
    const dark = pair[1], light = pair[0];
    const core = env.mixHex(light, '#ffffff', env.SKIN === 'neon' ? 0.26 : 0.15);
    g.addColorStop(0, dark);
    g.addColorStop(0.16, env.mixHex(dark, light, 0.55));
    g.addColorStop(0.4, light);
    g.addColorStop(0.56, core);
    g.addColorStop(0.74, light);
    g.addColorStop(1, dark);
    this.gradientCache.set(key, g);
    return g;
  },
  /* vertical depth: liquid reads deeper toward the base — cached per shape */
  depthOverlay(ctx, shapeName) {
    const key = 'depth:' + shapeName + ':' + env.SKIN;
    const cached = this.gradientCache.get(key);
    if (cached) return cached;
    const sh = env.SHAPES[shapeName];
    const g = ctx.createLinearGradient(0, sh.T, 0, sh.B);
    const tint = env.SKIN === 'neon' ? '18,8,42' : '38,22,10';
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
    const sh = env.SHAPES[shapeName];
    const key = [shapeName, env.SKIN, env.MODE, this.dpr].join(':');
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
    ctx.fillStyle = env.SKIN === 'neon' ? 'rgba(127,208,255,0.10)' : 'rgba(255,233,200,0.12)';
    ctx.fill(this.paths(shapeName).interior);
    ctx.shadowColor = 'transparent';
    /* pooled scene light beneath the bottle ties it to the backdrop
       (Neon skips this — it gets a per-colour bloom in drawBottle) */
    if (env.SKIN !== 'neon') {
      const tone = env.SKIN === 'tidepool' ? '224,255,246' : env.MODE === 'dark' ? '255,176,92' : '255,219,150';
      const alpha = env.MODE === 'dark' ? 0.26 : 0.20;
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
    const sh = env.SHAPES[shapeName];
    const key = [shapeName, env.SKIN, env.MODE, env.RIM_COLOR, this.dpr].join(':');
    const cached = this.shellCache.get(key);
    if (cached) return cached;
    const scale = Math.max(1, Math.min(2, this.dpr || 1));
    const cv = this.makeLayer(100 * scale, sh.vbH * scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const paths = this.paths(shapeName);
    const [xl, xr, , yb] = sh.box;
    const shadowRgb = parseInt(env.GLASS_SHADOW.slice(1), 16);
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
    ctx.strokeStyle = env.SKIN === 'neon' ? 'rgba(150,90,255,0.30)'
      : env.SKIN === 'tidepool' ? 'rgba(24,110,120,0.28)'
      : env.MODE === 'dark' ? 'rgba(255,176,96,0.30)' : 'rgba(120,78,38,0.26)';
    ctx.lineWidth = 4.6;
    ctx.stroke(paths.outline);
    ctx.strokeStyle = env.RIM_COLOR;
    ctx.lineWidth = 2.4;
    ctx.stroke(paths.outline);
    /* key light: brighter rim on the left, candle-amber on the right in the dark */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 42, sh.vbH); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3.2;
    ctx.stroke(paths.outline);
    ctx.restore();
    if (env.SKIN === 'apothecary' && env.MODE === 'dark') {
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
    if (env.SKIN === 'tidepool') { /* pearl specular */
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
    const k = sh.cork, pose = env.corkPose(c.t, env.corkBodyW(sh));
    const key = 'lid:' + env.LID.join(',') + ':' + k.x + ':' + k.w;
    let wood = this.gradientCache.get(key);
    if (!wood) {
      wood = ctx.createLinearGradient(k.x, 0, k.x + k.w, 0);
      wood.addColorStop(0, env.LID[0]); wood.addColorStop(0.42, env.LID[1]); wood.addColorStop(1, env.LID[2]);
      this.gradientCache.set(key, wood);
    }
    ctx.save();
    ctx.globalAlpha = pose.alpha;
    ctx.translate(0, pose.off);
    ctx.fillStyle = wood;
    this.roundRect(ctx, k.x, k.y, k.w, k.h, k.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,15,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = env.LID[3];
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
      ctx.stroke(new Path2D(env.snowflakePath(cx, cy, r)));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [dx2, dy2, dr] of [[-r * 1.9, -r * 0.7, 1.1], [r * 1.8, r * 0.6, 0.9]]) {
        ctx.beginPath(); ctx.arc(cx + dx2, cy + dy2, dr, 0, Math.PI * 2); ctx.fill();
      }
    } else if (elem === 'electric') {
      ctx.fillStyle = 'rgba(140,240,255,0.14)'; ctx.fillRect(-160, y, 420, h);
      const hh = Math.min(h * 0.62, 13);
      const bolt = new Path2D(env.boltPath(cx, cy, hh));
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
  effectsEnabled() { return !env.RM && env.activeRenderProfile().id !== 'low'; },
  prettyEffectsEnabled() { return !env.RM && env.activeRenderProfile().id === 'pretty'; },
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
      const f = e > 0 && e < job.T2 ? env.flowN(e / job.T2) : 0;
      const hw = f > 0 ? job.maxW * Math.sqrt(f) * (1 - 0.3 * u) * 0.5 : 0;
      if (hw > 0.2) any = true;
      L[2 * k] = x - dy * hw; L[2 * k + 1] = y + dx * hw;
      Rr[2 * k] = x + dy * hw; Rr[2 * k + 1] = y - dx * hw;
      Cx[2 * k] = x; Cx[2 * k + 1] = y;
    }
    if (!any) return;
    const c0 = env.COLORS[job.color][0], c1 = env.COLORS[job.color][1];
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    /* theme glow: wide soft strokes along the centreline (no blur filter) */
    const prof = env.activeRenderProfile();
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
        if (env.prettyTidepoolEffects()) {
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
    const r = this.rects[i], slot = env.slots[i];
    if (!r || !slot) return;
    const ctx = this.ctx, shapeName = r.shapeName, sh = env.SHAPES[shapeName];
    const sx = r.w / 100, sy = r.h / sh.vbH;
    const pose = env.poses[i];
    const tx = pose ? pose.tx : 0;
    const selectedLift = !pose && slot.el.classList.contains('selected') && !env.locked.has(i) ? -r.w * 0.22 : 0;
    const ty = (pose ? pose.ty : 0) + selectedLift;
    const rot = pose ? pose.a : 0;
    ctx.save();
    ctx.translate(r.x + tx, r.y + ty);
    const scale = pose?.scale ?? 1;
    if (rot || scale !== 1) { ctx.translate(r.w / 2, r.h / 2); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-r.w / 2, -r.h / 2); }
    ctx.scale(sx, sy);
    const paths = this.paths(shapeName), interior = paths.interior;
    const P = this.PAD;
    const segs = env.visual[i] || [];
    /* Neon: additive bloom tinted by the top liquid + a shelf reflection —
       two drawImages of a cached sprite, only when the bottle repaints anyway */
    if (env.SKIN === 'neon' && segs.length) {
      const units = segs.reduce((s, x) => s + x.u, 0);
      if (units > 0.01) {
        const hid0 = env.hiddenDepth[i] || 0;
        const col = hid0 >= units ? env.HIDDEN_FILL[0] : env.COLORS[segs[segs.length - 1].c][0];
        const bloom = this.glowDot(col);
        const gs = env.activeRenderProfile().glowStrength;
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
    const jobs = env.jobsInto(i);
    if (jobs) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      for (const job of jobs) this.drawStream(ctx, job);
      ctx.restore();
    }
    ctx.drawImage(this.shellLayer(shapeName), 0, 0, 100, sh.vbH);
    if (shapeName === 'tower') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let u = 1; u < sh.capacity; u++) { const y = sh.volToY(u / sh.capacity); ctx.moveTo(73, y); ctx.lineTo(81, y); }
      ctx.stroke();
    }
    if (env.corks[i] && sh.cork) this.drawCork(ctx, sh, env.corks[i]);
    if (env.veiled[i]) { ctx.fillStyle = 'rgba(48,25,90,0.35)'; ctx.fill(interior); ctx.fillStyle = '#e2d2ff'; ctx.font = '34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 50, sh.vbH * 0.38); }
    if (env.frozen.has(i)) { ctx.fillStyle = 'rgba(170,225,255,0.32)'; ctx.fill(interior); ctx.fillStyle = '#f0faff'; ctx.font = '30px system-ui'; ctx.textAlign = 'center'; ctx.fillText('❄', 50, sh.vbH * 0.72); }
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
    const body = env.bodies[i];
    const alpha = rot - (body ? body.phi : 0);
    const lv = env.PourPhysics.levelsFor(shapeName, alpha, cums);
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
    const sample = upright > 0 && env.Fluid.active() ? env.Fluid.sample(i) : null;
    const N = Math.max(6, (sample ? sample.h.length : env.Fluid.N) - 1);
    const bodyW = env.corkBodyW(sh);
    const amp = body ? Math.min(body.ripple, Math.max(0, (yb - 2 - topY) * 0.3)) : 0;
    const kx = 2 * Math.PI / (bodyW * 0.85), ph = body ? body.rphase : 0;
    const SX = this._sx || (this._sx = new Float64Array(40)), SY = this._sy || (this._sy = new Float64Array(40));
    const wallsOnly = span.xr - span.xl < 3;   /* nearly empty: no meniscus to speak of */
    for (let k = 0; k <= N; k++) {
      const x = span.xl + (span.xr - span.xl) * k / N;
      const edge = Math.abs(2 * k / N - 1);
      let y = topY;
      if (!wallsOnly) y += upright * ((sample ? sample.h[k] : 0) - env.Fluid.MENISCUS * Math.pow(edge, 2.2));
      if (amp > 0.05) y += amp * Math.sin(kx * x - ph);
      SX[k] = x; SY[k] = y;
    }
    const allHidden = (env.hiddenDepth[i] || 0) >= total - 1e-6;
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
    const hid = Math.min(env.hiddenDepth[i] || 0, total);
    let unitLv = null;
    if (hid > 0.001) {
      if (!allHidden) {
        const units = this._units || (this._units = []);
        units.length = 0;
        for (let u = 1; u <= Math.ceil(hid - 1e-6); u++) units.push(Math.min(u, hid));
        unitLv = env.PourPhysics.levelsFor(shapeName, alpha, units);
        ctx.fillStyle = this.liquidGradient(ctx, 'hidden', shapeName);
        quad(unitLv.tops[unitLv.tops.length - 1]); ctx.fill();
      } else {
        const units = [];
        for (let u = 1; u <= Math.ceil(hid - 1e-6); u++) units.push(Math.min(u, hid));
        unitLv = env.PourPhysics.levelsFor(shapeName, alpha, units);
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
        const elem = env.ELEMENT_MAP[cols[j]];
        if ((!elem && !env.save.symbols) || cums[j] <= hid + 1e-6) continue;
        const yT = lv.tops[j], yB = Math.min(j ? lv.tops[j - 1] : yb - 2, hidTop);
        const my = (yT + yB) / 2;
        ctx.save(); ctx.translate(-my * ta - 50, 0);
        if (env.save.symbols && yB - yT > 12) {
          ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.fillStyle = '#fff';
          ctx.strokeText(String(cols[j] + 1), 50, my); ctx.fillText(String(cols[j] + 1), 50, my);
        } else if (!env.save.symbols && elem) this.drawElement(ctx, elem, yT, yB - yT);
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
return CanvasRenderer;
}
