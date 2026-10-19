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
