# Phone wheel feedback correction

Build: W2-20261030T010559 (UTC build stamp).

Confirmed gaps: instantaneous heading changes produced only 0.09408 rad of steering before immediate decay; tread highlights shrank below a logical pixel; dust originated underneath rear tire centers; approved wheel-local boost streaks were absent.

Changes: hold steering briefly then recenter, wider translating tread bands, dust from rear tire edges with stronger contrast, four-wheel cyan/white streak overlay above tires and below chassis. H5 and mini game share World. Skynet unchanged.

Verification: 187 client/mini tests passed, both TypeScript checks and builds passed; mini package main 1305 KiB, total 3983 KiB. H5 real local Skynet match passed with screenshots and video. Packaged mini bundle passed keyboard and two-finger touch bridge tests against real local Skynet; WAV decode/playback passed through HTMLAudio adapter. Touch screenshots are touch-driving.png, touch-turning.png, touch-boosting.png.

Limit: browser bridge uses browser Canvas and emulated wx APIs, not a physical iPhone. Phone rendering and native audio still require user verification. Mini lobby shows build stamp; console records asset load failures and a bounded set of vehicle diagnostics.

Tread refinement: replace baked static tread with opaque rubber shading within the original alpha silhouette; animate one pattern across 16 phases. Cap phase advance to three steps per rendered frame to reduce temporal reversal at low FPS. Updated touch screenshots verified with the packaged mini bundle.
