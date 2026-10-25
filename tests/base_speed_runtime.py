"""Native Skynet WS regression: startup config reaches every room participant."""
import asyncio
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import websockets

ROOT = Path(__file__).resolve().parents[1]

async def state(ws):
    while True:
        message = json.loads(await asyncio.wait_for(ws.recv(), 4))
        if message['type'] == 'state':
            return message

async def check(expected):
    async with websockets.connect('ws://127.0.0.1:18080/ws') as a:
        await a.send(json.dumps(dict(type='join', name='Speed', color='#38bdf8')))
        # The directory welcome precedes create_room.
        while json.loads(await asyncio.wait_for(a.recv(), 4))['type'] != 'welcome':
            pass
        await a.send(json.dumps(dict(type='create_room')))
        first = await state(a)
        assert first['baseSpeed'] == expected, first
        async with websockets.connect('ws://127.0.0.1:18080/ws') as b:
            await b.send(json.dumps(dict(type='join', name='Peer', color='#fb7185')))
            while json.loads(await asyncio.wait_for(b.recv(), 4))['type'] != 'welcome':
                pass
            await b.send(json.dumps(dict(type='join_room', roomId=first['roomId'])))
            assert (await state(b))['baseSpeed'] == expected
            assert (await state(a))['baseSpeed'] == expected

for value, expected in [(None, 240), ('180', 180), ('NaN', 240)]:
    env = dict(os.environ)
    env.pop('ROVER_BASE_SPEED', None)
    if value is not None:
        env['ROVER_BASE_SPEED'] = value
    with socket.socket() as probe:
        assert probe.connect_ex(('127.0.0.1', 18080)) != 0, '18080 already occupied'
    with open(ROOT.parent / 'base-speed-runtime.log', 'a') as log:
        process = subprocess.Popen(['sh', str(ROOT / 'server/run.sh')], env=env, stdout=log, stderr=log)
        try:
            for _ in range(50):
                with socket.socket() as probe:
                    if probe.connect_ex(('127.0.0.1', 18080)) == 0:
                        break
                assert process.poll() is None, 'Skynet exited before listening'
                time.sleep(.1)
            asyncio.run(check(expected))
            print('PASS real WS startup', repr(value), '=>', expected, 'on both clients')
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
