// Real isolated Skynet only. Node 22+ native WebSocket.
// node tests/sync_protocol_ws.mjs --uri ws://127.0.0.1:18083/ws --report report.json
import fs from "node:fs";
import assert from "node:assert/strict";
import { StateDecoder } from "../client/src/state-codec.ts";
const args=process.argv.slice(2),opt=(k,d)=>args[args.indexOf(k)+1]||d;
const uri=opt("--uri","ws://127.0.0.1:18083/ws"),out=opt("--report","/tmp/rover-sync-ws.json");
assert.ok(/^ws:\/\/(127\.0\.0\.1|localhost):/.test(uri),"isolated loopback only");
const peers=[],checks=[],errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,timeout=6000){const end=Date.now()+timeout;while(!f()){if(errors.length)throw Error(errors.join(";"));if(Date.now()>end)throw Error("timeout");await sleep(30);}}
function connect(name,v=2,token) {
 const p={name,v,token,bytes:0,wsBytes:0,byType:{},messages:[],rawFrames:[],decoder:new StateDecoder(),applied:0,ignored:0,recovery:0,seq:0,closed:false};
 p.ws=new WebSocket(uri);
 p.send=m=>p.ws.send(JSON.stringify(m));
 p.ws.onopen=()=>p.send({type:"join",name,protocolVersion:v,token});
 p.ws.onerror=e=>errors.push(name+" socket error");
 p.ws.onclose=()=>p.closed=true;
 p.ws.onmessage=e=>{
  const m=JSON.parse(e.data),n=Buffer.byteLength(e.data);
  p.bytes+=n;p.wsBytes+=n+(n<126?2:n<65536?4:10);
  const cat=p.byType[m.type]??={messages:0,bytes:0};cat.messages++;cat.bytes+=n;
  p.messages.push(m.type);if(p.messages.length>100)p.messages.shift();
  if(m.type==="welcome"){p.token=m.token;p.roomId=m.roomId;p.id=m.id;p.decoder.reset(m.roomId??undefined);p.welcome=m;p.state=null}
  else if(m.type.startsWith("state_")){
   if(p.skipOne&&m.type==="state_delta"){p.skipOne=false;return;}
   const r=p.decoder.apply(m);
   if(r.status==="need_full"){
    if(p.testGap){if(!p.gapRequestedAt||Date.now()-p.gapRequestedAt>=1000){p.gapRequestedAt=Date.now();p.send({type:"request_full"});}return;}
    errors.push(name+" invalid chain: "+r.reason);return;
   }
   if(p.testGap&&r.status==="applied"&&r.mode==="recover"){p.recoveredGap=true;p.testGap=false;}
   if(r.status==="applied"){p.state=r.state;p.applied++;if(r.mode==="recover")p.recovery++;p.epoch=m.epoch;p.lastState=Date.now();}
   else p.ignored++;
  } else if(m.type==="state"){p.state=m;p.lastState=Date.now();}
  else if(m.type==="error")p.lastError=m;
 };
 peers.push(p);return p;
}
const started=Date.now();
let interval;
try{
 const players=[];
 for(let i=0;i<8;i++){
  const p=connect("Tester"+i);players.push(p);await until(()=>p.welcome);
  p.send(i===0?{type:"create_room"}:{type:"join_room",roomId:players[0].roomId});
  await until(()=>p.state?.players.length===i+1);
 }
 const room=players[0].roomId;
 const legacy=connect("LegacyObserver",1);await until(()=>legacy.welcome);legacy.send({type:"spectate",roomId:room});await until(()=>legacy.state);
 const viewer=connect("V2Observer");await until(()=>viewer.welcome);viewer.send({type:"spectate",roomId:room});await until(()=>viewer.state);
 assert.equal(viewer.state.players.length,8);checks.push("8 v2 player seats + v1/v2 spectators");
 players[0].send({type:"set_name",name:"Changed"});
 await until(()=>viewer.state.players.some(p=>p.name==="Changed"));checks.push("metadata rename propagation");
 const before=viewer.byType.state_full.messages;
 for(let i=0;i<8;i++)viewer.send({type:"request_full"});
 await sleep(300);assert.equal(viewer.byType.state_full.messages,before+1);checks.push("spectator full recovery + resync rate limit");
 for(const p of players)p.send({type:"ready",ready:true});
 await until(()=>players.every(p=>p.state?.phase==="playing"));
 await sleep(1100);
 viewer.testGap=true;viewer.skipOne=true;
 await until(()=>viewer.recoveredGap);checks.push("discarded delta -> detected baseline gap -> canonical full -> resumed deltas");
 const playStart=Date.now(),oldEpoch=players[0].epoch;
 interval=setInterval(()=>{
  const t=(Date.now()-playStart)/1000;
  for(let i=0;i<players.length;i++){
   const p=players[i];if(p.closed||p.state?.phase!=="playing")continue;
   p.seq++;p.send({type:"input",x:Math.cos(t*.21+i),y:Math.sin(t*.21+i),boost:(t+i*.31)%4<.15,seq:p.seq});
  }
 },50);
 await sleep(args.includes("--smoke")?2000:20000);
 const prior=players[0];prior.ws.close();await until(()=>prior.closed);await sleep(250);
 const resumed=connect("Changed",2,prior.token);await until(()=>resumed.state?.phase==="playing");
 assert.equal(resumed.roomId,room);assert.equal(resumed.id,prior.id);assert.equal(resumed.epoch,oldEpoch);
 players[0]=resumed;checks.push("single connection reconnect preserves room epoch + canonical full");
 if(args.includes("--smoke")) {
  const report={uri,checks,errors,mode:"final-code smoke: mixed clients, resync, reconnect",seconds:(Date.now()-started)/1000};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
 } else {
 await until(()=>players.every(p=>p.state?.phase==="finished"),90000);
 const results=players[0].state.results;assert.ok(results?.length===8);
 assert.deepEqual(results.map(p=>[p.id,p.score]),legacy.state.results.map(p=>[p.id,p.score]));checks.push("same v1/v2 final scores");
 await until(()=>players.every(p=>p.state?.phase==="lobby"),15000);
 assert.notEqual(players[0].epoch,oldEpoch);assert.equal(players[0].state.results,undefined);checks.push("finished -> lobby new epoch and cleared results");
 await sleep(20000);
 for(const p of players){assert.ok(Date.now()-p.lastState<2100);assert.equal(p.closed,false)}
 checks.push("20-second lobby healthy on <=1Hz updates");
 // Prove a new round reset, then clean up all test connections.
 for(const p of players)p.send({type:"ready",ready:true});
 await until(()=>players.every(p=>p.state?.phase==="playing"));
 assert.equal(players[0].state.roundId,2);checks.push("next round self-contained full");
 const report={uri,seconds:(Date.now()-started)/1000,checks,errors,peers:peers.map(p=>({name:p.name,protocol:p.v,bytes:p.bytes,websocketFrameBytes:p.wsBytes,byType:p.byType,applied:p.applied,recovery:p.recovery,ignored:p.ignored}))};
 fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
 }
}finally{clearInterval(interval);for(const p of peers)if(p.ws.readyState===1){p.send({type:"leave_room"});p.ws.close();}}
