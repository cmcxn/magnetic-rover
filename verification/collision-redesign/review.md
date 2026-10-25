# Independent review and resolutions

Independent code review examined the full collision implementation against the approved behavior.

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Important: partial boost tick averaged speed could misclassify an actual pre-expiry boost impact as ordinary | Slice simulation at each dash expiry; preserve absolute collision timing | Regression with remaining boost0.02s and contact at10/720s failed before fix, now attacker unstunned/target cargo15 |
| Important: missing route during packet loss could leave displayed cars permanently on wrong sides | On stale delivery or large display/authority discrepancy, atomically rebase to fresh legal authority instead of sweeping a fictitious path | Two new client regressions (2s silence;400ms buffered large correction), local+spectator |
| Knockback decay multiplied displacement-average into persistent velocity | Keep analytic integrated displacement separate from exp(-5dt) velocity update | kx100 after0.05s is77.8800783; exact displacement4.4239843 |
| Safe-zone interpretation | Confirmed approved behavior: suppress drops only; preserve ordinary/boost classification | Both ordinary-safe and boosted-safe regressions |

Independent extra stress:5,000 eight-car near-wall server projections (<1e-7 error),2,000 client projections (~5.4e-8 maximum penetration). These are constraint probes, not browser visual review or performance benchmarks.

No unresolved important code findings. Browser screenshot/pixel verification remains blocked and has **not** passed. Existing Vite bundle-size warning remains; no new dependency/engine introduced.
