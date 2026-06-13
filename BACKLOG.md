# Vessel — Backlog

## In Progress — Visual Upgrade (Apothecary & Neon + WebGL fluid)

Tracked in PR #5. The design handoff (`Game Visual Enhancement.zip`) ships two art
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
glint from a slowly-orbiting light + a fresnel rim, masked to the silhouette and
screen-composited over the SVG bottle — live, tracking glass highlights. Per-bottle
quads driven by slot rects; default off so the proven look ships by default.
**Remaining — replace SVG glass pixels with a full refractive-glass renderer:**
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

### ◑ Phase 5 — Neon polish + extras (partially shipped)
**Shipped:**
- Per-liquid bubble density: citron/aqua bands now spawn 3 fast-rising bubbles;
  amber/violet/mocha spawn 1 slow bubble; others 2 medium — driven by `DENSITY`/`SPEED`
  lookup tables on the top liquid colour index.
- Gameplay parchment labels: Apothecary gameplay bottles now display the decorative
  parchment label in the lower body, consistent with hero bottles.
- Themed win flash: `#flash` overlay colour now switches — Neon gets magenta,
  Apothecary dark gets amber candlelight, Apothecary light keeps the warm cream.
**Remaining:**
- 2-pass bloom for Neon (glow = top band bright face; currently using the Gaussian
  radial Glow pass which already handles this reasonably).
- Beat-sync scaffolding for the "sort to the beat" Neon mode (quantize pours to a
  track; pulse grid on the beat; combo feedback).
- Richer carry-acceleration slosh: track slot screen-position deltas during the
  pour arc and inject proportional `Fluid.slosh()` impulses.

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
