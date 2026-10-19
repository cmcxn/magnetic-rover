"""Real 180-second match + 10-second results; no debug endpoints or time controls."""
import asyncio,json,time
import websockets
URI='ws://127.0.0.1:18080/ws'
async def send(ws,**data):await ws.send(json.dumps(data))
async def recv(ws,kind,timeout=5):
    async with asyncio.timeout(timeout):
        while True:
            m=json.loads(await ws.recv())
            if m['type']==kind:return m
async def main():
    async with websockets.connect(URI) as a,websockets.connect(URI) as b,websockets.connect(URI) as waiter:
        for ws,name in [(a,'A'),(b,'B')]:
            await send(ws,type='join',name=name,color='#38bdf8');await recv(ws,'welcome')
        await send(a,type='start');s=await recv(a,'state')
        while s['phase']!='playing':s=await recv(a,'state')
        started=time.monotonic()
        await send(waiter,type='join',name='AutoWait',color='#fb7185');w=await recv(waiter,'waiting')
        assert w['reason']=='playing' and 189<=w['availableIn']<=190
        async with websockets.connect(URI) as cancelled:
            await send(cancelled,type='join',name='Cancelled',color='#fb7185');await recv(cancelled,'waiting')
        # Drain established sockets so server writes cannot be blocked by test readers.
        async def drain(ws):
            async for _ in ws:pass
        tasks=[asyncio.create_task(drain(a)),asyncio.create_task(drain(b))]
        saw_finished=False
        async with asyncio.timeout(200):
            while True:
                m=json.loads(await waiter.recv())
                if m['type']=='waiting' and m['reason']=='finished':
                    saw_finished=True;assert 0<=m['availableIn']<=10
                if m['type']=='welcome':break
        elapsed=time.monotonic()-started
        s=await recv(waiter,'state');assert saw_finished and 189<=elapsed<=193
        assert s['phase']=='lobby' and len(s['players'])==3
        assert not any(p['name']=='Cancelled' for p in s['players'])
        assert sum(p['name']=='AutoWait' for p in s['players'])==1
        print(f'PASS real match: waiting estimate, 180s match + 10s results ({elapsed:.2f}s), automatic one-time join, cancelled waiter absent')
        for t in tasks:t.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
asyncio.run(main())
