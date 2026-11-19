import test from "node:test";
import assert from "node:assert/strict";
import { createWarmup } from "../src/health.ts";

function harness(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const requests = [];
  const warmup = createWarmup((complete) => {
    const request = { complete, aborted: false };
    requests.push(request);
    return { abort: () => { request.aborted = true; } };
  });
  return { warmup, requests, tick: (ms) => t.mock.timers.tick(ms) };
}

test("warmup retries only after failure and enters once after validated health", (t) => {
  const { warmup, requests, tick } = harness(t);
  let joins = 0;
  warmup.start();
  warmup.join(() => joins++);
  requests[0].complete({ statusCode: 200, data: { ready: true } });
  tick(999);
  assert.equal(requests.length, 1);
  tick(1);
  requests[1].complete({ statusCode: 200, data: { ready: true, wechatWs: true } });
  assert.equal(joins, 1);
  tick(45000);
  assert.equal(requests.length, 2);
  assert.equal(warmup.failed, false);
});

test("warmup stops after 45 seconds and a retry starts a new attempt", (t) => {
  const { warmup, requests, tick } = harness(t);
  warmup.join(() => assert.fail("old action resumed"));
  tick(45000);
  assert.equal(warmup.failed, true);
  assert.equal(requests[0].aborted, true);
  requests[0].complete({ statusCode: 200, data: { ready: true, wechatWs: true } });
  warmup.join(() => {});
  assert.equal(requests.length, 2);
});

test("background aborts pending request and foreground resumes queued entry", (t) => {
  const { warmup, requests } = harness(t);
  let joins = 0;
  warmup.join(() => joins++);
  warmup.pause();
  assert.equal(requests[0].aborted, true);
  requests[0].complete({ statusCode: 200, data: { ready: true, wechatWs: true } });
  assert.equal(joins, 0);
  warmup.start();
  requests[1].complete({ statusCode: 200, data: { ready: true, wechatWs: true } });
  assert.equal(joins, 1);
});
