"""Real TCP/WebSocket slow observer; standard library only, loopback service only.
Run while sync_protocol_ws.mjs owns room 000001: python3 tests/slow_sync_socket.py.
SO_RCVBUF=1024 and no reads for 45 seconds force bounded server write queues.
"""
import socket,base64,os,json,struct,time
s=socket.socket()
s.setsockopt(socket.SOL_SOCKET,socket.SO_RCVBUF,1024)
s.settimeout(8)
s.connect(('127.0.0.1',18083))
key=base64.b64encode(os.urandom(16)).decode()
s.sendall(('GET /ws HTTP/1.1\r\nHost: 127.0.0.1:18083\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\n\r\n').encode())
buf=b''
while b'\r\n\r\n' not in buf:buf+=s.recv(1)
assert b'101' in buf
def send(m):
 b=json.dumps(m).encode();mask=os.urandom(4)
 head=bytes([129,128|len(b)]) if len(b)<126 else bytes([129,254])+struct.pack('!H',len(b))
 s.sendall(head+mask+bytes(v^mask[i%4] for i,v in enumerate(b)))
def readn(n):
 b=b''
 while len(b)<n:
  part=s.recv(n-len(b))
  if not part:raise EOFError()
  b+=part
 return b
def read():
 a,b=readn(2);n=b&127
 if n==126:n=struct.unpack('!H',readn(2))[0]
 if n==127:n=struct.unpack('!Q',readn(8))[0]
 return json.loads(readn(n))
send({'type':'join','name':'SlowObserver'})
while read()['type']!='welcome':pass
send({'type':'spectate','roomId':'000001'})
while read()['type']!='welcome':pass
print('Slow spectator paused 45 seconds',flush=True)
time.sleep(45)
s.settimeout(15)
total=0;closed=False
try:
 while True:
  b=s.recv(65536)
  if not b:closed=True;break
  total+=len(b)
except (socket.timeout,ConnectionResetError):pass
s.close()
print(json.dumps({'closedByServer':closed,'drainedBytes':total,'receiveBuffer':1024,'pausedSeconds':45}))
