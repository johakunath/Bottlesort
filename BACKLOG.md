# Vessel — Backlog

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
