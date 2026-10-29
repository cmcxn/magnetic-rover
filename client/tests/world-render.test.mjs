import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { VehicleMotion, TireDust, wheelAngle } from "../src/vehicle-effects.ts";
import { Motion } from "../src/motion.ts";
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
    VehicleMotion,
    TireDust,
    wheelAngle,
    Motion,
    performance: { now: () => 0 },
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

test("all devices render the same enlarged98x68body without changing camera policy or label font", () => {
  for (const [width, height, multiplier] of [
    [390, 844, 2],
    [844, 390, 2],
    [1200, 800, 2],
  ]) {
    const { w, calls } = renderCar(20, 0.2);
    w.scale = { width, height };
    w.self = "p";
    const sprites = [];
    w.sprite = (...args) => {
      sprites.push(args);
      return false;
    };
    calls.length = 0;
    w.update(116, 16);
    const car = sprites.find((args) => args[0] === "car-p");
    assert.equal(car[4], 49 * multiplier);
    assert.equal(car[5], 34 * multiplier);
    const rack = calls.find(
      (c) =>
        c.key === "fillPoints" &&
        Math.abs(c.args[0][0].x + 23.5 * multiplier) < 0.01,
    );
    assert.ok(
      rack,
      "contained rear-deck rack scales around rover center with the body",
    );
    assert.equal(w.worldScale, cameraPolicy(width, height).scale);
    assert.ok(
      calls.some(
        (c) =>
          c.kind === "text" &&
          c.key === "setPosition" &&
          c.args[1] <= w.oy - 34 * multiplier * w.worldScale,
      ),
    );
    assert.ok(!calls.some((c) => c.kind === "text" && c.key === "setScale"));
  }
});

test("phone pickup text stays above the enlarged upright loaded rack", () => {
  const { w, calls } = renderCar(20, 0, Math.PI / 2);
  w.scale = { width: 390, height: 844 };
  w.self = "p";
  w.pickupFeedback(1);
  calls.length = 0;
  w.update(116, 16);
  const positions = calls.filter(
    (c) => c.kind === "text" && c.key === "setPosition",
  );
  const nameY = positions[0].args[1];
  const pickupY = positions.at(-1).args[1];
  assert.ok(pickupY < nameY - 20, "pickup text clears both car and name label");
});

test("world exposes sequenced local prediction and reset without changing camera policy", () => {
  const { w } = harness();
  w.self = "self";
  w.state = {
    phase: "playing",
    roomId: "a",
    roundId: 1,
    serverTime: 0,
    radius: 500,
    players: [
      {
        id: "self",
        name: "A",
        color: "#38bdf8",
        x: 0,
        y: 0,
        angle: 0,
        cargo: 0,
        score: 0,
        cooldown: 0,
        boost: 0,
        stun: 0,
        hitSeq: 0,
        connected: true,
        inputSeq: 0,
        inputElapsed: 0,
      },
    ],
    stations: [],
    batteries: [],
  };
  assert.equal(typeof w.inputCommand, "function");
  const command = w.inputCommand({ x: 1, y: 0, boost: false }, 0);
  assert.equal(command.seq, 1);
  w.update(0, 16);
  assert.ok(w.smooth.has("self"));
  w.resetMotion();
  assert.equal(w.smooth.size, 0);
});

test("magnet guide uses server radius and tracks rendered car on phone and desktop", () => {
  for (const width of [390, 1200]) {
    const { w, calls } = renderCar(13);
    w.scale = { width, height: 844 };
    w.self = "p";
    w.state.pickupRadius = 56;
    w.state.players[0].x = 100;
    calls.length = 0;
    w.update(116, 16);
    assert.ok(w.smooth.get("p").x < 100, "display pose differs from authority");
    assert.ok(
      calls.some(
        (c) =>
          c.key === "strokeCircle" &&
          c.args[0] === w.smooth.get("p").x &&
          c.args[1] === 0 &&
          c.args[2] === 56,
      ),
    );
    assert.ok(
      !calls.some((c) => c.key === "strokeCircle" && c.args[2] === 58),
      "no oversized self outline masquerades as range",
    );
  }
});

test("legacy server magnet guide uses legacy20 radius rather than enlarged vehicle scale", () => {
  const { w, calls } = renderCar(0);
  w.scale = { width: 390, height: 844 };
  calls.length = 0;
  w.update(116, 16);
  assert.ok(calls.some((c) => c.key === "strokeCircle" && c.args[2] === 20));
});

test("authoritative supply ring and five-second next-zone warning render on phone and desktop", () => {
  for (const width of [390, 1200]) {
    const { w, calls } = harness();
    w.scale = { width, height: 844 };
    w.state = {
      phase: "playing",
      players: [],
      stations: [],
      batteries: [],
      supply: {
        stage: 2,
        outerRadius: 340,
        nextOuterRadius: 230,
        secondsToShrink: 6,
        banking: false,
      },
    };
    calls.length = 0;
    w.update(0, 16);
    assert.ok(calls.some((c) => c.key === "strokeCircle" && c.args[2] === 340));
    assert.equal(calls.filter((c) => c.key === "arc").length, 0);
    w.state.supply.secondsToShrink = 5;
    calls.length = 0;
    w.update(16, 16);
    assert.equal(
      calls.filter((c) => c.key === "arc" && c.args[2] === 230).length,
      48,
    );
    w.state.phase = "lobby";
    calls.length = 0;
    w.update(32, 16);
    assert.ok(
      !calls.some((c) => c.key === "strokeCircle" && c.args[2] === 340),
    );
  }
});

test("missing rover sprite fallback has the same98x68body footprint", () => {
  const { calls } = renderCar(0);
  const vertices = calls
    .filter((c) => c.key === "fillPoints")
    .flatMap((c) => c.args[0]);
  assert.equal(Math.max(...vertices.map((p) => p.x)), 49);
  assert.equal(Math.min(...vertices.map((p) => p.x)), -49);
  assert.equal(Math.max(...vertices.map((p) => p.y)), 34);
  assert.equal(Math.min(...vertices.map((p) => p.y)), -34);
});

test("solid boundary uses authority radius, not the independent pickup radius", () => {
  const { w, calls } = renderCar(20);
  w.state.collisionRadius = 60;
  w.state.pickupRadius = 56;
  calls.length = 0;
  w.update(116, 16);
  assert.ok(calls.some((c) => c.key === "strokeCircle" && c.args[2] === 60));
  assert.ok(
    !calls.some((c) => c.key === "strokeCircle" && c.args[2] === 56),
    "no misleading second solid-looking magnet ring",
  );
});
test("loaded vehicle body and all twenty cargo cells fit in hard circle at every heading", () => {
  for (const angle of [0, 0.4, Math.PI / 2, Math.PI]) {
    const { calls } = renderCar(20, 0, angle);
    const vertices = calls
      .filter((c) => c.key === "fillPoints")
      .flatMap((c) => c.args[0]);
    assert.ok(vertices.length >= 24 * 4);
    for (const p of vertices)
      assert.ok(
        Math.hypot(p.x, p.y) <= 60,
        "body/rack vertex must fit radius60",
      );
  }
});
test("airborne dropped battery renders at server height with its ground shadow", () => {
  const { w, calls } = harness();
  w.state = {
    phase: "playing",
    players: [],
    stations: [],
    batteries: [{ id: "drop", x: 100, y: 80, z: 24, source: "drop" }],
  };
  const sprites = [];
  w.sprite = (...args) => {
    sprites.push(args);
    return true;
  };
  calls.length = 0;
  w.update(0, 16);
  const battery = sprites.find((a) => a[0] === "battery-drop");
  assert.equal(battery[2], 100);
  assert.equal(battery[3], 56);
  assert.ok(
    calls.some(
      (c) => c.key === "fillEllipse" && c.args[0] === 100 && c.args[1] === 86,
    ),
  );
});
test("contained cargo has a graphics layer above the car sprite, not hidden beneath it", () => {
  const { calls } = harness();
  assert.ok(
    calls.some(
      (c) => c.kind === "graphics" && c.key === "setDepth" && c.args[0] === 5,
    ),
  );
});

test("boost cooldown label follows authoritative state and only appears on local rover", () => {
  const { w, calls } = renderCar(20);
  w.self = "p";
  w.state.players[0].cooldown = 2.8;
  calls.length = 0;
  w.update(116, 16);
  assert.ok(
    calls.some((c) => c.key === "setText" && c.args[0].includes("冲刺 2.8s")),
  );
  w.state.players[0].cooldown = 0;
  calls.length = 0;
  w.update(132, 16);
  assert.ok(
    calls.some((c) => c.key === "setText" && c.args[0].includes("冲刺就绪")),
  );
  w.state.players[0].connected = false;
  calls.length = 0;
  w.update(148, 16);
  assert.ok(
    !calls.some((c) => c.key === "setText" && c.args[0].includes("冲刺")),
  );
});

test("boost flame expires between snapshots even before stale timeout", () => {
  const { w, calls } = renderCar(0, 0.1);
  calls.length = 0;
  w.update(250, 150);
  assert.ok(
    !calls.some((c) => c.key === "fillStyle" && c.args[0] === 0xff7a32),
  );
});
test("round reset silently baselines impact sequence instead of showing a false collision", () => {
  const { w } = renderCar(4);
  w.state = {
    ...w.state,
    roundId: 1,
    players: w.state.players.map((p) => ({ ...p, impactSeq: 5 })),
  };
  w.update(100, 16);
  w.state = {
    ...w.state,
    roundId: 2,
    players: w.state.players.map((p) => ({ ...p, impactSeq: 0, cargo: 0 })),
  };
  w.update(116, 16);
  assert.equal(w.impactState.get("p").until, 0);
});

test("overview camera and background scale with server arena without resizing vehicles", () => {
  const { w, calls } = harness();
  w.scale.width = 1600;
  w.scale.height = 1200;
  w.state = {
    phase: "playing",
    radius: 1000,
    players: [],
    stations: [],
    batteries: [],
  };
  calls.length = 0;
  w.update(0, 16);
  assert.ok(Math.abs(w.worldScale - 1200 / 2320) < 1e-8);
  assert.ok(
    calls.some(
      (c) =>
        c.kind === "image" &&
        c.key === "setScale" &&
        Math.abs(c.args[0] - w.worldScale * 2) < 1e-8,
    ),
  );
});

test("layered vehicle renders four independent wheels, reuses them, and removes departed wheels", () => {
  const { w, calls } = renderCar(0);
  w.state.players[0].stun = 0;
  w.textures.exists = (k) =>
    k === "chassis" || k.startsWith("chassis-") || k.startsWith("tire-roll-");
  w.update(116, 16);
  assert.equal(
    [...w.sprites.keys()].filter((k) => k.startsWith("wheel-p-")).length,
    4,
  );
  const wheel = w.sprites.get("wheel-p-true-1");
  w.state.players[0].x = 8;
  w.state.players[0].angle = 0.2;
  w.update(132, 16);
  assert.equal(w.sprites.get("wheel-p-true-1"), wheel);
  assert.ok(w.wheelMotion.size === 1);
  w.state.players = [];
  w.update(148, 16);
  assert.equal(
    [...w.sprites.keys()].filter((k) => k.startsWith("wheel-")).length,
    0,
  );
  assert.equal(w.wheelMotion.size, 0);
});
