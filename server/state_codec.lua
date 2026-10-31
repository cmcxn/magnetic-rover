-- Transport-only projection. Never mutates Game/snapshot floats.
local json=require 'json'
local C={}
local configs={}
for k in ('boostMultiplier vehicleScale boostCooldown boostDuration baseSpeed radius mapScale supplySpeed refillInterval collisionRadius pickupRadius stations roomCode maxPlayers maxSpectators'):gmatch('%S+') do configs[k]=true end
local profiles={name=true,color=true,isBot=true}
local groups={x='position',y='position',z='position',angle='angle',kx='velocity',ky='velocity',vx='velocity',vy='velocity',ix='direction',iy='direction',bx='direction',by='direction',energy='energy',serverTime='clock',remaining='time',returnIn='time',secondsToShrink='time',cooldown='time',boost='time',stun='time',inputElapsed='inputTime',unlock='time'}
local scales={
 conservative={clock=1,inputTime=1,playerPosition=10,position=10,angle=1000,velocity=1,direction=1,energy=1,time=1},
 fine={clock=1,inputTime=1,playerPosition=100,position=100,angle=10000,velocity=100,direction=10000,energy=10000,time=1000},
}
C.scales=scales
function C.round(n) assert(type(n)=='number' and n==n and math.abs(n)<math.huge,'nonfinite wire value');local v=n>=0 and math.floor(n+.5) or math.ceil(n-.5);assert(math.abs(v)<=9007199254740991,'wire overflow');return v==0 and 0 or v end
local function copy(t)
 if type(t)~='table' then return t end
 local out=json.kind(t)=='array' and json.array() or {}
 for k,v in pairs(t) do out[k]=copy(v) end
 return out
end
local function projectObject(t,s)
 local o={}
 for k,v in pairs(t) do
  if type(v)=='number' and groups[k] then
   local scale=s[groups[k]];o[k]=scale==1 and v or C.round(v*scale)
   -- Prediction branches on >0 for these fields. Preserve a positive tail
   -- instead of rounding an active stun/dash/energy value into false.
   if scale~=1 and v>0 and (k=='stun' or k=='boost' or k=='energy') then o[k]=math.max(1,o[k]) end
  elseif type(v)=='table' then o[k]=projectObject(v,s)
  else o[k]=v end
 end
 return o
end
function C.project(raw,profile)
 local scale=assert(scales[profile or 'fine'],'unknown profile')
 local dto={metadata={config={},profiles={},scales=copy(scale),profile=profile or 'fine'},frame={},players=json.array(),batteries=json.array(),roomId=raw.roomId or '',roundId=raw.roundId or 0}
 for k,v in pairs(raw) do
  if configs[k] then dto.metadata.config[k]=copy(v)
  elseif k~='type' and k~='players' and k~='batteries' and k~='roomId' and k~='roundId' then dto.frame[k]=copy(v) end
 end
 dto.frame=projectObject(dto.frame,scale)
 -- Results keep profile fields: they are a small phase event, not repeated play data.
 if raw.results then dto.frame.results=copy(raw.results) end
 for _,p in ipairs(raw.players) do
  local out={}
  local profileData={}
  for k,v in pairs(p) do if profiles[k] then profileData[k]=v else out[k]=v end end
  dto.metadata.profiles[p.id]=profileData
  local playerScale=copy(scale);playerScale.position=scale.playerPosition
  dto.players[#dto.players+1]=projectObject(out,playerScale)
 end
 for _,b in ipairs(raw.batteries) do dto.batteries[#dto.batteries+1]=projectObject(b,scale) end
 return dto
end
local function equal(a,b)
 if type(a)~=type(b) then return false end
 if type(a)~='table' then return a==b end
 for k,v in pairs(a) do if not equal(v,b[k]) then return false end end
 for k in pairs(b) do if a[k]==nil then return false end end
 return true
end
C.equal=equal
local function clock(frame) return {serverTime=frame.serverTime,remaining=frame.remaining,returnIn=frame.returnIn} end
local function content(dto)
 local f=copy(dto.frame);f.serverTime=nil;f.remaining=nil;f.returnIn=nil
 return {metadata=dto.metadata,frame=f,players=dto.players,batteries=dto.batteries}
end
local E={};E.__index=E
local serial=0
function C.new(options)
 options=options or {};serial=serial+1
 return setmetatable({profile=options.profile or 'fine',prefix=(options.epochPrefix or 'local')..':'..serial,reset=0,seq=-1,metadataVer=0,keyframeSeconds=options.keyframeSeconds or 10,stats={commits=0,suppressed=0,full=0,delta=0,heartbeat=0,recovery=0}},E)
end
function E:header(kind)
 return {v=2,type=kind,roomId=self.dto.roomId,roundId=self.dto.roundId,epoch=self.epoch,seq=self.seq,metadataVer=self.metadataVer}
end
function E:full(cause)
 assert(self.dto,'no committed state')
 if cause=='resync' or cause=='reconnect' then self.stats.recovery=self.stats.recovery+1 end
 local m=self:header('state_full');m.cause=cause or 'resync'
 m.metadata=self.dto.metadata;m.frame=self.dto.frame;m.players=self.dto.players;m.batteries=self.dto.batteries
 return m
end
function E:getStats() return copy(self.stats) end
function E:publish(raw,now)
 local dto=C.project(raw,self.profile)
 local old=self.dto
 local reset=not old or old.metadata.profile~=dto.metadata.profile or old.roomId~=dto.roomId or old.roundId~=dto.roundId or (old.frame.phase~='lobby' and dto.frame.phase=='lobby')
 local phaseChange=old and old.frame.phase~=dto.frame.phase
 if not reset and dto.frame.phase~='playing' and equal(content(dto),content(old)) then
  if now-self.lastCommit<1-1e-7 then self.stats.suppressed=self.stats.suppressed+1;return end
  local base=self.seq;self.seq=base+1;self.dto=dto;self.lastCommit=now
  local m=self:header('state_heartbeat');m.baseSeq=base;m.clock=clock(dto.frame)
  self.stats.commits=self.stats.commits+1;self.stats.heartbeat=self.stats.heartbeat+1;return m
 end
 local changedMetadata=not old or not equal(old.metadata,dto.metadata)
 if changedMetadata then self.metadataVer=self.metadataVer+1 end
 local base=self.seq
 if reset then self.reset=self.reset+1;self.epoch=self.prefix..':'..self.reset;self.seq=0 else self.seq=self.seq+1 end
 self.dto=dto;self.lastCommit=now;self.stats.commits=self.stats.commits+1
 if reset or phaseChange or (dto.frame.phase=='playing' and now-(self.lastFull or -math.huge)>=self.keyframeSeconds) then
  self.lastFull=now;self.stats.full=self.stats.full+1
  return self:full(reset and (old and 'phase_reset' or 'bootstrap') or phaseChange and 'phase_change' or 'keyframe')
 end
 local m=self:header('state_delta');m.baseSeq=base;m.frame=dto.frame;m.players=dto.players
 if changedMetadata then m.metadata=dto.metadata end
 local before,after={},{}
 for _,b in ipairs(old.batteries) do before[b.id]=b end
 m.batteryUpserts=json.array();m.batteryRemoves=json.array()
 for _,b in ipairs(dto.batteries) do after[b.id]=true;if not equal(b,before[b.id]) then m.batteryUpserts[#m.batteryUpserts+1]=b end end
 for _,b in ipairs(old.batteries) do if not after[b.id] then m.batteryRemoves[#m.batteryRemoves+1]=b.id end end
 self.stats.delta=self.stats.delta+1;return m
end
return C
