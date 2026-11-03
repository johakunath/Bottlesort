# Vessel — Liquid Sort

A browser puzzle game with four-unit small bottles and twelve-unit towers, three visual themes, Classic,
Daily, Rush, and reproducible shared challenges. Gameplay and hints run locally;
there is no model API or token usage during play.

## Run and verify

```sh
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:e2e
```

For an installed system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium` when
running `npm run test:e2e`. The browser suite builds and serves production on
port 4173. `npm run bake` regenerates and verifies all Classic seed offsets and
par values; commit `src/levels-baked.js` when level rules change.

`npm run build` produces `dist/`. Serve that directory at the origin root over
HTTPS (localhost works for development). Service workers are production-only.
After the first complete online load, the app caches its code, worker, icons,
and optimized backgrounds. New versions wait for **Update ready · reload**;
the current board is saved before reload. Installation uses the browser's
supported install UI; on iOS use Safari's Add to Home Screen.

## Code map for focused changes

| Area | Read/edit |
| --- | --- |
| Rules, generator, solver | `src/game-logic.js`, `src/levels-baked.js` |
| Liquid geometry and tilt | `src/pour-physics.js` |
| Bottle silhouettes and palettes | `src/bottle-design.js` |
| Responsive center grid and tower rails | `src/board-layout.js` |
| Canvas / SVG drawing | `src/canvas-renderer.js`, `src/svg-renderer.js` |
| Board lifecycle, input, animation, UI | `src/game-runtime.js` |
| Audio synthesis | `src/audio.js` |
| Defaults, migrations, optional storage | `src/storage.js` |
| Resume validation and challenge URLs | `src/session.js` |
| Background jobs and cancellation | `src/worker-client.js`, `src/puzzle-worker.js` |
| Offline cache, install/update flow | `vite.config.js`, `src/pwa.js` |
| Styling and accessible controls | `src/styles.css`, `index.html` |

Renderers receive an explicit adapter with live getters for board state and
callbacks for effects. They do not own save data or puzzle rules. Keep new
features in their owning module; use targeted searches and tests rather than
loading the entire runtime and historical backlog for every change.

## State and concurrency contracts

- Bottle arrays run bottom to top. Each has a `capacity` (4 or 12). Generators
  also emit a serializable `capacities` vector; cloning, worker messages, and
  session restore preserve it. Two 12-segment towers are mandatory in every mode.
- Each board includes eight additional units for each of two colors, enough
  to fill both towers. Winning requires both towers to be full and monochrome.
  A full small bottle can still pour into a tower. Style settings affect only small bottles.
- Two giant bottles always occupy the side rails.
  They span the play area and briefly scale down during transfer to stay visible
  on narrow screens. Full bottles fill into their shoulders, leaving neck headspace.
- A move commits immediately; visual pours queue per bottle. `snapshotBoard()`
  incorporates pending reveals/thaws so reload and undo never restore stale animation state.
- Board changes cancel hint workers. A revision check also rejects results already
  resolved before the change. Workers terminate on timeout, error, or replacement.
- Daily/Rush/shared generation runs in a worker. Classic uses baked seeds.
- `vessel_save_v1` contains validated progress/preferences; `vessel_session_v2`
  contains a separately validated unfinished puzzle. Storage-denied browsers remain
  playable but cannot retain data after closing/reloading the page.
- Number labels reveal only visible colors. Screen reader labels list visible
  layers bottom to top. Keyboard: arrows, Enter/Space, U (undo), R (restart), H (hint).
- Shared links use `#v=2` with bounded configuration. They share initial conditions,
  never the solution or personal progress. Imported links are consumed once so
  reloading offers Resume rather than restarting the challenge.
- Older `#v=1` links are upgraded to the tower rules. Saved progress and awards
  are retained, but unfinished v1 sessions must restart; the menu explains this once.
- Completed bottles play a finite sparkling spiral and keep a glow/Full badge.
  Reduced-motion users get the persistent marker without the animation. Undo
  and pouring out remove the marker. See `src/completion-effect.js`.
- `window.__vessel` is the manual QA interface; runtime dependencies use imports.

## Tests and assets

Unit tests cover rules, replay of solutions, volume conservation, queued-pour
ordering, save validation/reset isolation, session data, links, and worker
cancellation. Browser tests cover both renderers, hints during navigation,
reset, storage denial, resume/undo, sharing, colorblind concealment, mobile
layout, and offline worker execution. `scripts/qa-rapid-tap.mjs` supports manual
animated stress checks (see its header).

Original design images live under `design/original-backgrounds/`; only optimized
backgrounds ship in `public/assets/`. Current product work belongs in `BACKLOG.md`.
