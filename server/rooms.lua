-- Room/session orchestration. Physics remains entirely in game.lua.
local Game=require 'game'
local Clock=require 'game_clock'
local json=require 'json'
local Codec=require 'state_codec'
local R={};R.__index=R
function R.new(tokenfn,now,array,options)
 return setmetatable({tokenfn=tokenfn,codecOptions=options or {},now=now or 0,array=array or function(t)return t or {} end,rooms={},sessions={},connections={},nextRoom=0,outbox={}},R)
end
function R:emit(fd,message) self.outbox[#self.outbox+1]={fd=fd,message=message} end
function R:drain() local out=self.outbox;self.outbox={};return out end
function R:error(fd,message) self:emit(fd,{type='error',message=message}) end
function R:counts(room)
 local players,ready,spectators=0,0,0
 for _,p in ipairs(room.game.players) do if not p.removed then players=players+1;if p.connected and room.ready[p.id] then ready=ready+1 end end end
 for _,s in pairs(self.sessions) do if s.room==room and s.role=='spectator' and s.fd then spectators=spectators+1 end end
 return players,ready,spectators
end
function R:humanCounts(room)
 local humans,online,bots=0,0,0
 for _,p in ipairs(room.game.players) do if not p.removed then
  if p.isBot then bots=bots+1 else humans=humans+1;if p.connected then online=online+1 end end
 end end
 return humans,online,bots
end
function R:resetReady(room)
 room.readyDeadlines={};room.readyWarnings={}
 room.ready={}
 for _,p in ipairs(room.game.players) do if p.isBot and p.connected and not p.removed then room.ready[p.id]=true end end
end
-- Wall-clock deadlines are additive protocol metadata; legacy clients still use
-- error text and the existing directory welcome when a seat is released.
function R:clearReadyWarning(room,id)
 if not room.readyWarnings or not room.readyWarnings[id] then return end
 for _,s in pairs(self.sessions) do if s.room==room and s.player and s.player.id==id and s.fd then self:emit(s.fd,{type='error',code='ready_warning_clear',message=''}) end end
 room.readyWarnings[id]=nil
end
function R:syncReady(room)
 room.readyDeadlines=room.readyDeadlines or {};room.readyWarnings=room.readyWarnings or {}
 local humans=self:humanCounts(room)
 if room.game.phase~='lobby' or humans<2 then for id in pairs(room.readyWarnings) do self:clearReadyWarning(room,id) end;room.readyDeadlines={};room.readyWarnings={};return end
 local present={}
 for _,p in ipairs(room.game.players) do if not p.isBot and not p.removed then
  present[p.id]=true
  if room.ready[p.id] then room.readyDeadlines[p.id]=nil;self:clearReadyWarning(room,p.id)
  elseif not room.readyDeadlines[p.id] then room.readyDeadlines[p.id]=self.now+60 end
 end end
 for id in pairs(room.readyDeadlines) do if not present[id] then room.readyDeadlines[id]=nil;room.readyWarnings[id]=nil end end
end
function R:expireReady(room)
 self:syncReady(room)
 local expired={}
 for _,s in pairs(self.sessions) do if s.room==room and s.player then
  local deadline=room.readyDeadlines[s.player.id]
  if deadline then
   local left=math.max(0,math.ceil(deadline-self.now))
   if left==0 then expired[#expired+1]=s
   elseif left<=10 and room.readyWarnings[s.player.id]~=left then
    room.readyWarnings[s.player.id]=left
    if s.fd then self:emit(s.fd,{type='error',code='ready_warning',message='请准备，'..left..' 秒后将被移出房间',seconds=left}) end
   end
  end
 end end
 -- Collect first so simultaneous expiry is independent of iteration order.
 for _,s in ipairs(expired) do
  self:detach(s,true)
  if s.fd then
   self:welcome(s);self:directory(s.fd)
   self:emit(s.fd,{type='error',code='ready_timeout',message='超过 60 秒未准备，已返回房间大厅'})
  end
 end
 self:syncReady(room)
end
function R:removeBots(room)
 for i=#room.game.players,1,-1 do if room.game.players[i].isBot then table.remove(room.game.players,i) end end
 self:resetReady(room)
end
function R:summary(room)
 local n,r,s=self:counts(room)
 local humans,online,bots=self:humanCounts(room)
 local solo=room.game.phase=='lobby' and humans==1 and online==1
 return {humanCount=humans,botCount=bots,canAddBot=solo and bots==0,canRemoveBot=solo and bots>0,roomId=room.id,roomCode=room.id,phase=room.game.phase,remaining=room.game.remaining,playerCount=n,readyCount=r,spectatorCount=s,maxPlayers=8,maxSpectators=16,canJoin=room.game.phase=='lobby' and #room.game.players<8,canSpectate=s<16}
end
function R:directory(fd)
 local list=self.array();for _,room in pairs(self.rooms) do list[#list+1]=self:summary(room) end
 table.sort(list,function(a,b)return a.roomId<b.roomId end)
 self:emit(fd,{type='rooms',rooms=list})
end
function R:welcome(s)
 self:emit(s.fd,{type='welcome',id=s.player and s.player.id or '',token=s.token,roomId=s.room and s.room.id or json.null,role=s.role,name=s.name,color=s.color,protocolVersion=s.protocolVersion or 1})
end
function R:snapshot(room)
 local out=room.game:snapshot(self.array);local summary=self:summary(room)
 for _,key in ipairs({'roomId','roomCode','playerCount','readyCount','spectatorCount','maxPlayers','maxSpectators','humanCount','botCount','canAddBot','canRemoveBot'}) do out[key]=summary[key] end
 out.canStart=out.phase=='lobby' and summary.playerCount>=2 and summary.readyCount==summary.playerCount
 self:syncReady(room)
 for _,p in ipairs(out.players) do p.ready=room.ready[p.id]==true;local d=room.readyDeadlines[p.id];if d then p.readyIn=math.max(0,math.ceil(d-self.now)) end end
 return out
end
-- Only this room producer commits. Per-connection full reads the committed DTO.
function R:publishRoom(room)
 room.encoder=room.encoder or Codec.new(self.codecOptions)
 local raw=self:snapshot(room)
 local m=room.encoder:publish(raw,self.now)
 if m then
  local encoded=json.encode(m)
  for fd,s in pairs(self.connections) do
   if s.room==room and s.protocolVersion==2 and s.baseline then self:emit(fd,m);self.outbox[#self.outbox].encoded=encoded end
  end
 end
 return raw
end
function R:sendState(s,cause)
 if not s.room then return self:directory(s.fd) end
 if s.protocolVersion~=2 then return self:emit(s.fd,self:snapshot(s.room)) end
 if not s.room.encoder then self:publishRoom(s.room) end
 local m=s.room.encoder:full(cause or 'bootstrap')
 self:emit(s.fd,m);self.outbox[#self.outbox].encoded=json.encode(m)
 s.baseline=true
end
function R:detach(s,explicit)
 local room=s.room
 if room and s.player then
  room.clock:disconnect(s.fd,self.now);room.ready[s.player.id]=nil
  if explicit then
   s.player.token=nil
   if room.game.phase=='lobby' then for i,p in ipairs(room.game.players) do if p==s.player then table.remove(room.game.players,i);break end end end
  end
 end
 s.room=nil;s.player=nil;s.role='directory';s.baseline=false
end
function R:enter(s,room,role)
 if s.room then return self:error(s.fd,'Leave your current room first') end
 if role=='spectator' then
  local _,_,count=self:counts(room);if count>=16 then return self:error(s.fd,'Spectator limit reached (16)') end
  s.room=room;s.role=role
 else
  local p,e=room.game:join(s.fd,s.name,s.color)
  if not p then return self:error(s.fd,e) end
  p.token=s.token;s.player=p;s.room=room;s.role='player';room.ready[p.id]=false
  local humans,_,bots=self:humanCounts(room)
  if humans>=2 and bots>0 then self:removeBots(room) end
 end
 self:syncReady(room)
 room.emptySince=nil;s.baseline=false;self:welcome(s);self:publishRoom(room);self:sendState(s)
end
function R:tryStart(room)
 if room.game.phase~='lobby' then return end
 local n,ready=self:counts(room)
 if n>=2 and n==ready then room.clock:start(self.now) end
end
function R:join(fd,m)
 if self.connections[fd] then return self:error(fd,'Already joined') end
 local s=type(m.token)=='string' and self.sessions[m.token] or nil
 if s then
  if s.fd then return self:error(fd,'Guest already connected; close the other tab first') end
  if not s.room or s.room.game.phase=='lobby' then
   local validation=Game.new();local p,e=validation:join(fd,m.name or s.name,m.color or s.color)
   if not p then return self:error(fd,e) end
   s.name=p.name;s.color=p.color;if s.player then s.player.name=p.name end
  end
  s.fd=fd;s.last=self.now;s.protocolVersion=m.protocolVersion==2 and 2 or 1;s.baseline=false;s.lastResync=nil;self.connections[fd]=s
  if s.room and s.player then
   local p=s.room.game:join(fd,s.name,s.color,s.token)
   if p then p.token=s.token;s.player=p;s.room.ready[p.id]=false else self:detach(s,true) end
  elseif s.room and s.role=='spectator' then
   local _,_,count=self:counts(s.room)
   if count>16 then self:detach(s,true) end
  end
  self:welcome(s);if s.room then self:publishRoom(s.room) end;self:sendState(s,'reconnect');return
 end
 -- Reuse core nickname/color validation without adding a directory user to a room.
 local validation=Game.new(self.tokenfn);local p,e=validation:join(fd,m.name,m.color)
 if not p then return self:error(fd,e) end
 s={protocolVersion=m.protocolVersion==2 and 2 or 1,token=p.token,name=p.name,color=p.color,fd=fd,role='directory',last=self.now}
 self.sessions[s.token]=s;self.connections[fd]=s;self:welcome(s);self:directory(fd)
end
function R:handle(fd,m,now)
 self:advance(now)
 if m.type=='join' then return self:join(fd,m) end
 local s=self.connections[fd];if not s then return self:error(fd,'Join first') end
 s.last=self.now
 if m.type=='rooms' then return self:directory(fd) end
 if m.type=='leave_room' then self:detach(s,true);self:welcome(s);self:directory(fd);return end
 if m.type=='create_room' then
  if s.room then return self:error(fd,'Leave your current room first') end
  local count=0;for _ in pairs(self.rooms) do count=count+1 end
  if count>=32 then return self:error(fd,'Room limit reached (32); join an existing room') end
  self.nextRoom=self.nextRoom+1;local id=string.format('%06d',self.nextRoom)
  local g=Game.new(self.tokenfn);local room={id=id,game=g,clock=Clock.new(g,self.now),ready={}}
  self.rooms[id]=room;return self:enter(s,room,'player')
 end
 if m.type=='join_room' or m.type=='spectate' then
  local room=type(m.roomId)=='string' and self.rooms[m.roomId] or nil
  if not room then return self:error(fd,'Room not found') end
  return self:enter(s,room,m.type=='spectate' and 'spectator' or 'player')
 end
 if m.type=='set_name' then
  if s.room and s.room.game.phase~='lobby' then return self:error(fd,'Not in lobby') end
  local validation=Game.new();local p,e=validation:join(fd,m.name,s.color)
  if not p then return self:error(fd,e) end
  s.name=p.name;if s.player then s.player.name=p.name end
  self:emit(fd,{type='profile',name=s.name,color=s.color});return
 end
 if m.type=='request_full' then
  if s.room and s.protocolVersion==2 and (not s.lastResync or self.now-s.lastResync>=1) then
   s.lastResync=self.now;self:sendState(s,'resync')
  end
  return
 end
 if not s.room or s.role~='player' or not s.player then return self:error(fd,'Only room players can perform this action') end
 local room=s.room;local g=room.game
 if m.type=='add_bot' or m.type=='remove_bot' then
  if g.phase~='lobby' then return self:error(fd,'Not in lobby') end
  local humans,online,bots=self:humanCounts(room)
  if humans~=1 or online~=1 then return self:error(fd,'AI requires one connected human player') end
  if m.type=='remove_bot' then self:removeBots(room)
  elseif bots==0 then
   local bot,e=g:join({},'竞技小车','#fb923c')
   if not bot then return self:error(fd,e) end
   bot.isBot=true;bot.token=nil;self:resetReady(room)
  end
  self:publishRoom(room);self:sendState(s);return
 elseif m.type=='set_color' then
  if g.phase~='lobby' then return self:error(fd,'Not in lobby') end
  local allowed={['#38bdf8']=true,['#fb7185']=true,['#a78bfa']=true,['#facc15']=true,['#34d399']=true,['#fb923c']=true,['#e879f9']=true,['#cbd5e1']=true}
  if not allowed[m.color] then return self:error(fd,'Invalid color') end
  for _,p in ipairs(g.players) do if p.id~=s.player.id and not p.removed and p.color==m.color then return self:error(fd,'Color already taken') end end
  s.player.color=m.color;s.color=m.color
  self:emit(fd,{type='profile',name=s.name,color=s.color})
 elseif m.type=='ready' or m.type=='start' then
  if g.phase~='lobby' then return self:error(fd,'Not in lobby') end
  local ready=m.type=='start' or m.ready
  if type(ready)~='boolean' then return self:error(fd,'Ready must be a boolean') end
  room.ready[s.player.id]=ready;self:syncReady(room);self:tryStart(room)
 elseif m.type=='input' then local _,e=g:input(s.player,m);if e then self:error(fd,e) end
 elseif m.type=='again' then local ok,e=g:again();if not ok then self:error(fd,e) else self:resetReady(room) end
 else self:error(fd,'Unknown action') end
end
function R:disconnect(fd,now)
 self:advance(now)
 local s=self.connections[fd];if not s then return end
 if s.room and s.player then s.room.clock:disconnect(fd,self.now);s.room.ready[s.player.id]=nil end
 s.fd=nil;s.last=self.now;self.connections[fd]=nil
end
function R:advance(now)
 self.now=math.max(self.now,now or self.now)
 for id,room in pairs(self.rooms) do
  local phase=room.game.phase;room.clock:advance(self.now)
  if phase~='lobby' and room.game.phase=='lobby' then
   local humans=self:humanCounts(room)
   if humans~=1 then self:removeBots(room) else self:resetReady(room) end
  end
  self:expireReady(room)
  self:tryStart(room)
  -- Disconnected seats expire in the core. Preserve active-match tokens/results.
  local occupied=false
  for _,s in pairs(self.sessions) do if s.room==room and (s.fd or self.now-s.last<10) then occupied=true;break end end
  if not occupied then
   for _,s in pairs(self.sessions) do if s.room==room then s.room=nil;s.player=nil;s.role='directory';s.baseline=false end end
   self.rooms[id]=nil
  end
 end
 for token,s in pairs(self.sessions) do if not s.fd and not s.room and self.now-s.last>=600 then self.sessions[token]=nil end end
end
function R:broadcastStates()
 for _,room in pairs(self.rooms) do
  local raw=self:publishRoom(room)
  local encoded
  for fd,s in pairs(self.connections) do if s.room==room and s.protocolVersion~=2 then
   encoded=encoded or json.encode(raw);self:emit(fd,raw);self.outbox[#self.outbox].encoded=encoded
  end end
 end
end
function R:broadcastRooms() for fd,s in pairs(self.connections) do if s.role=='directory' then self:directory(fd) end end end
return R
