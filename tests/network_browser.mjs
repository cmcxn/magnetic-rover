import {chromium} from '/Users/chenmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
const errors=[],types={};
try{
 const c=await b.newContext({viewport:{width:812,height:375}});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 p.on('websocket',ws=>ws.on('framereceived',event=>{try{const m=JSON.parse(event.payload);types[m.type]=(types[m.type]||0)+1}catch{}}));
 await p.goto('http://127.0.0.1:18086');await p.locator('#nickname').fill('网络验证');
 await p.locator('#join').click();await p.locator('#create-room').click();await p.waitForTimeout(5500);
 await p.locator('#bot-action').click();await p.waitForTimeout(500);await p.locator('#start').click();await p.waitForTimeout(3000);
 await p.screenshot({path:'verification/network-sync/h5-v2.png'});
 assert.ok(types.state_full>0&&types.state_delta>10);assert.deepEqual(errors,[]);
 await c.close();
 const m=await b.newContext({viewport:{width:812,height:375}}),q=await m.newPage();q.on('pageerror',e=>errors.push(e.message));
 await q.goto('http://127.0.0.1:18088');await q.waitForTimeout(1000);await q.mouse.click(520,230);
 await q.waitForFunction(()=>window.roverSpike?.connected);await q.waitForTimeout(200);await q.mouse.click(605,92);await q.waitForFunction(()=>!!window.roverSpike?.roomId);await q.waitForTimeout(5500);
 await q.screenshot({path:'verification/network-sync/minigame-v2.png'});
 assert.deepEqual(errors,[]);await m.close();
 console.log(JSON.stringify({types,errors,h5:'real browser new-v2 AI match',mini:'packaged mini bundle under wx bridge, lobby; not native WeChat'}));
}finally{await b.close()}
