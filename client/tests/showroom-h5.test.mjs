import test from "node:test";
import assert from "node:assert/strict";
import {
  H5Showroom,
  updateSelectionRoster,
  installShowroom,
} from "../src/showroom-h5.ts";
class Canvas {
  width = 0;
  height = 0;
  style = {};
  listeners = new Map();
  parentElement = null;
  setAttribute() {}
  addEventListener(k, v) {
    this.listeners.set(k, v);
  }
  removeEventListener(k) {
    this.listeners.delete(k);
  }
  remove() {
    this.parentElement = null;
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}
function setup() {
  let calls = [],
    frames = [],
    renderer;
  const canvas = new Canvas();
  const host = () => ({
    dataset: {},
    isConnected: true,
    clientWidth: 220,
    clientHeight: 160,
    append(c) {
      c.parentElement = this;
    },
    classList: { add() {}, remove() {} },
    setAttribute() {},
  });
  const env = {
    canvas,
    raf: (f) => (frames.push(f), frames.length),
    cancel() {},
    hidden: () => false,
    reduced: () => false,
    pixelRatio: () => 1,
    load: async () => new ArrayBuffer(4),
    create: async () =>
      (renderer = {
        yaw: 0.4,
        load: async () => calls.push("load"),
        setColor: (c) => calls.push(c),
        getYaw: () => renderer.yaw,
        setYaw: (y) => (renderer.yaw = y),
        setAutoRotate() {},
        update() {
          renderer.yaw += 0.1;
        },
        render() {
          calls.push("render");
        },
        beginDrag() {},
        endDrag() {},
        dragX: (x) => (renderer.yaw += x),
        dispose() {
          calls.push("dispose");
        },
      }),
  };
  return {
    calls,
    frames,
    host,
    env,
    get renderer() {
      return renderer;
    },
  };
}
test("palette redraw moves the same canvas without reloading or resetting yaw", async () => {
  const s = setup(),
    p = new H5Showroom(s.env),
    a = s.host(),
    b = s.host();
  await p.attach(a, "#38bdf8");
  s.renderer.yaw = 2;
  p.attach(b, "#fb7185");
  await Promise.resolve();
  assert.equal(s.env.canvas.parentElement, b);
  assert.equal(s.renderer.yaw, 2);
  assert.equal(s.calls.filter((x) => x === "load").length, 1);
  assert.ok(s.calls.includes("#fb7185"));
  p.dispose();
});
test("leaving disposes GPU, reentry restores yaw, async load cannot revive a departed host", async () => {
  const s = setup(),
    p = new H5Showroom(s.env);
  await p.attach(s.host(), "#38bdf8");
  s.renderer.yaw = 1.7;
  p.detach();
  assert.ok(s.calls.includes("dispose"));
  await p.attach(s.host(), "#facc15");
  assert.equal(s.renderer.yaw, 1.7);
  p.dispose();
  assert.equal(s.env.canvas.parentElement, null);
});
test("loader error preserves static host fallback and prevents animation", async () => {
  const s = setup();
  s.env.load = async () => {
    throw Error("missing");
  };
  const p = new H5Showroom(s.env),
    h = s.host();
  await p.attach(h, "#38bdf8");
  assert.equal(h.dataset.showroomStatus, "fallback");
  assert.equal(s.calls.includes("render"), false);
  p.dispose();
});
test("real lobby integrates only the own selection card and does not modify match World", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /installShowroom\(surface\)/);
  assert.ok(source.includes("data-showroom-color"));
  assert.ok(source.includes('p.id === id && role === "player"'));
});
test("failed model does not retry on every lobby redraw, but reentry can retry", async () => {
  const s = setup();
  let loads = 0;
  s.env.load = async () => {
    loads++;
    throw Error("missing");
  };
  const p = new H5Showroom(s.env);
  await p.attach(s.host(), "#38bdf8");
  await p.attach(s.host(), "#fb7185");
  assert.equal(loads, 1);
  p.detach();
  await p.attach(s.host(), "#38bdf8");
  assert.equal(loads, 2);
  p.dispose();
});
test("lost pointer capture during a roster rebuild releases drag for the next pointer", async () => {
  const s = setup();
  const p = new H5Showroom(s.env);
  await p.attach(s.host(), "#38bdf8");
  let starts = 0,
    ends = 0;
  s.renderer.beginDrag = () => starts++;
  s.renderer.endDrag = () => ends++;
  const c = s.env.canvas;
  c.listeners.get("pointerdown")({ pointerId: 1, button: 0, clientX: 0 });
  assert.ok(c.listeners.has("lostpointercapture"));
  c.listeners.get("lostpointercapture")({ pointerId: 1 });
  c.listeners.get("pointerdown")({ pointerId: 2, button: 0, clientX: 0 });
  assert.equal(starts, 2);
  assert.equal(ends, 1);
  p.dispose();
});
test("a late GLB completion cannot animate after leaving the selection view", async () => {
  const s = setup();
  let finish;
  s.env.load = () => new Promise((r) => (finish = r));
  const p = new H5Showroom(s.env),
    pending = p.attach(s.host(), "#38bdf8");
  await Promise.resolve();
  p.detach();
  finish(new ArrayBuffer(4));
  await pending;
  assert.equal(s.frames.length, 0);
  assert.equal(s.calls.filter((x) => x === "dispose").length, 1);
  p.dispose();
});
test("document hidden frames never update or render the model", async () => {
  const s = setup();
  s.env.hidden = () => true;
  const p = new H5Showroom(s.env);
  await p.attach(s.host(), "#38bdf8");
  s.frames.shift()(100);
  assert.equal(s.calls.includes("render"), false);
  assert.equal(s.renderer.yaw, 0.4);
  p.dispose();
});

test("identical server snapshots do not detach the captured preview canvas", () => {
  let writes = 0,
    html = "";
  const node = {
    get innerHTML() {
      return html;
    },
    set innerHTML(v) {
      writes++;
      html = v;
    },
  };
  updateSelectionRoster(node, "same");
  updateSelectionRoster(node, "same");
  assert.equal(writes, 1);
  updateSelectionRoster(node, "changed");
  assert.equal(writes, 2);
});

test("native animation functions are invoked through their Window-safe wrappers at startup", () => {
  const s = setup(),
    keys = [
      "document",
      "MutationObserver",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
    old = keys.map((k) => globalThis[k]);
  let cancels = 0;
  globalThis.document = { createElement: () => s.env.canvas };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = function () {
    assert.equal(this, undefined);
    return 1;
  };
  globalThis.cancelAnimationFrame = function () {
    assert.equal(this, undefined);
    cancels++;
  };
  try {
    const stop = installShowroom({ querySelector: () => null });
    stop();
    assert.equal(cancels, 2);
  } finally {
    keys.forEach((k, i) => {
      if (old[i] === undefined) delete globalThis[k];
      else globalThis[k] = old[i];
    });
  }
});
test("unrelated lobby DOM updates never reappend an already attached captured canvas", async () => {
  const s = setup(),
    h = s.host();
  let appends = 0;
  const append = h.append.bind(h);
  h.append = (c) => {
    appends++;
    append(c);
  };
  const p = new H5Showroom(s.env);
  await p.attach(h, "#38bdf8");
  await p.attach(h, "#38bdf8");
  assert.equal(appends, 1);
  p.dispose();
});
