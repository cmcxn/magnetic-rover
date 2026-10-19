"""Independent real Skynet multi-room acceptance (about 115 seconds).

Run an idle server on port 18080, then: python tests/multi_room.py
No debug endpoints, simulation clock changes, or mocked game/server behavior.
Tokens remain in memory and are never included in reports.
"""
import argparse
import asyncio
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import websockets

REPORT = {'method': 'Real Skynet with independent Python WebSocket clients; full wall-clock match; not browser/mobile QA',
          'started_utc': datetime.now(timezone.utc).isoformat(), 'checks': []}
CLIENTS = []
URI = 'ws://127.0.0.1:18080/ws'


def check(label, condition, detail=None):
    REPORT['checks'].append({'name': label, 'passed': bool(condition), 'detail': detail})
    print(('PASS ' if condition else 'FAIL ') + label, detail or '', flush=True)
    assert condition, label


async def until(predicate, timeout=6):
    deadline = time.monotonic() + timeout
    while not predicate():
        for client in CLIENTS:
            if client.reader_error:
                raise client.reader_error
        if time.monotonic() >= deadline:
            raise TimeoutError('Timed out waiting for protocol condition')
        await asyncio.sleep(.02)


class Client:
    def __init__(self, name):
        self.name = name
        self.token = None
        self.id = None
        self.room = None
        self.role = None
        self.state = None
        self.rooms = None
        self.welcomes = 0
        self.errors = []
        self.expected_errors = 0
        self.observed = set()
        self.reader_error = None
        self.ws = None
        self.task = None
        self.target = None
        self.phase_at = {}
        CLIENTS.append(self)

    async def connect(self):
        self.ws = await websockets.connect(URI)
        before = self.welcomes
        self.task = asyncio.create_task(self.read())
        await self.send(type='join', name=self.name, color='#38bdf8', **({'token': self.token} if self.token else {}))
        await until(lambda: self.welcomes > before)
        return self

    async def read(self):
        try:
            async for raw in self.ws:
                message = json.loads(raw)
                kind = message.get('type')
                if kind == 'welcome':
                    assert 'roomId' in message, 'Directory welcome must include explicit null roomId'
                    if self.token is not None:
                        assert self.token == message['token'], 'Guest token changed across room operations'
                    self.token, self.id = message['token'], message['id']
                    self.room, self.role = message['roomId'], message['role']
                    self.state = None
                    self.welcomes += 1
                elif kind == 'state':
                    assert message['roomId'] == self.room, 'Received another room state'
                    assert self.role != 'directory', 'Directory received room state'
                    assert all('token' not in p for p in message['players']), 'State exposes token'
                    assert all(isinstance(p['ready'], bool) for p in message['players'])
                    self.state = message
                    self.observed.add(message['roomId'])
                    self.phase_at.setdefault((self.room, message['phase']), time.monotonic())
                elif kind == 'rooms':
                    self.rooms = message['rooms']
                elif kind == 'error':
                    self.errors.append(message.get('message', 'unspecified protocol error'))
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.reader_error = error

    async def send(self, **message):
        await self.ws.send(json.dumps(message))

    async def enter(self, kind, room=None):
        before = self.welcomes
        await self.send(type=kind, **({'roomId': room} if room else {}))
        await until(lambda: self.welcomes > before and self.state is not None)
        return self.room

    async def leave(self):
        before = self.welcomes
        await self.send(type='leave_room')
        await until(lambda: self.welcomes > before and self.role == 'directory')

    async def rejected(self, **message):
        before = len(self.errors)
        await self.send(**message)
        await until(lambda: len(self.errors) > before)
        self.expected_errors += 1

    def player(self):
        return next(p for p in self.state['players'] if p['id'] == self.id)

    async def close(self):
        if self.ws:
            await self.ws.close()
        if self.task:
            await self.task

    async def steer(self):
        player = self.player()
        distance = lambda point: (player['x'] - point['x']) ** 2 + (player['y'] - point['y']) ** 2
        if player['cargo'] >= 4:
            self.target = min(self.state['stations'], key=distance)
        elif not self.target or 'id' not in self.target or not any(b['id'] == self.target['id'] for b in self.state['batteries']):
            self.target = min(self.state['batteries'], key=distance, default=None)
        if self.target:
            dx, dy = self.target['x'] - player['x'], self.target['y'] - player['y']
            length = max(1, math.hypot(dx, dy))
            await self.send(type='input', x=dx / length, y=dy / length, boost=False)


async def main():
    a = await Client('Room-A-one').connect()
    directory = await Client('Directory-watch').connect()
    await until(lambda: directory.rooms is not None)
    check('join opens directory without player seat', a.role == 'directory' and a.id == '' and a.room is None)
    room_a = await a.enter('create_room')
    b = await Client('Room-B-one').connect()
    room_b = await b.enter('create_room')
    check('create produces two distinct rooms', room_a != room_b)
    await a.send(type='ready', ready=True)
    await until(lambda: a.state['readyCount'] == 1)
    await asyncio.sleep(.3)
    check('one player cannot start even when ready', a.state['phase'] == 'lobby')
    await a.send(type='ready', ready=False)
    a2 = await Client('Room-A-two').connect()
    await a2.enter('join_room', room_a)
    b2 = await Client('Room-B-two').connect()
    await b2.enter('join_room', room_b)
    await until(lambda: len(a.state['players']) == len(b.state['players']) == 2)
    check('room players isolated', {p['name'] for p in a.state['players']} == {a.name, a2.name} and {p['name'] for p in b.state['players']} == {b.name, b2.name})
    for malformed in (None, '', '999999', {}, [], 42, '../000001'):
        await directory.rejected(type='join_room', roomId=malformed)
        await directory.rejected(type='spectate', roomId=malformed)
    check('malformed and unknown room identifiers rejected', directory.role == 'directory')
    before_room = a.room
    for kind in ('create_room', 'join_room', 'spectate'):
        await a.rejected(type=kind, roomId=room_a)
    await until(lambda: directory.rooms is not None and len(directory.rooms) == 2)
    check('repeated room commands cannot duplicate membership or rooms', a.room == before_room and len(a.state['players']) == 2 and len(directory.rooms) == 2)

    extra = []
    for index in range(6):
        client = await Client('Capacity-' + str(index)).connect()
        await client.enter('join_room', room_b)
        extra.append(client)
    overflow = await Client('Overflow').connect()
    await overflow.rejected(type='join_room', roomId=room_b)
    await until(lambda: len(b.state['players']) == 8)
    check('eight player cap enforced server-side', len(b.state['players']) == 8 and overflow.role == 'directory')
    spectators = []
    for index in range(16):
        client = await Client('Watcher-' + str(index)).connect()
        await client.enter('spectate', room_b)
        spectators.append(client)
    await overflow.rejected(type='spectate', roomId=room_b)
    await until(lambda: b.state['spectatorCount'] == 16)
    check('sixteen spectators independent from eight player seats', len(b.state['players']) == 8 and all(c.id == '' and c.role == 'spectator' for c in spectators))
    for client in spectators + extra:
        await client.leave()
    await until(lambda: len(b.state['players']) == 2 and b.state['spectatorCount'] == 0)
    check('explicit leave frees lobby seats and spectators', b.state['playerCount'] == 2)
    token = overflow.token
    await overflow.enter('join_room', room_b)
    await overflow.leave()
    await overflow.leave()
    await overflow.enter('spectate', room_a)
    await overflow.leave()
    check('stable guest token across rooms and repeated leave', overflow.token == token and overflow.id == '' and overflow.room is None)

    await a.send(type='ready', ready=True)
    await a.send(type='ready', ready=True)
    await until(lambda: a.state['readyCount'] == 1)
    await asyncio.sleep(.3)
    check('one of two ready cannot start', a.state['phase'] == 'lobby')
    await a.send(type='ready', ready=False)
    await until(lambda: a.state['readyCount'] == 0)
    check('ready can be cancelled', not a.player()['ready'])
    await a.send(type='ready', ready=True)
    await a2.send(type='start')
    await until(lambda: a.state['phase'] == 'playing')
    started = a.phase_at[(room_a, 'playing')]
    check('all players ready autostarts; start aliases ready', 99 <= a.state['remaining'] <= 100)
    await until(lambda: b.state['phase'] == 'lobby')
    check('other room remains pristine lobby', b.state['remaining'] == 100 and not b.state['batteries'] and all(p['score'] == 0 and not p['ready'] for p in b.state['players']))
    spectator = await Client('Live-watcher').connect()
    await spectator.enter('spectate', room_a)
    await directory.rejected(type='join_room', roomId=room_a)
    for message in ({'type': 'input', 'x': 1, 'y': 1, 'boost': True}, {'type': 'ready', 'ready': True}, {'type': 'start'}, {'type': 'again'}, {'type': 'score', 'score': 99999}):
        await spectator.rejected(**message)
    check('live spectator receives state but all mutations rejected', spectator.id == '' and spectator.state['phase'] == 'playing' and len(spectator.state['players']) == 2)
    takeover = await websockets.connect(URI)
    try:
        await takeover.send(json.dumps({'type': 'join', 'name': 'Takeover', 'token': a.token}))
        response = json.loads(await asyncio.wait_for(takeover.recv(), 5))
        check('active token cannot take over connection', response['type'] == 'error')
    finally:
        await takeover.close()
    score_deadline = time.monotonic() + 30
    while a.player()['score'] == 0 and time.monotonic() < score_deadline:
        await a.steer()
        await asyncio.sleep(.08)
    check('real movement collects batteries and scores in room A', a.player()['score'] > 0, {'score': a.player()['score']})
    check('room A batteries and scores never appear in lobby B', not b.state['batteries'] and all(p['score'] == 0 and p['cargo'] == 0 for p in b.state['players']))
    await a.send(type='input', x=0, y=0, boost=False)
    await asyncio.sleep(.15)
    old_id, old_score = a.id, a.player()['score']
    await a.close()
    await until(lambda: any(p['id'] == old_id and not p['connected'] for p in a2.state['players']))
    await a.connect()
    await until(lambda: a.state is not None)
    check('disconnect/reconnect restores same room identity and score', a.room == room_a and a.id == old_id and a.player()['score'] == old_score)
    await b.send(type='ready', ready=True)
    await b2.send(type='ready', ready=True)
    await until(lambda: b.state['phase'] == 'playing')
    check('rooms have independent match clocks and batteries', b.state['remaining'] > a.state['remaining'] + 1 and b.state['batteries'] != a.state['batteries'])
    await until(lambda: directory.rooms and all(r['phase'] == 'playing' for r in directory.rooms))
    check('directory reflects authoritative room counts and admission', all(r['playerCount'] == 2 and r['maxPlayers'] == 8 and r['maxSpectators'] == 16 and not r['canJoin'] and r['canSpectate'] for r in directory.rooms))

    while a.state['phase'] == 'playing':
        await a.steer()
        assert all(p['name'].startswith('Room-A-') for p in a.state['players'])
        assert all(p['name'].startswith('Room-B-') and p['score'] == 0 for p in b.state['players'])
        await asyncio.sleep(.08)
    finished = a.phase_at[(room_a, 'finished')]
    check('full match lasts real 100 seconds', abs(finished - started - 100) < 1, {'wall_seconds': round(finished - started, 3)})
    await until(lambda: a2.state['phase'] == spectator.state['phase'] == 'finished')
    results = json.loads(json.dumps(a.state['results']))
    check('only room participants appear in identical player/spectator results', results == a2.state['results'] == spectator.state['results'] and {p['name'] for p in results} == {a.name, a2.name})
    check('room B continues while room A is finished', b.state['phase'] == 'playing')
    positions = [(p['x'], p['y']) for p in a.state['players']]
    await a.send(type='input', x=1, y=1, boost=True)
    await asyncio.sleep(1)
    check('finished match movement and results frozen', a.state['results'] == results and positions == [(p['x'], p['y']) for p in a.state['players']])
    await until(lambda: a.state['phase'] == 'lobby', timeout=12)
    elapsed = time.monotonic() - finished
    check('automatic results settle lasts real ten seconds', abs(elapsed - 10) < 1, {'wall_seconds': round(elapsed, 3)})
    check('next round clears scores batteries and all ready flags', a.state['remaining'] == 100 and not a.state['batteries'] and a.state['readyCount'] == 0 and all(p['score'] == p['cargo'] == 0 and not p['ready'] for p in a.state['players']))
    await a.send(type='ready', ready=True)
    await until(lambda: a.state['readyCount'] == 1)
    await asyncio.sleep(.3)
    check('next round cannot start from stale ready flag', a.state['phase'] == 'lobby')
    await a2.send(type='ready', ready=True)
    await until(lambda: a.state['phase'] == 'playing')
    check('next round starts only after fresh readiness from both players', a.state['remaining'] > 99)
    check('all observed states restricted to joined or spectated rooms', a.observed == {room_a} and a2.observed == {room_a} and b.observed == {room_b} and b2.observed == {room_b} and spectator.observed == {room_a} and not directory.observed)
    for client in (a, a2, b, b2, spectator):
        await client.leave()
    check('leave returns active and finished participants to directory', all(c.role == 'directory' and c.room is None and c.id == '' for c in (a, a2, b, b2, spectator)))
    check('no unexpected protocol errors or receive failures', all(len(c.errors) == c.expected_errors and c.reader_error is None for c in CLIENTS))
    REPORT['status'] = 'passed'


async def run():
    try:
        async with asyncio.timeout(170):
            await main()
    finally:
        await asyncio.gather(*(c.close() for c in CLIENTS), return_exceptions=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri', default=URI)
    parser.add_argument('--report', default='verification/multi-room.json')
    args = parser.parse_args()
    URI = args.uri
    try:
        asyncio.run(run())
    except BaseException as error:
        REPORT['status'] = 'failed'
        REPORT['error'] = str(error)
        raise
    finally:
        REPORT['ended_utc'] = datetime.now(timezone.utc).isoformat()
        output = Path(args.report)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(REPORT, indent=2) + '\n')
