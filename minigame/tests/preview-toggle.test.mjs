import test from "node:test";
import assert from "node:assert/strict";
import {
  requestPreviewMode,
  previewModeRequested,
} from "../src/preview-toggle.ts";
function fixture() {
  const writes = [],
    removed = [];
  let modal;
  return {
    writes,
    removed,
    get modal() {
      return modal;
    },
    wx: {
      showModal: (o) => (modal = o),
      setStorageSync: (...x) => writes.push(x),
      removeStorageSync: (k) => removed.push(k),
    },
  };
}
test("preview enable changes nothing until explicit modal confirmation and requires restart", () => {
  const f = fixture();
  let saved;
  requestPreviewMode(f.wx, true, (x) => (saved = x));
  assert.equal(f.writes.length, 0);
  assert.match(f.modal.content, /重新打开/);
  assert.match(f.modal.content, /画质/);
  f.modal.success({ confirm: false });
  assert.equal(f.writes.length, 0);
  requestPreviewMode(f.wx, true, (x) => (saved = x));
  f.modal.success({ confirm: true });
  assert.deepEqual(f.writes, [["rover.showroom3D", true]]);
  assert.deepEqual(f.removed, ["rover.forceCanvas"]);
  assert.equal(saved, true);
});
test("ordinary preview can be restored without a renderer hot-swap or unverified restart API", () => {
  const f = fixture();
  let saved;
  requestPreviewMode(f.wx, false, (x) => (saved = x));
  f.modal.success({ confirm: true });
  assert.deepEqual(f.writes, [["rover.showroom3D", false]]);
  assert.equal(saved, false);
  assert.match(f.modal.title, /普通预览/);
  assert.equal(f.removed.length, 0);
});

test("visible toggle respects the forceCanvas override", () => {
  assert.equal(previewModeRequested({ getStorageSync: (k) => true }), false);
  assert.equal(
    previewModeRequested({ getStorageSync: (k) => k === "rover.showroom3D" }),
    true,
  );
});
