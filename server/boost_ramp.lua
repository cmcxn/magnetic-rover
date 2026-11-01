local B={}
function B.average(age,dt,ramp,maximum)
 if ramp<=0 or age>=ramp then return maximum end
 local first=math.min(maximum,1.1)
 local function integral(t)
  t=math.max(0,t)
  if t<ramp then return first*t+(maximum-first)*t*t/(2*ramp) end
  return (first+maximum)*ramp/2+maximum*(t-ramp)
 end
 if dt<=0 then return first+(maximum-first)*math.min(1,math.max(0,age)/ramp) end
 return (integral(age+dt)-integral(age))/dt
end
function B.recover(mult,dt,seconds,maximum)
 if seconds<=0 then return 1,1 end
 if dt<=0 then return mult,mult end
 local extra=math.max(0,mult-1);local rate=math.max(1e-9,maximum-1)/seconds
 local t=math.min(dt,extra/rate)
 return 1+(extra*t-rate*t*t/2)/dt,1+math.max(0,extra-rate*dt)
end
return B
