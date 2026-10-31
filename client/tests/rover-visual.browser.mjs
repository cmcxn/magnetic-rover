// Dedicated headless browser replay of the production World; no production debug hooks.
// This is not live-server, native mini-game, or physical-phone performance evidence.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;try {({chromium}=require('playwright'));} catch {({chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright'));}
const root=path.resolve(import.meta.dirname,'../..');
const out=process.env.SCREENSHOTS || path.join(root,'verification/prerendered-rover');
const base=process.env.BASE_URL || 'http://127.0.0.1:5173';
fs.mkdirSync(out,{recursive:true});
const report={method:'Dedicated headless Chromium, actual imported production Phaser World; synthetic states, no backend',started:new Date().toISOString(),captures:[],checks:[],errors:[]};
const html=`<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#17231b}canvas{display:block}</style></head><body><script type="module">
import Phaser from '/node_modules/.vite/deps/phaser.js';
import {World} from '/src/world.ts';
class FixtureWorld extends World {create(){super.create();this.self='p0';this.diagnostics=true;window.ready=true;}}
const world=new FixtureWorld();window.world=world;
window.game=new Phaser.Game({type:Phaser.AUTO,width:innerWidth,height:innerHeight,backgroundColor:'#17231b',scene:[world],audio:{noAudio:true},render:{preserveDrawingBuffer:true},scale:{mode:Phaser.Scale.RESIZE}});
window.rasterFootprint=()=>{const sources=new Map();const all=world.textures.getTextureKeys().map(key=>({key,texture:world.textures.get(key)}));world.children.list.forEach((child,i)=>{if(child.texture)all.push({key:'scene-child-'+i,texture:child.texture})});for(const {key,texture} of all){const im=texture.getSourceImage();if(!im||!Number.isFinite(im.width)||!Number.isFinite(im.height))continue;const existing=sources.get(im);if(existing)existing.keys.push(key);else sources.set(im,{keys:[key],width:im.width,height:im.height,rgbaBytes:im.width*im.height*4});}return [...sources.values()];};
window.inspect=()=>({rasterTextures:window.rasterFootprint(),diagnostics:world.vehicleDiagnostics,sprites:[...world.sprites].map(([id,s])=>({id,texture:s.texture.key,frame:s.frame.name,pixelWidth:s.frame.realWidth,pixelHeight:s.frame.realHeight,displayWidth:s.displayWidth,displayHeight:s.displayHeight,x:s.x,y:s.y,depth:s.depth,angle:s.rotation,visible:s.visible,hasMask:!!s.mask,isCropped:!!s.isCropped,cropWidth:s._crop?.width,cropHeight:s._crop?.height})),textures:world.textures.getTextureKeys().filter(k=>k.includes('rover-v3')).map(k=>{const im=world.textures.get(k).getSourceImage();return {key:k,width:im.width,height:im.height,rgbaBytes:im.width*im.height*4}})});
window.ready=false;
</script></body></html>`;
const colors=['#38bdf8','#fb7185','#a78bfa','#facc15','#34d399','#fb923c','#e879f9','#cbd5e1'];
const player=(i,x=0,y=0,angle=0,cargo=0)=>({id:'p'+i,name:'Palette '+i,color:colors[i%8],x,y,angle,cargo,score:0,cooldown:0,boost:0,stun:0,hitSeq:0,pickupSeq:0,connected:true});
let tick=0;
const state=players=>({type:'state',serverTime:++tick*50,roundId:1,phase:'playing',remaining:120,players,batteries:[],stations:[],radius:520,vehicleScale:1,collisionRadius:25});
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox'],env:{...process.env,HOME:'/tmp'}});
 report.browserVersion=browser.version();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1200,height:800}]) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const transformedWorld=await (await page.request.get(base+'/src/world.ts')).text();
  const phaserModule=transformedWorld.match(/import [\w$]+ from ["']([^"']*\/phaser\.js[^"']*)["']/)?.[1];
  assert.ok(phaserModule,'Vite must expose the production World Phaser module URL');
  await page.route('**/__rover_visual_fixture.html',r=>r.fulfill({contentType:'text/html',body:html.replace('/node_modules/.vite/deps/phaser.js',phaserModule)}));
  const open=async()=>{await page.goto(base+'/__rover_visual_fixture.html');await page.waitForFunction(()=>window.ready===true);};
  const apply=async(players,reset=false)=>{await page.evaluate(({s,reset})=>{if(reset)world.resetStateBaseline(s);else world.state=s;},{s:state(players),reset});await page.waitForTimeout(120);};
  const capture=async name=>{const file=`${viewport.width}x${viewport.height}-${name}.png`;const details=await page.evaluate(()=>inspect());if(details.diagnostics.roverV3)delete details.diagnostics.roverV3.layers;await page.screenshot({path:path.join(out,file)});report.captures.push({file,viewport,...details});return details;};
  await open();
  // All headings and palettes use the same production rendering path. The grid is
  // intentionally limited to desktop; smaller views capture a centered local car.
  for(let heading=0;heading<16;heading++) {
   const players=viewport.width===1200?colors.map((_,i)=>player(i,(i%4-1.5)*190,(Math.floor(i/4)-.5)*230,heading*Math.PI/8,[0,10,20][i%3])):[player(0,0,0,heading*Math.PI/8,heading%3*10)];
   await apply(players,true);const d=await capture('heading-'+String(heading).padStart(2,'0'));
   assert.ok(d.sprites.length>0,'Actual World must render sprites');
   if(process.env.ALLOW_LEGACY!=='1')assert.ok(d.sprites.some(s=>s.texture.includes('rover-v3')),'Prerendered atlas layers required; legacy is not success');
   assert.ok(d.sprites.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)),'finite registered sprite positions');
   for(const sprite of d.sprites.filter(s=>s.id.startsWith('rover-v3-'))) {
    assert.equal(sprite.angle,0,'Prerendered layer must never be arbitrarily rotated');
    assert.ok(sprite.displayWidth>0&&sprite.displayHeight>0,'Positive gameplay display dimensions');
    const bound=/^[wh]-/.test(String(sprite.frame))?96:192;
    assert.ok(sprite.pixelWidth<=bound&&sprite.pixelHeight<=bound,'Cropped atlas frame within role budget: '+sprite.frame);
   }
  }
  for(const cargo of [0,10,20]) {await apply([player(0,0,0,0,cargo)],true);await capture('cargo-'+cargo);}
  const boosting={...player(0,0,0,0,10),boost:1,energy:0.5};
  await apply([boosting],true);const boosted=await capture('boost');
  if(process.env.ALLOW_LEGACY!=='1') {
   const strips=boosted.sprites.filter(s=>s.id.startsWith('rover-boost-'));
   const car=boosted.sprites.filter(s=>s.id.startsWith('rover-v3-p0-'));
   assert.ok(strips.length>0,'Prerendered boost strips visible');
   for(const strip of strips){assert.equal(strip.angle,0);const parts=strip.id.match(/^rover-boost-(.+)-(\d+)-(\d+)$/);assert.ok(parts,'Stable wheel-layer boost identity');const wheel=car.find(s=>s.id==='rover-v3-'+parts[1]+'-'+parts[2]);assert.ok(wheel,'Boost belongs to existing own wheel');assert.equal(strip.texture,wheel.texture,'Reuse actual wheel alpha texture');assert.equal(strip.frame,wheel.frame,'Reuse actual wheel frame alpha');assert.equal(strip.isCropped,true);assert.equal(strip.cropHeight,2,'Two-pixel cropped boost strip');assert.ok(strip.depth>wheel.depth&&strip.depth<=Math.max(...car.map(s=>s.depth))+.02,'Boost overlay stays in own vehicle depth group');}
  }
  await page.evaluate(()=>world.reducedEffects=true);await apply([boosting],true);const quietBoost=await capture('boost-reduced-effects');
  assert.equal(quietBoost.sprites.filter(s=>s.id.startsWith('rover-boost-')).length,0,'Reduced effects suppress boost strips');
  await page.evaluate(()=>world.reducedEffects=false);await apply([boosting],true);await apply([],true);
  assert.equal((await page.evaluate(()=>inspect())).sprites.filter(s=>s.id.startsWith('rover-boost-')).length,0,'Player removal cleans boost overlays');
  await apply([player(0,0,0,0,10),player(1,0,20,0,20)],true);
  const overlapping=await capture('overlap');
  if(process.env.ALLOW_LEGACY!=='1') {
   const back=overlapping.sprites.filter(s=>s.id.startsWith('rover-v3-p0-'));
   const front=overlapping.sprites.filter(s=>s.id.startsWith('rover-v3-p1-'));
   assert.ok(back.length>0&&front.length>0,'Both overlap rovers rendered from atlas');
   assert.ok(Math.max(...back.map(s=>s.depth))<Math.min(...front.map(s=>s.depth)),'Whole lower rover group must sort in front without wheel/body interleaving');
  }
  const motion={};
  for(const mode of ['forward','reverse','idle','lateral','steer']) {
   await apply([player(0)],true);motion[mode]=[];
   if(mode==='steer')await page.evaluate(()=>{window.motionFrames=[];window.sampleMotion=true;function collect(){if(!window.sampleMotion)return;const d=world.vehicleDiagnostics.roverV3;if(d)window.motionFrames.push(d.states.map(s=>({...s})));requestAnimationFrame(collect)}requestAnimationFrame(collect)});
   for(let frame=0;frame<12;frame++) {const distance=frame*5;await apply([player(0,mode==='forward'?distance:mode==='reverse'?-distance:0,mode==='lateral'?distance:0,mode==='steer'?frame*.045:0)]);motion[mode].push(await page.evaluate(()=>{const d=inspect().diagnostics;return {effectsActive:d.effectsActive,roverV3:d.roverV3?{ready:d.roverV3.ready,states:d.roverV3.states}:null}}));if([0,5,11].includes(frame))await capture(mode+'-'+frame);}
  }
  const steeringFrameSamples=await page.evaluate(()=>{window.sampleMotion=false;return window.motionFrames??[]});
  if(process.env.ALLOW_LEGACY!=='1') {
   const phases=mode=>motion[mode].map(d=>d.roverV3?.states.find(s=>s.id==='p0')?.phase);
   for(const mode of Object.keys(motion))assert.ok(phases(mode).every(Number.isFinite),mode+' has finite production visual phases');
   assert.ok(phases('forward').at(-1)>phases('forward')[0],'Forward increases signed phase');
   assert.ok(phases('reverse').at(-1)<phases('reverse')[0],'Reverse decreases signed phase');
   for(const mode of ['idle','lateral'])assert.ok(Math.abs(phases(mode).at(-1)-phases(mode)[0])<1e-6,mode+' must not roll forward');
   assert.ok(steeringFrameSamples.some(states=>states.some(s=>s.steer!==0)),'Steering transition selects projected wheel pose (sample every rendered frame, not only settled snapshot)');
  }
  report.checks.push({viewport,motion,steeringFrameSamples});
  await page.evaluate(()=>world.reducedEffects=true);await apply([player(0)],true);await capture('reduced-effects');
  await apply([],true);let empty=await page.evaluate(()=>inspect());assert.equal(empty.sprites.filter(s=>/^rover-v3-/.test(s.id)).length,0,'Removed player layers cleaned');
  await apply([player(0)],true);await capture('reconnected');
  const timings=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function frame(now){samples.push(now-last);last=now;if(samples.length<90)requestAnimationFrame(frame);else resolve(samples.slice(1));}requestAnimationFrame(frame);}));
  report.checks.push({viewport,browserRafIntervalsMs:timings});
  for(let nav=0;nav<3;nav++){await open();await apply([player(0)],true);assert.ok((await page.evaluate(()=>inspect())).sprites.length>0);}
  // Abort the new atlas only; production preload must keep the legacy fallback.
  await page.route('**/assets/cartoon/rover-v3/**',r=>r.abort());await open();await apply([player(0)],true);const fallback=await capture('missing-atlas-fallback');
  assert.ok(fallback.sprites.some(s=>s.id.startsWith('car-')),'Legacy car fallback visible');
  assert.equal(errors.length,0,errors.join('\n'));report.checks.push({viewport,repeatedNavigations:3,removedAndReconnected:true,missingAtlasFallback:true,pageErrors:errors});await context.close();
 }
 report.status='passed';
 const textures=new Map(report.captures.flatMap(c=>c.textures).map(t=>[t.key,t]));
 const rasterBytes=c=>c.rasterTextures.reduce((n,t)=>n+t.rgbaBytes,0);
 const maxRasterCapture=report.captures.reduce((a,b)=>rasterBytes(a)>=rasterBytes(b)?a:b);
 report.summary={captures:report.captures.length,viewports:[[390,844],[844,390],[1200,800]],headings:16,palettes:8,cargoCounts:[0,10,20],overlap:'whole-car depth assertion',atlasTextures:[...textures.values()],atlasRgbaBytes:[...textures.values()].reduce((n,t)=>n+t.rgbaBytes,0),allRasterTextures:maxRasterCapture.rasterTextures,allRasterRgbaBytes:rasterBytes(maxRasterCapture),memoryCapture:maxRasterCapture.file,memoryEstimate:'width*height*4 per unique loaded texture-manager or scene-child source image/canvas object; excludes driver allocations, mipmaps, and decoded CPU memory; includes legacy/derived/island overhead',rafTimings:report.checks.filter(c=>c.browserRafIntervalsMs).map(c=>{const sorted=[...c.browserRafIntervalsMs].sort((a,b)=>a-b);return {viewport:c.viewport,samples:sorted.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)}}),limits:'Synthetic World replay only; no live backend, mini-game native runtime, or phone FPS claim'};
 console.log('PASS actual World browser replay');
} catch(error){report.status='failed';report.errors.push(error.stack);console.error(error);process.exitCode=1;} finally {report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close();}
