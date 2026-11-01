import test from "node:test";
import assert from "node:assert/strict";
import { selectMiniRenderer } from "../src/renderer-config.js";
test("experimental opt-in acquires WebGL without 2D on successful main context", () => {
  const calls = [];
  const gl = {};
  const selected = selectMiniRenderer(
    {
      getContext: (kind) => {
        calls.push(kind);
        return gl;
      },
    },
    { getStorageSync: (key) => key === "rover.showroom3D" },
  );
  assert.equal(selected.mode, "webgl");
  assert.equal(selected.context, gl);
  assert.deepEqual(calls, ["webgl"]);
});
test("forceCanvas switch does not probe WebGL, while unsupported devices fallback before 2D lock", () => {
  let calls = [];
  const canvas = {
    getContext: (k) => {
      calls.push(k);
      return k === "2d" ? {} : null;
    },
  };
  assert.equal(
    selectMiniRenderer(canvas, { getStorageSync: () => true }).mode,
    "canvas",
  );
  assert.deepEqual(calls, ["2d"]);
  calls = [];
  assert.equal(
    selectMiniRenderer(canvas, {
      getStorageSync: (key) => key === "rover.showroom3D",
    }).mode,
    "canvas",
  );
  assert.deepEqual(calls, ["webgl", "experimental-webgl", "2d"]);
});

test("default startup retains high-density Canvas without probing WebGL", () => {
  const calls = [];
  const selected = selectMiniRenderer(
    {
      getContext: (kind) => {
        calls.push(kind);
        return {};
      },
    },
    {},
  );
  assert.equal(selected.mode, "canvas");
  assert.deepEqual(calls, ["2d"]);
});
