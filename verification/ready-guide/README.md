# Readiness and onboarding verification

Implemented: +50% tread phase rate (low-FPS phase cap retained); server lobby deadlines; first-entry five-second illustration guide with automatic close and device-local seen preference; subsequent entries allow early dismissal; countdown text and short per-second sound on new clients.

Server: all Lua test files passed under historical fixture environment (map/supply 1, speed240), including test_ready_timeout.lua. Solo and human+AI unlimited; second human starts60; warning10..1; duplicate same-second warning suppressed; pending deadlines survive reconnect; ready player remains; simultaneous unready expirations release both seats; existing welcome roomId=null returns old clients to directory.

Clients: 192 tests passed; both TypeScript checks and builds passed. Guide art uses approved generated design's four illustrations, displayed via source rectangles; captions/timers/buttons are live UI text. JPEG is technically resized/compressed for package budget. Mini package main1311KiB, art2775KiB, total4085KiB.

Runtime: actual local Skynet at18080. H5 first guide lock/auto close/storage/reopen-close tested. Real60s warning/eviction tested, exactly10 AudioContext starts in final10sec. Previous mini source at HEAD5c17009 rebuilt in isolated /tmp directory with no modifications, connected via wx browser bridge to new server: legacy warning and directory transition passed after actual60s. New packaged mini guide loads and auto-closes in five seconds; bridge is not a physical WeChat/iPhone runtime.

Screenshots: mini-first-guide.png; h5-guide-812.png, h5-guide-667.png, h5-guide-390.png; legacy-mini-warning.png, legacy-mini-timeout.png. Runtime browser test sessions were closed. Production was not pushed/deployed. New timeout policy requires server deployment; tutorial/audio require new client package.

Final responsive checks passed at812x375,667x320,390x844: close button stays in viewport, underlying room is inert while the modal is visible, automatic dismissal restores controls. Final mini build G1-20261030T045516. Read-only independent review reported no important findings. Temporary legacy bridge server was stopped.
