# Eight-color lobby and dash visual check

2026-10-28. H5 screenshots use the production build with a deterministic
WebSocket fixture, not a live Skynet match. Eight unique colors, alternating
ready/waiting players, and seven disabled occupied swatches were checked at
844×390 and 1200×800. Browser runtime errors: none. The dash orb CSS color was
asserted to match the authoritative local player's color.

The landscape header keeps the palette in two rows beside the room code;
the eight player cards and start/return controls are visible without scrolling.
Extra help text can still scroll in short viewports.

Server regression tests separately cover eight same-color join requests,
unique allocation, reconnect identity, occupied/invalid change rejection,
free color selection, and release after leaving. Native panel tests check that
occupied swatches have no hit target and free swatches send `set_color`.

Screenshots here are browser evidence, not native WeChat or phone evidence.

A live local Skynet check also passed after rebuilding the local runtime: eight
independent WebSocket clients requested the same preferred color and received
eight unique colors. An occupied color change was rejected; after its owner
left, the color was selectable by another player. All QA sockets were closed.
