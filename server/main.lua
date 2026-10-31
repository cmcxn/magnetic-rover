local skynet=require 'skynet'
local socket=require 'skynet.socket'
local websocket=require 'http.websocket'
local httpd=require 'http.httpd'
local helper=require 'http.sockethelper'
local crypt=require 'skynet.crypt'
local json=require 'json'
local rooms=require('rooms').new(function() return crypt.hexencode(crypt.randomkey()..crypt.randomkey()..crypt.randomkey()) end,skynet.now()/100,json.array,{epochPrefix=crypt.hexencode(crypt.randomkey())})
local pending={};local peers={}
local latency=require 'latency'
local sendStats={messages=0,jsonBytes=0,websocketBytes=0,byType={},byStream={}}
local function send(fd,m,encoded)
 encoded=encoded or json.encode(m)
 local ok=pcall(websocket.write,fd,encoded)
 if ok then
  local n=#encoded;local key=m.type or 'other'
  sendStats.messages=sendStats.messages+1;sendStats.jsonBytes=sendStats.jsonBytes+n
  sendStats.websocketBytes=sendStats.websocketBytes+n+(n<126 and 2 or n<65536 and 4 or 10)
  if os.getenv('ROVER_NETWORK_STATS')=='1' then
   local s=rooms.connections[fd]
   local stream=table.concat({tostring(fd),s and s.room and s.room.id or 'directory',tostring(m.roundId or 0),tostring(s and s.protocolVersion or 1),key},':')
   local entry=sendStats.byStream[stream] or {messages=0,bytes=0};sendStats.byStream[stream]=entry
   entry.messages=entry.messages+1;entry.bytes=entry.bytes+n
  end
  local t=sendStats.byType[key] or {messages=0,bytes=0};sendStats.byType[key]=t;t.messages=t.messages+1;t.bytes=t.bytes+n
 end
 if not ok then rooms:disconnect(fd,skynet.now()/100);pending[fd]=nil;peers[fd]=nil end
end
local function flush() for _,event in ipairs(rooms:drain()) do if peers[event.fd] then send(event.fd,event.message,event.encoded) end end end
local function err(fd,msg) send(fd,{type='error',message=msg or 'Invalid action'}) end
local handle={}
function handle.message(fd,msg,kind)
 if kind~='text' or #msg>2048 then return err(fd,'Text JSON messages, max 2048 bytes') end
 local peer=peers[fd];if not peer then return end
 local now=skynet.now();if now-peer.window>=100 then peer.window=now;peer.count=0 end
 peer.count=peer.count+1;if peer.count>60 then return end
 local ok,m=pcall(json.decode,msg);if not ok or type(m)~='table' then return err(fd,'Invalid JSON') end
 if m.type=='ping' and rooms.connections[fd] then
  local reply,e=latency.reply(peer,m,now/100);if reply then send(fd,reply) elseif e then err(fd,e) end;return
 end
 rooms:handle(fd,m,now/100)
 if rooms.connections[fd] then pending[fd]=nil end
 flush()
end
function handle.close(fd) rooms:disconnect(fd,skynet.now()/100);pending[fd]=nil;peers[fd]=nil end
handle.error=handle.close
local mime={html='text/html; charset=utf-8',js='text/javascript',css='text/css',svg='image/svg+xml',png='image/png',json='application/json',ico='image/x-icon',wav='audio/wav',ogg='audio/ogg',webp='image/webp'}
local function serve(fd,addr)
 socket.start(fd)
 local code,url,method,headers,body=httpd.read_request(helper.readfunc(fd),8192)
 if code~=200 then socket.close(fd);return end
 if url=='/ws' and method=='GET' and headers.upgrade and headers.upgrade:lower()=='websocket' then
  peers[fd]={window=skynet.now(),count=0};pending[fd]=skynet.now()
  -- Pinned runtime supplies queued write size in KiB to socket.warning.
  socket.warning(fd,function(id,kib)
   if kib >= 1024 then skynet.error('Closing slow rover socket',id,kib);handle.close(id);pcall(socket.close,id) end
  end)
  local ok=websocket.accept(fd,handle,'ws',addr,{upgrade={header=headers,method=method,url=url}})
  handle.close(fd);return
 end
 local path=url:match('^[^?]*');if path=='/' then path='/index.html' end
 local content,status,ctype='Not found',404,'text/plain'
 if method=='GET' and not path:find('..',1,true) and not path:find('%%') and path:match('^/[a-zA-Z0-9_./%-]+$') then
  local root=os.getenv('ROVER_CLIENT') or ((os.getenv('ROVER_SERVER') or './server'):gsub('/+$','')..'/../client/dist')
  local f=io.open(root..path,'rb');if f then content=f:read('*a');f:close();status=200;ctype=mime[path:match('%.([^%.]+)$')] or 'application/octet-stream' end
 end
 httpd.write_response(helper.writefunc(fd),status,content,{['Content-Type']=ctype,['Cache-Control']='no-cache',['X-Content-Type-Options']='nosniff'});socket.close(fd)
end
skynet.start(function()
 if os.getenv('ROVER_NETWORK_STATS')=='1' then
  skynet.fork(function() while true do skynet.sleep(1000);skynet.error('ROVER_NETWORK_STATS '..json.encode(sendStats)) end end)
 end
 local bind=os.getenv('ROVER_BIND') or '127.0.0.1'
 local listener=socket.listen(bind,18080)
 socket.start(listener,function(fd,addr) skynet.fork(function() local ok,e=pcall(serve,fd,addr);if not ok then handle.close(fd);pcall(socket.close,fd);skynet.error('Connection closed',tostring(e)) end end) end)
 skynet.error('Magnetic Rover listening on '..bind..':18080 ; HTTP / and WebSocket /ws')
 skynet.fork(function()
  local nextWake=skynet.now()+5
  local nextSnapshot=skynet.now()+10
  local nextDirectory=skynet.now()+100
  while true do
   skynet.sleep(math.max(1,nextWake-skynet.now()))
   local now=skynet.now()
   rooms:advance(now/100)
   nextWake=nextWake+5
   if nextWake<=now then nextWake=now+5 end
   if now>=nextSnapshot then
    rooms:broadcastStates();flush()
    nextSnapshot=nextSnapshot+10
    if nextSnapshot<=now then nextSnapshot=now+10 end
   end
   if now>=nextDirectory then
    nextDirectory=now+100;rooms:broadcastRooms();flush()
   end
   for fd,t in pairs(pending) do if now-t>1000 then pcall(websocket.close,fd);handle.close(fd) end end
  end
 end)
end)
