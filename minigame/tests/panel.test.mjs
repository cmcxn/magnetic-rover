import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "../../client/node_modules/typescript/lib/typescript.js";
import * as presentation from "../../client/src/presentation.ts";
import * as types from "../../client/src/types.ts";
import { lobbyCardLayout } from "../src/lobby-layout.ts";
const source = fs.readFileSync(
  new URL("../src/panel.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "panel.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const clean = ts.factory.updateSourceFile(
  ast,
  ast.statements.filter((s) => !ts.isImportDeclaration(s)),
);
const compiled = ts.transpileModule(
  ts
    .createPrinter()
    .printFile(clean)
    .replace("export class CartoonPanel", "class CartoonPanel"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
function object() {
  return new Proxy({}, { get: (_t, k) => () => object() });
}
function harness() {
  const context = {
    exports: {},
    ...presentation,
    lobbyCardLayout,
    ...types,
    Phaser: { Scene: class {} },
  };
  vm.createContext(context);
  vm.runInContext(compiled + ";globalThis.Panel=CartoonPanel", context);
  let calls = [];
  const model = {
    connected: false,
    status: "test",
    name: "车手",
    color: types.COLORS[0],
    endpoint: "wss://x/ws",
    rooms: [],
    state: null,
    self: "me",
    roomId: null,
    spectator: false,
    notice: "",
    rtt: 0,
    fps: 60,
    age: 0,
  };
  const actions = Object.fromEntries(
    [
      "connect",
      "rename",
      "color",
      "server",
      "send",
      "leave",
      "boost",
      "joinCode",
      "copy",
    ].map((k) => [k, (...args) => calls.push([k, ...args])]),
  );
  const p = new context.Panel(
    () => model,
    actions,
    new types.FloatingJoystick(),
    () => ({ left: 24, right: 24, top: 8 }),
  );
  p.scale = { width: 844, height: 390, on() {} };
  p.textures = { exists: () => false };
  p.add = {
    graphics: object,
    text: object,
    image: object,
    container: () => ({
      x: 0,
      y: 0,
      scaleX: 1,
      add() {},
      removeAll() {},
      setVisible() {},
      setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
      },
      setScale(s) {
        this.scaleX = s;
        return this;
      },
    }),
  };
  p.create();
  p.update();
  return { p, model, calls };
}
test("scaled login button hit tests agree with rendered menu placement", () => {
  const { p, calls } = harness();
  const login = p.hits[p.hits.length - 2];
  assert.equal(p.press(login.x + login.w / 2, login.y + login.h / 2), true);
  assert.equal(calls[0][0], "connect");
});
test("eight-player waiting room supports ready and copy without overflowing short landscape", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "000001";
  model.state = {
    phase: "lobby",
    players: Array.from({ length: 8 }, (_, i) => ({
      id: i === 0 ? "me" : String(i),
      name: "车手",
      color: types.COLORS[i % 6],
      ready: false,
      connected: true,
      score: 0,
    })),
    batteries: [],
    stations: [],
  };
  p.update();
  for (const hit of p.hits) {
    assert.ok(
      hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= 844 && hit.y + hit.h <= 390,
    );
  }
  const ready = p.hits[p.hits.length - 2];
  p.press(ready.x + 3, ready.y + 3);
  assert.equal(calls.at(-1)[0], "send");
  assert.equal(calls.at(-1)[1].type, "ready");
});
test("playing boost uses circular hit target and remains separate from joystick", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "1";
  model.state = {
    phase: "playing",
    remaining: 100,
    players: [
      {
        id: "me",
        color: types.COLORS[0],
        score: 0,
        cargo: 0,
        cooldown: 0,
        stun: 0,
      },
    ],
    stations: [],
    batteries: [],
  };
  p.update();
  const boost = p.hits.find((h) => h.circle);
  assert.ok(boost);
  assert.equal(
    p.press(boost.x + boost.w * 0.9, boost.y + boost.w * 0.9),
    false,
  );
  assert.equal(p.press(boost.x, boost.y), true);
  assert.equal(calls.at(-1)[0], "boost");
});
test("room code uses plain digits and a readable copy label instead of a square glyph", () => {
  const { p, model, calls } = harness(),
    labels = [],
    original = p.text.bind(p);
  p.text = (x, y, text, ...rest) => {
    labels.push(text);
    return original(x, y, text, ...rest);
  };
  model.connected = true;
  model.roomId = "000013";
  model.state = {
    phase: "lobby",
    roomCode: "000013",
    players: [
      { id: "me", name: "测试", color: types.COLORS[0], connected: true },
    ],
    batteries: [],
    stations: [],
  };
  p.invalidate();
  p.update();
  const label = labels.find((t) => t.startsWith("房间码"));
  assert.match(label, /000013.*复制/);
  assert.doesNotMatch(label, /[▣■□]/);
  const copy = p.hits[0];
  p.press(copy.x + copy.w / 2, copy.y + copy.h / 2);
  assert.equal(calls.at(-1)[0], "copy");
});
