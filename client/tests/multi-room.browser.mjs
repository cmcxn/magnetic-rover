// Deterministic WebSocket fixture: visual/layout QA only, not live-server proof.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
  args: ["--no-sandbox"],
});
const out = process.env.SCREENSHOTS || "/tmp/rover-multi-room";
fs.mkdirSync(out, { recursive: true });
const players = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  name: ["薄荷闪电", "珊瑚小车", "紫罗兰", "阳光小车"][i % 4],
  color: ["#38bdf8", "#fb7185", "#a78bfa", "#facc15"][i % 4],
  ready: i !== 0,
  connected: true,
  x: i * 40,
  y: 0,
  angle: 0,
  cargo: 5,
  score: i,
  cooldown: 0,
  boost: 0,
  stun: 0,
  hitSeq: 0,
  pickupSeq: 0,
}));
try {
  for (const [width, height] of [
    [390, 740],
    [844, 390],
    [1200, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1000,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let peer;
    let inputs = [];
    const send = (data) => peer.send(JSON.stringify(data));
    const welcome = (role, roomId) =>
      send({
        type: "welcome",
        id: role === "player" ? "p1" : "",
        token: "fixture",
        role,
        roomId,
      });
    const state = (phase = "lobby", roomId = "3862") =>
      send({
        type: "state",
        phase,
        roomId,
        roomCode: roomId,
        remaining: 100,
        players,
        readyCount: 7,
        playerCount: 8,
        spectatorCount: 0,
        radius: 500,
        stations: [],
        batteries: [],
      });
    await page.routeWebSocket("**/ws", (ws) => {
      peer = ws;
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === "join") {
          welcome("directory", null);
          send({
            type: "rooms",
            rooms: [
              {
                roomId: "3862",
                roomCode: "3862",
                phase: "playing",
                remaining: 70,
                playerCount: 8,
                readyCount: 8,
                spectatorCount: 0,
                canJoin: false,
                canSpectate: true,
              },
            ],
          });
        }
        if (m.type === "create_room") {
          welcome("player", "3862");
          state();
        }
        if (m.type === "spectate") {
          welcome("spectator", "3862");
          state("playing");
        }
        if (m.type === "ping") send({ type: "pong", id: m.id });
        if (m.type === "input") inputs.push(m);
      });
    });
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5173");
    await page.locator("#nickname").fill("测试车手");
    await page.locator("#join").click();
    await page.locator("#create-room").waitFor();
    await page.screenshot({ path: `${out}/directory-${width}.png` });
    await page.locator("#create-room").click();
    await page.locator("#start").waitFor();
    await page.locator("#start").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".car-card").count(), 8);
    await page.screenshot({ path: `${out}/lobby-${width}.png` });
    assert.ok(
      await page
        .locator(".garage")
        .evaluate((e) => e.getBoundingClientRect().right <= innerWidth),
    );
    welcome("spectator", "9000");
    state("playing", "9000");
    await page.locator("#follow-player").waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#boost").isVisible(), false);
    assert.equal(await page.locator("#cargo").isVisible(), false);
    assert.equal(inputs.length, 0);
    await page.locator("#follow-player").selectOption("p2");
    await page.screenshot({ path: `${out}/spectator-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `${width}x${height}: directory, 8-player garage, same-phase spectator transition, no inputs PASS`,
    );
  }
} finally {
  await browser.close();
}
