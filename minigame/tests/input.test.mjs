import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import ts from "../../client/node_modules/typescript/lib/typescript.js";
import * as types from "../../client/src/types.ts";
import { skillView } from "../../client/src/presentation.ts";
import { FrameMetrics } from "../../client/src/performance.ts";
const ast = ts.createSourceFile(
  "main.ts",
  fs.readFileSync(new URL("../src/main.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const compiled = ts.transpileModule(
  ts.createPrinter().printFile(
    ts.factory.updateSourceFile(
      ast,
      ast.statements.filter((s) => !ts.isImportDeclaration(s)),
    ),
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
function harness() {
  let panel,
    now = 1000,
    post;
  const events = {},
    sockets = [],
    sent = [];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390 }),
    getStorageSync: () => "",
    setStorageSync() {},
    removeStorageSync() {},
    setClipboardData() {},
    showModal() {},
    connectSocket: () => {
      const handlers = {};
      const s = {
        send: (o) => sent.push(JSON.parse(o.data)),
        close() {},
        onOpen: (f) => (handlers.open = f),
        onMessage: (f) => (handlers.message = f),
        onError: (f) => (handlers.error = f),
        onClose: (f) => (handlers.close = f),
        handlers,
      };
      sockets.push(s);
      return s;
    },
  };
  for (const event of [
    "TouchStart",
    "TouchMove",
    "TouchEnd",
    "TouchCancel",
    "Hide",
    "Show",
    "WindowResize",
  ])
    wx["on" + event] = (f) => (events[event] = f);
  class Panel {
    constructor(model, actions) {
      panel = this;
      this.model = model;
      this.actions = actions;
      this.hits = [];
    }
    press(x) {
      if (x > 650) {
        this.actions.boost();
        return true;
      }
      return false;
    }
  }
  const context = {
    exports: {},
    ...types,
    skillView,
    FrameMetrics,
    wx,
    GameGlobal: {},
    canvas: {},
    Date: { now: () => now },
    console: { info() {}, warn() {}, error() {} },
    WeChatSounds: class {
      enabled = true;
      unlock() {}
      update() {}
      setActive() {}
      toggle() {
        this.enabled = !this.enabled;
      }
      get diagnostics() {
        return {};
      }
    },
    CartoonPanel: Panel,
    World: class {
      resetMotion() {}
      pickupFeedback() {}
      inputCommand(x) {
        return { type: "input", ...x };
      }
    },
    Phaser: {
      CANVAS: 1,
      VERSION: "test",
      Scale: { NONE: 0 },
      Core: { Events: { POST_RENDER: "post" } },
      Game: class {
        constructor() {
          this.events = { on: (_e, f) => (post = f) };
          this.renderer = { type: 1 };
          this.scale = { resize() {} };
        }
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  panel.actions.connect();
  const socket = sockets[0];
  socket.handlers.open();
  const deliver = (message) =>
    socket.handlers.message({ data: JSON.stringify(message) });
  deliver({
    type: "welcome",
    id: "me",
    token: "test",
    roomId: "1",
    role: "player",
  });
  deliver({
    type: "state",
    phase: "playing",
    remaining: 100,
    players: [{ id: "me", name: "我", cooldown: 0, stun: 0, boost: 0 }],
    stations: [],
    batteries: [],
  });
  const touch = (kind, id, x, y = 220) =>
    events[kind]({
      changedTouches: [{ identifier: id, clientX: x, clientY: y }],
    });
  return {
    touch,
    events,
    context,
    sent,
    deliver,
    tick() {
      now += 50;
      post();
    },
    get model() {
      return panel.model();
    },
  };
}
test("boost finger release keeps driving owner and movement; a held third finger cannot steal it", () => {
  const h = harness();
  h.touch("TouchStart", 1, 120);
  h.touch("TouchMove", 1, 158);
  h.touch("TouchStart", 2, 740);
  h.tick();
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).boost, true);
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).x, 1);
  h.touch("TouchEnd", 2, 740);
  h.tick();
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).x, 1);
  h.touch("TouchStart", 3, 240);
  h.touch("TouchEnd", 1, 158);
  h.touch("TouchMove", 3, 280);
  h.tick();
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).x, 0);
});
test("canceling a boost finger discards dash but does not cancel driving finger", () => {
  const h = harness();
  h.touch("TouchStart", 1, 120);
  h.touch("TouchMove", 1, 158);
  h.touch("TouchStart", 2, 740);
  h.touch("TouchCancel", 2, 740);
  h.tick();
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).x, 1);
  assert.equal(h.sent.filter((m) => m.type === "input").at(-1).boost, false);
});
test("hide and spectator role cannot keep issuing movement", () => {
  const h = harness();
  h.touch("TouchStart", 1, 120);
  h.touch("TouchMove", 1, 158);
  h.events.Hide();
  h.tick();
  assert.equal(h.context.GameGlobal.roverSpike.controls.owner, null);
  h.events.Show();
  h.deliver({
    type: "welcome",
    id: "",
    token: "test",
    roomId: "1",
    role: "spectator",
  });
  h.deliver({
    type: "state",
    phase: "playing",
    remaining: 90,
    players: [],
    stations: [],
    batteries: [],
  });
  h.touch("TouchStart", 1, 120);
  h.tick();
  assert.equal(h.context.GameGlobal.roverSpike.controls.owner, null);
});
