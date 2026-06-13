# Vessel — Backlog

## In Progress — Visual Upgrade (Apothecary & Neon + WebGL fluid)

Tracked in PR #4. The design handoff (`Game Visual Enhancement.zip`) ships two art
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
**Remaining polish:** per-liquid bubble density/types ported from the handoff
`files/vessel-bottle.jsx` `Liquid` component; richer carry-acceleration slosh from
slot screen-position deltas during the pour arc.

### ⏳ Phase 4 — pour physics
**Goal:** cork-pop, gravity-driven arcing stream, droplets, splash + ripple,
conserved band-by-band transfer.
**Prep work:**
- Keep the logic half of `doPour` (legality + `applyPour`); rewrite only the visual half.
- Mirror the handoff `files/apo-scene.jsx` choreography/timings: cork-pop + steam → lift/carry/tilt (~70°, feeds `sim.accel`) → ballistic GL particle stream (gravity-integrated arc lip→mouth) → band-by-band transfer via existing `drainSnapshot`/`fillSnapshot` → splash impulse injected into the receiver's height-field + droplets + ripple ring → return + re-cork with damped settle.
- Apothecary game bottles gain animated corks (deferred from Phase 1 to avoid clashing with the completion-cap animation); reconcile the `.cap`/`.ring` "sealed" feedback with real corks.

### ⏳ Phase 5 — Neon polish + extras
**Goal:** finish the Neon direction and harden.
**Prep work:**
- 2-pass bloom (glow color = top band's bright face) instead of heavy refraction on Neon.
- Themed confetti/flash colors; per-skin reduced-motion paths verified.
- Beat-sync scaffolding for the requested Neon "sort to the beat" mode (quantize pours to a track; pulse glow/grid on the beat; combo feedback).
- Gameplay parchment labels on Apothecary bottles (Phase 1 kept game bottles clean to avoid obscuring liquid — revisit once the renderer can place them legibly).

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
