# Mobile, collision and supply feedback checkpoint

Date: 2026-10-20 UTC. Parent GitHub commit: `10cbc25d30af58a401a9797de443e19ea99fb94d`.

## Changes

- Server-owned 56-unit magnet range and matching guide on every device; pickup remains authoritative.
- Shared 98 x 68 oriented vehicle body with swept SAT collision and a release gap. Artwork and fallback match on desktop and phone.
- Compact lobby art bounds, wrapping names, scroll access, and a shared HUD action row for small embedded-browser viewports.
- Natural supply contracts at 0/25/50/75 seconds to outer radii 470/340/230/140. Existing outer natural resources migrate while IDs/counts are conserved; collision drops stay put. Five-second next-zone warning and final banking label are server-driven.

## Fresh final verification

- `cd client && npm test`: 107 tests passed, zero failed/skipped.
- `cd client && npm run build`: TypeScript and Vite production build passed. Existing large Phaser chunk warning remains.
- `server/test.sh`: 13 Lua test files and real WebSocket regressions passed.
- `node --check client/tests/mobile-layout.browser.mjs` and `node --check client/tests/multi-room.browser.mjs`: passed.
- `git diff --check`: passed.

Built JavaScript: `index-CC1itqyc.js`, SHA-256 `9fb91d7cc37cc22f40aa35494d6698d862602071c954aa98ceeb57124bebb69d`.
Built CSS: `index-X70QzK9L.css`, SHA-256 `bdb5b131c811e883f76b56fffa416e93245ccc0640cd224518bf8015f9a03caf`.

## Pending Mac/device acceptance

Browser scripts were not successfully executed in the cloud: Chromium launch was blocked by sandbox restrictions. No visual, touch, device FPS or production deployment acceptance is claimed here.

With Playwright available, start Vite on localhost:5173 from `client`, then run there:

```
BROWSER_EXECUTABLE=/path/to/chromium node tests/multi-room.browser.mjs
BROWSER_EXECUTABLE=/path/to/chromium node tests/mobile-layout.browser.mjs
```

Both scripts use deterministic WebSocket fixtures, not a live game server. Verify real iPhone 13 mini embedded-browser portrait/landscape separately, including eight-player names/art, Return Lobby versus ranking/settings, 320px supply caption, current/next supply circles, and two-player pickup/collision feel. Real multiplayer and a 100-second round should be checked after authorized Mac deployment. Build output and incidental runtime logs are excluded from this commit.
