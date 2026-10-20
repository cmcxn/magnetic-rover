// Structural CSS regression only, not a substitute for a real browser layout.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const css = fs.readFileSync(
  process.env.MOBILE_CSS_PATH || new URL("../src/style.css", import.meta.url),
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

test("waiting room reflows to fit available height without clipping scroll fallback", () => {
  const lobby = normalized.slice(normalized.indexOf("/* Waiting room fit"));
  assert.ok(lobby.startsWith("/* Waiting room fit"));
  assert.match(lobby, /\.lobby \.garage-center \{[^}]*safe-area-inset-top/);
  assert.match(
    lobby,
    /\.lobby \.card\.garage \{[^}]*max-height: 100%[^}]*overflow-y: auto/,
  );
  assert.match(
    lobby,
    /grid-template-areas: "logo logo" "code code" "roster roster" "slots start"/,
  );
  assert.match(lobby, /grid-template-areas: "logo logo code code code code"/);
  assert.match(lobby, /\.lobby \.error:empty \{[^}]*display: none/);
  assert.match(lobby, /\.lobby \.leave-room[^}]*min-height: 44px/);
  assert.doesNotMatch(lobby, /overflow(?:-y)?: (?:hidden|clip)/);
});

test("short lobby reserves painted-wheel space instead of shrinking artwork under names", () => {
  const lobby = normalized.slice(normalized.indexOf("/* Waiting room fit"));
  assert.match(
    lobby,
    /\.lobby \.car-art \{[^}]*height: 52px;[^}]*min-height: 52px/,
  );
  assert.doesNotMatch(lobby, /height: (?:28px|26px|clamp\(28px)/);
  assert.match(lobby, /grid-template-rows: repeat\(8, max-content\)/);
  assert.match(
    lobby,
    /\.lobby \.car-card > strong \{[^}]*white-space: normal[^}]*overflow-wrap: anywhere/,
  );
});

test("return and mobile menus share flow layout and preserve wrapping FPS/RTT", () => {
  assert.match(normalized, /\.playing \.match-actions \{[^}]*display: flex/);
  assert.match(
    normalized,
    /\.playing \.match-actions \.secondary \{[^}]*position: static[^}]*min-height: 44px/,
  );
  assert.match(
    normalized,
    /\.playing \.performance-line \{[^}]*flex-wrap: wrap/,
  );
});
