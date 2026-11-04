// Rendering reads live board state through the explicit runtime adapter.
export function createSvgRenderer(env) {
const SvgRenderer = {
  backend: 'svg',
  beginPour(info) {
    const fx = env.$('#fx');
    const { si, c0, c1, sx, sy, tx, ty, cpx, cpy, side, receiverW } = info;
    const arcD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    const pourSVG = document.createElementNS(env.NS, 'svg');
    pourSVG.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:71';
    const gid = 'ps_' + si;
    const pdefs = document.createElementNS(env.NS, 'defs');
    const pgrad = document.createElementNS(env.NS, 'linearGradient');
    pgrad.setAttribute('id', gid); pgrad.setAttribute('gradientUnits', 'userSpaceOnUse');
    pgrad.setAttribute('x1', sx); pgrad.setAttribute('y1', sy);
    pgrad.setAttribute('x2', tx); pgrad.setAttribute('y2', ty);
    [[0, c0], [1, c1]].forEach(([off, col]) => {
      const stop = document.createElementNS(env.NS, 'stop');
      stop.setAttribute('offset', off); stop.setAttribute('stop-color', col);
      pgrad.appendChild(stop);
    });
    pdefs.appendChild(pgrad); pourSVG.appendChild(pdefs);
    const paths = [];
    const mkPath = (stroke, width, opacity) => {
      const path = document.createElementNS(env.NS, 'path');
      paths.push(path);
      path.setAttribute('d', arcD); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', width);
      path.setAttribute('stroke-linecap', 'round');
      if (opacity !== undefined) path.setAttribute('opacity', opacity);
      return path;
    };
    /* layered wide strokes fake the glow — the blur() filter was a mobile slow path */
    if (env.activeRenderProfile().streamGlow) {
      pourSVG.appendChild(mkPath(c0, 14, 0.10 * env.activeRenderProfile().glowStrength));
      pourSVG.appendChild(mkPath(c0, 8, 0.18 * env.activeRenderProfile().glowStrength));
    }
    pourSVG.appendChild(mkPath('url(#' + gid + ')', 5));
    pourSVG.appendChild(mkPath('rgba(255,255,255,0.4)', 1.6));
    fx.appendChild(pourSVG);
    const rippleEls = [];
    if (!env.RM) {
      for (let r = 0; r < 2; r++) {
        const rip = document.createElement('div');
        rip.className = 'pour-ripple';
        rip.style.cssText = `width:${receiverW * 0.48}px;height:${receiverW * 0.15}px;border-color:${c0};` +
          `left:${tx}px;top:${ty}px;animation-delay:${r * 0.24}s`;
        fx.appendChild(rip);
        rippleEls.push(rip);
      }
      env.Fluid.drop(info.di, -1.8);
      env.Fluid.start();
    }
    const dropTimer = (!env.explicitPrettyEffects()) ? null : setInterval(() => {
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
    if (env.prettyTidepoolEffects()) {
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
    const slot = env.slots[i];
    const sh = slot.sh;
    const segs = env.visual[i];
    const g = slot.liquidGroup;
    while (g.firstChild) g.removeChild(g.firstChild);
    const t = tiltDeg || 0;
    const a = t * Math.PI / 180;
    const px = 50, py = sh.vbH / 2;
    const inner = env.svgEl('g', t ? { transform: 'rotate(' + (-t).toFixed(2) + ' ' + px + ' ' + py + ')' } : {});

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

    const shapeName = env.shapesByBottle[i];
    const WAVECUT = env.Fluid.AMP + env.Fluid.MENISCUS + 1;
    const waveMode = !t && env.Fluid.active() && !env.locked.has(i);
    const lastSeg = segs.length ? segs[segs.length - 1] : null;
    let topWave = null;

    let cum = 0;
    const ellipses = [];
    for (const seg of segs) {
      if (seg.u <= 0.01) continue;
      let y, h;
      if (!t && sh.volToY) {
        const yBot = sh.volToY(cum / sh.capacity);
        const yTop = sh.volToY((cum + seg.u) / sh.capacity);
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
      inner.appendChild(env.svgEl('rect', { x: -160, y: rectY, width: 420, height: rectH + 1.4, fill: 'url(#liq' + seg.c + ')' }));
      if (env.save.symbols && !t) {
        const visibleBottom = Math.min(y + h, sh.volToY((env.hiddenDepth[i] || 0) / sh.capacity));
        if (visibleBottom - y > 12) {
          const label = env.svgEl('text', { x: px, y: (y + visibleBottom) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 15, 'font-family': 'system-ui', 'font-weight': 700, fill: '#fff', stroke: '#111', 'stroke-width': 3, 'paint-order': 'stroke' });
          label.textContent = String(seg.c + 1); inner.appendChild(label);
        }
      }
      if (!env.save.symbols && !t && env.ELEMENT_MAP[seg.c]) env.appendElemOverlay(inner, env.ELEMENT_MAP[seg.c], y, h, px);
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
      const halfW = Math.max(5, env.shapeWidthAt(shapeName, e.y) / 2);
      const MEN = env.Fluid.MENISCUS;
      const sy = e.y + wdy + 0.4;          /* +0.4 matches crestFor baseline offset */
      inner.appendChild(env.svgEl('path', {
        d: `M${(px - halfW).toFixed(1)},${(sy - MEN).toFixed(2)} Q${px},${(sy + MEN).toFixed(2)} ${(px + halfW).toFixed(1)},${(sy - MEN).toFixed(2)}`,
        fill: 'none',
        stroke: 'rgba(255,255,255,0.7)', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        opacity: fade
      }));
    }

    /* animated wave surface for the top band */
    if (topWave) {
      const halfW = Math.max(5, env.shapeWidthAt(shapeName, topWave.surfY) / 2);
      const path = env.svgEl('path', { fill: 'url(#liq' + topWave.c + ')', d: env.Fluid.pathFor(i, topWave.surfY, halfW, topWave.bottomY) });
      inner.appendChild(path);
      const crest = env.svgEl('path', { d: env.Fluid.crestFor(i, topWave.surfY, halfW), fill: 'none',
        stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      inner.appendChild(crest);
      slot.surf = { path, crest, surfY: topWave.surfY, halfW, bottomY: topWave.bottomY };
      env.Fluid.start();
    } else {
      slot.surf = null;
    }

    /* mystery overlay: unit bands counted from the bottom */
    const hid = env.hiddenDepth[i] || 0;
    for (let u = 0; u < hid && u < cum; u++) {
      let hy, hh;
      if (!t && sh.volToY) {
        const hBot = sh.volToY(u / sh.capacity);
        const hTop = sh.volToY((u + 1) / sh.capacity);
        hy = hTop; hh = hBot - hTop;
      } else {
        hh = hUnit;
        hy = low - (u + 1) * hUnit;
      }
      inner.appendChild(env.svgEl('rect', { x: -160, y: hy, width: 420, height: hh + 1.2, fill: 'url(#liqH)' }));
      if (fade > 0.3) {
        const txt = env.svgEl('text', {
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
    const glowColor = top ? (hid >= cum ? env.HIDDEN_FILL[1] : env.COLORS[top.c][1]) : null;
    /* subtle CSS-only per-bottle glow (WebGL bloom removed) — a touch stronger on Neon */
    const glowAlpha = Math.round((env.SKIN === 'neon' ? 0.40 : 0.20) * env.activeRenderProfile().glowStrength * 255);
    const ga = Math.max(0, Math.min(255, glowAlpha)).toString(16).padStart(2, '0');
    slot.glow.style.background = glowColor
      ? 'radial-gradient(50% 60% at 50% 50%, ' + glowColor + ga + ', transparent 70%)'
      : 'none';
  }
};
return SvgRenderer;
}
