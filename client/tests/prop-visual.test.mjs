import test from "node:test";
import assert from "node:assert/strict";
import {
  selectStationFrame,
  batteryDisplay,
  validPropFrame,
} from "../src/prop-visual.ts";
const frame = (i, angle) => ({
  key: `station-v3-${i}`,
  image: `station-v3-${i}.png`,
  screenAngle: angle,
  modelYaw: 0,
  width: 256,
  height: 256,
  anchorX: 0.5,
  anchorY: 0.62,
  groundFootprintDiameterPx: 167,
});
const manifest = {
  version: 1,
  frames: [
    frame(0, Math.atan2(220, 330)),
    frame(1, Math.atan2(220, -330)),
    frame(2, -Math.PI / 2),
  ],
};
test("three actual station locations select inward headings, independent of order/scale", () => {
  for (const scale of [0.5, 1, 2])
    for (const [x, y, id] of [
      [-330, -220, 0],
      [330, -220, 1],
      [0, 380, 2],
    ])
      assert.equal(
        selectStationFrame(manifest, { x: x * scale, y: y * scale })?.key,
        `station-v3-${id}`,
      );
  const permuted = {
    ...manifest,
    frames: [manifest.frames[2], manifest.frames[0], manifest.frames[1]],
  };
  assert.equal(
    selectStationFrame(permuted, { x: 330, y: -220 })?.key,
    "station-v3-1",
  );
});
test("invalid/missing prop calibration or invalid position fails safely", () => {
  assert.equal(selectStationFrame(null, { x: 0, y: 380 }), null);
  assert.equal(
    selectStationFrame({ ...manifest, frames: [] }, { x: 0, y: 380 }),
    null,
  );
  assert.equal(selectStationFrame(manifest, { x: NaN, y: 380 }), null);
  assert.equal(
    validPropFrame({ ...frame(0, 0), groundFootprintDiameterPx: 0 }),
    false,
  );
  assert.equal(validPropFrame({ ...frame(0, 0), anchorY: 2 }), false);
  assert.equal(
    selectStationFrame(
      {
        ...manifest,
        frames: [
          ...manifest.frames.slice(0, 2),
          { ...frame(2, 0), screenAngle: NaN },
        ],
      },
      { x: 0, y: 380 },
    ),
    null,
  );
});
test("battery uses visible-height calibration and uniform scale, not stretched art", () => {
  const m = {
    version: 1,
    width: 256,
    height: 256,
    anchorX: 0.5,
    anchorY: 0.760409683,
    groundFootprintDiameterPx: 106.12,
    visibleHeightPx: 198,
    worldVisibleHeight: 28,
  };
  const v = batteryDisplay(m);
  assert.equal(v.width, v.height);
  assert.equal(v.width, (256 * 28) / 198);
  assert.equal(v.anchorY, 0.760409683);
  assert.equal(v.anchorX, 0.5);
  assert.equal(batteryDisplay({ ...m, visibleHeightPx: 0 }), null);
  assert.equal(batteryDisplay(null), null);
});
