-- Bounded, connection-owned FIFO. Only the game core can create a guest.
local A={};A.__index=A
function A.new(game,limit) return setmetatable({game=game,limit=limit or 32,entries={}},A) end
function A:has(fd) for _,entry in ipairs(self.entries) do if entry.fd==fd then return true end end return false end
function A:remove(fd) for i=#self.entries,1,-1 do if self.entries[i].fd==fd then table.remove(self.entries,i) end end end
function A:status(reason)
 local g=self.game;local available
 if reason=='queued' then available=1
 elseif reason=='playing' then available=g.remaining+10
 elseif reason=='finished' then available=math.max(0,10-(g.time-(g.finishedAt or g.time))) end
 return {type='waiting',reason=reason,phase=g.phase,remaining=g.remaining,availableIn=available}
end
function A:request(fd,message)
 if self:has(fd) then return nil,{type='error',message='Already waiting'} end
 local p,err,reason=self.game:join(fd,message.name,message.color,message.token,#self.entries>0)
 if p then return p end
 if not reason then return nil,{type='error',message=err} end
 if #self.entries>=self.limit then return nil,{type='error',message='Waiting room full; try again later'} end
 self.entries[#self.entries+1]={fd=fd,name=message.name,color=message.color,token=message.token}
 return nil,self:status(reason)
end
function A:process()
 local keep,events={},{}
 for _,entry in ipairs(self.entries) do
  local p,err,reason=self.game:join(entry.fd,entry.name,entry.color,entry.token)
  if p then events[#events+1]={fd=entry.fd,player=p}
  elseif reason then keep[#keep+1]=entry;events[#events+1]={fd=entry.fd,message=self:status(reason)}
  else events[#events+1]={fd=entry.fd,message={type='error',message=err}} end
 end
 self.entries=keep
 return events
end
return A
