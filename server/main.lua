local skynet=require 'skynet'
local socket=require 'skynet.socket'
local websocket=require 'http.websocket'
local httpd=require 'http.httpd'
local helper=require 'http.sockethelper'
local crypt=require 'skynet.crypt'
local json=require 'json'
local G=require 'game'
local g=G.new(function() return crypt.hexencode(crypt.randomkey()..crypt.randomkey()..crypt.randomkey()) end)
local clock=require('game_clock').new(g,skynet.now()/100)
local clients={};local pending={};local peers={}
local function send(fd,m) local ok=pcall(websocket.write,fd,json.encode(m));if not ok then clock:disconnect(fd,skynet.now()/100);clients[fd]=nil end end
local function err(fd,msg) send(fd,{type='error',message=msg or 'Invalid action'}) end
local handle={}
function handle.message(fd,msg,kind)
 clock:advance(skynet.now()/100)
 if kind~='text' or #msg>2048 then return err(fd,'Text JSON messages, max 2048 bytes') end
 local peer=peers[fd];if not peer then return end
 local now=skynet.now();if now-peer.window>=100 then peer.window=now;peer.count=0 end
 peer.count=peer.count+1;if peer.count>60 then return end
 local ok,m=pcall(json.decode,msg);if not ok or type(m)~='table' then return err(fd,'Invalid JSON') end
 if m.type=='join' then
  local p,e=g:join(fd,m.name,m.color,m.token);if not p then return err(fd,e) end
  clients[fd]=p;pending[fd]=nil;send(fd,{type='welcome',id=p.id,token=p.token});send(fd,g:snapshot(json.array));return
 end
 local p=clients[fd];if not p then return err(fd,'Join first') end
 if m.type=='input' then local valid,e=g:input(p,m);if e then err(fd,e) end
 elseif m.type=='start' then local valid,e=clock:start(skynet.now()/100);if not valid then err(fd,e) end
 elseif m.type=='again' then local valid,e=g:again();if not valid then err(fd,e) end
 else err(fd,'Unknown action') end
end
function handle.close(fd) clock:disconnect(fd,skynet.now()/100);clients[fd]=nil;pending[fd]=nil;peers[fd]=nil end
handle.error=handle.close
local mime={html='text/html; charset=utf-8',js='text/javascript',css='text/css',svg='image/svg+xml',png='image/png',json='application/json',ico='image/x-icon',wav='audio/wav',ogg='audio/ogg',webp='image/webp'}
local function serve(fd,addr)
 socket.start(fd)
 local code,url,method,headers,body=httpd.read_request(helper.readfunc(fd),8192)
 if code~=200 then socket.close(fd);return end
 if url=='/ws' and method=='GET' and headers.upgrade and headers.upgrade:lower()=='websocket' then
  peers[fd]={window=skynet.now(),count=0};pending[fd]=skynet.now()
  local ok=websocket.accept(fd,handle,'ws',addr,{upgrade={header=headers,method=method,url=url}})
  handle.close(fd);return
 end
 local path=url:match('^[^?]*');if path=='/' then path='/index.html' end
 local content,status,ctype='Not found',404,'text/plain'
 if method=='GET' and not path:find('..',1,true) and not path:find('%%') and path:match('^/[a-zA-Z0-9_./%-]+$') then
  local root=os.getenv('ROVER_CLIENT') or '/workspace/scratch/0811cde7f1f9/magnetic-rover/client/dist'
  local f=io.open(root..path,'rb');if f then content=f:read('*a');f:close();status=200;ctype=mime[path:match('%.([^%.]+)$')] or 'application/octet-stream' end
 end
 httpd.write_response(helper.writefunc(fd),status,content,{['Content-Type']=ctype,['Cache-Control']='no-cache',['X-Content-Type-Options']='nosniff'});socket.close(fd)
end
skynet.start(function()
 local listener=socket.listen('127.0.0.1',18080)
 socket.start(listener,function(fd,addr) skynet.fork(function() local ok,e=pcall(serve,fd,addr);if not ok then handle.close(fd);pcall(socket.close,fd);skynet.error('Connection closed',tostring(e)) end end) end)
 skynet.error('Magnetic Rover: http://127.0.0.1:18080 ; ws://127.0.0.1:18080/ws')
 skynet.fork(function()
  local nextWake=skynet.now()+5
  local nextSnapshot=skynet.now()+10
  while true do
   skynet.sleep(math.max(1,nextWake-skynet.now()))
   local now=skynet.now()
   clock:advance(now/100)
   -- Absolute wake targets prevent work time from extending every interval.
   nextWake=nextWake+5
   if nextWake<=now then nextWake=now+5 end
   if now>=nextSnapshot then
    local snapshot=g:snapshot(json.array);for fd in pairs(clients) do send(fd,snapshot) end
    nextSnapshot=nextSnapshot+10
    if nextSnapshot<=now then nextSnapshot=now+10 end
   end
   for fd,t in pairs(pending) do if now-t>1000 then pcall(websocket.close,fd);handle.close(fd) end end
  end
 end)
end)
