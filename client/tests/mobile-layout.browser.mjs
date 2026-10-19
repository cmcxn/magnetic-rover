// Real client rendering; deterministic WebSocket fixture, not a live server.
// Run with Vite on localhost:5173 and Playwright available.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const out = process.env.SCREENSHOTS || "/tmp/rover-mobile-layout";
fs.mkdirSync(out, { recursive: true });
const failures = [];
try {
  for (const [width, height, touch] of [
    [320, 640, true],
    [375, 667, true],
    [390, 740, true],
    [430, 820, true],
    [740, 390, true],
    [844, 390, true],
    [1200, 800, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.routeWebSocket("**/ws", (ws) =>
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === "ping")
          ws.send(JSON.stringify({ type: "pong", id: m.id }));
        if (m.type === "join") {
          ws.send(
            JSON.stringify({ type: "welcome", id: "p1", token: "test-only" }),
          );
          ws.send(
            JSON.stringify({
              type: "state",
              phase: "playing",
              remaining: 137,
              radius: 500,
              players: [
                {
                  id: "p1",
                  name: "当当",
                  color: "#34d399",
                  x: 0,
                  y: 0,
                  angle: 0,
                  cargo: 20,
                  score: 9999,
                  cooldown: 0,
                  boost: 0,
                  stun: 0,
                  hitSeq: 0,
                  pickupSeq: 0,
                  connected: true,
                },
              ],
              batteries: Array.from({ length: 80 }, (_, i) => ({
                id: String(i),
                x: Math.cos(i * 2.4) * Math.sqrt(i / 80) * 450,
                y: Math.sin(i * 2.4) * Math.sqrt(i / 80) * 450,
              })),
              stations: [{ x: 180, y: 0, r: 42 }],
            }),
          );
        }
      }),
    );
    await page.goto("http://127.0.0.1:5173");
    await page.locator("#nickname").fill("当当");
    await page.locator("#join").click();
    await page.locator("#score").waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${width}x${height}.png` });
    const m = await page.evaluate(() => {
      const rect = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      return {
        hud: rect(".hud"),
        labels: [...document.querySelectorAll(".stat small")].map((n) => ({
          height: n.getBoundingClientRect().height,
          scroll: n.scrollWidth,
          width: n.clientWidth,
        })),
        rankVisible: !!document
          .querySelector("#ranking")
          .getBoundingClientRect().height,
        controlsVisible: !!document
          .querySelector("#sound")
          .getBoundingClientRect().height,
        latency: rect("#latency"),
        boost: rect("#boost"),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    console.log(width, height, JSON.stringify(m));
    try {
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.equal(m.overflow, false);
      if (touch) {
        assert.ok(m.hud.height <= 56, "compact HUD");
        assert.ok(m.hud.x >= 0 && m.hud.right <= width, "HUD inside viewport");
        assert.ok(
          m.labels.every((l) => l.height < 20 && l.scroll <= l.width),
          "single-line labels",
        );
        assert.equal(m.rankVisible, false, "ranking collapsed");
        assert.equal(m.controlsVisible, false, "settings collapsed");
        assert.ok(m.latency.height > 0, "RTT retained");
        assert.ok(m.boost.width >= 44, "touch target");
      }
    } catch (e) {
      failures.push(`${width}x${height}: ${e.message}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, []);
