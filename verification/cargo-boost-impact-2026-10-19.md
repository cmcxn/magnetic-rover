# Cargo, boost and impact verification — 2026-10-19

Cloud-only branch: `feat/cargo-boost-impact-feedback`.
Baseline: `3848ee1` (same source tree as deployed `f841a78`).
Implementation commits: `0e1b51a` server; `8642e7f` client.

## Verified

- `./server/test.sh`: all seven Lua suites and real two-client WebSocket integration pass.
- `cd client && npm test`: 45/45 pass.
- `cd client && npm run build`: TypeScript checks and Vite build pass.
- `git diff --check`: pass.
- New regressions first failed against missing behavior, then passed after implementation.

Server cases cover idle heading, locked moving/idle dash, forged angle/speed rejection,
exact 0.32-second dash integration, exact four-second cooldown readiness, disconnect
and stale-input cancellation, empty-cargo hits, stun input discard/recovery, swept
glancing contacts, simultaneous three-car collision order, safe stations, knockback
arena/station boundaries, no knockback attack chains, protected recovery, finish
freeze/rematch reset, capacity20, preserving full/overflow ground resources and
resuming pickup after released capacity. Real WebSocket tests cover idle dash,
forged fields, cooldown spam, hit sequence and stun movement/boost rejection.

Client cases cover each cargo1–20, exact numbers visible only for self, hit sound
without cargo, short faded boost sound, one-second notice expiry/countdown/input
suppression, reduced-motion preference/override, guarded 25ms vibration, brief
shake, authoritative flame, and no retained flame after finish, disconnect or
stale snapshots. Effects expire after 500ms without a new state.

## Review corrections

- Finish-state gate prevents frozen final boost from animating through results.
- Disconnect disables transient effects without discarding identity/progress;
  stale state also times out effects and cancels camera shake.
- Cooldown floating-point epsilon fixed for exactly 80 × 0.05s readiness.

## Limits

No browser screenshot or physical-phone playtest was obtained in this task.
Tests exercising renderer/audio use simulated browser dependencies, not visual
or acoustic acceptance. Native vibration is best-effort and browser/device dependent.
Existing npm proxy-environment and Vite large-Phaser-chunk warnings remain.
No deploy, GitHub push or user-computer operation was performed by this worker.
