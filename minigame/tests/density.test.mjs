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
test("WebGL does not touch 2D or scale logical Phaser projection", () => {
  const canvas = {
    width: 844,
    height: 390,
    style: {},
    getContext() {
      throw Error("2D locks WebGL canvas");
    },
  };
  const renderer = {
    gl: {},
    resize() {
      throw Error("must not double-scale WebGL projection");
    },
  };
  assert.equal(
    installCanvasDensity({ renderer }, canvas, {
      windowWidth: 844,
      windowHeight: 390,
      pixelRatio: 3,
    }),
    1,
  );
  assert.equal(canvas.width, 844);
});

for (const ratio of [1, 2, 3])
  test(`default Canvas DPR ${ratio} preserves logical rendering and input units`, () => {
    let matrix;
    const context = { setTransform: (...args) => (matrix = args) };
    const canvas = {
      width: 844,
      height: 390,
      style: {},
      getContext: () => context,
    };
    const game = {
      scale: { width: 844, height: 390 },
      renderer: {
        resize(w, h) {
          canvas.width = w;
          canvas.height = h;
        },
      },
    };
    assert.equal(
      installCanvasDensity(game, canvas, {
        windowWidth: 844,
        windowHeight: 390,
        pixelRatio: ratio,
      }),
      ratio,
    );
    assert.equal(canvas.width, 844 * ratio);
    assert.equal(canvas.height, 390 * ratio);
    assert.equal(game.scale.width, 844);
    assert.equal(game.scale.height, 390);
    context.setTransform(1, 0, 0, 1, 25, 30);
    assert.deepEqual(matrix, [ratio, 0, 0, ratio, 25 * ratio, 30 * ratio]);
  });
