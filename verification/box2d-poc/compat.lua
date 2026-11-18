-- Observe the first unchanged assertion failure in each legacy fixture.
return function(mode)
 if mode~=0 then
  local adapter=require 'adapter'
  require('vehicle_collision').resolve=function(cars,dt,cb,stations)
   return adapter(cars,dt,cb,stations,mode)
  end
 end
 local tests={'test_game','test_pickup_seq','test_drop_pickup','test_boost_hit','test_collisions',
  'test_collision_redesign','test_fast_movement','test_station_collision','test_lifecycle','test_motion_protocol'}
 local failures=0
 for _,name in ipairs(tests) do
  math.randomseed(1701)
  local ok,err=pcall(dofile,os.getenv('ROVER_SERVER')..name..'.lua')
  print('COMPAT',name,ok and 'pass' or tostring(err))
  if not ok then failures=failures+1 end
 end
 print('COMPAT_SUMMARY',mode,#tests-failures,failures)
 if mode==0 then assert(failures==0) end
end
