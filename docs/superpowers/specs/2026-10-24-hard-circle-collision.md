# Approved hard-circle collision design

Approved by the user on 2026-10-24; implement and validate on a new branch from the user's latest branch, with real gameplay screenshots. No merge, push or production deployment.

- Each vehicle's visible boundary is its solid collision circle. All body and cargo artwork fits inside it. Pickup range is separate and must not be confused with the solid boundary.
- Cars never pass through one another, including while stunned or protected. Server-authoritative swept movement and iterative separation handle walls and multiple cars.
- Ordinary moving contact stuns both cars, knocks them apart, and never drops cargo. Front-facing closing movement transfers more impulse to the other car with attacker recoil.
- A forward, closing boosted impact stuns and knocks back the target, dropping carried batteries; the attacker recoils/slows without stun. Two frontal boosted cars both stun/drop. A glancing/rear/side boost contact is ordinary.
- Only one gameplay hit per contact until separation. Protection prevents repeated gameplay loss but never disables solidity.
- Dropped battery value is conserved; outward impact-directed velocity plus bounded random scatter, hop and settling, wall/car exclusion and a short pickup delay. Previously banked score never drops.
- Keep the existing architecture and dependencies: Phaser renders; Lua/Skynet owns rules. No new physics engine.

## Documented tuning defaults

Circle radius 60 (contains the current 98×68 body); pickup radius remains 56 and is not the collision guide. Front cone dot >= 0.65; minimum boost closing speed 40; boost cargo loss 25%, maximum 5. Any moving ordinary contact stuns regardless of speed. Normal stun 0.65 s, boosted target stun 1 s; protection 1.6 s. Contacts release only beyond 4 units of gap. Arena edge is at radius 500; vehicle centers remain inside 440.

## Confirmed safe-zone policy

User additionally confirmed: keep no-drop station safety; ordinary collisions there still stun/recoil both and all vehicles remain solid.

Settled drops collect at solid contact70 (car60 + battery10), because preserving natural magnet56 while excluding drops from bodies otherwise makes dropped cargo unreachable. Natural pickups remain56.

Safe-zone clarification: only cargo loss is exempt. Effective frontal boosted attacks still leave the attacker unstunned and stun the target; safe zones do not downgrade boosts to ordinary contacts.
