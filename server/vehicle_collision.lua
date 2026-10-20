-- Continuous SAT for the visible rover body (local +X is the front).
-- Heading is chosen before each tick's movement; translation follows that tick's
-- frozen segment. Cargo racks, flames and magnet guides are not body geometry.
local body=require('game_config').vehicleBody
local C={}
function C.sweep(a,finishA,angleA,b,finishB,angleB,padding)
 padding=padding or 0
 local ca,sa=math.cos(angleA),math.sin(angleA)
 local cb,sb=math.cos(angleB),math.sin(angleB)
 local axes={{ca,sa},{-sa,ca},{cb,sb},{-sb,cb}}
 local rx,ry=b.x-a.x,b.y-a.y
 local dx,dy=(finishB.x-b.x)-(finishA.x-a.x),(finishB.y-b.y)-(finishA.y-a.y)
 local enter,leave=0,1
 for _,axis in ipairs(axes) do
  local x,y=axis[1],axis[2]
  local extent=(body.halfLength+padding)*(math.abs(x*ca+y*sa)+math.abs(x*cb+y*sb))
              +(body.halfWidth+padding)*(math.abs(-x*sa+y*ca)+math.abs(-x*sb+y*cb))
  local position,velocity=rx*x+ry*y,dx*x+dy*y
  if math.abs(velocity)<1e-12 then
   if math.abs(position)>extent+1e-9 then return end
  else
   local first,last=(-extent-position)/velocity,(extent-position)/velocity
   if first>last then first,last=last,first end
   enter=math.max(enter,first);leave=math.min(leave,last)
   if enter>leave+1e-9 then return end
  end
 end
 if leave < -1e-9 or enter>1+1e-9 then return end
 return math.max(0,math.min(1,enter)),math.max(0,math.min(1,leave))
end
return C
