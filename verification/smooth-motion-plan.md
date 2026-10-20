# Smooth motion and frame pacing iteration

Base: deployed adecdeb (local 794449d). Work branch: feat/smooth-motion-fps.

## Scope and boundaries

- Keep Phaser 3.90 and authoritative Skynet collision, cargo, score and room rules.
- Add local kinematic prediction/reconciliation and timestamped remote interpolation.
- Display measured rendering FPS separately from network RTT; add frame-time diagnostics.
- Do not claim lower RTT from local prediction, or a capacity/fun improvement from unit tests.
- Collision presentation is awaiting the user's choice between current large art plus
  a clear contact footprint and smaller art fitting the existing shared collision geometry.
- Retain current resource and stun constants until the baseline below is measured;
  automated supply ratios alone do not establish whether a match is enjoyable.

## Baseline facts

Input/physics/snapshot cadences are 50/50/100 ms. Previous rendering follows latest
positions with local/remote smoothing constants 25/65 ms, without prediction.
Base speed is 240 units/s, dash 3x for 0.32 s. Contact is swept pair distance32,
re-arm separation40. Cargo cap20; hit stun1 s, protection1.6 s. Round100 s.
Natural resources:36 initially, up to6 every10 s, cap42, stop at remaining10 s.
Maximum natural supply under regular scheduling and sufficient consumption is84.

## Repeatable acceptance matrix

Test2/4/8 players under clean network,100 ms RTT ±20 ms jitter,200 ms RTT ±50 ms
jitter, and500 ms interruption. These are test conditions, not production findings.
Cover empty/full cargo, reversal, stationary/moving dash, head-on/glancing impact,
safe-zone entry, dense pickups/drops, three100 s rounds, reconnect, room changes,
spectating, background/foreground and viewport resize.

Measure separately:
- Actual rendered frame intervals: meanFPS, P95/P99 milliseconds and frames>50 ms.
- Touch to first local visual response versus server-confirmed movement/rewards.
- Snapshot cadence/jitter and same-time prediction correction magnitude/frequency.
- Long-frame and correction recovery following interruptions; exclude intentional
  hidden/loading intervals from active-play distributions and report recovery separately.
- Gameplay: time to first pickup/deposit, encounters, cargo lost/recovered, stun-time
  fraction and score distribution. Human ratings of control, fairness and replay desire
  are required; bot scores are not entertainment evidence.

Suggested performance goals (NOT measured guarantees): for60 Hz target devices,
P95 frame time≤20 ms/P99≤33.4 ms; explicit30 FPS fallback P95≤36 ms/P99≤50 ms.
Immediate local control-feedback target P95≤33.4 ms, P99≤50 ms; this is not a
promise for server-confirmed events. Compare against the unchanged base on the
same devices, rendering scale and network conditions before claiming improvement.

## Authority regression requirements

No duplicate pickup/reward feedback; no client-specified position/speed authority;
no gameplay inputs from spectators/directory/leaving clients; no old-round or
old-room state leakage; bounded unacknowledged input history and stale-data behavior;
stun, knockback, bounds and finish freeze remain server-owned.
