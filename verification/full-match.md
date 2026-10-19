# Real Skynet full-match protocol acceptance

Independent Python websockets clients against real Skynet; no browser automation; no time/rule changes

Status: passed

- PASS: initial lobby: None
- PASS: two unique identities: None
- PASS: short reconnect retains identity and score: {'id': '1', 'score_before': 9, 'score_after': 9}
- PASS: station dwell does not duplicate score: {'score': 9, 'dwell_seconds': 2.2}
- PASS: full real-time 180 second round: 179.931
- PASS: both clients agree results: [{'color': '#38bdf8', 'id': '1', 'name': '协议甲', 'score': 223}, {'color': '#38bdf8', 'id': '2', 'name': '协议乙', 'score': 205}]
- PASS: timer reaches zero: None
- PASS: both collect and deliver: [{'id': '1', 'score': 223, 'deliveries_observed': 28}, {'id': '2', 'score': 205, 'deliveries_observed': 29}]
- PASS: reconnect and duplicate score exercised: None
- PASS: finished state frozen: None
- PASS: again resets lobby and score: None
- PASS: eight independent clients remain synchronized: {'duration_seconds': 60.0, 'scores': [8, 10, 67, 53, 45, 44, 52, 60]}
- PASS: no protocol errors: [[], [], [], [], [], [], [], []]

## Events

- {'elapsed_s': 0.308, 'event': 'match_started', 'players': ['1', '2'], 'remaining': 179.89999999999998}
- {'elapsed_s': 4.328, 'event': 'reconnected', 'id': '1', 'score': 9}
- {'elapsed_s': 6.528, 'event': 'duplicate_score_check', 'score': 9}
- {'elapsed_s': 30.376, 'event': 'progress', 'remaining': 149.79999999999313, 'scores': [41, 34]}
- {'elapsed_s': 60.455, 'event': 'progress', 'remaining': 119.79999999998866, 'scores': [73, 76]}
- {'elapsed_s': 90.47, 'event': 'progress', 'remaining': 89.79999999999036, 'scores': [110, 115]}
- {'elapsed_s': 120.478, 'event': 'progress', 'remaining': 59.79999999999207, 'scores': [149, 135]}
- {'elapsed_s': 150.548, 'event': 'progress', 'remaining': 29.69999999999361, 'scores': [189, 173]}
- {'elapsed_s': 180.239, 'event': 'match_finished', 'wall_seconds': 179.931, 'results': [{'color': '#38bdf8', 'id': '1', 'name': '协议甲', 'score': 223}, {'color': '#38bdf8', 'id': '2', 'name': '协议乙', 'score': 205}]}
- {'elapsed_s': 181.301, 'event': 'returned_to_lobby'}
- {'elapsed_s': 181.851, 'event': 'eight_player_trial_started'}
- {'elapsed_s': 241.856, 'event': 'eight_player_trial_ended', 'remaining': 121.79999999998854}

## Scope and limitations

- Real unmodified Skynet server with independent Python WebSocket clients; not browser sessions.
- Two-player round completed, eight-player round intentionally stopped after 60 seconds.
- Eight-player check verifies connected roster and playing phase, not byte-identical simultaneous snapshots.
- This is a local protocol smoke test, not an Internet, mobile-device, or production load guarantee.
- Per-frame arrival timestamps were not collected; p95 and maximum snapshot interval are unavailable.
- First two snapshot counts cover both rounds; six new client counts include a short initial lobby.
- The two original bot controllers retained previous scoring bookkeeping during the second round, so they delivered once and then stayed at the station; six new controllers continued collecting.

## Eight-player observations

- 60.00 seconds wall time; ending remaining 121.8 seconds, approximately 58.2 seconds simulation progression (about 3% slower than wall time).
- New six clients received 584–587 snapshots each, approximately 9.7 Hz including their brief lobby time. No p95/max interval measurement.
- Snapshot totals: {'1': 2397, '2': 2399, '3': 586, '4': 587, '5': 585, '6': 584, '7': 585, '8': 584}
- Server log contains startup messages only, no observed errors. Server stopped after test.
