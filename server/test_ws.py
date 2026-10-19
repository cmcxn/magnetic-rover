import asyncio,json,math
import websockets
URI='ws://127.0.0.1:18080/ws'
async def recv(ws,kind):
    async with asyncio.timeout(4):
        while True:
            m=json.loads(await ws.recv())
            if m['type']==kind:return m
async def send(ws,**m):await ws.send(json.dumps(m))
async def main():
    async with websockets.connect(URI) as a,websockets.connect(URI) as b:
        await send(a,type='join',name='测试甲',color='#38bdf8');wa=await recv(a,'welcome')
        sa=await recv(a,'state');assert isinstance(sa['batteries'],list)
        await send(a,type='start');assert 'two' in (await recv(a,'error'))['message']
        await send(b,type='join',name='测试乙',color='#fb7185');wb=await recv(b,'welcome');assert wa['id']!=wb['id'] and wa['token']!=wb['token']
        async with websockets.connect(URI) as c:
            await send(c,type='join',name='偷号',color='#38bdf8',token=wa['token']);assert 'already connected' in (await recv(c,'error'))['message']
        await send(a,type='start');s=await recv(a,'state')
        while s['phase']!='playing':s=await recv(a,'state')
        p=next(p for p in s['players'] if p['id']==wa['id']);x,y=p['x'],p['y']
        await send(a,type='input',x=1e200,y=1e200,boost=False);assert 'Invalid input' in (await recv(a,'error'))['message']
        await send(a,type='deposit',score=99999);assert 'Unknown' in (await recv(a,'error'))['message']
        for _ in range(12):
            await send(a,type='input',x=1,y=0,boost=False,score=99999);await asyncio.sleep(.05)
        s=await recv(b,'state')
        for _ in range(8):s=await recv(b,'state')
        p=next(p for p in s['players'] if p['id']==wa['id']);assert p['x']>x and p['score']==0
        assert all('token' not in p for p in s['players']);assert len(s['batteries'])>0
        await b.close();await asyncio.sleep(.15)
        async with websockets.connect(URI) as c:
            await send(c,type='join',name='ignored',color='#facc15',token=wb['token']);w=await recv(c,'welcome');assert w['id']==wb['id']
        print('PASS two real WebSocket clients: UTF-8 guests, unique opaque tokens, arrays, minimum players, live-token takeover rejected, authoritative movement, cheat rejection, shared snapshots, reconnect identity')
asyncio.run(main())
