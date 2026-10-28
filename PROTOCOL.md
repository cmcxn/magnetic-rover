# Current multi-room protocol (2026-10-19)

This section supersedes the historical single-room notes below. Guest sessions,
rooms and scores are memory-only; a process restart clears them.

## Directory and membership

- `join {name,color,token?}` authenticates a guest. A new guest receives
  `welcome {id:"",token,roomId:null,role:"directory"}` followed by `rooms`.
- `rooms` requests the room directory. Entries have `roomId`, `roomCode`,
  `phase`, `remaining`, `playerCount`, `readyCount`, `spectatorCount`,
  `maxPlayers:8`, `maxSpectators:16`, `canJoin`, and `canSpectate`.
- `create_room`, `join_room {roomId}` and `spectate {roomId}` enter a room.
  A welcome identifies the new room and role (`player` or `spectator`), then
  its state follows. Spectators have no player ID and do not occupy player seats.
- `leave_room` returns a directory welcome. Tokens remain stable between rooms.
  Reconnecting with a token resumes its membership; a live token cannot be taken over.
- `ready {ready:boolean}` marks a participant ready or cancels readiness.
  `start` is a compatibility alias for ready=true. At least two participants,
  all connected and ready, are required; the server then starts automatically.
- The 100-second match is authoritative. Finished results last 10 seconds,
  then the room returns to its lobby and readiness resets. Spectators cannot
  send gameplay, ready, start, or again commands successfully.
- Room states include roomId/roomCode, playerCount/readyCount/spectatorCount,
  maxPlayers/canStart, and each player's ready flag. Clients must reset transient
  effects on room or role change, not merely on phase change.
- Directory updates are approximately 1 Hz; room state updates 10 Hz. Ping/Pong
  remains available for authenticated directory, player and spectator sessions.
- Implementation safety limits: 32 rooms and 16 spectators per room; these
  are resource caps, not measured capacity guarantees.

## Match resources and movement

- Duration 100 seconds. Base movement 240 units/s, reduced up to 20% at full load.
  Dash is 3x cargo-adjusted speed for 0.32 seconds, cooldown 4 seconds.
- Initial natural batteries: 36. Replenishment every 10 seconds, at most six
  per batch, natural ground cap 42, no replenishment during the final 10 seconds.
- Natural supply uses four stages at elapsed 0/25/50/75 seconds, with spawn
  annuli 260–470, 160–340, 70–230 and 0–140. On a stage change only natural
  batteries beyond the new outer radius relocate into the current annulus;
  IDs, counts and unlock times are conserved. Collision drops never relocate.
- State `supply` advertises `stage`, `outerRadius`, optional `nextOuterRadius`
  and `secondsToShrink`, plus `banking` during the final ten seconds. Main map
  and minimap show the active boundary, preview the next boundary for five
  seconds, and the timer caption shows stage/countdown. No damage or station
  movement is attached to the supply boundary.
- Collision drops do not consume the natural spawn cap and are not deleted to
  enforce it. Station zones remain excluded from natural spawns.
- Natural battery magnet pickup remains 56 world units (`pickupRadius`). It is
  not the solid car guide. Settled dropped batteries are collected on solid
  contact at 70 units (60-unit car + 10-unit battery); this prevents an
  unreachable pickup while keeping dropped batteries out of car bodies.
- Every car has a server-owned radius-60 solid circle (`collisionRadius`),
  independent of heading. The 98×68 artwork and twenty-cell cargo rack fit
  inside it. Flames are decorative. All devices render the same boundary.
- Continuous circle time-of-impact resolution, simultaneous incoming-velocity
  classification and iterative projection keep cars mutually exclusive,
  including during protection, stun, disconnection grace and at the arena wall.
  The arena radius is 500 and car centers remain inside radius 440.
- Any ordinary moving contact stuns both unprotected participants for 0.65 s,
  recoils/pushes them apart, and never drops cargo. Equal-velocity following and
  separating contacts do not create a gameplay hit. Front-facing motion gives
  more impulse to the target with smaller attacker recoil.
- An effective boosted attack requires forward dot >= 0.65, >=30 units/s of
  attacking movement toward the target, and >=40 units/s relative closing.
  Target loses `min(5,ceil(cargo*.25))`, stuns for 1 s and receives directional
  impulse; attacker cancels dash, recoils, and does not stun. Two simultaneous
  frontal boosts stun/drop both. Side/rear/grazing boosts use ordinary rules.
- Recycle-station contact protects both participants from cargo loss, not from
  physical blocking or ordinary stun/recoil. Protection lasts 1.6 s, blocks
  repeated cargo loss/stun, and never disables physical collision. A consumed
  pair rearms only after a genuine gap greater than four units; protected
  recontact consumes the episode too. Each victim takes the largest simultaneous
  drop, never their sum. Banked score is not dropped.
- Knockback uses server velocity `kx`/`ky`, decaying at 5/s, rather than a fixed
  teleport. `impactSeq` advances on new physical contact, including an unstunned
  attacker; `hitSeq` advances when a new stun is applied. Client prediction is
  canceled on either impact acknowledgement; displayed circles are swept and
  projected to avoid visual penetration but cannot assign outcomes.
- Each dropped battery remains one actual unit: server `x,y,vx,vy,z`, source
  `drop`, and `unlock` describe bounded directional random scatter, hop/settle
  and a 0.65 s global pickup lock. Drops avoid car bodies, stations and the wall;
  expired protection or a failed placement cannot silently destroy value.
  Pickup waits for landing. Natural refill never deletes collision drops.
- Cargo cap is20. Full cargo, station zones, airborne/locked drops prevent
  collection. A contested battery is awarded once in server player order.

Historical implementation notes below are retained for background only.

# Magnetic Rover v0 prototype protocol
Local demonstration, guest-only. Browser WebSocket /ws, backend port 18080.
Client sends JSON: {type:"join",name:string,color:hex,token?:string}; {type:"input",x:number,y:number,boost:boolean}; {type:"start"}; {type:"again"}.
Server sends {type:"welcome",id:string,token:string}; {type:"error",message:string}; state snapshots {type:"state",phase:"lobby"|"playing"|"finished",remaining:number,players:[{id,name,color,x,y,angle,cargo,score,cooldown,connected}],batteries:[{id,x,y}],stations:[{x,y,r}],radius:500,results?:[{id,name,color,score}]}.
World center (0,0), radius500. Stations at (-330,-220),(330,-220),(0,380), deposit radius65. Server-authoritative motion, pickups, deposits, boosts and score. Input vector normalized, not positions; input20Hz, snapshot10Hz, simulation20Hz. Speed120units/s scaled to80% with20cargo. Boost duration0.35s multiplier2 cooldown4s; normalcars pass through. Boost hit drops ceil25% max5cargo with1s victimprotection. Dropped batteries locked0.5s for all. Car pickup radius20, maxcargo20. Each banked battery1point. Match180seconds min2 max8. Stationzones exclude pickups/spawns. Resource check5s replenishes regional targets, stops last10s. Results rankedscore sharedties. Start action valid from lobby only, again finished only. Nickname1-16 chars sanitized; color from six-color allowlist. Guesttoken serverissued, retained browser localstorage, not password; identity not derived from name. Reconnect stopstaleinput immediately after0.3s, remove after10s with cargo dropped, retain bankedscore for match. Reconnect token must not evict live connection without controlled takeover policy. First implementation may simplify reconnect but explicitly test/document boundaries.

## 2026-10-19 mobile/reconnect update (supersedes conflicting prototype rules above)

- Joined guests and queued guests may send `{type:"ping",id:integer}` with ID 1–2147483647. The server replies only `{type:"pong",id}`. Invalid IDs are rejected; at most two valid replies per connection per second, within the existing 60-message/s cap. The client probes every two seconds with one probe in flight and measures application-level RTT with its own monotonic clock; hidden, disconnected or >5-second-old values are invalidated.
- Ordinary moving impact drops `min(2,ceil(cargo*0.10))`; boosted moving impact drops `min(5,ceil(cargo*0.25))`. Both use a 32-unit contact radius, pre-step direction and actual authoritative movement. Pair closing speed must be at least 40 units/s, and an attacker must contribute at least 30 units/s toward the target. Stationary, separating and equal-speed following cars cannot attack. A pair must separate beyond 40 units before another impact. Contact during one-second victim protection still consumes that contact, preventing deferred contact farming. Each victim takes only the strongest simultaneous hit, independent of join order. Cars remain non-solid; these are cargo impacts, not a rigid-body physics rewrite.
- Station zones protect both participants; dropped batteries remain locked for 0.5 seconds. Stationary boost input (magnitude below 0.1) no longer consumes the four-second cooldown. A boost still multiplies current movement input; releasing direction stops travel.
- A finished match displays results for ten seconds then automatically returns connected guests to the lobby. Manual `again` may return earlier. State snapshots in the finished phase include `returnIn` seconds. An entirely abandoned finished room can reset after the existing ten-second disconnection grace; disconnected playing guest tokens remain valid until the match is reset.
- A new valid join during playing, results or a full lobby enters a connection-owned FIFO (maximum 32 waiters). The server sends `{type:"waiting",reason:"playing"|"finished"|"full"|"queued",phase,remaining,availableIn?}` immediately and about once per second. Playing estimates include the ten-second results window; full lobbies omit `availableIn` because no slot is guaranteed. An available lobby slot still queues behind earlier waiters (`queued`, estimate one second). Automatic admission is checked once per second, retains the provided nickname/color/token, and sends exactly one normal welcome plus state on success. Existing valid tokens reconnect before admission rules; live tokens cannot be taken over. Connected old players retain their slots; disconnected players are pruned on rematch, or after ten seconds in the lobby. Waiters cannot start/input/again until joined. Closing/cancelling the waiting WebSocket removes its request; reconnecting creates a fresh request at the end of the queue.
- The client retries unexpected disconnects with bounded exponential delay (1–10 seconds), restores on foreground return, isolates callbacks by WebSocket instance, and allows cancellation. Tokens remain scoped to browser origin plus canonical WS endpoint. This does not transfer a guest identity between localhost/LAN/public URLs or browser profiles.

## Cargo, dash and impact feedback update

Cargo remains capped at 20. Full cars leave uncollected batteries on the ground.
Snapshots still include everyone's cargo for rack rendering; only the local driver's
UI prints exact cargo/20 text. This is a display rule, not network secrecy.

Dash uses server-owned heading when idle (spawn/rematch heading +X), otherwise the
current nontrivial input direction. Direction locks for 0.32 s, speed is 3x the
cargo-adjusted base speed, and cooldown remains 4 s. The final partial physics tick
integrates only the remaining dash duration. Stale input (>0.3 s), disconnect and
stun cancel the dash. Extra input angle/speed values have no authority.

Swept relative motion detects glancing contacts between physics ticks. Existing
closing-speed, safe-zone, contact hysteresis and drop percentages remain; an empty
victim can now also be hit. Each victim receives at most one hit per tick, the
largest applicable drop (not summed), 24 units of combined-direction knockback,
1 s stun and 1.6 s protection including a 0.6 s recovery window. Opposite equal
impacts cancel displacement. Knockback is clamped to the arena and stops before a
station; it does not participate in attack motion or cause chain impacts. Stunned
inputs are discarded; fresh input is required after recovery.

Player snapshots add numeric `boost` and `stun` remaining seconds, and `hitSeq`
(monotonic within a match, reset on rematch). Client feedback reacts to server
confirmation. Reduced effects disables shake/haptics and keeps readable dash/hit
indicators; native vibration is optional and failure-safe.

## Authoritative pickup feedback

Player snapshots add integer `pickupSeq`, initialized to 0 for a new guest. The
server increments it once for each battery actually collected by that player,
including multiple batteries collected in one simulation tick. Full cargo (20),
locked or out-of-range batteries, deposits, dropped cargo, and another player's
pickups do not increment it. It can exceed 20 as cargo is delivered and collected
again. Same-match reconnects preserve the sequence, including reconnects after
cargo removal; returning to the lobby for a new match resets it to 0.

Clients use only the local player's positive `pickupSeq` delta for pickup rewards,
never a cargo delta. Establish a silent baseline on the first snapshot of each
connection and after a sequence reset or phase transition; reconnect snapshots
must not replay previous pickups. A non-increasing sequence produces no reward.

## Smooth-motion prediction and timestamped snapshots

The simulation remains server-authoritative at 20 Hz, snapshots at 10 Hz, with
100-second rounds and eight players per room. No collision, pickup, station,
cargo, score, or camera geometry changed in this iteration.

- Inputs may include `seq`, an increasing integer from 1 through
  9007199254740991. Invalid values are rejected; duplicate or older sequences
  are ignored. Inputs without a sequence remain compatible with older clients.
- State includes `serverTime` (cumulative room simulation/wall-aging seconds)
  and `roundId` (increments whenever the next match starts).
- Player state includes `inputSeq`, the latest sequence consumed by a positive
  physics step, and `inputElapsed`, the actual physics seconds simulated under
  that held sequence. Neither receipt nor skipped-time aging acknowledges a
  command. Multiple packets may coalesce into one held input before a tick;
  unacknowledged packet count is never interpreted as extra simulation time.
  Stunned input is acknowledged as a no-op only on the next positive tick.
- `ix`/`iy` report current authoritative held control (including zero after
  timeout/stun); `bx`/`by`, when present, report locked dash heading. Reconnection
  resets sequence tracking. Round/room/role changes reset client motion history.
- The client predicts local kinematics from authority plus its bounded input
  timeline, with 64 retained commands maximum and a 250 ms replay horizon.
  Alignment uses the acknowledged command's local send time plus its actual
  simulated duration; it is an estimate, not synchronized clocks or an RTT
  measurement. Replay uses cargo-adjusted speed, cooldown, dash heading and
  partial dash duration, and the arena clamp. It never predicts pickups,
  deposits, collision outcomes, rewards, or scores.
- Small local corrections decay over 80 ms. A new hit/stun snaps to authority
  and discards old pending motion; large corrections also discard pending
  history. Prediction freezes at its bounded horizon during missing packets;
  after 500 ms without a snapshot it returns to last authority rather than
  extrapolating indefinitely. A prolonged outage can therefore visibly correct
  the rover. Blur/visibility and connection resets wait for a fresh snapshot.
- Remote rovers interpolate timestamped snapshots approximately 100 ms behind
  the estimated server timeline. Late delivery does not add its full jitter to
  that timeline; absent newer data freezes at the latest pose. Earlier room
  timestamps and prior-round snapshots are rejected before effects and HUD
  updates. Equal-time snapshots remain allowed because readiness, membership,
  and phase changes can occur between simulation ticks on ordered WebSockets.
- Input sampling/sending is still every 50 ms. Predicted movement can respond
  before the next authoritative snapshot, but this is not zero input latency
  and does not reduce real network RTT. Dash sound/flame/haptics, hit feedback,
  and pickup rewards remain server-confirmed, avoiding duplicate feedback when
  prediction is acknowledged. Older servers without motion metadata retain
  the previous authoritative-position smoothing fallback.

`state.baseSpeed`: 服务端启动配置的普通行驶速度（世界单位/秒，默认 240，支持 1–480）。客户端预测与重放使用此值；旧服务端缺失时回退 240。冲刺与负载倍率不变。

### Lobby vehicle colors

The palette supports eight colors: `#38bdf8`, `#fb7185`, `#a78bfa`,
`#facc15`, `#34d399`, `#fb923c`, `#e879f9`, `#cbd5e1`.
Colors are unique within each room. On room entry, an occupied preferred color
is replaced with the first free color. A disconnected player's color remains
reserved while their seat exists; leaving/removing the seat releases it.

A room player may send `{"type":"set_color","color":"#e879f9"}` in the lobby.
The server rejects invalid or occupied colors, spectators, and changes after
start. The authoritative `players[].color` in the next snapshot drives both
clients' vehicle colors and dash orb. This requires updating Skynet and clients
together; older servers do not implement `set_color`.

### Locally remembered driver profile

`welcome` includes session `name` and preferred `color`. Automatic room color
allocation does not replace this preference. Successful `set_color` replies
with `{"type":"profile","name":"Driver","color":"#e879f9"}`.
A connected guest may send `{"type":"set_name","name":"New driver"}` in
the directory or lobby; the server validates/truncates the nickname, updates
the session and room player, and returns the same `profile` acknowledgment.
Renaming during a match is rejected. Resuming a directory/lobby session accepts
the locally saved name and preferred color from the `join` message.

Both clients persist confirmed names and preferred colors as `rover.name` and
`rover.color`: H5 uses browser localStorage; WeChat uses device wx storage and
continues reading the legacy `rover.spike.name` key. These are independent local
profiles; there is no account-based cross-device or H5/WeChat synchronization.
