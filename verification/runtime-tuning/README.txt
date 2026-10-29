Runtime tuning verification: 2026-10-29
Server checks cover defaults, 0.5/1.5 vehicle scale, eight nonoverlapping spawn positions, scaled wall projection and circle collision, duration/cooldown, 5x dash speed, invalid and out-of-range fallback.
157 frontend tests pass, including configured skill charge and dash integration speed.
The screenshot is an actual H5 browser against an isolated local Skynet service with scale1.5, cooldown8s, duration1s and a configured5x multiplier. Snapshot verified collision radius90 and pickup84. It is not a WeChat phone screenshot.
Both clients now show remaining active dash time during release, followed by the separate recharge countdown.
