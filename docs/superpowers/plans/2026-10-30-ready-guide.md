# Ready deadline and first-entry guide

Goal: server-authoritative lobby timeout, backward-compatible departure, five-second illustrated entry guide, wheel animation +50%.
Architecture: rooms.lua owns per-human lobby deadlines; additive readyIn snapshot field plus existing error/welcome messages support old clients. Shared guide controller owns presentation timing and local seen preference; H5 DOM and mini Canvas render identical content. Existing countdown sound is reused.

- [x] Test and implement multiplayer 60-second readiness deadlines, final ten warnings, solo/AI exemption, reconnect and old protocol departure.
- [x] Test guide first entry five-second automatic close, repeat early dismissal, room exit cleanup; wire both clients with readable illustrations and timeout warning above overlay.
- [x] Increase tread phase rate 50%, preserving low-FPS limit; run regression tests.
- [x] Build both clients, exercise local real server with old protocol and new clients, capture key UI states. No public push/deployment without user request.

Approved: first entry has no manual close for five seconds, then auto-closes. Later entries auto-close after five seconds but allow early dismissal. Seen state is recorded after completed first exposure. Solo unlimited, AI not counted. All ready players start via existing mechanism; guide does not auto-ready. Sound respects mute/background; old clients receive text warnings only.
