-- Cloud image entry: keep the normal room layout, HTTP and WebSocket service.
local skynet = require 'skynet'
local Game = require 'game'
local resolve = require 'adapter'
local start = Game.start

function Game:start()
 local ok, err = start(self)
 if ok then
  for _, player in ipairs(self.players) do
   player.lastPhysicsX, player.lastPhysicsY = nil, nil
   player.bodyAngle, player.omega, player.underSteering = nil, nil, nil
  end
 end
 return ok, err
end

require('vehicle_collision').resolve = function(players, dt, onContacts, stations)
 return resolve(players, dt, onContacts, stations, 3)
end
skynet.error('Magnetic Rover physics: Box2D 3.1.1, 3 substeps per game tick')
dofile(assert(os.getenv('ROVER_SERVER')) .. 'main.lua')
