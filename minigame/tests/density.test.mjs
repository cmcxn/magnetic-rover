import test from "node:test";
import assert from "node:assert/strict";
import { installCanvasDensity } from "../src/density.ts";
test("3x canvas keeps logical dimensions and scales main-canvas transforms", () => {
  let matrix;
  const context = { setTransform: (...args) => (matrix = args) };
  const canvas = {
    width: 812,
    height: 375,
    style: {},
    getContext: () => context,
  };
  const game = {
    scale: { width: 812, height: 375 },
    renderer: {
      resize(w, h) {
        canvas.width = w;
        canvas.height = h;
      },
    },
  };
  installCanvasDensity(game, canvas, {
    windowWidth: 812,
    windowHeight: 375,
    pixelRatio: 3,
  });
  assert.equal(canvas.width, 2436);
  assert.equal(canvas.height, 1125);
  assert.equal(game.scale.width, 812);
  context.setTransform(1, 0, 0, 1, 10, 20);
  assert.deepEqual(matrix, [3, 0, 0, 3, 30, 60]);
  game.renderer.resize(844, 390);
  assert.equal(canvas.width, 2532);
  assert.equal(canvas.style.width, "844px");
});
