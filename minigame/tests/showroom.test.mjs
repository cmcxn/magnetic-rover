import test from "node:test";
import assert from "node:assert/strict";
import {
  MiniShowroom,
  framebufferViewport,
  readShowroomBinary,
} from "../src/showroom.ts";
function setup(loader = async () => new ArrayBuffer(8)) {
  const calls = [];
  let yaw = 0;
  const renderer = {
    load: async () => {},
    setColor: (c) => calls.push(["color", c]),
    setYaw: (y) => (yaw = y),
    getYaw: () => yaw,
    update: (d) => {
      yaw += d * 0.001;
      calls.push(["update", d]);
    },
    render: (v) => calls.push(["render", v]),
    dispose: () => calls.push(["dispose"]),
    beginDrag() {},
    endDrag() {},
    dragX: (d) => (yaw += d * 0.01),
  };
  const s = new MiniShowroom(() => renderer, loader);
  return { s, calls };
}
test("viewport converts logical top-left coordinates with framebuffer density", () => {
  assert.deepEqual(
    framebufferViewport(
      { x: 10, y: 20, width: 100, height: 80 },
      400,
      200,
      800,
      400,
    ),
    { x: 20, y: 200, width: 200, height: 160 },
  );
});
test("preview keeps fallback while loading, stops hidden, and preserves yaw across palette and recreation", async () => {
  let resolve;
  const { s, calls } = setup(() => new Promise((r) => (resolve = r)));
  s.show("#38bdf8");
  assert.equal(s.ready, false);
  resolve(new ArrayBuffer(8));
  await s.loading;
  assert.equal(s.ready, true);
  s.update(20);
  const yaw = s.yaw;
  s.show("#ff0000");
  assert.equal(s.yaw, yaw);
  s.hide();
  s.update(20);
  assert.equal(calls.filter((c) => c[0] === "update").length, 1);
  assert.equal(calls.at(-1)[0], "dispose");
  s.show("#ff0000");
  await s.loading;
  assert.equal(s.yaw, yaw);
});
test("failure keeps static fallback and does not render", async () => {
  const { s, calls } = setup(async () => {
    throw Error("missing");
  });
  s.show("#fff");
  await s.loading;
  assert.equal(s.ready, false);
  s.render({ x: 0, y: 0, width: 20, height: 20 });
  assert.ok(!calls.some((c) => c[0] === "render"));
});
test("wx loader reads packaged GLB as binary without fetch", async () => {
  let path;
  const bytes = new ArrayBuffer(4);
  const result = await readShowroomBinary({
    getFileSystemManager: () => ({
      readFile: (o) => {
        path = o.filePath;
        o.success({ data: bytes });
      },
    }),
  });
  assert.equal(result, bytes);
  assert.equal(path, "art/cartoon/rover-showroom/rover.glb");
});
test("context-loss disposal failure cannot prevent fallback or later recovery", async () => {
  let creations = 0;
  const s = new MiniShowroom(
    () => ({
      load: async () => {},
      setColor() {},
      setYaw() {},
      getYaw: () => 0.75,
      update() {},
      render() {},
      beginDrag() {},
      endDrag() {},
      dragX() {},
      dispose() {
        if (++creations === 1) throw Error("context already lost");
      },
    }),
    async () => new ArrayBuffer(8),
  );
  s.show("#38bdf8");
  await s.loading;
  assert.equal(s.ready, true);
  assert.doesNotThrow(() => s.hide());
  assert.equal(s.ready, false);
  assert.equal(s.yaw, 0.75);
  s.show("#38bdf8");
  await s.loading;
  assert.equal(s.ready, true);
});
test("failed model load is latched across palette and roster rebuilds until view reentry", async () => {
  let creates = 0,
    loads = 0;
  const renderer = {
    load: async () => {
      loads++;
      throw Error("bad model");
    },
    setColor() {},
    setYaw() {},
    getYaw: () => 0.25,
    dispose() {},
  };
  const s = new MiniShowroom(
    () => {
      creates++;
      return renderer;
    },
    async () => new ArrayBuffer(8),
  );
  s.show("#38bdf8");
  await s.loading;
  s.show("#ff0000");
  await s.loading;
  assert.equal(creates, 1);
  assert.equal(loads, 1);
  assert.equal(s.ready, false);
  s.hide();
  s.show("#ff0000");
  await s.loading;
  assert.equal(creates, 2);
  assert.equal(loads, 2);
});
test("render and update exceptions fall back and latch without crashing other scenes", async () => {
  for (const failing of ["render", "update"]) {
    let creates = 0;
    const renderer = {
      load: async () => {},
      setColor() {},
      setYaw() {},
      getYaw: () => 0.4,
      dispose() {},
      render() {
        if (failing === "render") throw Error("gpu");
      },
      update() {
        if (failing === "update") throw Error("gpu");
      },
    };
    const s = new MiniShowroom(
      () => {
        creates++;
        return renderer;
      },
      async () => new ArrayBuffer(8),
    );
    s.show("#38bdf8");
    await s.loading;
    assert.doesNotThrow(() =>
      s[failing](
        failing === "render" ? { x: 0, y: 0, width: 20, height: 20 } : 16,
      ),
    );
    assert.equal(s.ready, false);
    s.show("#ff0000");
    await s.loading;
    assert.equal(creates, 1);
  }
});
