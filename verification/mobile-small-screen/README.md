# Small-screen layout regression repair

Baseline: local d608c71, exact deployed 10cbc25 tree 8601b829d47e304747f3785a9e1c295680a116c7.

## Evidence and cause
- Inspected user images IMG_0075.png and 69.jpeg. Embedded-browser bars reduce available viewport height; wheel artwork paints over lobby names, and Return Lobby covers match action buttons.
- At portrait heights <= 640px the old CSS shrinks the art slot to 28px without reducing the 0.55 transformed car and its pseudo-element wheel shadows. Landscape similarly uses a 26px slot. Bounding boxes of name elements alone cannot detect this painted overlap.
- Return Lobby and menu toggles previously had independent absolute top/right positions.

## Fix
- Reserve 52px for portrait art and 36px at 0.38 landscape scale, independently of viewport height.
- Explicit max-content grid rows retain natural content size. Long names wrap. The panel retains vertical scrolling when embedded chrome or enlarged text leaves insufficient space.
- Ranking, settings and Return Lobby share one flex row. Status has reserved width, and FPS/RTT can wrap on narrow phones. Expanded menus open below the status/action row. Desktop and spectator actions remain available.

## Verification
- Final combined client Node suite: 107/107 passed after all UI, pickup, body-collision and supply changes were released.
- Two new structural regression cases fail against deployed CSS and pass against fixed CSS.
- TypeScript and Vite production build passed.
- Browser scripts were syntax-checked and expanded, but **not executed successfully in this environment**. Chromium launch is blocked by sandbox socket restrictions; escalation fails before execution. Cloud browser cannot reach workspace localhost (ERR_CONNECTION_REFUSED). No iPhone/WebKit validation is claimed.

## Browser QA still required
Run Vite on 127.0.0.1:5173 in an environment where Chromium is usable, then:
- `BROWSER_EXECUTABLE=/path/to/chromium node tests/multi-room.browser.mjs`
- `BROWSER_EXECUTABLE=/path/to/chromium node tests/mobile-layout.browser.mjs`

Matrix: 2/8 players, widths 320/375/390/740/812/844/1200, reduced 375x520/560/635 and 812x280/320, plus enlarged text, portrait and landscape. Lobby tests include transformed wheel-shadow bounds, readable names/statuses, 44px buttons, horizontal overflow and reachability by scrolling. HUD checks include Return Lobby, FPS/RTT, menu hit targets and mutual overlap. Follow with real iPhone13 mini embedded-browser QA.
