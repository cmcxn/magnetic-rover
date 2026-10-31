import test from "node:test";
import assert from "node:assert/strict";
import {
  selectHeading,
  stepRoverVisual,
  resolveRoverLayers,
} from "../src/rover-visual.ts";
const input = (extra = {}) => ({
  x: 0,
  y: 0,
  angle: 0,
  dtMs: 16,
  active: true,
  reset: false,
  worldUnitsPerTurn: 20,
  ...extra,
});
const initial = () => stepRoverVisual(null, input());
test("signed actual longitudinal travel advances and reverse decreases continuous cycles", () => {
  const f = stepRoverVisual(initial(), input({ x: 5 }));
  assert.equal(f.phase, 0.25);
  assert.equal(stepRoverVisual(f, input({ x: 0 })).phase, 0);
  assert.equal(stepRoverVisual(initial(), input({ x: -5 })).phase, -0.25);
});
test("idle, lateral displacement and pure rotation never roll", () => {
  for (const extra of [{}, { y: 5 }, { angle: 0.8 }])
    assert.equal(stepRoverVisual(initial(), input(extra)).phase, 0);
});
test("midpoint forward projection crosses angle seam without reversed travel", () => {
  const old = stepRoverVisual(null, input({ angle: Math.PI - 0.1 }));
  const v = stepRoverVisual(old, input({ x: -5, angle: -Math.PI + 0.1 }));
  assert.ok(Math.abs(v.phase - 0.25) < 1e-10);
});
test("inactive, reset, reconnect, teleports and invalid time rebase without accumulated travel", () => {
  for (const extra of [
    { active: false },
    { reset: true },
    { dtMs: 0 },
    { dtMs: -2 },
    { dtMs: NaN },
    { dtMs: 300 },
    { x: 1000 },
    { worldUnitsPerTurn: 0 },
  ]) {
    const v = stepRoverVisual(initial(), input({ x: 5, ...extra }));
    assert.equal(v.phase, 0);
    assert.equal(v.steer, 0);
  }
  const inactive = stepRoverVisual(initial(), input({ x: 5, active: false }));
  assert.equal(stepRoverVisual(inactive, input({ x: 10 })).phase, 0);
  assert.equal(stepRoverVisual(null, input({ x: 100 })).phase, 0);
});
test("nonfinite coordinates cannot poison later visual state", () => {
  const bad = stepRoverVisual(initial(), input({ x: NaN, angle: Infinity }));
  assert.ok(
    Object.values(bad).every(
      (v) => typeof v !== "number" || Number.isFinite(v),
    ),
  );
  assert.equal(stepRoverVisual(bad, input({ x: 2 })).phase, 0);
});
test("sixteen screen-uniform headings and hysteresis across wrap and boundaries", () => {
  for (let h = 0; h < 16; h++)
    assert.equal(selectHeading((h * Math.PI) / 8, null), h);
  assert.equal(selectHeading(Math.PI - 0.01, 8), 8);
  assert.equal(selectHeading(-Math.PI + 0.01, 8), 8);
  assert.equal(selectHeading(Math.PI / 16 + 0.01, 0), 0);
  assert.equal(selectHeading(Math.PI / 16 + 0.08, 0), 1);
  assert.equal(selectHeading(NaN, 3), 3);
});
test("steering responds to signed longitudinal yaw motion, including reverse", () => {
  assert.equal(
    stepRoverVisual(initial(), input({ x: 5, angle: 0.1 })).steer,
    1,
  );
  assert.equal(
    stepRoverVisual(initial(), input({ x: -5, angle: 0.1 })).steer,
    -1,
  );
  assert.equal(stepRoverVisual(initial(), input({ angle: 0.1 })).steer, 1);
});
const palettes = Array.from({ length: 8 }, (_, i) => String(i).repeat(6));
const layer = (frame, depthOrder = 0) => ({
  texture: "a",
  frame,
  width: 10,
  height: 10,
  anchorX: 0.5,
  anchorY: 0.5,
  offsetX: 0,
  offsetY: 0,
  depthOrder,
});
function fixture() {
  const poses = {};
  for (const s of [-1, 0, 1]) {
    poses[s] = {};
    for (let p = 0; p < 4; p++) poses[s][p] = [layer(`rubber-${s}-${p}`, 2)];
  }
  return {
    version: 1,
    palettes,
    referenceSize: 192,
    worldWidth: 100,
    atlases: [{ key: "a", image: "a.png", data: "a.json" }],
    headings: Array.from({ length: 16 }, (_, i) => ({
      screenAngle: (i * Math.PI) / 8,
      modelYaw: (i * Math.PI) / 8,
      body: Object.fromEntries(
        palettes.map((c) => [c, [layer("body" + c, 1), layer("light" + c, 4)]]),
      ),
      wheels: [true, true, false, false].map((front, j) => ({
        id: String(j),
        front,
        poses,
        accents: Object.fromEntries(
          palettes.map((c) => [
            c,
            Object.fromEntries(
              [-1, 0, 1].map((s) => [
                s,
                Object.fromEntries(
                  [0, 1, 2, 3].map((p) => [
                    p,
                    [layer("hub" + c + "-" + s + "-" + p, 3)],
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      })),
    })),
  };
}
test("all eight palettes resolve precoloured body lights and hubs, invariant rubber, rear straight", () => {
  const m = fixture();
  for (const palette of palettes) {
    const layers = resolveRoverLayers(m, palette, {
      ...initial(),
      phase: -0.1,
      steer: 1,
    });
    assert.equal(layers.length, 10);
    assert.ok(layers.some((l) => l.frame === "body" + palette));
    assert.ok(layers.some((l) => l.frame === "light" + palette));
    assert.equal(layers.filter((l) => l.frame === "rubber-1-3").length, 2);
    assert.equal(layers.filter((l) => l.frame === "rubber-0-3").length, 2);
    assert.equal(
      layers.filter((l) => l.frame === "hub" + palette + "-0-3").length,
      2,
    );
    assert.deepEqual(
      layers.map((l) => l.depthOrder),
      [1, 2, 2, 2, 2, 3, 3, 3, 3, 4],
    );
  }
});
test("resolver applies manifest model steering parity", () => {
  const m = fixture();
  m.steeringSign = -1;
  assert.equal(
    resolveRoverLayers(m, palettes[0], { ...initial(), steer: 1 }).filter(
      (l) => l.frame === "rubber--1-0",
    ).length,
    2,
  );
});
test("unavailable, malformed and incomplete selected assets fail atomically", () => {
  for (const m of [
    null,
    {},
    { ...fixture(), version: 2 },
    { ...fixture(), headings: [] },
  ])
    assert.deepEqual(resolveRoverLayers(m, palettes[0], initial()), []);
  const m = fixture();
  delete m.headings[0].wheels[3].poses[0][0];
  assert.deepEqual(resolveRoverLayers(m, palettes[0], initial()), []);
  const bad = fixture();
  bad.headings[0].body[palettes[0]][0].offsetX = NaN;
  assert.deepEqual(resolveRoverLayers(bad, palettes[0], initial()), []);
  assert.deepEqual(resolveRoverLayers(fixture(), "#unknown", initial()), []);
});

test("palette input accepts optional hash but manifest uses canonical unprefixed hex", () => {
  const m = fixture();
  assert.deepEqual(
    resolveRoverLayers(m, "#" + palettes[0], initial()),
    resolveRoverLayers(m, palettes[0], initial()),
  );
  assert.ok(resolveRoverLayers(m, palettes[0], initial()).length > 0);
});
