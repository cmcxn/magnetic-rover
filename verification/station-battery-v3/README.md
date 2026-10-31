# Runtime battery + all three inward stations

Actual production `World` in Chromium155,1200×900 browser viewport. **Focused browser assertions passed**,8screenshots inspected, errors[]. No standalone mockup or unmounted asset-preview claim.

## Two tracked images

- `arena-three-inward-stations-new-batteries.png`: all3stations,7newbattery pickups and the unchanged rover/cargo20 in the actual arena.
- `closeup-new-battery-airborne-and-ground-shadow.png`: new yellow cylinder, bolt, silver terminal/graphite caps; left pickup at serverz70 above its unchanged ground shadow, right pickup grounded. Actual Phaser camera zoom4.

`summary.json` contains measured sprites, origins, selected keys and checks. Six other actual screenshots (three station-entrance closeups, airborne arena, mapscale1.4, old-asset fallback), plus the full raw browser report, are kept outside the repository at `../docs/station-battery-browser-captures/` relative to repository root.

## Verified

- Authoritative baseline stations remain(-330,−220),(330,−220),(0,380),r65. Runtime keys `station-v3-0/1/2` use three actual3D renders with inward projected entrance angles33.69°,146.31°,−90°. Image rotation0; ground anchors and unchanged radius-based visual scaling match metadata.
- The bottom/rear-facing entrance is naturally hidden behind the real3D roof/body from the fixed camera. Its projected entrance anchor is verified inward; no misleading2D bitmap rotation was used.
- Runtime pickup sprites really use `battery-v3`, source256², uniform aspect, current calibrated metadata ground pivot, visible world height28. Serverz subtracts once; shadow remains at(b.x,b.y+6), existing shadow shape retained.
- Radius700case scales authoritative station centers to(−462,−308),(462,−308),(0,532); camera scale changes inversely, root projections remain consistent. Radius fields remain65.
- Missing new battery/direction assets fall back to old `battery`/current `station-v3`. Existing rover atlas9layers and20goldcargo cell draws remain intact.

Readiness was first RED because runtime battery-v3.json was absent (`../docs/station-battery-red.log`); after production integration it passed. This is synthetic actual-renderer evidence, not live server pickup/deposit behavior, native mini-game simulator/device or phone performance proof.

## Reproduce

With Vite running in `client`, from repository root:

```sh
SCREENSHOTS=../docs/station-battery-browser-captures node client/tests/station-battery.browser.mjs
```

Optional metadata readiness check: `node client/tests/station-battery.browser.mjs --check-assets`. Requires Playwright and Chromium as documented by the rover browser harness. Fixture-only graphics-method observation records actual production shadow/cargo draw calls; no production scene/debug code is changed.

## Build and review gate

- Client: 191/191 Node tests passed; TypeScript + Vite production build passed (existing large-bundle warning only).
- Mini-game: 39/39 tests passed; build and packaged asset byte checks passed. Main/art/total: 1,329 / 8,426 / 9,755 KiB.
- Source/assets: five original rover tests plus two battery and three station tests passed; rover validator passed.
- Independent scoped review found no Critical/Important issues, and independently projected both saved Blender models to verify corrected root anchors. A minor browser map-scale fixture gap was fixed and the full focused harness rerun successfully.
- No server, physics, protocol, capacity, scoring or cargo display changes; no main merge/deployment.
