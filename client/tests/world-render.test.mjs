import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { cameraPolicy } from "../src/types.ts";
const source = fs.readFileSync(
  new URL("../src/world.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  source
    .replace(/^import .*;$/gm, "")
    .replace("export class World", "class World"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
function harness() {
  const calls = [];
  function object(kind) {
    return new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) => {
            calls.push({ kind, key, args });
            return object(kind);
          },
      },
    );
  }
  const context = {
    cameraPolicy,
    window: { matchMedia: () => ({ matches: false }) },
    Phaser: {
      Scene: class {},
      Math: { Angle: { Wrap: (x) => x } },
      Display: { Color: { HexStringToColor: () => ({ color: 0 }) } },
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled + ";globalThis.World=World;", context);
  const w = new context.World();
  w.scale = { width: 1200, height: 800, on() {} };
  w.textures = { exists: () => false };
  w.add = {
    graphics: () => object("graphics"),
    image: () => object("image"),
    text: () => object("text"),
  };
  w.create();
  return { w, calls };
}
test("garden background is rasterized once and not redrawn on every frame", () => {
  const { w, calls } = harness();
  assert.equal(calls.filter((c) => c.key === "generateTexture").length, 1);
  calls.length = 0;
  w.update(0, 16);
  w.update(16, 16);
  assert.equal(calls.filter((c) => c.key === "generateTexture").length, 0);
  assert.ok(
    calls.filter((c) => c.key === "fillCircle").length < 100,
    "hundreds of garden primitives must stay out of frame loop",
  );
});
test("self converges faster than remote without extrapolating authoritative positions", () => {
  const { w } = harness();
  w.self = "self";
  const p = {
    x: 0,
    y: 0,
    angle: 0,
    color: "#38bdf8",
    cargo: 0,
    connected: true,
    name: "car",
  };
  w.state = {
    phase: "playing",
    players: [
      { ...p, id: "self" },
      { ...p, id: "other" },
    ],
    stations: [],
    batteries: [],
  };
  w.update(0, 16);
  w.state.players.forEach((p) => (p.x = 100));
  w.update(16, 16);
  assert.ok(w.smooth.get("self").x > w.smooth.get("other").x);
  assert.ok(w.smooth.get("self").x <= 100);
});

test("mobile camera uses the same current smoothed self position as the car", () => {
  const { w } = harness();
  w.scale.width = 390;
  w.scale.height = 844;
  w.self = "self";
  const p = {
    id: "self",
    x: 0,
    y: 0,
    angle: 0,
    color: "#38bdf8",
    cargo: 0,
    connected: true,
    name: "car",
  };
  w.state = { phase: "playing", players: [p], stations: [], batteries: [] };
  w.update(0, 16);
  p.x = 100;
  w.update(16, 16);
  assert.equal(w.ox + w.smooth.get("self").x * w.worldScale, w.scale.width / 2);
});

test("debug FPS measures render frames over elapsed time separately from network", () => {
  const { w } = harness();
  w.diagnostics = true;
  for (let i = 0; i < 50; i++) w.update(i * 20, 20);
  assert.equal(w.fps, 50);
});

function renderCar(cargo, boost = 0, angle = 0, reducedEffects = false) {
  const h = harness();
  h.w.reducedEffects = reducedEffects;
  h.w.state = {
    phase: "playing",
    players: [
      {
        id: "p",
        name: "car",
        x: 0,
        y: 0,
        angle,
        color: "#38bdf8",
        cargo,
        boost,
        connected: true,
      },
    ],
    stations: [],
    batteries: [],
  };
  h.calls.length = 0;
  h.w.update(100, 16);
  return h;
}
test("compact cargo rack displays one distinct battery for each cargo from 1 through 20", () => {
  for (let n = 1; n <= 20; n++) {
    const { calls } = renderCar(n);
    const cells = calls.filter(
      (c) => c.key === "fillStyle" && c.args[0] === 0xedc34f,
    );
    assert.equal(cells.length, n);
  }
});
test("authoritative boost draws tail flames even with reduced effects", () => {
  for (const reduced of [false, true]) {
    const { calls } = renderCar(20, 0.32, Math.PI / 2, reduced);
    assert.ok(
      calls.some((c) => c.key === "fillStyle" && c.args[0] === 0xff7a32),
    );
    assert.ok(
      !renderCar(20, 0).calls.some(
        (c) => c.key === "fillStyle" && c.args[0] === 0xff7a32,
      ),
    );
  }
});
test("boost shake lasts 100 ms and reduced effects disables it", () => {
  const { w } = harness();
  const shakes = [];
  w.cameras = { main: { shake: (...args) => shakes.push(args) } };
  assert.equal(typeof w.boostFeedback, "function");
  w.boostFeedback();
  assert.deepEqual(shakes, [[100, 0.002]]);
  w.reducedEffects = true;
  w.boostFeedback();
  assert.equal(shakes.length, 1);
});
test("only local rover label exposes exact cargo capacity and full-load state", () => {
  for (const n of [0, 7, 20]) {
    const { calls } = renderCar(n);
    const remoteLabel = calls.find(
      (c) => c.kind === "text" && c.key === "setText",
    ).args[0];
    assert.doesNotMatch(remoteLabel, /\d+\/20|⚡|满载/);
    const { w, calls: localCalls } = renderCar(n);
    w.self = "p";
    localCalls.length = 0;
    w.update(116, 16);
    const label = localCalls.find(
      (c) => c.kind === "text" && c.key === "setText",
    ).args[0];
    assert.match(label, new RegExp(`${n}/20`));
    if (n === 20) assert.match(label, /满载/);
  }
});
test("finished snapshots never render retained boost flame", () => {
  const { w, calls } = renderCar(20, 0.2);
  w.state.phase = "finished";
  calls.length = 0;
  w.update(116, 16);
  assert.equal(
    calls.some((c) => c.key === "fillStyle" && c.args[0] === 0xff7a32),
    false,
  );
});
test("disconnected or stale snapshot cannot animate retained tail flame", () => {
  for (const stale of [false, true]) {
    const { w, calls } = renderCar(20, 0.2);
    if (!stale) w.liveEffects = false;
    calls.length = 0;
    w.update(1000, 600);
    assert.equal(
      calls.some((c) => c.key === "fillStyle" && c.args[0] === 0xff7a32),
      false,
    );
  }
});
test("local pickup feedback aggregates into one +N label, reduced motion keeps text but no particles, stale effects clear", () => {
  const { w, calls } = harness();
  assert.equal(typeof w.pickupFeedback, "function");
  w.self = "self";
  w.reducedEffects = true;
  w.state = {
    phase: "playing",
    players: [
      {
        id: "self",
        x: 0,
        y: 0,
        angle: 0,
        color: "#38bdf8",
        cargo: 3,
        name: "car",
        connected: true,
      },
    ],
    stations: [],
    batteries: [],
  };
  w.pickupFeedback(1);
  w.pickupFeedback(2);
  w.update(0, 16);
  assert.ok(calls.some((c) => c.key === "setText" && c.args[0] === "⚡ +3"));
  assert.equal(
    calls.filter((c) => c.key === "fillStyle" && c.args[0] === 0xffe66d).length,
    0,
  );
  calls.length = 0;
  w.reducedEffects = false;
  w.update(16, 16);
  assert.ok(calls.some((c) => c.key === "fillStyle" && c.args[0] === 0xffe66d));
  w.liveEffects = false;
  calls.length = 0;
  w.update(32, 16);
  assert.equal(w.pickupRemaining, 0);
  assert.ok(calls.some((c) => c.key === "setVisible" && c.args[0] === false));
});
