import test from "node:test";
import assert from "node:assert/strict";
import { lobbyCardLayout } from "../src/lobby-layout.ts";
test("rotated rover, name and ready status each fit their own lane for one through eight players", () => {
  for (let count = 1; count <= 8; count++) {
    const l = lobbyCardLayout(count),
      half =
        (Math.abs(Math.sin(l.angle)) * l.carWidth +
          Math.abs(Math.cos(l.angle)) * l.carWidth * 0.7) /
        2;
    assert.ok(l.carY - half >= 0, "wheel above card");
    assert.ok(l.carY + half < l.nameTop, "wheel overlaps nickname");
    assert.ok(
      l.nameTop + l.nameHeight < l.readyY - l.readyFont * 0.5,
      "nickname overlaps ready",
    );
    assert.ok(
      l.readyY + l.readyFont * 0.65 <= l.height,
      "ready label leaves card",
    );
    assert.ok(
      l.top + (l.rows - 1) * l.rowStep + l.height < 348,
      "cards overlap start button",
    );
  }
});
