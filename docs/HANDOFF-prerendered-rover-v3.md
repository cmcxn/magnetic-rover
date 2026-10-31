# Local Codex / playtest handoff

Branch: `feat/prerendered-rover-v3`. This branch is for review/playtesting; it does not merge `main` or deploy production.

## Get and validate

```sh
git fetch origin feat/prerendered-rover-v3
git switch feat/prerendered-rover-v3
cd client
npm ci
npm test
npm run build
cd ..
python3 -m unittest discover -s art/battery-v3 -p test_runtime.py
python3 -m unittest discover -s art/recycling-station-v3 -p test_directions.py
python3 art/rover-v3/validate.py
python3 -m unittest discover -s art/rover-v3 -p 'test_*.py'
node --test minigame/tests/*.test.mjs
node minigame/build.mjs
```

Use a current Node version that supports the repository's direct `.ts` test imports (cloud validation uses Node24). Python asset checks need Pillow. The existing client dependencies and lockfile remain unchanged.

## Play and inspect

Run the existing local backend workflow from `README.md`, then `cd client && npm run dev`. No server/protocol/gameplay code changed in this visual branch.

A backend-free visual fixture is also available while Vite runs:

- `/rover-visual-fixture.html?w=390&h=844`
- `/rover-visual-fixture.html?w=844&h=390`
- `/rover-visual-fixture.html?w=1200&h=800&grid=1`
- Append `&fallback=1` to inspect the old-art fallback.

The fixture uses the real shared `World` renderer with synthetic snapshots. Its controls cover headings, palettes, cargo, movement, reduced effects, removal/reset and timing samples. It is not evidence of live-server networking or device performance.

The full Chromium viewport sweep passed120captures at390×844,844×390 and1200×800 after correcting the harness for Vite's CommonJS import alias. See `verification/prerendered-rover/headless-summary.json`. This does not establish native WeChat, real-phone/touch performance or live-backend correctness.

For automated full-browser viewport testing, install Playwright in your local tooling environment and run:

```sh
BASE_URL=http://127.0.0.1:5173 BROWSER_EXECUTABLE=/path/to/chromium node client/tests/rover-visual.browser.mjs
```

Import the existing `minigame` project in WeChat Developer Tools after building. Validate portrait/landscape as applicable, fresh load, asset failures, reconnect, collection/deposit, and real-device performance. The cloud environment has no WeChat Developer Tools or physical phone; those checks remain for local acceptance. The package-size script checks the main package threshold and reports resource bytes; it does not establish all current WeChat upload limits.

## Visual scope

- One source rover model, eight fixed accent palettes,16screen-uniform headings.
- White shell/dark rubber and fixed red-N/blue-S magnet; themed hubs and lights.
- Real front vertical-axis steering poses and independent local-axle tread phases; signed longitudinal travel, reverse, stop/lateral guards, teleport/reset rebasing.
- Four lookup phases span one repeated tread period rather than four90-degree whole-wheel rotations (which would alias repetitive geometry).
- Existing cargo cell/count logic retained and registered to a projected roof plane. No new20-slot tray, capacity rules or battery gameplay.
- User additionally requested a3D recycling station and battery model. Three station views are now genuinely rerendered in 3D with entrances toward the arena center (33.69°,146.31°,−90° screen directions), selected by station position. The lower station’s inward door is naturally occluded by its body. Deposit radii are unchanged. The new battery now replaces ground/airborne pickup artwork with calibrated root and uniform aspect; existing cargo artwork/counts stay unchanged.

## Editable sources and reproducibility

- `art/rover-v3/`: editable `.blend`, CLI renderer, packer, validator, schema and asset README.
- `client/public/assets/cartoon/rover-v3/`: production PNG/JSON atlases and manifest.
- `art/recycling-station-v3/`: station source/build script and provenance.
- `art/battery-v3/`: battery source/build script/preview plus reproducible runtime exporter.
- `verification/prerendered-rover/`: actual production asset sheets, browser evidence and limitations.

Keep generated dependency directories, `dist`, Blender backups and intermediate render batches out of Git. See asset READMEs for exact regeneration commands and measured download/texture footprints.

## Mini-game resource budget note

Do not confuse WeChat mini-program and mini-game subpackage rules. Current engine-publisher guidance for mini-games lists a4M main package and30M total, without a separate cap on one ordinary subpackage: [Cocos3.8](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/subpackage.html#微信小游戏), [Galacean](https://galacean.antgroup.com/engine/docs/platform/wechatMiniGame/). Direct WeChat/account-specific validation remains a local Developer Tools check. The branch retains the existing resource-subpackage loader unless measured totals require a change; no speculative package splitting is introduced.

Minor source-file caveat: the station/battery `.blend` files retain their original cloud output path. Opening/editing their geometry works; set a local Output path before a manual render/save. The supplied portable generators compute paths from their local location and are the recommended reproducible render route. The rover source uses a relative output path.

## Station/battery follow-up

The current branch includes the subsequently requested runtime battery replacement and three inward-facing stations. Run the focused real-World browser test while Vite is running:

```sh
BASE_URL=http://127.0.0.1:5173 BROWSER_EXECUTABLE=/path/to/chromium node client/tests/station-battery.browser.mjs
```

This checks all three stations together, new pickups, server-height/ground-shadow separation, station ordering/map scaling, legacy fallback and unchanged 20-cell cargo rendering using synthetic snapshots. See `verification/station-battery-v3/` for captured browser evidence. It does not substitute for live-server collection/deposit or native WeChat/phone acceptance.

The four additional 256×256 PNGs total 306,698 bytes downloaded and 1 MiB decoded RGBA (before driver overhead; legacy fallbacks remain). The rebuilt mini-game reports 1,329 KiB main / 8,426 KiB art / 9,755 KiB total. The source generators now calibrate pivots after setting the square render aspect; this corrects the old station/battery metadata without changing model geometry.
