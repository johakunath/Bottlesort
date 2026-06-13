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

### ⏳ Phase 2 — WebGL glass + refraction
**Goal:** replace SVG glass pixels with a stage-wide WebGL canvas; refractive +
specular glass shader; per-theme glass tint; neon bloom.
**Prep work:**
- Introduce a `Renderer` seam (`init/setBoard/syncLayout/renderFrame/setTilt/setWobble/spawnPour/setTheme/destroy`) with two backends: `SvgRenderer` (current code) and `GlRenderer`. Factory picks GL when available, else SVG. (Phase 0 of the plan — do first.)
- Keep DOM slot `<div>`s as invisible hit-targets + layout drivers; GL canvas reads `slots[i].slot.getBoundingClientRect()` each frame. One canvas, one context, one rAF.
- Precompute per-shape mask + distance/normal texture (rasterize `interior`/`outline` path once per shape → JS distance transform), reused by every bottle of that shape.
- WebGL bootstrap: context creation + loss handling → live swap back to `SvgRenderer`.
- Startup micro-bench → glass quality tiers (A full refraction / B spec+tint / C SVG) + a Settings "Glass quality" toggle; cap DPR ~2; honor reduced-motion (`RM`).
- Static liquid bands first (from `visual[i]` via existing `buildVolMap`/`volToY`), no sim yet.

### ⏳ Phase 3 — per-bottle height-field fluid sim
**Goal:** real meniscus, sloshing with momentum + damping, settling (not a looping
sine), rising bubbles per liquid type.
**Prep work:**
- `sim[i] = { h[], v[], level, targetLevel, tiltDeg, accel, bubbles[], meniscusK, colorTop }`; only the top surface is simulated, bands below stay static.
- Shallow-water update: `a[k] = c²·(h[k-1]−2h[k]+h[k+1]) − damping·v[k]`; tune `c`/damping for a settle.
- Track slot screen-position deltas to drive acceleration → slosh injection on lift/carry.
- Port tilt counter-rotation + lowest-point math from `renderBottle` so the surface stays gravity-level when the glass rotates; meniscus wall-climb bias at edge samples.
- Port the bubble model from the handoff `files/vessel-bottle.jsx` `Liquid` component.
- Replace `sloshBottle` with a damped settle driven by the sim.

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
