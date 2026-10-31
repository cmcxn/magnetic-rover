// Actual production World visual replay. No server, rules, or production debug hooks.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const assets=path.join(root,'client/public/assets/cartoon');
const read=name=>JSON.parse(fs.readFileSync(path.join(assets,name),'utf8'));
function contracts(){
 assert.ok(fs.existsSync(path.join(assets,'battery-v3.json')),'RED: required runtime battery-v3.json is missing; preview-only battery is not runtime integration');
 assert.ok(fs.existsSync(path.join(assets,'station-v3-directions.json')),'RED: three-direction runtime station manifest is missing');
 const battery=read('battery-v3.json'),stations=read('station-v3-directions.json');
 assert.equal(stations.frames?.length,3,'Exactly three real projected station variants');
 for(const frame of stations.frames)assert.ok(fs.existsSync(path.join(assets,frame.image)),'Missing directional station PNG '+frame.image);
 assert.ok(fs.existsSync(path.join(assets,'battery-v3.png')),'Missing production battery PNG');
 return {battery,stations};
}
if(process.argv.includes('--check-assets')){contracts();console.log('PASS runtime asset contract readiness');process.exit(0);}
const out=process.env.SCREENSHOTS||path.join(root,'verification/station-battery-v3');
fs.mkdirSync(out,{recursive:true});
const report={method:'Actual production Phaser World in dedicated headless Chromium; synthetic authoritative-shaped snapshots, not backend/device proof',started:new Date().toISOString(),captures:[],checks:[],errors:[]};
const near=(a,b,message,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const delta=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const stations=[{x:-330,y:-220,r:65},{x:330,y:-220,r:65},{x:0,y:380,r:65}];
const player={id:'p0',name:'New battery / inward stations',color:'#38bdf8',x:-120,y:40,angle:0,cargo:20,score:0,cooldown:0,boost:0,stun:0,hitSeq:0,pickupSeq:0,connected:true};
const groundBatteries=[{id:'lift',x:0,y:110,z:0},{id:'ground',x:85,y:110,z:0},{id:'b2',x:-190,y:-60,z:0},{id:'b3',x:190,y:-60,z:0},{id:'b4',x:-270,y:-180,z:0},{id:'b5',x:270,y:-180,z:0},{id:'b6',x:0,y:285,z:0}];
let seq=0;
const snapshot=(radius=500,lift=0)=>({type:'state',serverTime:++seq*100,roundId:1,phase:'playing',remaining:120,players:[{...player}],batteries:groundBatteries.map(b=>({...b,z:b.id==='lift'?lift:b.z})),stations:stations.map(s=>({...s,x:s.x*radius/500,y:s.y*radius/500})),radius,mapScale:radius/500,vehicleScale:1,collisionRadius:25});
const html=`<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:#17231b}canvas{display:block}</style></head><body><script type="module">
import Phaser from '/node_modules/.vite/deps/phaser.js';import {World} from '/src/world.ts';
window.ready=false;window.drawCalls={ellipses:[],cargo:[]};
function tap(g,tag){let fill={color:0,alpha:1};const clear=g.clear,style=g.fillStyle,ellipse=g.fillEllipse,points=g.fillPoints;g.clear=function(...args){if(tag==='world')drawCalls.ellipses=[];else drawCalls.cargo=[];return clear.apply(this,args)};g.fillStyle=function(color,alpha=1){fill={color,alpha};return style.call(this,color,alpha)};g.fillEllipse=function(x,y,width,height,...rest){if(tag==='world')drawCalls.ellipses.push({x,y,width,height,...fill});return ellipse.call(this,x,y,width,height,...rest)};g.fillPoints=function(vertices,...args){if(tag==='cargo')drawCalls.cargo.push({vertices:vertices.map(p=>({x:p.x,y:p.y})),...fill});return points.call(this,vertices,...args)};}
class Fixture extends World{create(){super.create();tap(this.g,'world');tap(this.cargoG,'cargo');this.self='p0';window.ready=true;}}
const world=new Fixture();window.world=world;window.game=new Phaser.Game({type:Phaser.AUTO,width:innerWidth,height:innerHeight,scene:[world],audio:{noAudio:true},render:{preserveDrawingBuffer:true},scale:{mode:Phaser.Scale.RESIZE}});
window.inspect=()=>({worldScale:world.worldScale,ox:world.ox,oy:world.oy,state:world.state,diagnostics:world.vehicleDiagnostics,drawCalls,labels:[...world.labels].map(([id,label])=>({id,text:label.text})),sprites:[...world.sprites].map(([id,s])=>({id,texture:s.texture.key,frame:s.frame.name,x:s.x,y:s.y,width:s.displayWidth,height:s.displayHeight,sourceWidth:s.frame.realWidth,sourceHeight:s.frame.realHeight,originX:s.originX,originY:s.originY,rotation:s.rotation,depth:s.depth,visible:s.visible}))});
</script></body></html>`;
let browser;
try{
 const meta=contracts();report.contracts=meta;
 const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright'))}
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox'],env:{...process.env,HOME:'/tmp'}});report.browserVersion=browser.version();
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.BASE_URL||'http://127.0.0.1:5173';const served=await (await page.request.get(base+'/src/world.ts')).text();const module=served.match(/import [\w$]+ from ["']([^"']*\/phaser\.js[^"']*)["']/)?.[1];assert.ok(module,'Resolve exact production Phaser optimized module');
 await page.route('**/__station_battery_fixture.html',r=>r.fulfill({contentType:'text/html',body:html.replace('/node_modules/.vite/deps/phaser.js',module)}));
 const open=async()=>{await page.goto(base+'/__station_battery_fixture.html');await page.waitForFunction(()=>window.ready)};
 const apply=async s=>{await page.evaluate(s=>world.resetStateBaseline(s),s);await page.waitForTimeout(180)};
 const capture=async name=>{const data=await page.evaluate(()=>inspect());const file=name+'.png';await page.screenshot({path:path.join(out,file)});report.captures.push({file,viewport:{width:1200,height:900},...data});return data};
 const sprite=(data,id)=>{const s=data.sprites.find(s=>s.id===id);assert.ok(s,'Actual rendered sprite '+id);return s};
 const assertScene=(data,input)=>{
  assert.deepEqual(data.state.stations,input.stations,'Renderer must preserve all three authoritative centers/radii');assert.deepEqual(data.state.batteries,input.batteries,'Renderer must preserve pickup coordinates and server z');
  input.stations.forEach((p,i)=>{const s=sprite(data,'station-'+i),frame=meta.stations.frames[i],target=Math.atan2(-p.y,-p.x);assert.equal(s.texture,frame.key);assert.equal(s.rotation,0,'No 2D station-image rotation');near(s.x,data.ox+p.x*data.worldScale,'Station ground root x');near(s.y,data.oy+p.y*data.worldScale,'Station ground root y');near(s.originX,frame.anchorX,'Station root pivot x');near(s.originY,frame.anchorY,'Station root pivot y');near(s.width/data.worldScale,(p.r+5)*2*frame.width/frame.groundFootprintDiameterPx,'Unchanged circular radius controls station image size');assert.ok(delta(frame.screenAngle,target)<1e-6,'Selected real3D station entrance points inward');assert.ok(delta(Math.atan2(frame.entranceAnchorPx[1]-frame.rootAnchorPx[1],frame.entranceAnchorPx[0]-frame.rootAnchorPx[0]),target)<1e-6,'Projected actual entrance anchor points inward');});
  for(const b of input.batteries){const s=sprite(data,'battery-'+b.id),m=meta.battery;assert.equal(s.texture,'battery-v3','New battery must actually render, not merely be copied');assert.equal(s.rotation,0);near(s.originX,m.anchorX,'Battery ground pivot x');near(s.originY,m.anchorY,'Battery ground pivot y');near(s.width/s.height,m.width/m.height,'Uniform battery aspect, no stretch');near(s.height/data.worldScale,m.worldVisibleHeight*m.height/m.visibleHeightPx,'Metadata visible-height scale');near(s.x,data.ox+b.x*data.worldScale,'Battery server ground x');near(s.y,data.oy+(b.y+6-b.z)*data.worldScale,'Server z applied exactly once above true ground');const shadow=data.drawCalls.ellipses.find(e=>Math.abs(e.x-b.x)<1e-6&&Math.abs(e.y-(b.y+6))<1e-6&&e.color===0x796b4e);assert.ok(shadow,'Battery ground shadow stays at authoritative ground +6');near(shadow.width,Math.max(7,15-b.z*0.12),'Existing server-height shadow width');near(shadow.height,7,'Existing ground shadow height');}
  assert.equal(data.diagnostics.roverV3.ready,true,'Existing rover atlas remains active');assert.equal(data.sprites.filter(s=>s.id.startsWith('rover-v3-p0-')).length,9,'Original rover layers preserved');assert.equal(data.drawCalls.cargo.filter(c=>c.color===0xedc34f).length,20,'Existing cargo semantics/drawing retains20cells');
 };
 await open();const initial=snapshot();await apply(initial);const arena=await capture('arena-three-inward-stations-new-batteries');assertScene(arena,initial);report.checks.push({case:'all-three-stations-and-new-batteries',pass:true,centers:stations,keys:stations.map((_,i)=>sprite(arena,'station-'+i).texture)});
 const elevated=snapshot(500,70);await apply(elevated);const airborne=await capture('arena-airborne-battery');assertScene(airborne,elevated);near(sprite(airborne,'battery-lift').y-sprite(arena,'battery-lift').y,-70*arena.worldScale,'Exact server z70 lift, no double offset');report.checks.push({case:'server-z-and-ground-shadow',pass:true,z:70});
 await page.evaluate(()=>{const s=world.sprites.get('battery-lift');const g=world.sprites.get('battery-ground');world.cameras.main.setZoom(4);world.cameras.main.centerOn((s.x+g.x)/2,(s.y+g.y)/2+15)});await capture('closeup-new-battery-airborne-and-ground-shadow');
 for(let i=0;i<3;i++){await page.evaluate(i=>{const s=world.sprites.get('station-'+i);world.cameras.main.setZoom(2.5);world.cameras.main.centerOn(s.x,s.y)},i);await capture('closeup-inward-station-'+i)}
 await page.evaluate(()=>{world.cameras.main.setZoom(1);world.cameras.main.centerOn(600,450)});const expanded=snapshot(700,70);await apply(expanded);const mapped=await capture('mapscale-1-4-authoritative-roots');assertScene(mapped,expanded);near(mapped.worldScale,arena.worldScale/1.4,'Map radius changes camera scale consistently');for(let i=0;i<3;i++){near(sprite(mapped,'station-'+i).x,sprite(arena,'station-'+i).x,'Scaled authoritative station x cancels inverse camera scale');near(sprite(mapped,'station-'+i).y,sprite(arena,'station-'+i).y,'Scaled authoritative station y cancels inverse camera scale')}report.checks.push({case:'mapscale-consistency',pass:true,worldScales:[arena.worldScale,mapped.worldScale],scaledAuthoritativeCenters:expanded.stations});
 await page.route(/\/assets\/cartoon\/(?:battery-v3\.(?:png|json)|station-v3-directions\.json|station-v3-[012]\.png)(?:\?.*)?$/,r=>r.abort());await open();await apply(initial);const fallback=await capture('fallback-old-battery-and-station');for(const b of initial.batteries)assert.equal(sprite(fallback,'battery-'+b.id).texture,'battery');for(let i=0;i<3;i++)assert.equal(sprite(fallback,'station-'+i).texture,'station-v3');assert.equal(fallback.diagnostics.roverV3.ready,true);assert.equal(fallback.drawCalls.cargo.filter(c=>c.color===0xedc34f).length,20);report.checks.push({case:'missing-new-assets-fallback',pass:true});
 assert.deepEqual(errors,[],'No uncaught browser errors');report.status='passed';console.log('PASS actual World three inward stations and runtime new battery');
}catch(error){report.status='failed';report.errors.push(error.stack);console.error(error);process.exitCode=1}finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close()}
