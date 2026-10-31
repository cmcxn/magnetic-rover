// Product decoder + independent raw-State oracle + shared Motion replay.
// node tests/network_replay.mjs fixture.jsonl report.json
import fs from "node:fs";
import assert from "node:assert/strict";
import { StateDecoder } from "../client/src/state-codec.ts";
import { Motion } from "../client/src/motion.ts";
const [input,output]=process.argv.slice(2);
const rows=fs.readFileSync(input,"utf8").trim().split("\n").map(JSON.parse);
const decoder=new StateDecoder();decoder.reset("000001");
const rawMotion=new Motion(),newMotion=new Motion();
const bytes={raw:0,encoded:0,websocket:0,byType:{},metadataBytes:0,byPhase:{},fullCauses:{},firstFullBytes:0};
let old=null,oldCopy,applied=0,maxError=0,sum=0,count=0,eventMatches=0,frames=[],timeline=[];
let correctionRaw=0,correctionNew=0,maxCorrectionDifference=0,meaningfulRaw=0,meaningfulNew=0;
const fine={clock:1,inputTime:1,playerPosition:100,position:100,angle:10000,velocity:100,direction:10000,energy:10000,time:1000};
const conservative={clock:1,inputTime:1,playerPosition:10,position:10,angle:1000,velocity:1,direction:1,energy:1,time:1};
const round=n=>(n<0?-Math.round(-n):Math.round(n))||0;
function oracle(raw,scales){
 const s=structuredClone(raw);
 const q=(o,k,n)=>{if(o[k]!==undefined&&n!==1)o[k]=((["stun","boost","energy"].includes(k)&&o[k]>0)?Math.max(1,round(o[k]*n)):round(o[k]*n))/n;};
 for(const k of ["remaining","returnIn"]) q(s,k,scales.time);
 if(s.supply) q(s.supply,"secondsToShrink",scales.time);
 for(const p of s.players) {
  for(const k of ["x","y"])q(p,k,scales.playerPosition);
  q(p,"angle",scales.angle);
  for(const k of ["kx","ky"])q(p,k,scales.velocity);
  for(const k of ["ix","iy","bx","by"])q(p,k,scales.direction);
  q(p,"inputElapsed",scales.inputTime);
  for(const k of ["cooldown","boost","stun"])q(p,k,scales.time);
  q(p,"energy",scales.energy);
 }
 for(const b of s.batteries){
  for(const k of ["x","y","z"])q(b,k,scales.position);
  for(const k of ["vx","vy"])q(b,k,scales.velocity);
  q(b,"unlock",scales.time);
 }
 // Entity order is not part of absolute ID-state semantics.
 s.batteries.sort((a,b)=>a.id.localeCompare(b.id));
 return s;
}
function freeze(x){if(x&&typeof x==="object"){Object.freeze(x);for(const v of Object.values(x))freeze(v)}}
let scales=fine;
for(const row of rows) {
 bytes.raw+=row.rawJsonBytes ?? Buffer.byteLength(JSON.stringify(row.raw));
 const m=row.message;if(!m)continue;
 if(m.metadata)scales=m.metadata.profile==="fine"?fine:conservative;
 const n=row.wireJsonBytes ?? Buffer.byteLength(JSON.stringify(m));bytes.encoded+=n;bytes.websocket+=n+(n<126?2:n<65536?4:10);
 const cat=bytes.byType[m.type]??={messages:0,bytes:0};cat.messages++;cat.bytes+=n;frames.push(n);
 const phase=bytes.byPhase[row.raw.phase]??={messages:0,bytes:0};phase.messages++;phase.bytes+=n;
 if(m.type==="state_full"){const cause=bytes.fullCauses[m.cause]??={messages:0,bytes:0};cause.messages++;cause.bytes+=n;if(!bytes.firstFullBytes)bytes.firstFullBytes=n;}
 if(m.metadata)bytes.metadataBytes+=Buffer.byteLength(JSON.stringify(m.metadata));
 const result=decoder.apply(m);assert.equal(result.status,"applied",result.reason);
 if(old)assert.deepEqual(old,oldCopy,"mutated published state");
 const normalized=structuredClone(result.state);normalized.batteries.sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(normalized,oracle(row.raw,scales),"independent raw oracle mismatch at "+row.time);
 old=result.state;oldCopy=structuredClone(old);freeze(old);applied++;
 const arrival=row.time*1000+70+(applied%3)*7;
 for(const input of row.inputs??[]) {
  if(input.players) timeline.push({at:input.time*1000-35,kind:"input",control:input.players[0]});
 }
 timeline.push({at:arrival,kind:"state",raw:row.raw,state:result.state,reset:result.mode!=="continuous"});
 for(const offset of [0,16,33,66,99]) timeline.push({at:arrival+offset,kind:"sample"});
 for(const p of result.state.players){
  const raw=row.raw.players.find(x=>x.id===p.id);
  for(const k of ["cargo","score","hitSeq","impactSeq","pickupSeq","inputSeq"])assert.equal(p[k],raw[k]);
  eventMatches++;
 }
}
timeline.sort((a,b)=>a.at-b.at||(["input","state","sample"].indexOf(a.kind)-["input","state","sample"].indexOf(b.kind)));
for(const e of timeline) {
 if(e.kind==="input"){rawMotion.input(e.control,e.at);newMotion.input(e.control,e.at);}
 else if(e.kind==="state"){
  if(e.reset){rawMotion.reset();newMotion.reset();}
  rawMotion.receive(e.raw,"1",false,e.at);newMotion.receive(e.state,"1",false,e.at);
  const a=rawMotion.correction,b=newMotion.correction;
  if(Math.hypot(a.x,a.y)>.01)correctionRaw++;
  if(Math.hypot(b.x,b.y)>.01)correctionNew++;
  if(Math.hypot(a.x,a.y)>1)meaningfulRaw++;if(Math.hypot(b.x,b.y)>1)meaningfulNew++;
  maxCorrectionDifference=Math.max(maxCorrectionDifference,Math.hypot(a.x-b.x,a.y-b.y));
 } else {
  const a=rawMotion.sample(e.at),b=newMotion.sample(e.at);
  for(const [id,p] of a){const q=b.get(id);if(!q)continue;const d=Math.hypot(p.x-q.x,p.y-q.y);if(d>maxError){maxError=d;if(d>2)console.error(JSON.stringify({at:e.at,id,error:d,raw:p,decoded:q}));}sum+=d;count++;}
 }
}
frames.sort((a,b)=>a-b);
assert.ok(maxError<2,"quantization prediction divergence "+maxError);
const report={source:"actual product Lua encoder -> JSON -> shared TS decoder; independent raw oracle and shared Motion",...bytes,applied,eventMatches,prediction:{maxWorldError:maxError,meanWorldError:sum/count,samples:count,correctionRaw,correctionNew,meaningfulRaw,meaningfulNew,maxCorrectionDifference,inputEvents:timeline.filter(e=>e.kind==="input").length,arrival:"identical 70/77/84 ms plus fixed intra-frame sample offsets"},messageSizes:{p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1)}};
fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
