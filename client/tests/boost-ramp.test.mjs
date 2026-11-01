import test from "node:test";
import assert from "node:assert/strict";
import { boostAverage, integrate } from "../src/motion.ts";
test("held boost ramps toward cap and is independent of frame partition", () => {
  assert.ok(boostAverage(0.2, 0.05, 0.6, 3) > boostAverage(0, 0.05, 0.6, 3));
  assert.equal(boostAverage(1, 0.1, 0.6, 3), 3);
  assert.equal(boostAverage(0, 0.1, 0, 3), 3);
  const total = boostAverage(0, 0.8, 0.6, 3) * 0.8;
  let sum = 0;
  for (let i = 0; i < 16; i++)
    sum += boostAverage(i * 0.05, 0.05, 0.6, 3) * 0.05;
  assert.ok(Math.abs(sum - total) < 1e-9);
});

test("prediction integrates held acceleration consistently across frame sizes", () => {
  const player = () => ({
    x: 0,
    y: 0,
    angle: 0,
    ix: 1,
    iy: 0,
    bx: 1,
    by: 0,
    boost: 1.3,
    boostHeld: true,
    boostElapsed: 0,
    energy: 1,
    boostCapacity: 1.3,
    cargo: 0,
    connected: true,
    stun: 0,
    cooldown: 0,
  });
  const a = player(),
    b = player();
  integrate(a, 0.8, 10000, 0, 360, 1.5, [], 0.6);
  for (let i = 0; i < 16; i++) integrate(b, 0.05, 10000, 0, 360, 1.5, [], 0.6);
  assert.ok(Math.abs(a.x - b.x) < 1e-8);
  assert.ok(Math.abs(a.boostElapsed - 0.8) < 1e-8);
  assert.ok(Math.abs(a.x - 360 * boostAverage(0, 0.8, 0.6, 1.5) * 0.8) < 1e-8);
});
test('half-capacity duration reaches 150 percent of prescribed boost speed',()=>{
 const duration=1.3,prescribed=1.5,cap=prescribed*1.5;
 assert.equal(boostAverage(duration/2,0,duration/2,cap),2.25);
 assert.ok(boostAverage(.5,.1,duration/2,cap)>prescribed);
});
test('energy exhaustion coasts down instead of returning instantly to normal speed',()=>{
 const p={x:0,y:0,angle:0,ix:1,iy:0,bx:1,by:0,boost:0,boostSpeed:2.25,boostElapsed:1.3,cargo:0,connected:true,stun:0,cooldown:0};
 integrate(p,.05,10000,0,360,2.25,[],.65,.7);const first=p.x/.05;assert.ok(first>700);assert.ok(p.boostSpeed<2.25&&p.boostSpeed>1);
 for(let i=0;i<20;i++)integrate(p,.05,10000,0,360,2.25,[],.65,.7);assert.equal(p.boostSpeed,1);
});
