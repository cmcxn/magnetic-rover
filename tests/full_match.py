"""Real-time protocol acceptance; requires an idle, running unmodified Skynet server.
Python WebSocket bots, NOT browser/playability tests. Never records reconnect tokens.
Usage: python tests/full_match.py [--eight-player-seconds 60]
"""
import argparse, asyncio, json, math, time
from datetime import datetime, timezone
from pathlib import Path
import websockets

ROOT=Path(__file__).resolve().parents[1]
REPORT={'method':'Independent Python websockets clients against real Skynet; no browser automation; no time/rule changes','started_utc':datetime.now(timezone.utc).isoformat(),'checks':{},'events':[]}
def event(name,**data):
    REPORT['events'].append({'elapsed_s':round(time.monotonic()-BASE,3),'event':name,**data})
    print(name,json.dumps(data,ensure_ascii=False),flush=True)
def check(name,condition,detail=None):
    REPORT['checks'][name]={'passed':bool(condition),'detail':detail}
    assert condition,(name,detail)
def save():
    out=ROOT/'verification';out.mkdir(exist_ok=True)
    (out/(OUTPUT_PREFIX+'.json')).write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    lines=['# Real Skynet full-match protocol acceptance','',REPORT['method'],'',f"Status: {REPORT.get('status','running')}",'']
    lines += [f"- {'PASS' if v['passed'] else 'FAIL'}: {k}: {v.get('detail')}" for k,v in REPORT['checks'].items()]
    lines += ['', '## Events', '']+[f"- {e}" for e in REPORT['events']]
    (out/(OUTPUT_PREFIX+'.md')).write_text('\n'.join(lines)+'\n')
class Client:
    def __init__(self,name): self.name=name;self.ws=None;self.state=None;self.id=None;self.token=None;self.count=0;self.errors=[];self.task=None;self.target=None;self.dwell_until=0;self.lastscore=0;self.deposits=0;self.arrivals=[];self.state_at=None;self.motion={};self.track_motion=False;self.last_position=None
    async def connect(self):
        self.ws=await websockets.connect('ws://127.0.0.1:18080/ws')
        await self.send(type='join',name=self.name,color='#38bdf8',**({'token':self.token} if self.token else {}))
        msg=json.loads(await asyncio.wait_for(self.ws.recv(),5))
        assert msg['type']=='welcome',msg
        self.id,self.token=msg['id'],msg['token']
        self.task=asyncio.create_task(self.read())
        await until(lambda:self.state is not None)
    async def read(self):
        async for raw in self.ws:
            m=json.loads(raw)
            if m['type']=='state':
                assert all('token' not in p for p in m['players'])
                now=time.monotonic()
                self.arrivals.append(now);self.state_at=now
                if self.track_motion:
                    p=next(p for p in m['players'] if p['id']==self.id)
                    if self.last_position is not None:
                        bucket=int((now-self.motion_start)/10)
                        self.motion[bucket]=self.motion.get(bucket,0)+math.hypot(p['x']-self.last_position[0],p['y']-self.last_position[1])
                    self.last_position=(p['x'],p['y'])
                self.state=m;self.count+=1
            elif m['type']=='error': self.errors.append(m['message'])
    async def send(self,**m): await self.ws.send(json.dumps(m))
    def player(self): return next(p for p in self.state['players'] if p['id']==self.id)
    async def close(self):
        await self.ws.close()
        if self.task: await self.task
    def reset_controller(self):
        self.target=None;self.dwell_until=0;self.lastscore=0;self.deposits=0
    async def steer(self):
        p=self.player();now=time.monotonic()
        if p['score']>self.lastscore:
            self.deposits+=1;self.lastscore=p['score'];self.dwell_until=now+1;self.target=None
        if now<self.dwell_until: return await self.send(type='input',x=0,y=0,boost=False)
        if p['cargo']>=8: self.target=min(self.state['stations'],key=lambda b:distance(p,b))
        elif self.target is None or ('id' in self.target and not any(b['id']==self.target['id'] for b in self.state['batteries'])):
            self.target=min(self.state['batteries'],key=lambda b:distance(p,b),default=None)
        if self.target is None: return
        dx,dy=self.target['x']-p['x'],self.target['y']-p['y'];n=math.hypot(dx,dy)
        await self.send(type='input',x=dx/max(1,n),y=dy/max(1,n),boost=False)
def distance(a,b):return (a['x']-b['x'])**2+(a['y']-b['y'])**2
async def until(fn,timeout=5):
    deadline=time.monotonic()+timeout
    while not fn():
        if time.monotonic()>deadline:raise TimeoutError('condition not reached')
        await asyncio.sleep(.02)
async def main(eight):
    a,b=Client('协议甲'),Client('协议乙');clients=[a,b]
    try:
        await a.connect();await b.connect()
        check('initial lobby',a.state['phase']=='lobby' and b.state['phase']=='lobby')
        await until(lambda:len(a.state['players'])==2)
        check('two unique identities',a.id!=b.id)
        await a.send(type='start');await until(lambda:a.state['phase']=='playing' and b.state['phase']=='playing')
        start=time.monotonic();event('match_started',players=[a.id,b.id],remaining=a.state['remaining'])
        reconnected=False;dwelled=False;last_progress=0
        while a.state['phase']=='playing':
            elapsed=time.monotonic()-start
            for c in clients: await c.steer()
            if a.player()['score']>0 and not reconnected:
                await a.send(type='input',x=0,y=0,boost=False)
                await asyncio.sleep(.15);old=a.player().copy();oldid=a.id
                await a.close();await asyncio.sleep(.4)
                await until(lambda:not next(p for p in b.state['players'] if p['id']==oldid)['connected'])
                a.state=None;await a.connect()
                check('short reconnect retains identity and score',a.id==oldid and a.player()['score']==old['score'],{'id':a.id,'score_before':old['score'],'score_after':a.player()['score']})
                reconnected=True;event('reconnected',id=a.id,score=a.player()['score'])
            if reconnected and not dwelled and a.player()['cargo']==0 and any(distance(a.player(),s)<s['r']**2 for s in a.state['stations']):
                await a.send(type='input',x=0,y=0,boost=False);before=a.player()['score'];await asyncio.sleep(2.2)
                check('station dwell does not duplicate score',a.player()['score']==before,{'score':before,'dwell_seconds':2.2});dwelled=True;event('duplicate_score_check',score=before)
            if elapsed-last_progress>30:
                last_progress=elapsed;event('progress',remaining=a.state['remaining'],scores=[c.player()['score'] for c in clients]);save()
            await asyncio.sleep(.08)
        await until(lambda:b.state['phase']=='finished')
        duration=time.monotonic()-start;event('match_finished',wall_seconds=round(duration,3),results=a.state['results'])
        check('full real-time 180 second round',abs(duration-180)<.5,round(duration,3))
        check('both clients agree results',a.state['results']==b.state['results'],a.state['results'])
        check('timer reaches zero',a.state['remaining']==0 and b.state['remaining']==0)
        check('both collect and deliver',all(c.player()['score']>0 and c.deposits>0 for c in clients),[{'id':c.id,'score':c.player()['score'],'deliveries_observed':c.deposits} for c in clients])
        check('reconnect and duplicate score exercised',reconnected and dwelled)
        final=json.loads(json.dumps(a.state['results']));positions=[(p['x'],p['y']) for p in a.state['players']]
        for c in clients:await c.send(type='input',x=1,y=1,boost=True)
        await asyncio.sleep(1)
        check('finished state frozen',a.state['results']==final and positions==[(p['x'],p['y']) for p in a.state['players']])
        await a.send(type='again');await until(lambda:all(c.state['phase']=='lobby' for c in clients))
        check('again resets lobby and score',all(p['score']==0 and p['cargo']==0 for p in a.state['players']) and a.state['remaining']==180 and not a.state['batteries'])
        event('returned_to_lobby')
        for c in clients:c.reset_controller()
        if eight:
            for i in range(6):
                c=Client('协议'+str(i+3));await c.connect();clients.append(c)
            await until(lambda:all(len(c.state['players'])==8 for c in clients))
            await a.send(type='start');await until(lambda:all(c.state['phase']=='playing' for c in clients));t=time.monotonic()
            initial_remaining=a.state['remaining'];initial_state_at=a.state_at
            baselines={c.id:len(c.arrivals) for c in clients}
            for c in clients:c.track_motion=True;c.motion_start=t;c.last_position=(c.player()['x'],c.player()['y'])
            event('eight_player_trial_started',remaining=initial_remaining)
            while time.monotonic()-t<eight:
                for c in clients:await c.steer()
                await asyncio.sleep(.08)
            check('eight independent clients remain synchronized',all(c.state['phase']=='playing' and len(c.state['players'])==8 for c in clients),{'duration_seconds':round(time.monotonic()-t,2),'scores':[c.player()['score'] for c in clients]})
            wall=a.state_at-initial_state_at;advance=initial_remaining-a.state['remaining']
            check('eight player clock tracks wall time',abs(wall-advance)<.5,{'snapshot_wall_seconds':round(wall,4),'game_clock_advance_seconds':round(advance,4),'absolute_error_seconds':round(abs(wall-advance),4),'allowed_error_seconds':.5})
            activity=[{'id':c.id,'score':c.player()['score'],'deliveries_observed':c.deposits,'distance_per_10s_bucket':{str(k):round(v,1) for k,v in c.motion.items()}} for c in clients]
            check('all eight bots remain active and deliver repeatedly',all(c.deposits>=2 and all(c.motion.get(k,0)>50 for k in range(int(eight/10))) for c in clients),activity)
            stats={}
            for c in clients:
                arrivals=c.arrivals[baselines[c.id]:];intervals=sorted(b-a for a,b in zip(arrivals,arrivals[1:]))
                stats[c.id]={'snapshots_received_during_trial':len(arrivals),'average_hz':round((len(arrivals)-1)/(arrivals[-1]-arrivals[0]),3),'arrival_interval_max_ms':round(max(intervals)*1000,3),'arrival_interval_p95_ms':round(intervals[math.ceil(len(intervals)*.95)-1]*1000,3)}
            REPORT['eight_player_snapshot_metrics']=stats
            REPORT['scope_and_limits']=['Real local Skynet with eight Python WebSocket protocol clients; not browser sessions.','Local protocol smoke test; not an Internet, mobile-device, or production performance guarantee.','Arrival intervals measure observed local snapshot receive spacing, not network round-trip latency.','Eight-player trial intentionally ends after 60 seconds rather than completing its round.']
            event('eight_player_trial_ended',remaining=a.state['remaining'],snapshot_metrics=stats)
        check('no protocol errors',not any(c.errors for c in clients),[c.errors for c in clients])
        REPORT['status']='passed';REPORT['snapshots_received']={c.id:c.count for c in clients}
    finally:
        for c in clients:
            if c.ws:await c.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--eight-player-seconds',type=int,default=0);parser.add_argument('--output-prefix',default='full-match');args=parser.parse_args();BASE=time.monotonic();OUTPUT_PREFIX=args.output_prefix
    try:asyncio.run(main(args.eight_player_seconds))
    except BaseException as e:REPORT['status']='failed';REPORT['error']=str(e);raise
    finally:REPORT['ended_utc']=datetime.now(timezone.utc).isoformat();save()
