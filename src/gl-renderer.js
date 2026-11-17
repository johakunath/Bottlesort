/* ============================================================
   Vessel — WebGL board renderer (Three.js).

   Draws the same board state as the Canvas 2D renderer, through the same
   runtime adapter, as lit 3D glass: every bottle is a lathe of the physics
   module's own interior profile, so the liquid's cut lines (volume-true, from
   PourPhysics.levelsFor) land exactly where the 2D renderer puts them.

   Layout stays in stage pixels under an orthographic camera, so hit targets,
   poses and pour geometry need no translation. The "seen slightly from
   above" look comes from tipping each bottle a few degrees toward the viewer.

   Cost rules (the WebGL pass removed in June 2026 ran a full-screen shader
   every frame, even at rest):
   - a frame is drawn only when the runtime asks for one
   - no post-processing, no refraction pass, no shadow maps
   - one small shader each for glass, liquid, stream and lid
   ============================================================ */
import * as THREE from 'three';

const ELEV = 7 * Math.PI / 180;      /* how far bottles tip toward the viewer */
const MAX_LAYERS = 12;               /* a tower holds up to 12 single-unit runs */
const MAX_DECALS = 12;
const WAVE_N = 17;
const STREAM_N = 16;
const MAX_DROPS = 96;
const ATLAS_CELLS = 4, ATLAS_PX = 96;
const GLYPH = { digit0: 4, question: 13 };
const ELEMENT_ID = { icy: 1, electric: 2, boiling: 3, toxic: 4 };
/* translucent washes the element emblems lay over their band (as in the 2D renderer) */
const ELEMENT_TINT = { icy: [0.78, 0.94, 1.0, 0.22], electric: [0.55, 0.94, 1.0, 0.14], toxic: [0.43, 1.0, 0.55, 0.16] };

const GLASS_VERT = `
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vL = position;
    gl_Position = projectionMatrix * mv;
  }`;
const GLASS_FRAG = `
  uniform vec3 uRim; uniform vec4 uTint; uniform float uH;
  uniform float uTicks[11]; uniform int uTickN;
  uniform vec4 uGlow; uniform float uSheen;
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  void main() {
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.4);
    /* two fake softbox reflections: a wide key strip on the left, a thin one on the right */
    float ends = smoothstep(1.0, 0.72, abs(vL.y) / uH);
    float key = smoothstep(0.13, 0.0, abs(n.x + 0.56)) * 0.8 * ends;
    float fill = smoothstep(0.05, 0.0, abs(n.x - 0.66)) * 0.42 * ends;
    float a = 0.05 + 0.62 * fres + key + fill;
    vec3 col = mix(uRim, vec3(1.0), clamp(key + fill, 0.0, 1.0));
    if (!gl_FrontFacing) a *= 0.35;
    else {
      /* capacity ticks on towers */
      float v = uH - vL.y, tick = 0.0;
      if (vL.x > 22.0 && vL.x < 31.0) for (int k = 0; k < 11; k++) { if (k >= uTickN) break; tick = max(tick, smoothstep(1.3, 0.5, abs(v - uTicks[k]))); }
      a = max(a, tick * 0.5); col = mix(col, vec3(1.0), tick);
      /* frozen / veiled wash over the whole vessel */
      col = mix(col, uTint.rgb, uTint.a / max(uTint.a + a, 0.001));
      a = a + uTint.a * (1.0 - a);
    }
    /* selection: rim light in the bottle's top colour */
    float glow = uGlow.a * (0.25 + 0.75 * fres);
    col = mix(col, uGlow.rgb, clamp(glow, 0.0, 1.0) * 0.8); a += glow * 0.55;
    /* win wave: a slanted band of light crossing the glass */
    float sheen = smoothstep(16.0, 0.0, abs(vL.x + 0.3 * vL.y - uSheen));
    col = mix(col, vec3(1.0), sheen * 0.8); a += sheen * 0.5;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.96));
  }`;

const LIQUID_VERT = `
  varying vec3 vN; varying vec3 vL;
  void main() {
    vN = normalize(normalMatrix * normal); vL = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const LIQUID_FRAG = `
  uniform vec2 uCS; uniform float uH;
  uniform float uTops[${MAX_LAYERS}]; uniform vec3 uLight[${MAX_LAYERS}]; uniform vec3 uDark[${MAX_LAYERS}]; uniform int uCount;
  uniform vec2 uSpan; uniform float uWave[${WAVE_N}]; uniform int uWaveN; uniform float uUpright; uniform float uMeniscus; uniform vec3 uRipple;
  uniform vec4 uDecal[${MAX_DECALS}]; uniform int uDecalN; uniform sampler2D uAtlas; uniform vec3 uDeep; uniform float uYb;
  uniform int uElem[${MAX_LAYERS}]; uniform float uBot; uniform float uTime; uniform vec3 uImpact; uniform vec2 uFlash; uniform float uSheen;
  varying vec3 vN; varying vec3 vL;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float tri(float x) { return abs(fract(x) - 0.5) * 2.0; }
  /* rising bubbles in band coordinates: by = distance below the band top, bh = band height */
  vec2 bubbles(float bx, float by, float bh, float cellW, float speed, float seed) {
    float cx = floor(bx / cellW), h = hash(vec2(cx, seed));
    float r = 1.3 + 2.6 * hash(vec2(cx, seed + 3.1));
    float rise = fract(h + uTime * speed * (0.6 + 0.8 * hash(vec2(cx, seed + 7.7))));
    vec2 c = vec2((cx + 0.3 + 0.4 * hash(vec2(cx, seed + 1.3))) * cellW, (1.0 - rise) * bh);
    r *= smoothstep(0.0, 0.2, rise) * smoothstep(0.0, 0.12, 1.0 - rise);
    float d = length(vec2(bx, by) - c);
    float rim = smoothstep(0.75, 0.15, abs(d - r)), fill = smoothstep(r, r - 0.6, d);
    float spec = smoothstep(r * 0.36, 0.0, length(vec2(bx, by) - c + vec2(r * 0.35)));
    return vec2(max(rim * 0.85, spec * fill), fill * 0.26);     /* (white amount, soft fill) */
  }
  void main() {
    /* bottle frame (u - 50, v) → surface frame: the bottle rotated by alpha about (50, 0) */
    vec2 q = vec2(vL.x, uH - vL.y);
    float xs = uCS.x * q.x - uCS.y * q.y, ys = uCS.y * q.x + uCS.x * q.y;
    /* live top surface: fluid height-field + wall meniscus + pour ripple */
    float top = uTops[uCount - 1];
    float t = clamp((xs - uSpan.x) / max(uSpan.y - uSpan.x, 0.001), 0.0, 1.0);
    if (uSpan.y - uSpan.x > 3.0) {
      float f = t * float(uWaveN - 1); int i0 = int(floor(f)); int i1 = min(i0 + 1, uWaveN - 1);
      float wave = uWaveN > 1 ? mix(uWave[i0], uWave[i1], fract(f)) : 0.0;
      top += uUpright * (wave - uMeniscus * pow(abs(2.0 * t - 1.0), 2.2));
    }
    top += uRipple.x * sin(uRipple.y * xs - uRipple.z);
    if (ys < top) discard;
    float aa = max(fwidth(ys) * 1.2, 0.35);
    vec3 light = uLight[0], dark = uDark[0];
    int elem = uElem[0];
    float bandTop = uCount > 1 ? uTops[0] : top, bandBot = uBot;
    for (int j = 1; j < ${MAX_LAYERS}; j++) {
      if (j >= uCount) break;
      float k = 1.0 - smoothstep(uTops[j - 1] - aa, uTops[j - 1] + aa, ys);
      light = mix(light, uLight[j], k); dark = mix(dark, uDark[j], k);
      if (ys < uTops[j - 1]) { elem = uElem[j]; bandBot = uTops[j - 1]; bandTop = j == uCount - 1 ? top : uTops[j]; }
    }
    if (!gl_FrontFacing) {
      /* the far wall seen through the cut: reads as the liquid's top surface */
      vec3 surf = mix(light, vec3(1.0), 0.36);
      /* pour impact: rings spreading over the surface from where the stream lands */
      float rr = length(vec2(xs - uImpact.x, vL.z));
      surf = mix(surf, vec3(1.0), uImpact.y * 0.6 * smoothstep(0.35, 1.0, sin(rr * 0.55 - uImpact.z * 14.0)) * smoothstep(34.0, 4.0, rr));
      gl_FragColor = vec4(surf, 1.0);
      return;
    }
    vec3 n = normalize(vN);
    vec3 col = mix(dark, light, smoothstep(0.08, 0.86, clamp(n.z, 0.0, 1.0)));
    col += vec3(1.0) * smoothstep(0.16, 0.0, abs(n.x + 0.5)) * 0.14;            /* inner highlight */
    col = mix(col, uDeep, 0.2 * smoothstep(uYb - 70.0, uYb, ys));                /* deeper toward the base */
    /* elements live in the liquid itself (purely cosmetic): frost, arcs, bubbles, murk */
    float by = ys - bandTop, bh = max(bandBot - bandTop, 0.001);
    if (elem == 1) {
      float frost = 2.6 + 3.2 * tri(xs / 9.0) + 1.8 * tri(xs / 3.7 + 0.3);
      col = mix(col, vec3(0.96, 0.99, 1.0), 0.78 * smoothstep(frost + 0.6, frost - 0.6, by) * step(7.0, bh));
      vec2 g = vec2(xs, by) / 13.0, id = floor(g);
      vec2 o = (fract(g) - 0.5 - 0.5 * (vec2(hash(id), hash(id + 9.2)) - 0.5)) * 13.0;
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash(id + 2.0) * 6.28);
      float star = smoothstep(1.0, 0.0, abs(o.x) * abs(o.y) * 1.6 + dot(o, o) * 0.09) * step(0.45, hash(id + 4.0));
      col = mix(col, vec3(1.0), star * tw * smoothstep(frost, frost + 3.0, by));
    } else if (elem == 2) {
      float flick = floor(uTime * 14.0);
      float amp = min(bh * 0.26, 7.0);
      /* a jagged polyline through random heights: reads as a spark, not a sawtooth */
      float sx0 = xs / 6.5 + hash(vec2(flick, 1.0)) * 4.0, si = floor(sx0), sf = fract(sx0);
      float zig = (mix(hash(vec2(si, flick)), hash(vec2(si + 1.0, flick)), sf) - 0.5) * 2.0 * amp;
      float d = abs(by - bh * 0.5 - zig);
      col = mix(col, vec3(1.0, 0.98, 0.72), 0.45 * exp(-d * 0.45));
      col = mix(col, vec3(1.0), smoothstep(1.3, 0.25, d));
    } else if (elem == 3) {
      vec2 b = max(bubbles(xs + 40.0, by, bh, 12.0, 0.55, 1.0), bubbles(xs + 46.0, by, bh, 17.0, 0.35, 5.0));
      col = mix(col, vec3(1.0), clamp(b.x + b.y, 0.0, 1.0));
    } else if (elem == 4) {
      /* slow murky veils in a darker shade of the band's own colour, so the hue stays readable */
      float w = sin(by * 0.34 + 1.7 * sin(xs * 0.1 + uTime * 0.7) + 0.6 * sin(xs * 0.23 - by * 0.08));
      col = mix(col, dark * 0.5, 0.32 * smoothstep(0.1, 0.85, w));
      vec2 g = vec2(xs, by + uTime * 2.0) / 10.0, id = floor(g);
      vec2 o = (fract(g) - 0.5) * 10.0 - (vec2(hash(id), hash(id + 5.0)) - 0.5) * 5.0;
      col = mix(col, vec3(0.86, 1.0, 0.55), smoothstep(1.5, 0.6, length(o)) * step(0.62, hash(id + 1.0)) * 0.9);
    }
    /* pour impact: a column of bubbles driven down under the stream */
    if (uImpact.y > 0.01) {
      float depth = ys - top, col0 = xs - uImpact.x;
      vec2 b = bubbles(col0 + 60.0, depth, 34.0, 6.5, 2.4, 11.0);
      col = mix(col, vec3(1.0), clamp(b.x + b.y, 0.0, 1.0) * uImpact.y * smoothstep(15.0, 3.0, abs(col0)) * smoothstep(34.0, 10.0, depth));
    }
    /* completion: light sweeps up through the bottle in its own colour */
    if (uFlash.x > 0.001) {
      float band = smoothstep(46.0, 0.0, abs(ys - mix(uYb, uYb - 190.0, uFlash.y)));
      col = mix(col, mix(light, vec3(1.0), 0.6), uFlash.x * (0.28 + 0.6 * band));
    }
    col = mix(col, vec3(1.0), smoothstep(16.0, 0.0, abs(vL.x + 0.3 * vL.y - uSheen)) * 0.45);   /* win wave */
    /* colour-blind numbers and '?' marks, upright in the surface frame */
    for (int d = 0; d < ${MAX_DECALS}; d++) {
      if (d >= uDecalN) break;
      vec4 dc = uDecal[d];
      float cell = floor(dc.w + 0.5);
      vec2 p = (vec2(xs, ys) - dc.xy) / dc.z;
      if (abs(p.x) < 1.0 && abs(p.y) < 1.0) {
        vec2 c = vec2(mod(cell, ${ATLAS_CELLS}.0), floor(cell / ${ATLAS_CELLS}.0));
        vec2 uv = (c + p * 0.5 + 0.5) / ${ATLAS_CELLS}.0;
        vec4 tx = texture2D(uAtlas, vec2(uv.x, 1.0 - uv.y));
        col = mix(col, tx.rgb, tx.a * uUpright);
      }
    }
    col = mix(col, vec3(1.0), smoothstep(top + 2.2, top, ys) * 0.5);            /* meniscus line */
    gl_FragColor = vec4(col, 1.0);
  }`;

const STREAM_VERT = `
  attribute float side; varying float vSide;
  void main() { vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STREAM_FRAG = `
  uniform vec3 uLight; uniform vec3 uDark; varying float vSide;
  void main() {
    float r = abs(vSide * 2.0 - 1.0);                                            /* 0 centre → 1 edge */
    vec3 col = mix(uLight, uDark, smoothstep(0.25, 1.0, r));
    col = mix(col, vec3(1.0), smoothstep(0.16, 0.0, abs(vSide - 0.3)) * 0.55);  /* lit streak */
    gl_FragColor = vec4(col, 1.0 - smoothstep(0.82, 1.0, r));
  }`;

const LID_VERT = `
  varying vec3 vN;
  void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LID_FRAG = `
  uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uTop; uniform float uAlpha;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    float x = n.x * 0.5 + 0.5;
    vec3 side = x < 0.42 ? mix(uA, uB, x / 0.42) : mix(uB, uC, (x - 0.42) / 0.58);
    vec3 col = mix(side, uTop, smoothstep(0.35, 0.8, n.y));
    gl_FragColor = vec4(col, uAlpha);
  }`;

export function createGlRenderer(env) {
  const SHAPE_GEO = env.PourPhysics.SHAPE_GEO;
  const hexRgb = (hex, out) => { const v = parseInt(hex.slice(1), 16); out[0] = ((v >> 16) & 255) / 255; out[1] = ((v >> 8) & 255) / 255; out[2] = (v & 255) / 255; return out; };
  const tmp3 = [0, 0, 0];

  /* ---- per-shape geometry, built once ---- */
  const geoCache = new Map();
  function shapeGeometry(sn) {
    let g = geoCache.get(sn);
    if (g) return g;
    const sh = env.SHAPES[sn], geo = SHAPE_GEO[sn], H = sh.vbH / 2;
    const half = y => env.shapeWidthAt(sn, y) / 2;
    /* interior profile, base → neck, from the physics module's own widths.
       Sampled finely, then thinned: straight walls keep only their ends, so a
       tower costs barely more triangles than a small bottle. */
    const raw = [];
    for (let y = geo.bottom; y > geo.top; y -= 1.5) { const r = half(y); if (r >= 0.5) raw.push([r, y]); }
    raw.push([half(geo.top), geo.top]);
    const prof = [raw[0]];
    for (let k = 1; k < raw.length - 1; k++) {
      const a = prof[prof.length - 1], p = raw[k], c = raw[k + 1];
      /* distance of p from the chord a–c, in viewBox units */
      const dev = Math.abs((c[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - a[1])) / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1);
      if (dev > 0.12) prof.push(p);
    }
    prof.push(raw[raw.length - 1]);
    const inner = [new THREE.Vector2(0, H - geo.bottom)], outer = [new THREE.Vector2(0, H - geo.bottom - 3)];
    for (const [r, y] of prof) {
      inner.push(new THREE.Vector2(r, H - y));
      /* glass wall: the interior pushed out 3 units, and down 3 across the base */
      const below = Math.max(0, Math.min(1, (y - (geo.bottom - 18)) / 18));
      outer.push(new THREE.Vector2(r + 3, H - y - 3 * below));
    }
    outer.push(new THREE.Vector2(half(geo.top) + 3, H - geo.top + 3));
    const lip = sh.lip;
    const lipGeo = new THREE.TorusGeometry(lip.w / 2 - 2.2, 2.6, 6, 28);
    lipGeo.rotateX(Math.PI / 2);
    lipGeo.translate(0, H - (lip.y + lip.h * 0.42), 0);
    let lidGeo = null;
    if (sh.cork) {
      const k = sh.cork;
      lidGeo = new THREE.CylinderGeometry(k.w / 2, k.w / 2 * 0.9, k.h, 28);
      lidGeo.translate(0, H - (k.y + k.h / 2), 0);
    }
    g = { liquid: new THREE.LatheGeometry(inner, 32), glass: new THREE.LatheGeometry(outer, 32), lip: lipGeo, lid: lidGeo, H };
    geoCache.set(sn, g);
    return g;
  }

  /* ---- glyph atlas: emblems, digits, '?' ---- */
  let atlas = null, glowTex = null, unitPlane = null;
  function buildAtlas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = ATLAS_CELLS * ATLAS_PX;
    const ctx = cv.getContext('2d'), C = ATLAS_PX;
    const cell = (idx, fn) => {
      ctx.save();
      ctx.translate((idx % ATLAS_CELLS) * C + C / 2, Math.floor(idx / ATLAS_CELLS) * C + C / 2);
      ctx.scale(C / 2, C / 2);                       /* cell spans −1 … 1 */
      fn();
      ctx.restore();
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const text = (idx, s, fill) => cell(idx, () => {
      ctx.font = '700 1.5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 0.3; ctx.strokeText(s, 0, 0.06);
      ctx.fillStyle = fill; ctx.fillText(s, 0, 0.06);
    });
    for (let d = 1; d <= 9; d++) text(GLYPH.digit0 + d - 1, String(d), '#fff');
    text(GLYPH.question, '?', '#cdd5f2');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  const makeGlassMat = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    uniforms: { uRim: { value: new THREE.Vector3(1, 1, 1) }, uTint: { value: new THREE.Vector4(0, 0, 0, 0) }, uH: { value: 120 }, uTicks: { value: new Array(11).fill(0) }, uTickN: { value: 0 }, uGlow: { value: new THREE.Vector4(1, 1, 1, 0) }, uSheen: { value: 1e6 } }
  });
  const makeLiquidMat = () => new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG,
    uniforms: {
      uCS: { value: new THREE.Vector2(1, 0) }, uH: { value: 120 }, uYb: { value: 224 },
      uTops: { value: new Array(MAX_LAYERS).fill(0) }, uCount: { value: 0 },
      uLight: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3()) },
      uDark: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3()) },
      uSpan: { value: new THREE.Vector2() }, uWave: { value: new Array(WAVE_N).fill(0) }, uWaveN: { value: 1 },
      uUpright: { value: 1 }, uMeniscus: { value: 2.4 }, uRipple: { value: new THREE.Vector3() },
      uDecal: { value: Array.from({ length: MAX_DECALS }, () => new THREE.Vector4()) }, uDecalN: { value: 0 },
      uAtlas: { value: atlas }, uDeep: { value: new THREE.Vector3(0.15, 0.09, 0.04) },
      uElem: { value: new Array(MAX_LAYERS).fill(0) }, uBot: { value: 224 }, uTime: { value: 0 },
      uImpact: { value: new THREE.Vector3(0, 0, 0) }, uFlash: { value: new THREE.Vector2(0, 0) }, uSheen: { value: 1e6 }
    }
  });
  const makeLidMat = () => new THREE.ShaderMaterial({
    transparent: true, vertexShader: LID_VERT, fragmentShader: LID_FRAG,
    uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uC: { value: new THREE.Vector3() }, uTop: { value: new THREE.Vector3() }, uAlpha: { value: 1 } }
  });

  const Gl = {
    backend: 'webgl',
    canvas: null,
    three: null,
    scene: null,
    camera: null,
    ok: false,
    failed: false,
    dpr: 1,
    rects: [],
    items: [],
    itemsKey: '',
    streams: [],
    drops: null,
    renderQueued: false,
    w: 0, h: 0,
    time: 0, dt: 0, lastNow: 0, live: false, busy: false, keepAlive: false, wave: -1, waveX: 0,
    ensure() {
      if (this.failed) return false;
      if (this.ok) return true;
      this.canvas = document.getElementById('board-gl');
      if (!this.canvas) { this.failed = true; return false; }
      try {
        /* a software rasteriser (no usable GPU) is slower than Canvas 2D: refuse it unless ?renderer=webgl asks */
        this.three = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !env.glForced() });
      } catch (e) { this.failed = true; return false; }
      this.three.setClearColor(0x000000, 0);
      this.three.debug.checkShaderErrors = false;   /* skips a slow driver round-trip per shader */
      /* a lost context (tab backgrounded on a busy phone, driver reset) hands the board back to Canvas 2D */
      this.canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); this.failed = true; this.ok = false; env.onContextLost(); });
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
      atlas = buildAtlas();
      const gc = document.createElement('canvas'); gc.width = gc.height = 64;
      const gctx = gc.getContext('2d'), gg = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gg.addColorStop(0, 'rgba(255,255,255,0.8)'); gg.addColorStop(0.55, 'rgba(255,255,255,0.3)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      gctx.fillStyle = gg; gctx.fillRect(0, 0, 64, 64);
      glowTex = new THREE.CanvasTexture(gc);
      unitPlane = new THREE.PlaneGeometry(1, 1);
      /* splash droplets: one point cloud for every running pour */
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 3), 3));
      dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 3), 3));
      const dot = document.createElement('canvas'); dot.width = dot.height = 32;
      const dctx = dot.getContext('2d'); dctx.fillStyle = '#fff'; dctx.beginPath(); dctx.arc(16, 16, 14, 0, Math.PI * 2); dctx.fill();
      this.drops = new THREE.Points(dg, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, map: new THREE.CanvasTexture(dot), alphaTest: 0.5, transparent: false }));
      this.drops.frustumCulled = false; this.drops.renderOrder = 1;
      this.scene.add(this.drops);
      this.ok = true;
      return true;
    },
    syncLayout() {
      if (!this.ensure()) return false;
      const stage = env.$('#stage');
      const sr = stage.getBoundingClientRect();
      this.dpr = Math.max(1, Math.min(env.activeDprCap(), window.devicePixelRatio || 1));
      const w = Math.max(1, sr.width), h = Math.max(1, sr.height);
      if (w !== this.w || h !== this.h || this.three.getPixelRatio() !== this.dpr) {
        this.w = w; this.h = h;
        this.three.setPixelRatio(this.dpr);
        this.three.setSize(w, h, false);
        this.camera.right = w; this.camera.bottom = -h;
        this.camera.updateProjectionMatrix();
      }
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.rects = env.slots.map((slot, i) => Object.assign(env.layoutBox(slot.slot, stage), { shapeName: env.shapesByBottle[i] }));
      this.buildItems();
      return true;
    },
    /* one group per bottle; rebuilt only when the board's shapes change */
    buildItems() {
      const key = env.shapesByBottle.join(',');
      if (key === this.itemsKey && this.items.length === env.slots.length) return;
      for (const it of this.items) { this.scene.remove(it.root); it.liquidMat.dispose(); it.glassMat.dispose(); it.bloomMat.dispose(); it.shelfMat.dispose(); if (it.lidMat) it.lidMat.dispose(); }
      this.items = env.shapesByBottle.map(sn => {
        const g = shapeGeometry(sn), sh = env.SHAPES[sn];
        const root = new THREE.Group(), body = new THREE.Group();
        root.rotation.x = ELEV;
        root.add(body);
        const liquidMat = makeLiquidMat(), glassMat = makeGlassMat();
        liquidMat.uniforms.uH.value = g.H; glassMat.uniforms.uH.value = g.H;
        liquidMat.uniforms.uYb.value = SHAPE_GEO[sn].bottom;
        if (sn.startsWith('tower')) {
          const n = Math.min(11, sh.capacity - 1);
          for (let u = 1; u <= n; u++) glassMat.uniforms.uTicks.value[u - 1] = env.PourPhysics.uprightLevel(sn, u);
          glassMat.uniforms.uTickN.value = n;
        }
        const liquid = new THREE.Mesh(g.liquid, liquidMat);
        const glass = new THREE.Mesh(g.glass, glassMat); glass.renderOrder = 2;
        const lip = new THREE.Mesh(g.lip, glassMat); lip.renderOrder = 2;
        body.add(liquid, glass, lip);
        let lid = null, lidMat = null;
        if (g.lid) { lidMat = makeLidMat(); lid = new THREE.Mesh(g.lid, lidMat); lid.renderOrder = 3; lid.visible = false; body.add(lid); }
        /* Neon halo sprites (hidden on other skins) */
        const bloomMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const shelfMat = bloomMat.clone();
        const bloom = new THREE.Mesh(unitPlane, bloomMat), shelfGlow = new THREE.Mesh(unitPlane, shelfMat);
        bloom.scale.set(150, sh.vbH * 0.9, 1); bloom.position.set(0, -sh.vbH * 0.06, -60);
        shelfGlow.scale.set(110, 30, 1); shelfGlow.position.set(0, -g.H + 2, -60);
        bloom.renderOrder = shelfGlow.renderOrder = -1; bloom.visible = shelfGlow.visible = false;
        body.add(bloom, shelfGlow);
        this.scene.add(root);
        return { root, body, liquid, liquidMat, glass, glassMat, lid, lidMat, bloom, bloomMat, shelfGlow, shelfMat, sn, sh, H: g.H };
      });
      this.itemsKey = key;
    },
    clear() { if (this.ok) this.three.clear(); },
    renderBottle() { return this.requestRender(); },
    renderAll() { return this.requestRender(); },
    requestRender() {
      if (!this.ensure()) return this;
      if (this.renderQueued || env.Motion.running) return this;   /* Motion paints every frame anyway */
      this.renderQueued = true;
      env.FrameGate.request('gl-render', () => { this.renderQueued = false; this.renderNow(); });
      return this;
    },
    setQuality() { return this; },
    destroy() { this.renderQueued = false; this.clear(); return this; },

    renderNow() {
      if (!this.ensure()) return;
      if (this.rects.length !== env.slots.length || this.items.length !== env.slots.length) this.syncLayout();
      const now = performance.now();
      env.PerfMeter.mark('webgl', now);
      /* effect clock: advances only while the board is animating, so a resting board is a still image */
      this.live = env.Motion.running;
      this.dt = this.live && this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0;
      this.lastNow = now;
      this.time = (this.time + this.dt) % 600;
      this.busy = false;
      if (this.wave >= 0) {
        this.wave += this.dt / 0.9;
        if (this.wave >= 1 || !this.live) this.wave = -1;
        else { this.waveX = -0.25 * this.w + 1.5 * this.w * this.wave; this.busy = true; }
      }
      const n = Math.min(env.state.length, this.items.length);
      for (let i = 0; i < n; i++) this.updateBottle(i);
      this.updateStreams();
      this.three.render(this.scene, this.camera);
      /* fading effects ask the shared loop for a few more frames */
      if (this.busy && !this.keepAlive) {
        this.keepAlive = true;
        env.Motion.add(() => { if (!this.busy) this.keepAlive = false; return this.busy; });
      }
    },
    /* a band of light crosses the board, left to right (called on a win) */
    winWave() {
      if (!this.ok || env.RM) return;
      this.wave = 0; this.waveX = -1e6; this.busy = true;
      if (!this.keepAlive) { this.keepAlive = true; env.Motion.add(() => { if (!this.busy) this.keepAlive = false; return this.busy; }); }
    },

    updateBottle(i) {
      const it = this.items[i], r = this.rects[i], slot = env.slots[i];
      if (!it || !r || !slot) return;
      const sh = it.sh, sx = r.w / 100, sy = r.h / sh.vbH;
      const pose = env.poses[i];
      const lift = !pose && slot.el.classList.contains('selected') && !env.locked.has(i) ? -r.w * 0.22 : 0;
      const tx = pose ? pose.tx : 0, ty = (pose ? pose.ty : 0) + lift;
      const rot = pose ? pose.a : 0, scale = pose && pose.scale != null ? pose.scale : 1;
      /* bottles in flight pass in front of their neighbours */
      const flying = env.flyingSource(i);
      it.root.position.set(r.x + tx + r.w / 2, -(r.y + ty + r.h / 2), flying ? r.w * 4 : 0);
      it.body.rotation.z = -rot;
      it.body.scale.set(sx * scale, sy * scale, sx * scale);

      const gu = it.glassMat.uniforms;
      hexRgb(rimHex(env.RIM_COLOR), tmp3); gu.uRim.value.set(tmp3[0], tmp3[1], tmp3[2]);
      if (env.frozen.has(i)) gu.uTint.value.set(0.67, 0.88, 1.0, 0.32);
      else if (env.veiled[i]) gu.uTint.value.set(0.19, 0.1, 0.35, 0.35);
      else gu.uTint.value.set(0, 0, 0, 0);

      this.updateLiquid(i, it, rot);
      const lu2 = it.liquidMat.uniforms;

      /* selection glow in the top colour */
      const segs = env.visual[i] || [], topSeg = segs.length ? segs[segs.length - 1] : null;
      let units = 0; for (const sg of segs) units += sg.u;
      const topHex = !topSeg ? null : (env.hiddenDepth[i] || 0) >= units - 1e-6 ? env.HIDDEN_FILL[0] : env.COLORS[topSeg.c][0];
      if (lift && topHex) { hexRgb(topHex, tmp3); gu.uGlow.value.set(tmp3[0] * 0.5 + 0.5, tmp3[1] * 0.5 + 0.5, tmp3[2] * 0.5 + 0.5, 0.75); }
      else gu.uGlow.value.w = 0;

      /* pour impact: strength follows the stream, then fades */
      let hit = 0, hitX = it.impactX || 0;
      const into = env.jobsInto(i);
      if (into) for (const job of into) if (job.flowD > 0.05 && job.streamFx) { hit = Math.max(hit, Math.min(1, job.flowD * 2)); hitX = (job.streamFx.tx - r.x) / sx - 50; }
      it.impact = this.live ? Math.max(hit, (it.impact || 0) * Math.exp(-this.dt * 4.5)) : 0;
      if (it.impact < 0.02) it.impact = 0; else this.busy = true;
      it.impactX = hitX;
      lu2.uImpact.value.set(hitX, it.impact, this.time);

      /* completion flash rides the lid's fall */
      const ck = env.corks[i];
      if (ck && ck.t > 0 && ck.t < 1) lu2.uFlash.value.set(Math.sin(Math.PI * ck.t), ck.t); else lu2.uFlash.value.set(0, 0);

      /* win wave position in this bottle's own units */
      const sheen = this.wave >= 0 ? (this.waveX - (r.x + r.w / 2)) / sx : 1e6;
      gu.uSheen.value = sheen; lu2.uSheen.value = sheen;

      /* Neon: additive halo behind the vessel in its top colour, plus a shelf reflection */
      const neon = env.SKIN === 'neon' && !!topHex;
      it.bloom.visible = it.shelfGlow.visible = neon;
      if (neon) {
        const gs = env.activeRenderProfile().glowStrength;
        it.bloomMat.color.set(topHex);
        it.bloomMat.opacity = 0.34 * gs; it.shelfMat.color.set(topHex); it.shelfMat.opacity = 0.5 * gs;
      }

      if (it.lid) {
        const c = env.corks[i];
        it.lid.visible = !!c && c.t > 0;
        if (it.lid.visible) {
          const p = env.corkPose(c.t, env.corkBodyW(sh)), lu = it.lidMat.uniforms, L = env.LID;
          it.lid.position.y = -p.off;
          lu.uAlpha.value = p.alpha;
          hexRgb(L[0], tmp3); lu.uA.value.set(tmp3[0], tmp3[1], tmp3[2]);
          hexRgb(L[1], tmp3); lu.uB.value.set(tmp3[0], tmp3[1], tmp3[2]);
          hexRgb(L[2], tmp3); lu.uC.value.set(tmp3[0], tmp3[1], tmp3[2]);
          hexRgb(L[3], tmp3); lu.uTop.value.set(tmp3[0], tmp3[1], tmp3[2]);
        }
      }
    },

    /* Same band maths as CanvasRenderer.drawLiquid: cut lines from area, in
       the surface frame (bottle tilt − slosh). */
    updateLiquid(i, it, rot) {
      const segs = env.visual[i] || [], u = it.liquidMat.uniforms, sn = it.sn;
      const cums = this._cums || (this._cums = []), cols = this._cols || (this._cols = []);
      cums.length = 0; cols.length = 0;
      let total = 0;
      for (const seg of segs) { if (seg.u <= 0.001) continue; total += seg.u; cums.push(total); cols.push(seg.c); }
      const m = cums.length;
      it.liquid.visible = m > 0;
      if (!m) { u.uCount.value = 0; return; }
      const body = env.bodies[i];
      const alpha = rot - (body ? body.phi : 0);
      const lv = env.PourPhysics.levelsFor(sn, alpha, cums);
      const ca = Math.cos(alpha), sa = Math.sin(alpha);
      u.uCS.value.set(ca, sa);
      const hid = Math.min(env.hiddenDepth[i] || 0, total);
      const allHidden = hid >= total - 1e-6;
      let unitLv = null;
      if (hid > 0.001) {
        const units = this._units || (this._units = []);
        units.length = 0;
        for (let k = 1; k <= Math.ceil(hid - 1e-6); k++) units.push(Math.min(k, hid));
        unitLv = env.PourPhysics.levelsFor(sn, alpha, units);
      }
      const hidTop = unitLv ? unitLv.tops[unitLv.tops.length - 1] : Infinity;
      /* layers, bottom first: the hidden block (if any), then every visible run */
      let count = 0;
      const push = (top, pair, tint, elem) => {
        if (count >= MAX_LAYERS) return;
        u.uTops.value[count] = top;
        u.uElem.value[count] = elem ? ELEMENT_ID[elem] : 0;
        hexRgb(pair[0], tmp3); if (tint) blend(tmp3, tint);
        u.uLight.value[count].set(tmp3[0], tmp3[1], tmp3[2]);
        hexRgb(pair[1], tmp3); if (tint) blend(tmp3, tint);
        u.uDark.value[count].set(tmp3[0], tmp3[1], tmp3[2]);
        count++;
      };
      if (allHidden) push(lv.tops[m - 1], env.HIDDEN_FILL, null);
      else {
        if (hid > 0.001) push(hidTop, env.HIDDEN_FILL, null);
        for (let j = 0; j < m; j++) {
          if (cums[j] <= hid + 1e-6) continue;
          const elem = env.save.symbols ? null : env.ELEMENT_MAP[cols[j]];
          push(lv.tops[j], env.COLORS[cols[j]], elem ? ELEMENT_TINT[elem] : null, elem);
        }
      }
      u.uCount.value = count;
      u.uBot.value = lv.yb - 2;
      u.uTime.value = this.time;

      /* live surface */
      const span = lv.span || { xl: lv.x0, xr: lv.x1 };
      u.uSpan.value.set(span.xl, span.xr);
      const upright = Math.max(0, Math.min(1, 1 - Math.abs(rot) / 0.35));
      u.uUpright.value = upright;
      u.uMeniscus.value = env.Fluid.MENISCUS;
      const sample = upright > 0 && env.Fluid.active() ? env.Fluid.sample(i) : null;
      if (sample) {
        const hN = Math.min(WAVE_N, sample.h.length);
        for (let k = 0; k < hN; k++) u.uWave.value[k] = sample.h[k];
        u.uWaveN.value = hN;
      } else { u.uWave.value[0] = 0; u.uWaveN.value = 1; }
      const topY = lv.tops[m - 1], bodyW = env.corkBodyW(it.sh);
      const amp = body ? Math.min(body.ripple, Math.max(0, (lv.yb - 2 - topY) * 0.3)) : 0;
      u.uRipple.value.set(amp > 0.05 ? amp : 0, 2 * Math.PI / (bodyW * 0.85), body ? body.rphase : 0);

      /* emblems / numbers / '?' on the bottle axis (surface frame x = −y·tan α) */
      let dn = 0;
      const ta = Math.tan(alpha);
      const decal = (my, half, cell) => { if (dn < MAX_DECALS) u.uDecal.value[dn++].set(-my * ta, my, half, cell); };
      if (upright > 0.01) {
        if (env.save.symbols) for (let j = 0; j < m && !allHidden; j++) {
          if (cums[j] <= hid + 1e-6) continue;
          const yT = lv.tops[j], yB = Math.min(j ? lv.tops[j - 1] : lv.yb - 2, hidTop);
          if (yB - yT > 12) decal((yT + yB) / 2, 10, GLYPH.digit0 + cols[j]);
        }
        if (unitLv) for (let k = 0; k < unitLv.tops.length; k++) {
          const yT = unitLv.tops[k], yB = k ? unitLv.tops[k - 1] : lv.yb - 2;
          if (yB - yT >= 6) decal((yT + yB) / 2, 9, GLYPH.question);
        }
      }
      u.uDecalN.value = dn;
      if (env.SKIN === 'neon') u.uDeep.value.set(0.07, 0.03, 0.16); else u.uDeep.value.set(0.15, 0.09, 0.04);
    },

    /* Aliquot stream as a lit ribbon: same centreline and width profile as
       CanvasRenderer.drawStream, in stage pixels. */
    updateStreams() {
      const jobs = env.jobs;
      let used = 0, dropN = 0;
      const dpos = this.drops.geometry.attributes.position, dcol = this.drops.geometry.attributes.color;
      let dropR = 2;
      for (const job of jobs) {
        const pair = env.COLORS[job.color];
        if (job.drops && job.drops.length) {
          hexRgb(pair[0], tmp3);
          for (const d of job.drops) {
            if (dropN >= MAX_DROPS) break;
            dpos.setXYZ(dropN, d.x, -d.y, this.rects[job.di] ? this.rects[job.di].w * 2 : 100);
            dcol.setXYZ(dropN, tmp3[0], tmp3[1], tmp3[2]);
            dropR = d.r; dropN++;
          }
        }
        const st = job.streamFx;
        if (!st || job.dstDone || st.ty <= st.sy) continue;
        const sx = st.sx, sy = st.sy, ex = st.tx, ey = st.ty, s = job.s, tp = job.t - job.T1;
        const cx = sx + s * job.w * 0.16, cy = sy + (ey - sy) * 0.08;
        let mesh = this.streams[used];
        if (!mesh) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((STREAM_N + 1) * 6), 3));
          const side = new Float32Array((STREAM_N + 1) * 2), idx = [];
          for (let k = 0; k <= STREAM_N; k++) { side[2 * k] = 0; side[2 * k + 1] = 1; if (k < STREAM_N) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2); }
          g.setAttribute('side', new THREE.BufferAttribute(side, 1));
          g.setIndex(idx);
          mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: STREAM_VERT, fragmentShader: STREAM_FRAG,
            uniforms: { uLight: { value: new THREE.Vector3() }, uDark: { value: new THREE.Vector3() } }
          }));
          mesh.frustumCulled = false; mesh.renderOrder = 1;
          this.scene.add(mesh);
          this.streams[used] = mesh;
        }
        const pos = mesh.geometry.attributes.position;
        const z = this.rects[job.di] ? this.rects[job.di].w * 2 : 100;   /* in front of the receiver's liquid, behind the flying source */
        let any = false;
        for (let k = 0; k <= STREAM_N; k++) {
          const uu = k / STREAM_N, iu = 1 - uu;
          const x = iu * iu * sx + 2 * iu * uu * cx + uu * uu * ex, y = iu * iu * sy + 2 * iu * uu * cy + uu * uu * ey;
          let dx = 2 * iu * (cx - sx) + 2 * uu * (ex - cx), dy = 2 * iu * (cy - sy) + 2 * uu * (ey - cy);
          const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          const e = tp - job.tf * Math.sqrt(uu);
          const f = e > 0 && e < job.T2 ? env.flowN(e / job.T2) : 0;
          /* a touch wider than the 2D ribbon: the shader spends the outer fifth on a soft edge */
          const hw = f > 0 ? job.maxW * Math.sqrt(f) * (1 - 0.3 * uu) * 0.6 : 0;
          if (hw > 0.2) any = true;
          pos.setXYZ(2 * k, x - dy * hw, -(y + dx * hw), z);
          pos.setXYZ(2 * k + 1, x + dy * hw, -(y - dx * hw), z);
        }
        mesh.visible = any;
        if (!any) continue;
        pos.needsUpdate = true;
        hexRgb(pair[0], tmp3); mesh.material.uniforms.uLight.value.set(tmp3[0], tmp3[1], tmp3[2]);
        hexRgb(pair[1], tmp3); mesh.material.uniforms.uDark.value.set(tmp3[0], tmp3[1], tmp3[2]);
        used++;
      }
      for (let k = used; k < this.streams.length; k++) this.streams[k].visible = false;
      this.drops.geometry.setDrawRange(0, dropN);
      this.drops.visible = dropN > 0;
      if (dropN) { dpos.needsUpdate = true; dcol.needsUpdate = true; this.drops.material.size = Math.max(3, dropR * 2.4); }
    }
  };

  /* the runtime keeps the rim as a CSS rgba() string; the shader wants rgb */
  const rimCache = new Map();
  function rimHex(css) {
    let hex = rimCache.get(css);
    if (!hex) {
      const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(css);
      hex = m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : '#ffffff';
      rimCache.set(css, hex);
    }
    return hex;
  }
  function blend(rgb, tint) { for (let k = 0; k < 3; k++) rgb[k] += (tint[k] - rgb[k]) * tint[3]; }

  return Gl;
}
