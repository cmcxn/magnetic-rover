import test from "node:test";
import assert from "node:assert/strict";
import { createWarmup, startWeChatWarmup } from "../src/health.ts";

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

test("foreground stays warm without a join and hiding cancels the heartbeat", (t) => {
  const { warmup, requests, tick } = harness(t);
  const ready = { statusCode: 200, data: { ready: true, wechatWs: true } };
  warmup.start();
  requests[0].complete(ready);
  tick(59_999);
  assert.equal(requests.length, 1);
  tick(1);
  assert.equal(requests.length, 2);
  requests[1].complete(ready);
  tick(60_000);
  assert.equal(requests.length, 3);
  requests[2].complete(ready);
  warmup.pause();
  tick(60_000);
  assert.equal(requests.length, 3);
  warmup.start();
  assert.equal(requests.length, 4);
});

test("failed foreground warmup resumes at heartbeat cadence", (t) => {
  const { warmup, requests, tick } = harness(t);
  warmup.start();
  tick(45_000);
  assert.equal(warmup.failed, true);
  tick(59_999);
  assert.equal(requests.length, 1);
  tick(1);
  assert.equal(requests.length, 2);
});

test("default warmup checks the WeChat Cloud Run service and resumes queued entry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let options;
  let resolve;
  const wx = {
    cloud: {
      init() {},
      callContainer(request) {
        options = request;
        return new Promise((complete) => { resolve = complete; });
      },
    },
    onHide() {},
    onShow() {},
  };
  const warmup = startWeChatWarmup(wx, "");
  let entered = false;
  warmup.join(() => { entered = true; });
  assert.deepEqual(options.config, { env: "prod-d9ghudrmh2b8bfd7c" });
  assert.equal(options.header["X-WX-SERVICE"], "mr");
  assert.equal(options.path, "/healthz");
  resolve({ statusCode: 200, data: { ready: true, wechatWs: true } });
  await Promise.resolve();
  assert.equal(entered, true);
  warmup.pause();
});
