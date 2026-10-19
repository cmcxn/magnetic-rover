# Mobile HUD and second-finger boost (2026-10-19)

## Root cause and change

- The centered absolutely positioned HUD had no explicit width. Shrink-to-fit sizing on narrow screens compressed the Chinese label columns; fixed gaps/padding and wrapped cargo text inflated its height into the independently positioned leaderboard.
- The existing floating joystick rejected every additional field touch; only the dedicated boost button could queue a dash.
- Narrow, coarse-pointer and short-landscape layouts now use an explicit edge-constrained 52px three-column HUD, nonwrapping labels/numbers, safe-area offsets, and compact boost control. Ranking/settings are collapsed initially; only one can expand. Settings padding intercepts touches as well as its buttons. RTT remains visible. Desktop panels remain visible.
- The first field touch owns driving. A second concurrent field touch requests a single boost; movement/repeated pointer events and third field fingers cannot repeat it. UI touches do not enter the field listener. Cooldown/stun block requests. Second-finger up preserves its queued tap; cancellation discards it. First-finger release stops driving and discards queued boost; held remaining field fingers cannot be promoted or start a new gesture until all lift. Blur, hidden page, resize/orientation, disconnect, phase changes and reconnection clear stale state.
- Scoring and server gameplay rules are unchanged. No deployment performed.

## Verification

- `cd client && npm test`: 63/63 passing. Includes real-handler VM tests for multi-pointer ownership, single taps versus concurrent taps, interruption, cooldown/stun, reconnect and assistive button activation; structural CSS checks and menu behavior checks.
- `cd client && npm run build`: strict TypeScript and production Vite build pass. Existing large-chunk warning remains (Phaser bundle).
- New tests demonstrated failure before HUD/second-touch fixes; settings-padding interception test failed before its correction.
- `client/tests/mobile-layout.browser.mjs` is a repeatable optional real-client Chromium test against a deterministic WebSocket fixture. It covers 320x640, 375x667, 390x740, 430x820, 740x390, 844x390 and desktop 1200x800. It checks compact geometry, non-overlap and viewport safe-area bounds, hidden defaults, RTT, hit-testing of expanded panel padding and desktop visibility, and writes screenshots.

## Explicit limits

Chromium could not start in this cloud execution sandbox: socket creation was blocked. The permitted elevated retry failed during environment setup (read-only mount). The browser safe-area assertions use the device/browser reported insets (normally zero in desktop emulation); nonzero notch/home-indicator validation still needs a real device. No browser screenshots were produced, no real rendered-layout pass is claimed, and no physical iOS/Android multi-touch/rotation acceptance has occurred. The user-supplied before screenshot was inspected. Run the optional browser script in a supported environment, then verify on an actual phone before calling mobile visual acceptance complete. No browser or computer on the user's Mac was used.
