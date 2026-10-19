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
        await send(a,type='ping',id=7);assert (await recv(a,'pong'))=={'type':'pong','id':7}
        await send(a,type='ping',id='bad');assert 'Invalid ping' in (await recv(a,'error'))['message']
        await send(a,type='start');assert 'two' in (await recv(a,'error'))['message']
        await send(b,type='join',name='测试乙',color='#fb7185');wb=await recv(b,'welcome');assert wa['id']!=wb['id'] and wa['token']!=wb['token']
        async with websockets.connect(URI) as c:
            await send(c,type='join',name='偷号',color='#38bdf8',token=wa['token']);assert 'already connected' in (await recv(c,'error'))['message']
        await send(a,type='start');s=await recv(a,'state')
        while s['phase']!='playing':s=await recv(a,'state')
        async with websockets.connect(URI) as waiting:
            await send(waiting,type='join',name='等待客人',color='#38bdf8')
            wait=await recv(waiting,'waiting');assert wait['reason']=='playing' and wait['availableIn']>180
            await send(waiting,type='ping',id=9);assert (await recv(waiting,'pong'))['id']==9
            await send(waiting,type='start');assert 'Join first' in (await recv(waiting,'error'))['message']
        # Authoritative idle dash, cooldown spam, heading and empty-cargo hit feedback.
        player=lambda state,pid:next(p for p in state['players'] if p['id']==pid)
        origin=player(s,wa['id'])
        await send(a,type='input',x=0,y=0,boost=True,angle=2,speed=99999)
        while True:
            s=await recv(a,'state');p=player(s,wa['id'])
            if p['cooldown']>0:break
        assert p['x']>origin['x'] and abs(p['y']-origin['y'])<.01 and p['angle']==0
        first_cd=p['cooldown']
        for _ in range(4):
            await send(a,type='input',x=0,y=0,boost=True)
            s=await recv(a,'state')
        assert player(s,wa['id'])['cooldown']<first_cd
        # Drive toward the victim. Hits are valid without needing any cargo.
        async with asyncio.timeout(6):
            while player(s,wb['id'])['hitSeq']==0:
                p,q=player(s,wa['id']),player(s,wb['id'])
                dx,dy=q['x']-p['x'],q['y']-p['y'];length=math.hypot(dx,dy)
                await send(a,type='input',x=dx/length,y=dy/length,boost=False)
                s=await recv(a,'state')
        q=player(s,wb['id']);assert q['stun']>0 and q['stun']<=1
        hit_x,hit_y=q['x'],q['y']
        await send(a,type='input',x=0,y=0,boost=False)
        await send(b,type='input',x=1,y=0,boost=True)
        for _ in range(3):s=await recv(a,'state')
        q=player(s,wb['id']);assert q['x']==hit_x and q['y']==hit_y and q['boost']==0 and q['hitSeq']==1
        print('PASS real WS idle forward dash, forged heading/speed ignored, cooldown spam, authoritative hit sequence, stun movement/boost rejection')
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
