# Magnetic Rover browser client

Phaser 3 + TypeScript + Vite. Real Skynet WebSocket only; no local gameplay simulation, fake players, or offline fallback. Motion interpolation is visual only; positions, score, pickups, deposits and cooldown are authoritative snapshots.

## Run

- Install: `npm ci --cache /tmp/rover-npm-cache`
- Build: `npm run build`
- Development: `npm run dev -- --port 5173`
- Static production root: `client/dist`, served by backend on port 18080.
- Default socket: `ws://<current-hostname>:18080/ws` (`wss` on HTTPS).
- Override with `?ws=ws%3A%2F%2Fhost%3A18080%2Fws` or the login screen's server setting. Saved server setting takes precedence after first use.

## Controls

WASD / arrows to drive; Space to boost. Optional mouse steering requires holding the pointer on the arena. Mobile drag left joystick and tap right boost. Inputs send at 20Hz. Blur and document hiding clear inputs. Server-scoped guest tokens, nickname, colour and server address persist in localStorage; open a separate browser profile/incognito context to test a distinct player.

## Checks

`npm test` (Node 22+ TypeScript stripping) checks normalization, idle values, HTML escaping, exact six-colour allowlist, server URL validation/token isolation and shared-tie ranking. The additional VM-based connection-flow tests exercise actual client handlers (without pretending to be a browser render). `npm run build` runs strict TypeScript and Vite build. Browser visual/mobile playtest still required; the execution environment's Chromium sandbox launch is blocked, so no screenshot or interactive test is claimed.

## Scope

CC0 Kenney Digital Audio sounds are included with source manifest and license under `public/assets/audio/`. Sound unlocks only on user interaction; failed loading stays silent, and a toggle is available in play.

Three independent generated transparent PNG sprites (rover, battery, recycle station) are loaded from `public/assets/sprites/`, with framed alpha padding and vector fallback. The procedural cream arena and mint/yellow palette reflect the supplied visual direction. No external fonts or image CDN required. Reconnect is explicit via a reconnect button, with token reuse; backend determines retention and live-session conflict rules. HTTPS deployment needs a TLS WebSocket endpoint configured in server settings; this local prototype does not provide TLS.
