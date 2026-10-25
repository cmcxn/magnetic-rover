import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:18080');
const response = await fetch(base, {signal:AbortSignal.timeout(5000)});
assert.equal(response.status,200);
const html = await response.text();
const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(s=>s.startsWith('/assets/'));
assert.ok(urls.length);
for (const path of [...urls, '/assets/sprites/rover.png','/assets/sprites/battery.png','/assets/sprites/recycle-station.png','/assets/audio/pickup.ogg']) {
 const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,path);assert.ok((await r.arrayBuffer()).byteLength>0,path);
}
console.log('HTTP + built JS/CSS + sprites/audio OK');
const endpoint=new URL('/ws',base);endpoint.protocol=base.protocol==='https:'?'wss:':'ws:';
const clients=[];
const deadline=setTimeout(()=>{console.error('WS timeout');process.exit(1)},15000);
try {
 for(const [name,color] of [['DeployOne','#38bdf8'],['DeployTwo','#fb7185']]) {
  const ws=new WebSocket(endpoint);const c={ws,messages:[]};clients.push(c);
  ws.addEventListener('message',e=>c.messages.push(JSON.parse(e.data)));
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.send(JSON.stringify({type:'join',name,color}));
 }
 const until=async(fn)=>{while(!fn())await new Promise(r=>setTimeout(r,40))};
 await until(()=>clients.every(c=>c.messages.some(m=>m.type==='welcome')));
 clients[0].ws.send(JSON.stringify({type:'create_room'}));
 await until(()=>clients[0].messages.some(m=>m.type==='welcome'&&m.roomId));
 const roomId=clients[0].messages.find(m=>m.type==='welcome'&&m.roomId).roomId;
 clients[1].ws.send(JSON.stringify({type:'join_room',roomId}));
 await until(()=>clients.every(c=>c.messages.some(m=>m.type==='welcome'&&m.roomId===roomId)));
 const ids=clients.map(c=>c.messages.find(m=>m.type==='welcome'&&m.roomId===roomId).id);assert.notEqual(...ids);
 await until(()=>clients.every(c=>c.messages.some(m=>m.type==='state'&&ids.every(id=>m.players.some(p=>p.id===id)))));
 for(const c of clients)c.ws.send(JSON.stringify({type:'ready',ready:true}));
 await until(()=>clients.every(c=>c.messages.some(m=>m.phase==='playing')));
 const before=clients[0].messages.filter(m=>m.type==='state').at(-1).players.find(p=>p.id===ids[0]);
 for(let i=0;i<8;i++){clients[0].ws.send(JSON.stringify({type:'input',x:1,y:0,boost:false}));await new Promise(r=>setTimeout(r,50))}
 await until(()=>clients[1].messages.some(m=>m.type==='state'&&m.players.some(p=>p.id===ids[0]&&p.x>before.x+5)));
 console.log('Two real WS clients: distinct identities, shared roster, start, authoritative movement OK');
} finally {clearTimeout(deadline);for(const c of clients)c.ws.close()}
