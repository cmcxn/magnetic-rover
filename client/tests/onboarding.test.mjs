import test from "node:test";
import assert from "node:assert/strict";
import { EntryGuide } from "../src/onboarding.ts";
test("first guide locks five seconds then auto closes and persists; later entry can close early", () => {
  let saved = 0;
  const g = new EntryGuide(false, () => saved++);
  g.enter("a", 100);
  g.close(1000);
  assert.equal(g.view(5099).visible, true);
  assert.equal(saved, 0);
  assert.equal(g.view(5100).visible, false);
  assert.equal(saved, 1);
  g.enter("b", 6000);
  assert.equal(g.view(6000).canClose, true);
  g.close(6001);
  assert.equal(g.view(6002).visible, false);
});
test("duplicate welcome does not extend guide; room exit cancels without marking seen", () => {
  let saved = 0;
  const g = new EntryGuide(false, () => saved++);
  g.enter("a", 0);
  g.enter("a", 4000);
  assert.equal(g.view(5000).visible, false);
  const fresh = new EntryGuide(false, () => saved++);
  fresh.enter("b", 0);
  fresh.enter(null, 1000);
  assert.equal(fresh.view(6000).visible, false);
  assert.equal(saved, 1);
});
