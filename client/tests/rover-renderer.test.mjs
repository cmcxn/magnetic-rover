import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { VehicleMotion, TireDust, wheelAngle } from "../src/vehicle-effects.ts";
import { Motion } from "../src/motion.ts";
import { cameraPolicy } from "../src/types.ts";
import * as roverVisual from "../src/rover-visual.ts";
import * as propVisual from "../src/prop-visual.ts";
const source = fs.readFileSync(
  new URL("../src/world.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  source
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace("export class World", "class World"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
function harness(
  manifest = null,
  missing = false,
  station = null,
  directions = null,
  battery = null,
) {
  const calls = [];
  const textures = new Set(manifest ? ["v3"] : []);
  if (station) textures.add("station-v3");
  if (directions)
    for (const frame of directions.frames) textures.add(frame.key);
  if (battery) textures.add("battery-v3");
  function obj(kind) {
    const o = { texture: { key: "" }, frame: { name: "" } };
    return new Proxy(o, {
      get(t, k) {
        if (k in t) return t[k];
        return (...a) => {
          calls.push({ kind, key: k, args: a });
          if (k === "setTexture") {
            t.texture = { key: a[0] };
            t.frame = { name: a[1] };
          }
          if (k === "setFrame") t.frame = { name: a[0] };
          if (k === "setDepth") t.depth = a[0];
          return o.proxy;
        };
      },
    });
  }
  const context = {
    ...roverVisual,
    ...propVisual,
    VehicleMotion,
    TireDust,
    wheelAngle,
    Motion,
    cameraPolicy,
    performance: { now: () => 0 },
    window: { matchMedia: () => ({ matches: false }) },
    Phaser: {
      Scene: class {},
      Math: { Angle: { Wrap: (x) => Math.atan2(Math.sin(x), Math.cos(x)) } },
      Display: { Color: { HexStringToColor: () => ({ color: 0 }) } },
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled + ";globalThis.World=World;", context);
  const w = new context.World();
  w.scale = { width: 1200, height: 800, on() {} };
  w.cache = {
    json: {
      get: (key) =>
        key === "station-v3-meta"
          ? station
          : key === "station-v3-directions"
            ? directions
            : key === "battery-v3-meta"
              ? battery
              : manifest,
    },
  };
  w.textures = {
    exists: (k) => textures.has(k),
    get: (k) => ({
      has: (f) => !missing,
      get: (f) => ({ name: f }),
      getSourceImage: () => ({ width: 256, height: 256 }),
      add() {},
    }),
  };
  function make(kind) {
    const o = obj(kind);
    o.proxy = o;
    return o;
  }
  w.add = {
    graphics: () => make("graphics"),
    image: (_x, _y, k, f) => {
      const o = make("image");
      o.texture = { key: k };
      o.frame = { name: f };
      return o;
    },
    text: () => make("text"),
  };
  w.create();
  return { w, calls, textures };
}
function fixture() {
  const layer = (frame, depthOrder) => ({
    texture: "v3",
    frame,
    width: 60,
    height: 40,
    anchorX: 0.5,
    anchorY: 0.5,
    offsetX: 0,
    offsetY: 0,
    depthOrder,
    role: frame.startsWith("wheel") ? "wheel" : "body",
  });
  const poses = {
    0: Object.fromEntries(
      [0, 1, 2, 3].map((n) => [n, [layer("wheel" + n, 1)]]),
    ),
  };
  return {
    version: 1,
    referenceSize: 192,
    worldWidth: 120,
    palettes: [
      "38bdf8",
      "fb7185",
      "a78bfa",
      "facc15",
      "34d399",
      "fb923c",
      "e879f9",
      "cbd5e1",
    ],
    atlases: [{ key: "v3", image: "atlas-0.png", data: "atlas-0.json" }],
    headings: Array.from({ length: 16 }, (_, i) => ({
      screenAngle: (i * Math.PI) / 8,
      modelYaw: 0,
      body: Object.fromEntries(
        [
          "38bdf8",
          "fb7185",
          "a78bfa",
          "facc15",
          "34d399",
          "fb923c",
          "e879f9",
          "cbd5e1",
        ].map((c) => [c, [layer("body" + i, 0)]]),
      ),
      wheels: Array.from({ length: 4 }, (_, j) => ({
        id: "rear" + j,
        front: false,
        poses,
      })),
    })),
  };
}
function state(cargo = 0) {
  return {
    phase: "playing",
    roundId: 1,
    players: [
      {
        id: "p",
        name: "rover",
        x: 0,
        y: 0,
        angle: 0,
        color: "#38bdf8",
        cargo,
        connected: true,
        stun: 0,
      },
    ],
    stations: [],
    batteries: [],
  };
}
test("pooled image updates same-texture frames and explicit atlas origin", () => {
  const { w, calls, textures } = harness();
  textures.add("v3");
  w.sprite("a", "v3", 0, 0, 20, 30, 4, 0, "one", 0.2, 0.7);
  const first = w.sprites.get("a");
  w.sprite("a", "v3", 0, 0, 20, 30, 4, 0, "two", 0.2, 0.7);
  assert.equal(w.sprites.get("a"), first);
  assert.equal(first.frame.name, "two");
  assert.ok(
    calls.some(
      (c) => c.key === "setOrigin" && c.args[0] === 0.2 && c.args[1] === 0.7,
    ),
  );
});
test("atlas frames render unrotated with stable IDs, then remove/reset cleanly", () => {
  const { w } = harness(fixture());
  w.state = state();
  w.update(0, 16);
  const ids = [...w.sprites.keys()].filter((k) => k.startsWith("rover-v3-"));
  assert.ok(ids.length >= 2);
  const first = w.sprites.get(ids[0]);
  w.state.players[0].angle = Math.PI / 2;
  w.update(16, 100);
  assert.equal(w.sprites.get(ids[0]), first);
  w.resetMotion();
  assert.equal(w.vehicleDiagnostics.roverV3.players, 0);
  w.state.players = [];
  w.update(32, 16);
  assert.equal(
    [...w.sprites.keys()].filter((k) => k.startsWith("rover-v3-")).length,
    0,
  );
});
test("missing one atlas frame falls back atomically without partial v3 car", () => {
  const { w } = harness(fixture(), true);
  w.state = state();
  w.update(0, 16);
  assert.equal(
    [...w.sprites.keys()].filter((k) => k.startsWith("rover-v3-")).length,
    0,
  );
});
test("new car preserves exact current cargo cell counts", () => {
  for (const n of [0, 1, 5, 10, 19, 20]) {
    const { w, calls } = harness(fixture());
    w.state = state(n);
    calls.length = 0;
    w.update(0, 16);
    assert.equal(
      calls.filter((c) => c.key === "fillStyle" && c.args[0] === 0xedc34f)
        .length,
      n,
    );
  }
});

test("prerendered rovers retain dust while reduced effects suppress it", () => {
  for (const reduced of [false, true]) {
    const { w } = harness(fixture());
    w.reducedEffects = reduced;
    w.state = state();
    w.update(0, 16);
    w.state.players[0].x = 20;
    w.update(100, 16);
    assert.equal(w.vehicleDiagnostics.dust > 0, !reduced);
  }
});

test("projected cargo uses source roof registration rather than screen rotation", () => {
  const manifest = fixture();
  for (const h of manifest.headings)
    h.cargoProjection = {
      origin: [0, -20],
      xAxis: [10, 0],
      yAxis: [0, 5],
      legacyXScale: 0.046,
      legacyXOffset: 0.481,
      legacyYScale: 0.042,
    };
  const { w, calls } = harness(manifest);
  w.state = state(1);
  calls.length = 0;
  w.update(0, 16);
  const i = calls.findIndex(
    (c) => c.key === "fillStyle" && c.args[0] === 0xedc34f,
  );
  const points = calls.slice(i).find((c) => c.key === "fillPoints").args[0];
  assert.ok(Math.abs(points[0].x - 2.14375) < 1e-5);
  assert.ok(Math.abs(points[0].y - -14.009375) < 1e-5);
  assert.equal(w.state.players[0].cargo, 1);
});

test("station artwork registers ground center and preserves authoritative deposit radius", () => {
  const metadata = {
    version: 1,
    width: 256,
    height: 256,
    anchorX: 0.45,
    anchorY: 0.65,
    groundFootprintDiameterPx: 200,
  };
  const { w, calls } = harness(null, false, metadata);
  w.state = state();
  w.state.stations = [{ x: 30, y: 40, r: 65 }];
  calls.length = 0;
  w.update(0, 16);
  assert.equal(w.sprites.get("station-0")?.texture.key, "station-v3");
  assert.equal(w.state.stations[0].r, 65);
  assert.ok(
    calls.some(
      (c) => c.key === "setOrigin" && c.args[0] === 0.45 && c.args[1] === 0.65,
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.key === "setDisplaySize" &&
        Math.abs(c.args[0] - 179.2 * w.worldScale) < 1e-6,
    ),
  );
});

test("overlapping rovers keep each body and wheel group together in depth order", () => {
  const { w } = harness(fixture());
  w.state = state();
  w.state.players.push({ ...w.state.players[0], id: "near", y: 1 });
  w.update(0, 16);
  const far = [...w.sprites]
    .filter(([id]) => id.startsWith("rover-v3-p-"))
    .map(([, s]) => s.depth);
  const near = [...w.sprites]
    .filter(([id]) => id.startsWith("rover-v3-near-"))
    .map(([, s]) => s.depth);
  assert.ok(
    Math.max(...far) < Math.min(...near),
    "near body must occlude far wheels instead of globally sorting all bodies before wheels",
  );
});

test("v3 boosted tire strips use the actual wheel mask above that wheel and are pooled/cleaned", () => {
  const { w, calls } = harness(fixture());
  w.state = state();
  w.state.players[0].boost = 0.3;
  w.update(0, 16);
  const effects = [...w.sprites].filter(([id]) =>
    id.startsWith("rover-boost-"),
  );
  assert.equal(
    effects.length,
    12,
    "three alpha-masked strips on each of four rendered wheels",
  );
  for (const [, image] of effects) {
    assert.ok(image.frame.name.startsWith("wheel"));
    assert.ok(
      image.depth > 4.001 && image.depth < 4.002,
      "effect belongs above own wheel, not below it or above every car",
    );
  }
  assert.equal(calls.filter((c) => c.key === "setCrop").length, 12);
  const first = effects[0];
  w.update(16, 16);
  assert.equal(w.sprites.get(first[0]), first[1]);
  w.reducedEffects = true;
  w.update(32, 16);
  assert.equal(
    [...w.sprites.keys()].filter((id) => id.startsWith("rover-boost-")).length,
    0,
  );
  w.reducedEffects = false;
  w.state.players[0].boost = 0;
  w.update(48, 16);
  assert.equal(
    [...w.sprites.keys()].filter((id) => id.startsWith("rover-boost-")).length,
    0,
  );
});

test("three stations choose baked inward entrances without rotating images or changing rules", () => {
  const frames = [
    Math.atan2(220, 330),
    Math.atan2(220, -330),
    -Math.PI / 2,
  ].map((screenAngle, i) => ({
    key: `station-v3-${i}`,
    image: `station-v3-${i}.png`,
    screenAngle,
    modelYaw: i,
    width: 256,
    height: 256,
    anchorX: 0.5,
    anchorY: 0.62,
    groundFootprintDiameterPx: 167,
  }));
  const { w, calls } = harness(null, false, null, { version: 1, frames });
  w.state = state();
  w.state.stations = [
    { x: 0, y: 760, r: 65 },
    { x: -660, y: -440, r: 65 },
    { x: 660, y: -440, r: 65 },
  ];
  w.update(0, 16);
  assert.deepEqual(
    [0, 1, 2].map((i) => w.sprites.get(`station-${i}`)?.texture.key),
    ["station-v3-2", "station-v3-0", "station-v3-1"],
  );
  assert.ok(
    calls.filter((c) => c.key === "setRotation").every((c) => c.args[0] === 0),
  );
  assert.ok(w.state.stations.every((s) => s.r === 65));
});
test("new pickup battery preserves aspect, ground shadow and server airborne height", () => {
  const metadata = {
    version: 1,
    width: 256,
    height: 256,
    anchorX: 0.5,
    anchorY: 0.760409683,
    groundFootprintDiameterPx: 106,
    visibleHeightPx: 198,
    worldVisibleHeight: 28,
  };
  const { w, calls } = harness(null, false, null, null, metadata);
  w.state = state();
  w.state.batteries = [
    { id: "a", x: 80, y: 100, z: 0 },
    { id: "b", x: 120, y: 100, z: 60 },
  ];
  w.update(0, 16);
  assert.equal(w.sprites.get("battery-a")?.texture.key, "battery-v3");
  assert.equal(w.sprites.get("battery-b")?.texture.key, "battery-v3");
  const positions = calls.filter((c) => c.key === "setPosition");
  assert.ok(
    positions.some(
      (c) => Math.abs(c.args[1] - (w.oy + 106 * w.worldScale)) < 1e-6,
    ),
  );
  assert.ok(
    positions.some(
      (c) => Math.abs(c.args[1] - (w.oy + 46 * w.worldScale)) < 1e-6,
    ),
  );
  const batterySize = ((256 * 28) / 198) * w.worldScale;
  assert.ok(
    calls.some(
      (c) =>
        c.key === "setDisplaySize" &&
        Math.abs(c.args[0] - batterySize) < 1e-6 &&
        c.args[0] === c.args[1],
    ),
  );
  assert.ok(
    calls.some((c) => c.key === "setOrigin" && c.args[1] === 0.760409683),
  );
  const shadows = calls.filter(
    (c) => c.key === "fillEllipse" && (c.args[0] === 80 || c.args[0] === 120),
  );
  assert.ok(shadows.every((c) => c.args[1] === 106));
  assert.equal(w.state.batteries[1].z, 60);
});

test("partial directional textures fall back as a complete set and malformed battery calibration is ignored", () => {
  const station = {
    version: 1,
    width: 256,
    height: 256,
    anchorX: 0.52,
    anchorY: 0.566,
    groundFootprintDiameterPx: 167,
  };
  const frames = [0.588, 2.554, -Math.PI / 2].map((screenAngle, i) => ({
    ...station,
    key: `station-v3-${i}`,
    image: `station-v3-${i}.png`,
    screenAngle,
    modelYaw: i,
  }));
  const { w } = harness(
    null,
    false,
    station,
    { version: 1, frames },
    { ...station, visibleHeightPx: 0, worldVisibleHeight: 28 },
  );
  const exists = w.textures.exists;
  w.textures.exists = (k) => k !== "station-v3-1" && exists(k);
  w.create();
  w.state = state();
  w.state.stations = [{ x: -330, y: -220, r: 65 }];
  w.state.batteries = [{ id: "bad", x: 0, y: 0, z: 0 }];
  w.update(0, 16);
  assert.equal(w.sprites.get("station-0")?.texture.key, "station-v3");
  assert.notEqual(w.sprites.get("battery-bad")?.texture.key, "battery-v3");
});
