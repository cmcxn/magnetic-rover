// Actual Phaser rendering of exact snapshots emitted by tests/collision_scenarios.lua.
// This replay is visual QA, NOT a live Skynet-network screenshot. Numeric assertions
// live in the Lua producer; real network proof is tests/collision_redesign_runtime.py.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'../..');
const input=process.env.SCENARIOS || path.join(root,'verification/collision-redesign/scenarios.json');
const out=process.env.SCREENSHOTS || path.join(root,'verification/collision-redesign/screenshots');
const data=JSON.parse(fs.readFileSync(input,'utf8'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium',args:['--no-sandbox']});
const report={method:'Real Chromium + Phaser client, replaying unmodified production-Lua scenario snapshots; separate real-network test recorded in runtime.json',screenshots:[],errors:[]};
try {
 for (const scenario of data.scenarios) {
  for (const viewport of [{width:1000,height:500,touch:false},{width:844,height:390,touch:true}]) {
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.touch,hasTouch:viewport.touch,deviceScaleFactor:1});
   const page=await context.newPage();let peer;let current=scenario.frames[0];
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.routeWebSocket('**/ws',ws=>{
    peer=ws;
    ws.onMessage(raw=>{
     const message=JSON.parse(raw);
     if(message.type==='join') {
      ws.send(JSON.stringify({type:'welcome',id:current.players[0].id,role:'player',roomId:current.roomId,token:'local-visual-replay-only'}));
      ws.send(JSON.stringify(current));
     }
     if(message.type==='ping') ws.send(JSON.stringify({type:'pong',id:message.id}));
    });
   });
   await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
   await page.locator('#nickname').fill('碰撞验证');await page.locator('#join').click();
   await page.locator('#cargo').waitFor();await page.waitForTimeout(250);
   const captures=Object.entries(scenario.captures).reduce((map,[name,index])=>{(map[index]??=[]).push(name);return map;},{});
   for(let i=0;i<scenario.frames.length;i++) {
    current=scenario.frames[i];peer.send(JSON.stringify(current));
    await page.waitForTimeout(55);
    for(const name of captures[i+1]??[]) {
     // Let the display's one-snapshot peer interpolation settle on this exact
     // authoritative frame without changing the simulation or recorded state.
     peer.send(JSON.stringify(current));await page.waitForTimeout(140);
     const file=`${scenario.name}-${name}-${viewport.touch?'mobile':'desktop'}.png`;
     await page.screenshot({path:path.join(out,file)});
     assert.equal(await page.locator('#cargo').textContent(),`${current.players[0].cargo} / 20`,'HUD must match authoritative snapshot');
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
     assert.equal(overflow,false,'gameplay page must not overflow viewport');
     report.screenshots.push({file,scenario:scenario.name,frame:i+1,serverTime:current.serverTime,viewport,players:current.players.map(p=>({id:p.id,cargo:p.cargo,stun:p.stun,x:p.x,y:p.y})),dropCount:current.batteries.filter(b=>b.source==='drop').length,check:scenario.check});
    }
   }
   assert.equal(errors.length,0,errors.join('\n'));await context.close();
  }
 }
 console.log(`PASS ${report.screenshots.length} real Phaser screenshots; no browser errors or viewport overflow`);
} catch(error) {report.errors.push(error.stack);throw error;} finally {
 fs.writeFileSync(path.join(out,'capture-report.json'),JSON.stringify(report,null,2));await browser.close();
}
