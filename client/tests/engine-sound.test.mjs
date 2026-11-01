import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('recorded engine edit preserves PCM format and unclipped headroom',()=>{
 const b=fs.readFileSync(new URL('../public/assets/audio/boost-engine.wav',import.meta.url));const rate=b.readUInt32LE(24),n=Math.round(rate*.4),offset=Math.round(rate*.08);
 assert.equal(rate,44100);assert.ok(b.length>40000);
 let peak=0;for(let i=44;i<b.length;i+=2)peak=Math.max(peak,Math.abs(b.readInt16LE(i)));assert.ok(peak<32767);
});
