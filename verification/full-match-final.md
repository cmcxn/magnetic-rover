# Real Skynet full-match protocol acceptance

Independent Python websockets clients against real Skynet; no browser automation; no time/rule changes

Status: passed

- PASS: initial lobby: None
- PASS: two unique identities: None
- PASS: short reconnect retains identity and score: {'id': '1', 'score_before': 9, 'score_after': 9}
- PASS: station dwell does not duplicate score: {'score': 9, 'dwell_seconds': 2.2}
- PASS: full real-time 180 second round: 179.998
- PASS: both clients agree results: [{'color': '#38bdf8', 'id': '2', 'name': '协议乙', 'score': 231}, {'color': '#38bdf8', 'id': '1', 'name': '协议甲', 'score': 205}]
- PASS: timer reaches zero: None
- PASS: both collect and deliver: [{'id': '1', 'score': 205, 'deliveries_observed': 24}, {'id': '2', 'score': 231, 'deliveries_observed': 28}]
- PASS: reconnect and duplicate score exercised: None
- PASS: finished state frozen: None
- PASS: again resets lobby and score: None
- PASS: eight independent clients remain synchronized: {'duration_seconds': 60.04, 'scores': [52, 60, 65, 59, 68, 57, 72, 62]}
- PASS: eight player clock tracks wall time: {'snapshot_wall_seconds': 59.9588, 'game_clock_advance_seconds': 60.0, 'absolute_error_seconds': 0.0412, 'allowed_error_seconds': 0.5}
- PASS: all eight bots remain active and deliver repeatedly: [{'id': '1', 'score': 52, 'deliveries_observed': 6, 'distance_per_10s_bucket': {'0': 1025.3, '1': 1002.4, '2': 1024.7, '3': 1124.6, '4': 899.3, '5': 1012.0}}, {'id': '2', 'score': 60, 'deliveries_observed': 7, 'distance_per_10s_bucket': {'0': 1003.4, '1': 951.9, '2': 952.9, '3': 1134.3, '4': 1006.3, '5': 962.3}}, {'id': '3', 'score': 65, 'deliveries_observed': 9, 'distance_per_10s_bucket': {'0': 889.4, '1': 931.5, '2': 1076.4, '3': 891.0, '4': 879.7, '5': 1014.7}}, {'id': '4', 'score': 59, 'deliveries_observed': 7, 'distance_per_10s_bucket': {'0': 995.9, '1': 974.0, '2': 924.2, '3': 990.1, '4': 1011.5, '5': 996.6}}, {'id': '5', 'score': 68, 'deliveries_observed': 8, 'distance_per_10s_bucket': {'0': 879.8, '1': 968.2, '2': 911.0, '3': 1002.9, '4': 1014.5, '5': 993.0, '6': 11.4}}, {'id': '6', 'score': 57, 'deliveries_observed': 8, 'distance_per_10s_bucket': {'0': 1007.9, '1': 877.4, '2': 991.3, '3': 1083.4, '4': 890.6, '5': 879.9, '6': 11.3}}, {'id': '7', 'score': 72, 'deliveries_observed': 8, 'distance_per_10s_bucket': {'0': 991.5, '1': 1026.9, '2': 997.8, '3': 892.9, '4': 955.4, '5': 893.7, '6': 11.8}}, {'id': '8', 'score': 62, 'deliveries_observed': 7, 'distance_per_10s_bucket': {'0': 1153.1, '1': 933.0, '2': 962.8, '3': 870.6, '4': 1014.4, '5': 978.4, '6': 10.9}}]
- PASS: no protocol errors: [[], [], [], [], [], [], [], []]

## Events

- {'elapsed_s': 0.297, 'event': 'match_started', 'players': ['1', '2'], 'remaining': 179.91}
- {'elapsed_s': 5.617, 'event': 'reconnected', 'id': '1', 'score': 9}
- {'elapsed_s': 7.818, 'event': 'duplicate_score_check', 'score': 9}
- {'elapsed_s': 30.349, 'event': 'progress', 'remaining': 149.91000000000003, 'scores': [34, 35]}
- {'elapsed_s': 60.351, 'event': 'progress', 'remaining': 119.81, 'scores': [67, 77]}
- {'elapsed_s': 90.373, 'event': 'progress', 'remaining': 89.81, 'scores': [101, 109]}
- {'elapsed_s': 120.408, 'event': 'progress', 'remaining': 59.81, 'scores': [135, 153]}
- {'elapsed_s': 150.416, 'event': 'progress', 'remaining': 29.810000000000002, 'scores': [171, 196]}
- {'elapsed_s': 180.295, 'event': 'match_finished', 'wall_seconds': 179.998, 'results': [{'color': '#38bdf8', 'id': '2', 'name': '协议乙', 'score': 231}, {'color': '#38bdf8', 'id': '1', 'name': '协议甲', 'score': 205}]}
- {'elapsed_s': 181.357, 'event': 'returned_to_lobby'}
- {'elapsed_s': 181.891, 'event': 'eight_player_trial_started', 'remaining': 179.90000000000003}
- {'elapsed_s': 241.929, 'event': 'eight_player_trial_ended', 'remaining': 119.90000000000003, 'snapshot_metrics': {'1': {'snapshots_received_during_trial': 600, 'average_hz': 10.004, 'arrival_interval_max_ms': 150.591, 'arrival_interval_p95_ms': 140.146}, '2': {'snapshots_received_during_trial': 600, 'average_hz': 9.999, 'arrival_interval_max_ms': 148.028, 'arrival_interval_p95_ms': 140.165}, '3': {'snapshots_received_during_trial': 600, 'average_hz': 9.999, 'arrival_interval_max_ms': 157.154, 'arrival_interval_p95_ms': 140.917}, '4': {'snapshots_received_during_trial': 600, 'average_hz': 9.999, 'arrival_interval_max_ms': 152.163, 'arrival_interval_p95_ms': 140.75}, '5': {'snapshots_received_during_trial': 600, 'average_hz': 9.997, 'arrival_interval_max_ms': 149.017, 'arrival_interval_p95_ms': 142.345}, '6': {'snapshots_received_during_trial': 600, 'average_hz': 9.996, 'arrival_interval_max_ms': 156.228, 'arrival_interval_p95_ms': 139.281}, '7': {'snapshots_received_during_trial': 600, 'average_hz': 9.996, 'arrival_interval_max_ms': 155.917, 'arrival_interval_p95_ms': 140.643}, '8': {'snapshots_received_during_trial': 600, 'average_hz': 9.995, 'arrival_interval_max_ms': 155.682, 'arrival_interval_p95_ms': 141.872}}}

## Measurement summary

- Full round: 179.998 seconds, final scores 231:205, both clients agree.
- Eight bots: 60.04 seconds, all active in each 10-second bucket, each delivered 6–9 times.
- Aligned snapshot wall time: 59.9588 seconds; game time advancement: 60.0000 seconds; absolute error 0.0412 seconds (<0.5 seconds).
- Each client received 600 trial snapshots at approximately 10 Hz; receive-interval p95 ranged 139.281–142.345 ms, maximum observed interval 157.154 ms.
- Server log: no observed errors. Test server stopped.

## Scope and limitations

- Real local Skynet with eight Python WebSocket protocol clients; not browser sessions.
- Local protocol smoke test; not an Internet, mobile-device, or production performance guarantee.
- Arrival intervals measure observed local snapshot receive spacing, not network round-trip latency.
- Eight-player trial intentionally ends after 60 seconds rather than completing its round.
- Runtime started after monotonic deadline/catch-up fix and expired-boost correction. A subsequent disconnect-callback clock synchronization edit was made while this runtime was active and is not covered by this long run; the backend worker subsequently reported server/test.sh passing, including core rules, clock pause/disconnect-grace regressions, and real two-client WebSocket checks. This does not imply another full-length run of that final callback edit.
