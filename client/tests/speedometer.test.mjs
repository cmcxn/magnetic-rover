import test from 'node:test';import assert from 'node:assert/strict';import {Speedometer} from '../src/speedometer.ts';
test('needle rises and falls progressively rather than jumping to new speeds',()=>{
 const s=new Speedometer();const rising=[];for(let i=0;i<80;i++){s.update(810,16);rising.push(s.value)}assert.ok(rising[0]<100);assert.ok(rising.at(-1)>750);assert.ok(rising.every((v,i)=>!i||v>=rising[i-1]));
 const start=s.value;const falling=[];for(let i=0;i<100;i++){s.update(360,16);falling.push(s.value)}assert.ok(falling[0]>360);assert.ok(falling.at(-1)<390);assert.ok(falling.every((v,i)=>!i||v<=falling[i-1]));
 s.reset();assert.equal(s.value,0);
});
test('small measurement jitter does not make settled digits oscillate',()=>{
 const s=new Speedometer();for(let i=0;i<200;i++)s.update(540,16);const values=[];
 for(let i=0;i<180;i++){s.update(i%2?550:530,16);values.push(s.value)}
 assert.ok(Math.max(...values)-Math.min(...values)<=10);
});
