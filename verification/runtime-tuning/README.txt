Runtime tuning verification: 2026-10-29
Server checks cover defaults, 0.5/1.5 vehicle scale, eight nonoverlapping spawn positions, scaled wall projection and circle collision, duration/cooldown, 5x dash speed, invalid and out-of-range fallback.
157 frontend tests pass, including configured skill charge and dash integration speed.
The screenshot is an actual H5 browser against an isolated local Skynet service with scale1.5, cooldown8s, duration1s and a configured5x multiplier. Snapshot verified collision radius90 and pickup84. It is not a WeChat phone screenshot.
Both clients now show remaining active dash time during release, followed by the separate recharge countdown.

Hold and density update:
161 client/mini checks plus the full Lua suite passed. A real H5 browser pointer press against isolated Skynet (1s capacity for measurable partial hold) consumed only part of the energy; release stopped boost, energy recharged, and a second hold reused partial charge.
Native bundle bridge test used wx window info DPR3: canvas2436x1125, CSS/input812x375. Logical-coordinate connection button worked after scaling; no runtime errors. Native text textures also use the device density.
The new PNGs are browser/bridge evidence, not iPhone true-device screenshots. iPhone13mini clarity/FPS still needs user confirmation. QA browser sessions and container were closed.
