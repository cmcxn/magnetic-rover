-- Application-level RTT probe. Never echo arbitrary client fields.
local L={}
function L.reply(peer,message,now)
 local id=message.id
 if type(id)~='number' or id~=id or id<1 or id>2147483647 or id%1~=0 then return nil,'Invalid ping' end
 if not peer.pingWindow or now-peer.pingWindow>=1 then peer.pingWindow=now;peer.pingCount=0 end
 if peer.pingCount>=2 then return nil end
 peer.pingCount=peer.pingCount+1
 return {type='pong',id=id}
end
return L
