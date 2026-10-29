import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "../../client/node_modules/typescript/lib/typescript.js";
import { pickupCount } from "../../client/src/types.ts";
const source = fs.readFileSync(
  new URL("../src/audio.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "audio.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  ts
    .createPrinter()
    .printFile(
      ts.factory.updateSourceFile(
        ast,
        ast.statements.filter((s) => !ts.isImportDeclaration(s)),
      ),
    )
    .replace("export class WeChatSounds", "class WeChatSounds"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
function harness(enabled = true) {
  let now = 1000;
  const contexts = [],
    storage = new Map([["rover.sound", enabled ? "on" : "off"]]);
  const api = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    createInnerAudioContext() {
      const c = {
        plays: 0,
        stops: 0,
        play() {
          this.plays++;
          this.onPlayHandler?.();
        },
        stop() {
          this.stops++;
        },
        onPlay(f) {
          this.onPlayHandler = f;
        },
        onError(f) {
          this.errorHandler = f;
        },
        onCanplay(f) {
          this.readyHandler = f;
        },
      };
      contexts.push(c);
      return c;
    },
  };
  const sandbox = { exports: {}, pickupCount, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(code + ";globalThis.Audio=WeChatSounds", sandbox);
  const audio = new sandbox.Audio(api, () => now);
  return { audio, contexts, storage, advance: (ms) => (now += ms) };
}
const state = (patch = {}) => ({
  phase: "playing",
  remaining: 80,
  roomId: "1",
  roundId: 1,
  players: [
    {
      id: "me",
      cargo: 0,
      pickupSeq: 0,
      score: 0,
      hitSeq: 0,
      cooldown: 0,
      ...patch,
    },
  ],
  batteries: [],
  stations: [],
});
test("native audio starts only after a gesture and reuses a bounded pool", () => {
  const h = harness();
  h.audio.play("pickup");
  assert.equal(h.contexts.length, 0);
  h.audio.unlock();
  assert.equal(h.contexts.length, 6);
  h.audio.play("pickup");
  h.audio.play("pickup");
  assert.equal(h.contexts.find((c) => c.src.endsWith("pickup.wav")).plays, 1);
  h.advance(250);
  h.audio.play("pickup");
  h.audio.unlock();
  assert.equal(h.contexts.length, 6);
  assert.ok(
    h.contexts.every(
      (c) => c.src.startsWith("art/audio/") && c.obeyMuteSwitch === true,
    ),
  );
});
test("server event transitions trigger six effects, not first snapshots or cargo-only changes", () => {
  const h = harness();
  h.audio.unlock();
  h.audio.update(null, state({ pickupSeq: 8 }), "me");
  assert.equal(
    h.contexts.reduce((n, c) => n + c.plays, 0),
    0,
  );
  h.audio.update(state(), state({ cargo: 4 }), "me");
  assert.equal(
    h.contexts.reduce((n, c) => n + c.plays, 0),
    0,
  );
  for (const patch of [
    { pickupSeq: 1 },
    { cooldown: 4 },
    { hitSeq: 1 },
    { score: 1 },
  ]) {
    h.advance(300);
    h.audio.update(state(), state(patch), "me");
  }
  h.audio.update(
    { ...state(), remaining: 6 },
    { ...state(), remaining: 5 },
    "me",
  );
  h.audio.update(state(), { ...state(), phase: "finished" }, "me");
  assert.ok(h.contexts.every((c) => c.plays === 1));
});
test("room or round changes silently baseline instead of replaying rewards", () => {
  const h = harness();
  h.audio.unlock();
  h.audio.update(
    state(),
    {
      ...state({ score: 99, pickupSeq: 9, cooldown: 4, hitSeq: 1 }),
      roomId: "2",
    },
    "me",
  );
  h.audio.update(
    state(),
    { ...state({ score: 99, pickupSeq: 9 }), roundId: 2 },
    "me",
  );
  assert.equal(
    h.contexts.reduce((n, c) => n + c.plays, 0),
    0,
  );
});
test("mute persists, stops active sounds; hide suppresses events until foreground", () => {
  const h = harness();
  h.audio.unlock();
  h.audio.play("boost");
  assert.equal(h.audio.toggle(), false);
  assert.equal(h.storage.get("rover.sound"), "off");
  assert.ok(h.contexts.every((c) => c.stops > 0));
  h.advance(500);
  h.audio.play("boost");
  assert.equal(h.contexts.find((c) => c.src.endsWith("boost.wav")).plays, 1);
  assert.equal(h.audio.toggle(), true);
  h.audio.setActive(false);
  h.audio.play("hit");
  assert.equal(h.contexts.find((c) => c.src.endsWith("hit.wav")).plays, 0);
  h.audio.setActive(true);
  h.audio.play("hit");
  assert.equal(h.contexts.find((c) => c.src.endsWith("hit.wav")).plays, 1);
});
test("saved mute creates no native contexts until explicitly enabled", () => {
  const h = harness(false);
  h.audio.unlock();
  assert.equal(h.contexts.length, 0);
  h.audio.toggle();
  assert.equal(h.contexts.length, 6);
});
test("native errors are visible in read-only diagnostics, missing API cannot crash game", () => {
  const h = harness();
  h.audio.unlock();
  h.contexts[0].errorHandler({ errCode: 10003, errMsg: "decode error" });
  assert.match(h.audio.diagnostics.error, /decode error/);
  const silent = new h.audio.constructor(
    { getStorageSync: () => "", setStorageSync() {} },
    () => 0,
  );
  assert.doesNotThrow(() => {
    silent.unlock();
    silent.play("pickup");
  });
  assert.match(silent.diagnostics.error, /不支持/);
});
test("native held boost loops once and stops on release or mute", () => {
  const h = harness();
  h.audio.unlock();
  h.audio.setBoosting(true);
  h.audio.setBoosting(true);
  const effect = h.contexts.find((c) => c.src.endsWith("boost.wav"));
  assert.equal(effect.plays, 1);
  assert.equal(effect.loop, true);
  h.audio.setBoosting(false);
  assert.equal(effect.loop, false);
  h.audio.setBoosting(true);
  assert.equal(effect.plays, 2);
  h.audio.toggle();
  h.audio.setBoosting(true);
  assert.equal(effect.plays, 2);
});
