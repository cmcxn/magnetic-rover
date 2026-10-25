"""Build a LOCAL-ONLY review page from the current client build and Lua snapshots.
No physics or artwork is fabricated. The only shim replaces the network transport
with the already-tested exact authoritative snapshots. Open review/index.html in
the supported browser; all assets are embedded, no server/permissions required.
"""
import base64,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dist=root/'client/dist'
out=root/'verification/collision-redesign/review';out.mkdir(exist_ok=True)
index=(dist/'index.html').read_text()
script=re.search(r'src="(/assets/[^\"]+\.js)"',index)[1]
css=re.search(r'href="(/assets/[^\"]+\.css)"',index)[1]
js=(dist/script.lstrip('/')).read_text()
for path in (dist/'assets/sprites').glob('*.png'):
    uri='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
    js=js.replace('/assets/sprites/'+path.name,uri)
scenarios=json.loads((root/'verification/collision-redesign/scenarios.json').read_text())
audio={f'/assets/audio/{p.name}':base64.b64encode(p.read_bytes()).decode() for p in (dist/'assets/audio').glob('*.wav')}
shim=r'''
const DATA=__DATA__;
const params=new URLSearchParams(location.search);
const scenario=DATA.scenarios.find(s=>s.name==params.get('scenario'))||DATA.scenarios[0];
const capture=params.get('capture')||'before';
const index=(scenario.captures[capture]||1)-1;
const current=scenario.frames[index];
localStorage.setItem('rover.server','ws://127.0.0.1/ws');
localStorage.setItem('rover.sound','off');
const AUDIO=__AUDIO__;
const originalFetch=window.fetch.bind(window);
window.fetch=(url,...args)=>AUDIO[url]?Promise.resolve(new Response(Uint8Array.from(atob(AUDIO[url]),c=>c.charCodeAt(0)))):originalFetch(url,...args);
class ReplaySocket {
 static OPEN=1;static CONNECTING=0;static CLOSED=3;
 readyState=0;
 constructor(){setTimeout(()=>{this.readyState=1;this.onopen?.({});},0);}
 emit(message){this.onmessage?.({data:JSON.stringify(message)});}
 send(raw){const m=JSON.parse(raw);
  if(m.type==='ping')this.emit({type:'pong',id:m.id});
  if(m.type==='join'){
   this.emit({type:'welcome',id:current.players[0].id,role:'player',roomId:current.roomId,token:'local-simulation-replay-only'});
   this.emit(current);
   this.timer=setInterval(()=>this.emit(current),100);
  }
 }
 close(){clearInterval(this.timer);this.readyState=3;this.onclose?.({});}
}
window.WebSocket=ReplaySocket;
document.addEventListener('DOMContentLoaded',()=>{
 const join=setInterval(()=>{
  const name=document.querySelector('#nickname'),button=document.querySelector('#join');
  if(name&&button){name.value='碰撞验证';button.click();clearInterval(join);}
 },50);
});
'''.replace('__DATA__',json.dumps(scenarios,ensure_ascii=False)).replace('__AUDIO__',json.dumps(audio))
html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>磁力小车 · 真实模拟快照回放</title><style>'+(dist/css.lstrip('/')).read_text()+'</style><body><div id="game"></div><div id="app"></div><script>'+shim.replace('</script','<\\/script')+'</script><script type="module">'+js.replace('</script','<\\/script')+'</script></body></html>'
(out/'game.html').write_text(html)
review='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>磁力小车 · 本地碰撞验证截图</title><style>body{margin:16px;background:#e5ece7;font:14px system-ui;color:#243e32}header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}button,select{font:inherit;padding:8px;border:1px solid #8fa99a;border-radius:6px}iframe{border:0;display:block;box-shadow:0 8px 32px #243e3233}small{display:block;margin:0 0 10px}</style><header><strong>本地 QA · 生产 Lua 快照 → 原 Phaser 渲染</strong><select id="scenario" aria-label="碰撞场景"><option value="normal">普通碰撞</option><option value="boost">单车冲刺</option><option value="double-boost">双车冲刺</option><option value="wall-three">三车墙边</option></select><select id="capture" aria-label="关键帧"><option value="before">碰撞前</option><option value="contact">接触后</option><option value="scatter">电池散落</option><option value="after">弹开后</option></select><select id="viewport" aria-label="视口"><option value="1000x500">桌面 1000×500</option><option value="844x390">手机横屏 844×390</option><option value="390x740">手机竖屏 390×740</option></select><button id="show">显示关键帧</button></header><small>此页仅回放真实游戏核心输出；不是生产部署或实时联网截图。另附真实 Skynet 双客户端验证报告。</small><iframe id="game-frame" title="实际游戏客户端" width="1000" height="500"></iframe><script>const frame=document.querySelector('iframe');function show(){const [w,h]=document.querySelector('#viewport').value.split('x');frame.width=w;frame.height=h;frame.src='game.html?scenario='+document.querySelector('#scenario').value+'&capture='+document.querySelector('#capture').value;}document.querySelector('#show').onclick=show;show();</script></html>'''
(out/'index.html').write_text(review)
print(out/'index.html')
