# Vessel backlog

This is the current tracker. `docs/historical-backlog.md` is archived history and
contains superseded designs; do not use it as an implementation specification.

## Completed in the current upgrade

- Permanent 12-segment screen-height towers in all modes; selectable small-bottle styles.
- Capacity-aware rules, solver, generator, physics, sessions, and completion effects.
- Higher full-capacity fill lines and giant side bottles with a responsive center grid.
- Colorblind numbers 1–9 in both renderers; hidden layers stay hidden.
- Validated saves, independent reset defaults, protected storage reads.
- Resume unfinished Classic, Daily, Rush, and shared puzzles with undo history.
- Cancellable module workers for hints and seeded board generation; no blocking fallback.
- All 90 Classic seeds baked and verified; frozen-state solver memoization preserves lock identity.
- Versioned challenge links and spoiler-free result sharing.
- Installable offline app with explicit update/reload control.
- Renderer, audio, bottle-design, storage, session, and worker modules; lint and browser regressions.

## Future work requiring product decisions

- Cross-device accounts and cloud save: requires a backend, identity, and conflict handling.
- Public competitive leaderboards: requires server-side verification.

## Device validation

- Test tactile response, installation, and audio interruption on physical iOS/Android devices.
- Measure frame timing and battery use on lower-end phones before adding richer glass effects.
