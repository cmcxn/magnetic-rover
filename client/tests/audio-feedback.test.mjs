import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import ts from "typescript";
const source = fs
  .readFileSync(new URL("../src/audio.ts", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace("export class Sounds", "class Sounds");
function harness() {
  const context = {
    localStorage: { getItem: () => null },
    performance: { now: () => 1000 },
  };
  vm.createContext(context);
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText + ";globalThis.Sounds=Sounds;",
    context,
  );
  return new context.Sounds();
}
test("authoritative hit sequence plays collision sound even with zero cargo", () => {
  const sounds = harness();
  const played = [];
  sounds.play = (n) => played.push(n);
  const state = (hitSeq) => ({
    phase: "playing",
    remaining: 100,
    players: [{ id: "p", cargo: 0, score: 0, cooldown: 0, hitSeq }],
  });
  sounds.update(state(0), state(1), "p");
  assert.deepEqual(played, ["hit"]);
  sounds.update(state(1), state(1), "p");
  assert.deepEqual(played, ["hit"]);
});
test("boost sound is stronger than routine effects and ends within 320 milliseconds with a fade", () => {
  const sounds = harness();
  const starts = [],
    stops = [],
    ramps = [];
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: (...a) => ramps.push(a),
      linearRampToValueAtTime: (...a) => ramps.push(a),
    },
    connect() {},
  };
  sounds.context = {
    currentTime: 10,
    state: "running",
    createBufferSource: () => ({
      connect() {},
      start: (...a) => starts.push(a),
      stop: (t) => stops.push(t),
    }),
    createGain: () => gain,
  };
  sounds.buffers.set("boost", { duration: 1 });
  sounds.play("boost");
  assert.ok(gain.gain.value > 0.24 && gain.gain.value <= 0.4);
  assert.ok(stops[0] > 10 && stops[0] <= 10.32);
  assert.ok(ramps.some((a) => a[0] === 0 && a[1] <= 10.32));
});
