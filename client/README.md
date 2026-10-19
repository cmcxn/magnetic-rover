# Magnetic Rover browser client

Phaser 3 + TypeScript + Vite. Real Skynet WebSocket only; no local gameplay simulation, fake players, or offline fallback. Motion interpolation is visual only; positions, score, pickups, deposits and cooldown are authoritative snapshots.

## Run

- Install: `npm ci --cache /tmp/rover-npm-cache`
- Build: `npm run build`
- Development: `npm run dev -- --port 5173`
- Static production root: `client/dist`, served by backend on port 18080.
- Default socket: `ws://<current-host-and-port>/ws` (`wss` on HTTPS).
- Override with `?ws=ws%3A%2F%2Fhost%3A18080%2Fws` or the login screen's server setting. Saved server setting takes precedence after first use.

## Controls

WASD / arrows to drive; Space to boost. Optional mouse steering requires holding the pointer on the arena. On touch devices, drag anywhere on the game field to set a floating joystick. While holding that finger, tap the field with a second finger to boost once. UI taps are excluded; a third held field finger never triggers boost. Releasing the driving finger stops movement and discards queued boost; remaining fingers must lift before a new driving gesture. The small boost button remains available, including keyboard/assistive activation. Inputs send at 20Hz. Blur and document hiding clear inputs. Server-scoped guest tokens, nickname, colour and server address persist in localStorage; open a separate browser profile/incognito context to test a distinct player.

## Checks

`npm test` (Node 22+ TypeScript stripping) checks normalization, idle values, HTML escaping, exact six-colour allowlist, server URL validation/token isolation and shared-tie ranking. The additional VM-based connection-flow tests exercise actual client handlers (without pretending to be a browser render). `npm run build` runs strict TypeScript and Vite build. Browser visual/mobile playtest is separate: these unit tests do not establish actual device frame rate, touch feel, or browser rendering.

## Scope

CC0 Kenney Digital Audio sounds are included with source manifest and license under `public/assets/audio/`. Sound unlocks only on user interaction; failed loading stays silent, and a toggle is available in play.

Three independent generated transparent PNG sprites (rover, battery, recycle station) are loaded from `public/assets/sprites/`, with framed alpha padding and vector fallback. The procedural cream arena and mint/yellow palette reflect the supplied visual direction. No external fonts or image CDN required. Reconnect uses bounded 1–10 second exponential backoff and existing endpoint-scoped tokens, pauses while hidden, and resumes on foreground. Users can cancel automatic reconnect. Explicit join rejections stop retries, except an automatic reconnect can retry the exact live-guest conflict while the old socket finishes closing; backend determines retention and live-session conflict rules. HTTPS deployment needs a TLS WebSocket endpoint configured in server settings; this local prototype does not provide TLS.


## Network HUD and waiting

- Default HUD shows application WebSocket RTT measured by matching ping/pong IDs with `performance.now()`. One ping is sent at most every 2 seconds, only after admission or waiting acknowledgement, with one request outstanding. Samples expire after 5 seconds and are invalidated on hide, disconnect, or socket replacement. This includes application scheduling and transport delay; it is not pure wire latency.
- `?debug=1` adds separate render FPS and snapshot-arrival interval fields. Neither is used as RTT. Existing query parameters can use `&debug=1`.
- A server `waiting` response keeps the socket open and shows the server's estimated admission time. Full capacity without an ETA is explicitly unknown. The server admits automatically; the client never repeatedly sends `join`. Cancel waiting closes the connection and stops retrying.
- Finished snapshots may include `returnIn`; the results screen announces the automatic lobby return countdown.
- The garden background is rasterized once into a texture. Local visual smoothing uses a 25 ms catch-up divisor versus 65 ms for remote cars, and the follow camera uses the current smoothed position. This reduces added visual lag without predicting authoritative movement.
- Unit regressions cover RTT matching/expiry, hidden and old sockets, scoped reconnect, cancellation, waiting promotion/countdown, opt-in diagnostics, cached garden rendering, and camera alignment. They do not claim an end-to-end real-device latency improvement.

## Mobile HUD regression

Narrow/coarse-pointer/short-landscape layouts use a fixed-height three-column score/time/cargo strip. Ranking and settings start collapsed; RTT stays visible. All score and cargo values remain authoritative and unchanged.

`node tests/mobile-layout.browser.mjs` is an optional real Chromium check with Vite running on localhost:5173 and Playwright available. It uses a deterministic WebSocket fixture and checks 320/375/390/430 portrait, 740/844 landscape and 1200 desktop, writing screenshots to `/tmp/rover-mobile-layout` (override `SCREENSHOTS`). It does not test a live backend or physical touch hardware. This cloud session could not launch Chromium due to sandbox socket restrictions; structural CSS and handler tests passed, but visual/device acceptance remains pending.
