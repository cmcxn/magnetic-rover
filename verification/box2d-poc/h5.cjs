// Run with a local Vite frontend and the isolated h5.lua service.
const { chromium } = require('playwright-core');
(async () => {
 const browser = await chromium.launch({executablePath: process.env.BROWSER, headless:true});
 try {
  const page = await browser.newPage();
  const url='ws://127.0.0.1:18982/ws';
  await page.addInitScript(url=>localStorage.setItem('rover.server',url),url);
  await page.goto('http://127.0.0.1:18983/');
  await page.fill('#nickname','POC driver');
  await page.click('#join'); await page.click('#create-room');
  const roomId=await page.locator('#room-code').innerText();
  await page.evaluate(async ({roomId,url})=>{
   const {Motion}=await import('/src/motion.ts');
   const receive=Motion.prototype.receive;
   window.samples=[];window.lastImpact=0;
   Motion.prototype.receive=function(state,self,spectator,now){
    const before=this.sample(now).get(self);
    const result=receive.call(this,state,self,spectator,now);
    const after=this.sample(now).get(self);
    const p=state.players.find(p=>p.id===self);
    if(p && before && after && p.impactSeq>window.lastImpact){
     window.samples.push({time:state.serverTime,before:[before.x,before.y],after:[after.x,after.y],dx:after.x-before.x,dy:after.y-before.y,angle:p.angle,input:[p.ix,p.iy]});
     window.lastImpact=p.impactSeq;
    }
    return result;
   };
   const ws=new WebSocket(url);
   const send=data=>ws.send(JSON.stringify(data));
   ws.onopen=()=>send({type:'join',name:'impactor'});
   ws.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.type==='welcome' && m.role==='directory')send({type:'join_room',roomId});
    if(m.type==='welcome' && m.role==='player')send({type:'ready',ready:true});
    if(m.phase==='playing')window.playing=true;
    if(m.phase==='finished')window.finished=true;
   };
  },{url,roomId});
  await page.click('#start');
  await page.waitForFunction(()=>window.playing);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>window.samples.length>0,undefined,{timeout:12000});
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(()=>window.finished,undefined,{timeout:120000});
  const samples=await page.evaluate(()=>window.samples);
  console.log(JSON.stringify({finished:true,impactCorrections:samples}));
  if(!samples.length) throw Error('No self impact observation');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
