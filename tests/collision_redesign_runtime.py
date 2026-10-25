"""Real Skynet WebSocket collision acceptance using only normal player inputs.

Start an isolated local server, then run this file. No debug endpoint, teleport,
score edit, seeded production RNG, or simulation-time override is used. Recorded
states omit guest tokens and can also be replayed by the screenshot harness.
"""
import argparse
import asyncio
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
import websockets

PARSER=argparse.ArgumentParser()
PARSER.add_argument('--uri',default='ws://127.0.0.1:18080/ws')
PARSER.add_argument('--out',default='verification/collision-redesign/runtime.json')
ARGS=PARSER.parse_args()
REPORT={'method':'Real local Skynet; independent WebSocket clients; normal input/room protocol only',
        'started_utc':datetime.now(timezone.utc).isoformat(),'checks':[],'scenarios':[]}
CLIENTS=[]


def check(name,passed,detail=None):
    item={'name':name,'passed':bool(passed)}
    if detail is not None:item['detail']=detail
    REPORT['checks'].append(item)
    print(('PASS ' if passed else 'FAIL ')+name,detail or '',flush=True)
    assert passed,name

async def until(test,timeout=10):
    end=time.monotonic()+timeout
    while not test():
        for c in CLIENTS:
            if c.error:raise c.error
        if time.monotonic()>end:raise TimeoutError('Protocol condition timed out')
        await asyncio.sleep(.025)

class Client:
    def __init__(self,name,color):
        self.name,self.color=name,color
        self.ws=self.task=self.state=self.welcome=self.error=None
        self.welcomes=0;self.seq=0;self.frames=[];self.errors=[]
        CLIENTS.append(self)
    async def connect(self):
        self.ws=await websockets.connect(ARGS.uri)
        self.task=asyncio.create_task(self.read())
        await self.send(type='join',name=self.name,color=self.color)
        await until(lambda:self.welcome is not None)
        return self
    async def send(self,**m):await self.ws.send(json.dumps(m))
    async def read(self):
        try:
            async for raw in self.ws:
                m=json.loads(raw)
                if m['type']=='welcome':self.welcome=m;self.welcomes+=1;self.state=None
                elif m['type']=='state':
                    self.state=m;self.frames.append(m)
                    if len(self.frames)>2000:self.frames.pop(0)
                elif m['type']=='error':self.errors.append(m['message'])
        except asyncio.CancelledError:raise
        except Exception as e:self.error=e
    async def enter(self,kind,room=None):
        before=self.welcomes
        await self.send(type=kind,**({'roomId':room} if room else {}))
        await until(lambda:self.welcomes>before and self.state is not None)
        return self.welcome['roomId']
    def p(self):return next(p for p in self.state['players'] if p['id']==self.welcome['id'])
    async def input(self,x=0,y=0,boost=False,**extra):
        self.seq+=1;await self.send(type='input',x=x,y=y,boost=boost,seq=self.seq,**extra)
    async def close(self):
        if self.ws:await self.ws.close()
        if self.task:await self.task

async def pair(name):
    a=await Client(name+'蓝车','#38bdf8').connect()
    room=await a.enter('create_room')
    b=await Client(name+'红车','#fb7185').connect();await b.enter('join_room',room)
    await a.send(type='ready',ready=True);await b.send(type='ready',ready=True)
    await until(lambda:a.state and b.state and a.state['phase']==b.state['phase']=='playing')
    check(name+' authoritative geometry advertised',a.state.get('collisionRadius')==60 and a.state.get('pickupRadius')==56)
    return a,b

async def drive(c,target,timeout=9,tolerance=12):
    end=time.monotonic()+timeout
    while True:
        p=c.p();dx,dy=target[0]-p['x'],target[1]-p['y'];length=math.hypot(dx,dy)
        if length<=tolerance:
            await c.input();await asyncio.sleep(.15);return
        if time.monotonic()>end:raise TimeoutError(f'{c.name} could not reach waypoint {target}; at {p["x"]:.1f},{p["y"]:.1f}')
        speed=240*(1-.2*p['cargo']/20)
        amount=min(1,length/(speed*.16))
        await c.input(dx/length*amount,dy/length*amount)
        await asyncio.sleep(.05)

async def collect(c,minimum=6,timeout=20):
    end=time.monotonic()+timeout
    while c.p()['cargo']<minimum:
        if time.monotonic()>end:raise TimeoutError('Could not collect cargo by gameplay')
        p=c.p()
        candidates=[b for b in c.state['batteries'] if math.hypot(b['x'],b['y'])<430 and all(math.hypot(b['x']-s['x'],b['y']-s['y'])>s['r']+65 for s in c.state['stations'])]
        assert candidates,'No reachable natural resources'
        b=min(candidates,key=lambda b:math.hypot(b['x']-p['x'],b['y']-p['y']))
        before=p['cargo'];goal=(b['x'],b['y'])
        # Reach the edge of the magnet, not the battery center.
        dx,dy=goal[0]-p['x'],goal[1]-p['y'];length=math.hypot(dx,dy)
        if length>40:goal=(goal[0]-dx/length*30,goal[1]-dy/length*30)
        try:await drive(c,goal,timeout=5,tolerance=10)
        except TimeoutError:
            await c.input();await asyncio.sleep(.25)
        if c.p()['cargo']==before:await asyncio.sleep(.1)
    await c.input();await asyncio.sleep(.2)

async def prepare(a,b,with_a=False,with_b=False):
    # Separate vertical lanes prevent accidental collision while gathering/alignment.
    await drive(a,(-240,120))
    await drive(b,(180,-140))
    if with_b:await collect(b)
    if with_a:await collect(a)
    await drive(b,(170,-140));await drive(a,(-150,80));await drive(b,(150,80))
    await a.input();await b.input();await asyncio.sleep(1.8)


def validate_frame(s):
    r=s['collisionRadius'];min_gap=9999
    for i,p in enumerate(s['players']):
        assert math.hypot(p['x'],p['y'])<=s['radius']-r+1e-4,'circle outside arena'
        for q in s['players'][i+1:]:
            gap=math.hypot(p['x']-q['x'],p['y']-q['y'])-2*r
            min_gap=min(min_gap,gap)
            assert gap>=-1e-4,'authoritative vehicle circles overlap'
    return min_gap

async def collision(name,boost_a=False,boost_b=False):
    a,b=await pair(name)
    try:
        await prepare(a,b,with_a=boost_b,with_b=boost_a)
        before=a.state;pa,pb=a.p().copy(),b.p().copy()
        if boost_a:check(name+' victim has genuinely collected cargo',pb['cargo']>=6)
        if boost_b:check(name+' both have genuinely collected cargo',pa['cargo']>=6)
        start=len(a.frames);hit_a,hit_b=pa['hitSeq'],pb['hitSeq']
        deadline=time.monotonic()+5;first=True;contact=None
        while time.monotonic()<deadline:
            pa1,pb1=a.p(),b.p();dx,dy=pb1['x']-pa1['x'],pb1['y']-pa1['y'];d=math.hypot(dx,dy)
            # Start boosts only after driving within one dash's available reach.
            boost_now=first and d<235
            await a.input(dx/d,dy/d,boost_a and boost_now)
            await b.input(-dx/d if boost_b else 0,-dy/d if boost_b else 0,boost_b and boost_now)
            if boost_now:first=False
            await asyncio.sleep(.05)
            if a.p()['hitSeq']>hit_a or b.p()['hitSeq']>hit_b:
                contact=a.state;break
        assert contact is not None,'No collision observed'
        await a.input();await b.input()
        qa=next(p for p in contact['players'] if p['id']==a.welcome['id']);qb=next(p for p in contact['players'] if p['id']==b.welcome['id'])
        if not boost_a:
            check(name+' ordinary impact stuns both',qa['stun']>0 and qb['stun']>0)
            check(name+' ordinary impact does not drop batteries',not any(x.get('source')=='drop' for x in contact['batteries']))
            check(name+' ordinary carried value preserved',qa['cargo']==pa['cargo'] and qb['cargo']==pb['cargo'],{'before':[pa['cargo'],pb['cargo']],'after':[qa['cargo'],qb['cargo']]})
        elif not boost_b:
            check(name+' boosted attacker remains unstunned',qa['stun']==0 and qb['stun']>0)
            lost=pb['cargo']-qb['cargo'];drops=[x for x in contact['batteries'] if x.get('source')=='drop']
            check(name+' target cargo becomes exact ground drop count',lost==min(5,math.ceil(pb['cargo']*.25)) and len(drops)==lost,{'lost':lost,'drops':len(drops)})
        else:
            check(name+' both boosted participants stun',qa['stun']>0 and qb['stun']>0)
            lost=pa['cargo']+pb['cargo']-qa['cargo']-qb['cargo'];drops=[x for x in contact['batteries'] if x.get('source')=='drop']
            check(name+' double boost conserves both cargo losses',lost==min(5,math.ceil(pa['cargo']*.25))+min(5,math.ceil(pb['cargo']*.25)) and len(drops)==lost,{'lost':lost,'drops':len(drops)})
        # A stunned driver's forged fields cannot replace server-owned outcomes.
        before_seq=qb['hitSeq'];await b.input(1,0,True,cargo=999,score=999,stun=0,collisionRadius=0)
        await asyncio.sleep(.2)
        check(name+' stun rejects movement intent and forged state',b.p()['boost']==0 and b.p()['ix']==0 and b.p()['iy']==0 and b.p()['cargo']<999 and b.p()['score']<999)
        await asyncio.sleep(.35)
        frames=a.frames[start:];min_gap=min(validate_frame(s) for s in frames)
        check(name+' all sampled live circles solid and inside walls',min_gap>=-1e-4,{'snapshots':len(frames),'minimum_gap':min_gap})
        check(name+' one hit event during sampled recoil sequence',b.p()['hitSeq']==before_seq)
        check(name+' both clients receive same authoritative geometry',b.state['collisionRadius']==a.state['collisionRadius'])
        REPORT['scenarios'].append({'name':name,'before':before,'contact':contact,'after':a.state,'frames':frames})
    finally:
        await a.send(type='leave_room');await b.send(type='leave_room');await a.close();await b.close()

async def main():
    await collision('normal')
    await collision('boost',True)
    await collision('double-boost',True,True)

try:
    asyncio.run(main())
    REPORT['status']='passed'
except Exception as error:
    REPORT['status']='failed';REPORT['error']=repr(error);raise
finally:
    REPORT['finished_utc']=datetime.now(timezone.utc).isoformat()
    path=Path(ARGS.out);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
