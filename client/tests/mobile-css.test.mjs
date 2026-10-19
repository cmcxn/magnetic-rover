// Structural CSS regression only, not a substitute for a real browser layout.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const css = fs.readFileSync(
  new URL("../src/style.css", import.meta.url),
  "utf8",
);
const normalized = css.replace(/\s+/g, " ");
const mobile = normalized.slice(
  normalized.indexOf("@media (max-width: 700px), (pointer: coarse)"),
);
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mobile.match(new RegExp(escaped + "\\s*\\{([^}]+)\\}"));
  assert.ok(match, selector);
  return match[1];
};
test("compact HUD applies to narrow, coarse and short-landscape viewports with explicit sizing", () => {
  assert.match(
    mobile,
    /\(max-width: 700px\), \(pointer: coarse\), \(max-height: 520px\) and \(orientation: landscape\)/,
  );
  const hud = rule(".playing .hud");
  for (const declaration of [
    "width: auto",
    "max-width: none",
    "height: 52px",
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
    "transform: none",
  ])
    assert.ok(hud.includes(declaration), declaration);
  assert.match(css, /\.stat small,\s*\.stat b\s*\{\s*white-space: nowrap;/);
  assert.match(mobile, /env\(safe-area-inset-top\)/);
  assert.match(mobile, /env\(safe-area-inset-bottom\)/);
  assert.match(mobile, /max-height: calc\([\s\S]*?100dvh/);
});
test("mobile secondary overlays and keyboard-only hint are hidden by default", () => {
  assert.match(rule(".playing .controls"), /display: none/);
  assert.match(rule(".playing .leaderboard.expanded"), /display: block/);
  assert.match(rule(".playing .controls.expanded"), /display: flex/);
  assert.match(rule(".playing .controls.expanded"), /pointer-events: auto/);
  assert.match(rule(".playing .boost .keyboard-hint"), /display: none/);
  assert.match(rule(".playing .boost"), /width: 64px/);
});
