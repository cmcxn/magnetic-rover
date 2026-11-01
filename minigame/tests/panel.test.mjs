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
  const login = p.hits[p.hits.length - 1];
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
test("room palette disables occupied colors and sends free color selection", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "000001";
  model.state = {
    phase: "lobby",
    players: [
      { id: "me", name: "Me", color: types.COLORS[0], connected: true },
      { id: "other", name: "Other", color: types.COLORS[1], connected: true },
    ],
    batteries: [],
    stations: [],
  };
  p.update();
  // Palette is at fixed logical coordinates; occupied cell must have no hit.
  const scale = p.menu.scaleX;
  const at = (i) =>
    p.press(
      p.menu.x + (658 + (i % 4) * 46) * scale,
      p.menu.y + (76 + Math.floor(i / 4) * 46) * scale,
    );
  assert.equal(at(1), false);
  assert.equal(at(6), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), [
    "send",
    { type: "set_color", color: types.COLORS[6] },
  ]);
});
test("local lobby nickname opens rename action", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "000001";
  model.state = {
    phase: "lobby",
    players: [
      { id: "me", name: "Me", color: types.COLORS[0], connected: true },
    ],
    batteries: [],
    stations: [],
  };
  p.update();
  const layout = lobbyCardLayout(1),
    s = p.menu.scaleX;
  p.press(p.menu.x + 422 * s, p.menu.y + (layout.top + layout.nameY) * s);
  assert.equal(calls.at(-1)[0], "rename");
});
test("PC startup displays key guide while mobile keeps touch introduction", () => {
  const { p, model } = harness(),
    labels = [];
  const original = p.text.bind(p);
  p.text = (x, y, text, ...rest) => {
    labels.push(text);
    return original(x, y, text, ...rest);
  };
  model.keyboardEnabled = true;
  p.update();
  assert.ok(labels.some((s) => s.includes("WASD") && s.includes("松开充能")));
  labels.length = 0;
  model.keyboardEnabled = false;
  p.invalidate();
  p.update();
  assert.ok(!labels.some((s) => s.includes("WASD")));
});
test("mobile and PC minigame have no server settings entry", () => {
  for (const keyboardEnabled of [false, true]) {
    const { p, model } = harness(),
      labels = [];
    const original = p.text.bind(p);
    p.text = (x, y, text, ...rest) => {
      labels.push(text);
      return original(x, y, text, ...rest);
    };
    model.keyboardEnabled = keyboardEnabled;
    p.invalidate();
    p.update();
    assert.ok(
      !labels.some((s) => s.includes("服务器设置") || s.includes("WebSocket")),
    );
  }
});
test("reused HUD text updates its latency color", () => {
  const { p } = harness();
  let color;
  const label = {
    setPosition() {
      return this;
    },
    setText() {
      return this;
    },
    setVisible() {
      return this;
    },
    setColor(c) {
      color = c;
      return this;
    },
  };
  p.labels.set("net", label);
  p.label("net", 0, 0, "68 ms", 12, "#40e396");
  assert.equal(color, "#40e396");
  p.label("net", 0, 0, "328 ms", 12, "#ff3f4f");
  assert.equal(color, "#ff3f4f");
});

test("solo AI entry and removal use real menu hit targets and keep start explicit", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "000001";
  model.state = {
    phase: "lobby",
    canAddBot: true,
    canRemoveBot: false,
    botCount: 0,
    players: [
      {
        id: "me",
        name: "车手",
        color: types.COLORS[0],
        connected: true,
        ready: false,
      },
    ],
    batteries: [],
    stations: [],
  };
  p.update();
  for (const h of p.hits) p.press(h.x + h.w / 2, h.y + h.h / 2);
  assert.ok(calls.some((c) => c[0] === "send" && c[1].type === "add_bot"));
  assert.ok(!calls.some((c) => c[0] === "send" && c[1].type === "ready"));
  calls.length = 0;
  model.state.canAddBot = false;
  model.state.canRemoveBot = true;
  model.state.botCount = 1;
  model.state.players.push({
    id: "2",
    name: "竞技小车",
    color: types.COLORS[5],
    connected: true,
    ready: true,
    isBot: true,
  });
  p.update();
  for (const h of p.hits) p.press(h.x + h.w / 2, h.y + h.h / 2);
  assert.ok(calls.some((c) => c[0] === "send" && c[1].type === "remove_bot"));
  assert.ok(calls.some((c) => c[0] === "send" && c[1].type === "ready"));
});

test("lobby help stays below the WeChat capsule and remains tappable", () => {
  const { p, model, calls } = harness();
  model.connected = true;
  model.roomId = "r";
  model.state = { phase: "lobby", players: [], batteries: [], stations: [] };
  p.insets = () => ({ left: 47, right: 24, top: 8, capsuleBottom: 48 });
  p.actions.showGuide = () => calls.push(["guide"]);
  p.update();
  assert.ok(p.guideHit.y >= 56);
  p.press(p.guideHit.x + 10, p.guideHit.y + 10);
  assert.equal(calls.at(-1)[0], "guide");
});
test("menu previews select the exact palette texture without tinting the white shell", () => {
  const { p } = harness();
  const seen = [];
  p.textures.exists = (key) => key.startsWith("rover-menu-");
  p.textures.get = () => ({ get: () => ({ width: 192, height: 140 }) });
  p.add.image = (x, y, key, frame) => {
    seen.push({ key, frame });
    return object();
  };
  for (const color of types.COLORS) p.car(0, 0, color);
  assert.deepEqual(
    seen.map((v) => v.key),
    types.COLORS.map((c) => "rover-menu-" + c.slice(1)),
  );
  assert.ok(seen.every((v) => v.frame === undefined));
});
test("directory exposes a return to the initial vehicle selection screen", () => {
  const { p, model } = harness();
  let returned = 0;
  p.actions.backToProfile = () => returned++;
  model.connected = true;
  model.roomId = null;
  p.update();
  const back = p.hits.find((h) => h.action === p.actions.backToProfile);
  assert.ok(back);
  back.action();
  assert.equal(returned, 1);
});
test("ready and waiting players retain their exact color and full opacity; only ready gets a ring", () => {
  const { p, model } = harness();
  model.connected = true;
  model.roomId = "1";
  model.state = {
    phase: "lobby",
    players: [
      {
        id: "me",
        name: "甲",
        color: types.COLORS[0],
        ready: false,
        connected: true,
        score: 0,
      },
      {
        id: "2",
        name: "乙",
        color: types.COLORS[1],
        ready: true,
        connected: true,
        score: 0,
      },
    ],
    batteries: [],
    stations: [],
  };
  let cars = [],
    rings = 0;
  p.car = (...args) => cars.push(args);
  const g = new Proxy(
    {},
    {
      get: (_o, k) => () => {
        if (k === "strokeEllipse") rings++;
        return g;
      },
    },
  );
  p.add.graphics = () => g;
  p.update();
  assert.deepEqual(
    cars.map((c) => c[2]),
    types.COLORS.slice(0, 2),
  );
  assert.ok(cars.every((c) => c[5] === 1));
  assert.equal(rings, 1);
  cars = [];
  model.state.players[1].color = types.COLORS[2];
  p.update();
  assert.equal(cars[1][2], types.COLORS[2]);
});
test("3D preview eligibility is restricted to initial hero and local lobby card", () => {
  const { p, model } = harness();
  const previews = [];
  p.previewCar = (...args) => previews.push(args);
  p.invalidate();
  p.update();
  assert.equal(previews.length, 1);
  previews.length = 0;
  model.connected = true;
  model.roomId = "1";
  model.state = {
    phase: "lobby",
    players: [
      { id: "me", name: "甲", color: types.COLORS[0], connected: true },
      { id: "2", name: "乙", color: types.COLORS[1], connected: true },
    ],
    batteries: [],
    stations: [],
  };
  p.update();
  assert.equal(previews.length, 1);
  assert.equal(previews[0][2], types.COLORS[0]);
  previews.length = 0;
  model.state.phase = "playing";
  p.update();
  assert.equal(previews.length, 0);
});
test("authoritative playing transition cannot intercept first game touch before panel redraw", () => {
  const { p, model } = harness();
  let drags = 0;
  p.showroomRect = { x: 10, y: 10, width: 100, height: 100 };
  p.showroom = {
    ready: true,
    beginDrag() {
      drags++;
    },
    endDrag() {},
  };
  assert.equal(p.showroomStart(1, 20, 20), true);
  p.showroomEnd(1);
  model.state = { phase: "playing", players: [], batteries: [], stations: [] };
  assert.equal(p.showroomStart(2, 20, 20), false);
  assert.equal(drags, 1);
});
test("held preview gesture stops consuming movement immediately on authoritative playing transition", () => {
  const { p, model } = harness();
  let ended = 0,
    moved = 0;
  p.showroomRect = { x: 10, y: 10, width: 100, height: 100 };
  p.showroom = {
    ready: true,
    beginDrag() {},
    endDrag() {
      ended++;
    },
    dragX() {
      moved++;
    },
  };
  assert.equal(p.showroomStart(1, 20, 20), true);
  model.state = { phase: "playing", players: [], batteries: [], stations: [] };
  assert.equal(p.showroomMove(1, 30), false);
  assert.equal(moved, 0);
  assert.equal(ended, 1);
  assert.equal(p.showroomTouch, null);
});
for (const midPass of [false, true])
  test(`Extern survives ${midPass ? "mid-pass" : "already-lost"} context with null GL snapshots and allows recovery`, () => {
    const { p } = harness();
    let lost = !midPass,
      hides = 0,
      renders = 0;
    let external;
    p.showroom = {
      ready: true,
      show() {},
      hide() {
        this.ready = false;
        hides++;
      },
      fail() {
        this.ready = false;
      },
      render() {
        renders++;
      },
    };
    p.add.extern = () => (external = {});
    const gl = {
      isContextLost: () => lost,
      getParameter() {
        lost = true;
        return null;
      },
      isEnabled: () => false,
      bindFramebuffer() {},
      viewport() {},
      scissor() {},
      enable() {},
      disable() {},
      depthMask() {},
    };
    p.game = { renderer: { gl } };
    p.previewCar(100, 100, "#38bdf8", 100);
    assert.doesNotThrow(() => external.render());
    assert.equal(renders, 0);
    p.contextLost({ preventDefault() {} });
    assert.equal(p.showroom.ready, false);
    assert.ok(hides > 0);
    lost = false;
    p.contextRestored();
    assert.equal(p.showroomLost, false);
    assert.equal(p.key, "");
  });
test('visible 3D preview toggle is available in profile and room but absent during play',()=>{const {p,model}=harness();let toggles=0;const buttons=[];p.actions.togglePreview=()=>toggles++;const original=p.button.bind(p);p.button=(...args)=>{buttons.push(args);return original(...args)};p.invalidate();p.update();let b=buttons.find(x=>x[3]==='3D预览（实验）');assert.ok(b);b[4]();assert.equal(toggles,1);buttons.length=0;model.connected=true;model.roomId='r';model.preview3D=true;model.state={phase:'lobby',players:[{id:'me',name:'me',color:types.COLORS[0],connected:true,ready:false,score:0}],batteries:[],stations:[]};p.update();b=buttons.find(x=>x[3]==='切回普通预览');assert.ok(b);b[4]();assert.equal(toggles,2);buttons.length=0;model.state.phase='playing';p.update();assert.equal(buttons.some(x=>x[3].includes('预览')),false)});
