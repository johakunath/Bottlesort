# Vessel — Backlog

## Shipped — Aliquot mechanics port (pour physics, cork, sound, input)

Ported from `reference/aliquot.html` (mechanics only; Vessel keeps its look).

- **Timing:** travel 240–420 ms by distance, pour 160 ms + 100 ms/layer, return 280 ms. Normal quality targets 60 FPS.
- **Sound:** `AudioFX` runs on Aliquot's graph (master → compressor, delay send for bells, one noise buffer). Pour is a live voice whose pitch follows the receiver's fill. The cork pop climbs a pentatonic scale per completion. There is a new `land` thud. Mute ramps the master gain; the context suspends while the page is hidden.
- **Cork:** drawn in the bottle's own frame (canvas) or as an animated SVG group. It drops when the receiver finishes filling; pop, haptic, ripple and sparkles fire on contact. The DOM `.cap` is gone.
- **Physics:** `src/pour-physics.js` (unit-tested) gives volume-true bands at any tilt and the tilt at which liquid meets the lip. Canvas draws bands in the surface frame. The pour is an Aliquot-style job: lip anchored over the receiver, clearance against its outline, tapered stream with a detaching tail, fill delayed by the fall, slosh oscillator driven by pose acceleration.
- **Input:** taps commit instantly; animations queue per bottle (`src/pour-queue.js`) and independent pours run in parallel. Undo, restart, hint and menu fast-forward pending pours.

### Left / follow-ups
- **Real-device check:** 60 FPS on a mid-range Android is unverified. Headless Chromium with 4× CPU throttle shows the same native raster cost as before the port; JS per frame stays small (see PR #35).
- **Headspace (decision needed):** the brief asked for capacity at the shoulder and a 35–50° full-bottle start angle. With Vessel's narrow necks these conflict: shoulder caps give 60–79°. Shipped caps are in the upper neck (classic 37, tall 33, flask 33) for 41–43°. Change `SHAPE_GEO.cap` in `src/pour-physics.js` if the look matters more.
- **SVG fallback** still uses its old tilt heuristic for liquid (not volume-true). Its stream follows the lip, and it has no slosh oscillator.
- **Colour-blind symbols:** not ported; the `symbols` setting was removed earlier. Element emblems follow the new band geometry.
- **Frozen timing:** frozen bottles thaw when the completing pour lands (as before), so a very fast tapper can hit a still-frozen bottle once.
- **QA:** `scripts/qa-rapid-tap.mjs` (Playwright, manual) covers rapid taps, undo mid-pour and the win path. `?slowmo=N` slows board motion for inspection.

## Top — single "fake 3D" liquid top (meniscus cue)

Deferred from the mobile-stabilization pass. We removed the per-band dark
surface ellipses for colour readability, so static (fluid-off) liquids now read
flat. Add back **exactly one** cheap fake-3D cue: a subtle curved **meniscus /
"curdle" at the top of the topmost visible band** — a thin convex cap that hints
at a rounded surface, without the dark line that made colours ambiguous.

Scope / constraints:
- One effect only. No per-band lines, no gradients that darken the colour, no
  extra DOM churn per frame.
- Static bottles only: when liquid flow is ON, the `Fluid` wave crest already
  provides the 3D top, so skip the static meniscus there (mutually exclusive).
- Keep it readable: light/translucent highlight, not a dark band. Should survive
  on small mobile screens and in both themes.

Where: `SvgRenderer.renderBottle()` in `src/game-runtime.js` — the top-band
highlight block that currently appends a single faint white ellipse on
`ellipses[last]` (guarded by `!topWave`). Replace/augment that one ellipse
with a slightly convex meniscus
(e.g. a shallow arc/clipped ellipse following `sh.surfRx`) rather than a flat
sliver. Reuse `sh.surfRx` and the existing `wob` offset; do not reintroduce the
removed `COLORS[c][0]` dark surface ellipses.

Acceptance: top of the liquid looks gently rounded (3D) in both themes; colours
stay unambiguous; no flicker; no measurable perf cost; fluid-ON path unchanged.

## In Progress — Visual Upgrade (Apothecary & Neon + WebGL fluid)

Phases 1–4 + most of Phase 5 are merged (PRs #4, #5). The remaining Phase 5 items
(Neon bloom, beat-sync, carry-slosh) and a first refraction pass are tracked in the
follow-up PR. The one genuinely large piece still open is the full refractive-glass
**renderer rewrite** (Phase 2, called out below). The design handoff (`Game Visual
Enhancement.zip`) ships two art
directions that coexist as selectable themes, plus a mandate to rebuild the
liquid/glass/pour motion properly in the engine. The codebase has a clean seam:
the pure game-logic layer (solver, level generation, pour rules, win detection) is
renderer-agnostic and stays untouched. Visual work is phased behind a renderer
abstraction with a permanent SVG fallback, so the game stays playable at every step.

### ✅ Phase 1 — themes, backdrops, glassware furniture, typography (shipped)
Apothecary (light/dark) + Neon Arcade as selectable skins on the existing SVG
renderer; old Dusk/Ocean/Candy/Galaxy themes retired; token-driven chrome; fonts,
palettes, glass tone, corks, parchment labels, backdrops. This renderer is the base
**and** the fallback for everything below.

### ◑ Phase 2 — WebGL lighting (shipped); refractive-glass renderer (remaining)
**Shipped:** a stage-wide WebGL canvas (`Glow`) that sums a soft radial glow per
bottle, coloured by the top liquid and tuned per theme (Neon bloom / Apothecary-dark
candlelight / Apothecary-light near-zero). Single full-screen-triangle fragment pass,
≤16 lights, premultiplied-additive, composited (screen) over the scene; reads slot
rects + `visual[]` live each frame; feature-detected with silent fallback to the CSS
per-bottle glow; honors reduced-motion.
**Also shipped (opt-in, Settings ▸ Glass reflections, beta):** a `Glass` WebGL pass
that rasterises each shape into a cylindrical normal map and adds a Blinn specular
glint from a slowly-orbiting light + a fresnel rim + a **chromatic edge-refraction**
term (wavelengths split by the sign of the surface normal at the silhouette), masked
to the silhouette and screen-composited over the SVG bottle. Per-bottle quads driven
by slot rects; default off so the proven look ships by default.
**Remaining — replace SVG glass pixels with a full refractive-glass renderer**
(the one large architectural piece still open; the chromatic edge above is a cue
layered on the SVG, not true light transport through rendered liquid):
- Introduce a `Renderer` seam (`init/setBoard/syncLayout/renderFrame/setTilt/setWobble/spawnPour/setTheme/destroy`) with `SvgRenderer` (current) + `GlRenderer` backends; factory picks GL when available, else SVG.
- Keep DOM slot `<div>`s as invisible hit-targets + layout drivers; the GL renderer reads `slots[i].slot.getBoundingClientRect()` each frame (the `Glow` layer already proves this pattern).
- Precompute per-shape mask + distance/normal texture (rasterize `interior`/`outline` path once per shape → JS distance transform), reused by every bottle of that shape.
- Refraction + specular glass shader; per-theme tint; context-loss handling → live swap back to `SvgRenderer`.
- Startup micro-bench → glass quality tiers (A full refraction / B spec+tint / C SVG) + a Settings "Glass quality" toggle; cap DPR ~2.
- Render the liquid bands + the height-field surface (already simulated in Phase 3) inside the GL glass instead of SVG.

### ✅ Phase 3 — per-bottle height-field fluid sim (shipped)
Per-bottle 1-D shallow-water surface (`Fluid`): one rAF loop integrates wave
propagation with damping so disturbances settle; `renderBottle` draws the top band's
lid as an animated wave `<path>` with a wall-climbing meniscus + crest highlight,
lower bands static. Slosh on select/invalid; splash + settle on pour (source &
receiver). Gated by the "Liquid motion" setting (default on); tilt/reduced-motion
fall back to the prior ellipse. Sims reset per board.

### ✅ Phase 4 — pour physics (shipped)
Cork-pop: gameplay bottles (Apothecary) now include a `.cork-g` SVG group; CSS
transitions on `.slot.pouring` animate the cork upward on pour start, back on
return. Arc stream: the old vertical `.stream` div replaced with an inline SVG
`<path>` quadratic-bezier arc (glow halo + coloured gradient core + highlight
streak) from the tilted bottle lip to the receiver surface. Steam: a `.steam-wisp`
div rises from the open mouth during the pour (Apothecary only). Landing: two
`.pour-ripple` rings expand on the receiver surface; `Fluid.drop()` injects a
splash impulse at pour-start.

### ✅ Phase 5 — Neon polish + extras (shipped)
- Per-liquid bubble density: citron/aqua bands spawn 3 fast-rising bubbles;
  amber/violet/mocha spawn 1 slow bubble; others 2 medium — driven by `DENSITY`/`SPEED`
  lookup tables on the top liquid colour index.
- Gameplay parchment labels: Apothecary gameplay bottles display the decorative
  parchment label (CSS-hidden on Neon, robust to runtime theme switches).
- Themed win flash: `#flash` overlay colour switches — Neon magenta, Apothecary-dark
  amber candlelight, Apothecary-light warm cream.
- Carry-acceleration slosh: two `Fluid.slosh()` impulses during the pour lift arc.
- **Neon bloom:** the `Glow` shader now sums a tight core + a wide halo lobe (gated by
  `uHalo`, on only for Neon) for a soft synthwave bloom around each tube.
- **Neon "sort to the beat" rhythm mode** (`Beat`): a 96 BPM clock pulses the grid +
  horizon (`#backdrop.beat-hit`) and the Glow (`Glow.pulse`) on each beat; pours that
  land within ±0.18 of a beat build a combo shown in a HUD chip. Settings toggle
  (Neon-only row); save flag default off; combo resets per board. Silent no-op off-Neon
  so puzzle logic is never gated by rhythm.

**Beat-sync follow-ups (future):** quantise/lock pour availability to the beat as a
harder "rhythm challenge" variant; load an actual music track and derive BPM from it;
score/leaderboard for longest combo.

---

## High Priority

### Cloud Save / User Accounts
**Goal**: Let players resume progress across devices and browsers.

**Approach options**:
1. **Anonymous + upgrade flow** (recommended first step)
   - Assign each new player a random UUID (stored in localStorage)
   - Sync progress to a lightweight backend (Supabase or Cloudflare KV) keyed by UUID
   - Later: offer "claim your account" with email/magic link to persist UUID across devices
2. **OAuth only** (simpler backend, but higher friction on first visit)
   - Sign in with Google / Apple — no password
   - Progress tied directly to the social account

**Data to sync**: `vessel_save_v1` JSON blob — progress per level/difficulty, streaks, achievements, rush best, theme unlocks.

**Notes**:
- Keep localStorage as the primary write path; backend syncs async in the background
- Conflict resolution: take the save with the higher total stars
- Daily streak must be timezone-aware on the server side
- No account = full gameplay, no data loss on current device

---

## Medium Priority

- **PWA / install to homescreen** — add `manifest.json` + service worker for offline play and install prompt
- **Haptic patterns** — richer vibration choreography on pour/cap/win (currently single buzz)
- **Colorblind mode** — shape symbols per color overlaid on liquid segments (foundation already exists via `save.symbols`)
- **Level editor / share** — generate a shareable link for custom boards (encode seed in URL hash)
- **Global leaderboard** — daily challenge streak rankings; rush stage high scores

## Low Priority / Ideas

- Sound design pass — replace Web Audio tone generators with proper sampled SFX
- Animated bottle fill on level load (liquid "pours in" from above)
- Seasonal themes (winter frost, summer heat) unlocked by streak
- Accessibility: full keyboard navigation for desktop
