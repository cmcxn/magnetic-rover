"""Real WebSocket motion protocol acceptance, including optional full wall-clock match.

Uses the existing multi_room acceptance unchanged via its run() entry point.
No debug endpoint, altered clock, client-authoritative position, or browser FPS claim.
"""
import argparse
import asyncio
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
import multi_room as mr

REPORT = {'method': 'Real Skynet WebSocket clients; protocol and wall-clock integration, not device FPS',
          'checks': [], 'started_utc': datetime.now(timezone.utc).isoformat()}
HISTORY = {}
RECEIPTS = {}


def check(name, passed, detail=None):
    REPORT['checks'].append({'name': name, 'passed': bool(passed), 'detail': detail})
    print(('PASS ' if passed else 'FAIL ') + name, detail or '', flush=True)
    assert passed, name


class Client(mr.Client):
    @property
    def state(self):
        return self._state

    @state.setter
    def state(self, value):
        self._state = value
        if value is None:
            return
        stamp, generation = value['serverTime'], value['roundId']
        assert isinstance(stamp, (int, float)) and math.isfinite(stamp) and stamp >= 0
        assert isinstance(generation, int) and generation >= 0
        key = (self.name, value['roomId'])
        history = HISTORY.setdefault(key, [])
        if history:
            old = history[-1]
            assert stamp >= old[0], 'serverTime moved backward'
            assert generation in (old[1], old[1] + 1), 'roundId lost continuity'
            if generation != old[1]:
                assert value['phase'] == 'playing', 'round generation changed outside start'
        history.append((stamp, generation, value['phase']))
        RECEIPTS.setdefault(key, []).append(time.monotonic())
        for p in value['players']:
            assert isinstance(p['inputSeq'], int) and p['inputSeq'] >= 0
            assert p['inputElapsed'] >= 0 and math.isfinite(p['inputElapsed'])
            assert math.isfinite(p['x']) and math.isfinite(p['y'])


mr.Client = Client


async def focused():
    a = await Client('Motion-A').connect()
    room = await a.enter('create_room')
    b = await Client('Motion-peer').connect()
    await b.enter('join_room', room)
    isolated = await Client('Motion-isolated').connect()
    other = await isolated.enter('create_room')
    before_other = isolated.player().copy()
    await a.send(type='ready', ready=True)
    await b.send(type='ready', ready=True)
    await mr.until(lambda: a.state['phase'] == 'playing')
    initial = a.player().copy()
    t0 = a.state['serverTime']
    await a.send(type='input', x=-1, y=0, boost=False, seq=100)
    await mr.until(lambda: a.player()['inputSeq'] == 100)
    p = a.player()
    check('sequence acknowledgement accompanies simulated tick and motion',
          a.state['serverTime'] > t0 and p['inputElapsed'] > 0 and p['x'] < initial['x'],
          {'inputSeq': p['inputSeq'], 'inputElapsed': p['inputElapsed']})
    # Stale sequence may be silently ignored; unlike invalid shape it need not emit an error.
    await a.send(type='input', x=1, y=0, boost=False, seq=99)
    await a.send(type='input', x=1, y=0, boost=False, seq=100)
    await asyncio.sleep(.15)
    check('stale and duplicate sequence cannot replace movement', a.player()['inputSeq'] == 100 and a.player()['ix'] == -1)
    for seq in (0, -1, 1.5, '101', {}, 9007199254740992):
        await a.rejected(type='input', x=1, y=0, boost=False, seq=seq)
    check('invalid sequence types and bounds rejected', a.player()['inputSeq'] == 100 and a.player()['ix'] <= 0)
    await a.send(type='input', x=0, y=0, boost=False, seq=101,
                 position={'x': 999999, 'y': 999999}, playerX=999999, playerY=999999,
                 score=99999, cargo=99999, inputSeq=99999, serverTime=99999, roundId=99999)
    await mr.until(lambda: a.player()['inputSeq'] == 101)
    p = a.player()
    check('client position score clock and acknowledgement fields have no authority',
          math.hypot(p['x'], p['y']) <= 500 and p['score'] < 99999 and p['cargo'] <= 20
          and a.state['serverTime'] < 99999 and a.state['roundId'] == 1)
    before = a.player()['y']
    await a.send(type='input', x=0, y=-1, boost=False)
    await mr.until(lambda: a.player()['y'] < before - 1)
    check('legacy unsequenced input still moves authoritative player', a.player()['inputSeq'] == 101 and a.player()['iy'] == -1)
    old_id, old_time = a.id, a.state['serverTime']
    await a.close()
    await a.connect()
    await mr.until(lambda: a.state is not None)
    check('reconnect keeps player room and server clock but resets sequence',
          a.id == old_id and a.room == room and a.player()['inputSeq'] == 0
          and a.state['serverTime'] >= old_time and a.state['roundId'] == 1)
    await a.send(type='input', x=0, y=1, seq=1, boost=False)
    await mr.until(lambda: a.player()['inputSeq'] == 1)
    check('reconnected client may restart sequence at one', a.player()['iy'] == 1)
    check('motion and sequence are isolated to joined room', isolated.room == other
          and isolated.player()['inputSeq'] == 0 and isolated.player()['x'] == before_other['x']
          and isolated.player()['y'] == before_other['y'] and isolated.state['roundId'] == 0)
    check('focused clients have no unexpected protocol or reader errors',
          all(len(c.errors) == c.expected_errors and c.reader_error is None for c in mr.CLIENTS))
    for c in (a, b, isolated):
        await c.leave()
    await asyncio.gather(*(c.close() for c in mr.CLIENTS))
    mr.CLIENTS.clear()


async def load_test():
    clients = []
    a = await Client('Load-0').connect()
    clients.append(a)
    room = await a.enter('create_room')
    for i in range(1, 8):
        client = await Client('Load-' + str(i)).connect()
        await client.enter('join_room', room)
        clients.append(client)
    for client in clients:
        await client.send(type='ready', ready=True)
    await mr.until(lambda: all(c.state['phase'] == 'playing' for c in clients))
    for c in clients:
        RECEIPTS[(c.name, room)] = []
    started = time.monotonic()
    seq = 0
    while time.monotonic() - started < 20:
        seq += 1
        for i, client in enumerate(clients):
            angle = i * math.pi / 4 + seq / 90
            await client.send(type='input', x=math.cos(angle), y=math.sin(angle), seq=seq, boost=False)
        await asyncio.sleep(max(0, started + seq * .05 - time.monotonic()))
    await mr.until(lambda: all(c.player()['inputSeq'] >= seq for c in clients))
    elapsed = time.monotonic() - started
    check('eight active players accept 20 Hz intent stream without disconnects or protocol errors',
          all(c.state['phase'] == 'playing' and len(c.state['players']) == 8
              and all(p['connected'] for p in c.state['players'])
              and c.player()['inputSeq'] >= seq and not c.errors and c.reader_error is None
              for c in clients),
          {'active_clients': 8, 'intent_hz_per_client': 20, 'sequences_per_client': seq,
           'wall_seconds': round(elapsed, 3)})
    intervals = sorted((b - a) * 1000 for c in clients
                       for a, b in zip(RECEIPTS[(c.name, room)], RECEIPTS[(c.name, room)][1:]))
    check('eight active players remain within authoritative arena bounds',
          all(math.hypot(p['x'], p['y']) <= 500.001 for c in clients for p in c.state['players']))
    check('snapshot interval observations collected for eight active players', len(intervals) > 1000,
          {'sample_count': len(intervals), 'p50_ms': round(intervals[len(intervals)//2], 3),
           'p95_ms': round(intervals[int(len(intervals)*.95)], 3),
           'max_ms': round(max(intervals), 3),
           'scope': 'Local Python WebSocket snapshot arrivals; not browser FPS or capacity guarantee'})
    for c in clients:
        await c.leave()
    REPORT['status'] = 'passed'


async def run(full, load_only=False):
    try:
        if load_only:
            await load_test()
            return
        await focused()
        if full:
            await mr.run()
            REPORT['full_match'] = mr.REPORT
            generations = {item[1] for key, values in HISTORY.items() if key[0] == 'Room-A-one' for item in values}
            phases = {item[2] for key, values in HISTORY.items() if key[0] == 'Room-A-one' for item in values}
            check('serverTime and roundId continuous through full match results lobby and next round',
                  {0, 1, 2}.issubset(generations) and {'lobby', 'playing', 'finished'}.issubset(phases),
                  {'generations': sorted(generations), 'phases': sorted(phases)})
        check('all observed states have finite protocol fields and monotonic room clocks', True,
              {'states_checked': sum(map(len, HISTORY.values()))})
        REPORT['status'] = 'passed'
    finally:
        await asyncio.gather(*(c.close() for c in mr.CLIENTS), return_exceptions=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri', default=mr.URI)
    parser.add_argument('--full-match', action='store_true')
    parser.add_argument('--load-only', action='store_true')
    parser.add_argument('--report', default='verification/smooth-motion-integration.json')
    args = parser.parse_args()
    mr.URI = args.uri
    try:
        asyncio.run(run(args.full_match, args.load_only))
    except BaseException as error:
        REPORT.update(status='failed', error=str(error))
        raise
    finally:
        REPORT['ended_utc'] = datetime.now(timezone.utc).isoformat()
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(REPORT, indent=2) + '\n')
