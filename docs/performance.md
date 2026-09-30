# Latency investigation — September 30, 2026

## Evidence

The initial release was tested on a fast local emulator. Production logs from the September 28 evening test (America/New_York) showed successful game-state reads often taking 2–4 seconds, one at 10,134 ms, successful mutations around 5–7 seconds, and rejected POSTs around 2.3–4 seconds.

These are Worker wall times. The original release did not separate DB processing from other hosting waits, so the logs do not prove that D1 alone caused the infrastructure latency.

## Application defects and fixes

| Before | Now |
| --- | --- |
| Answer time computed after SELECT and again on retry | Arrival captured once before all DB work |
| Expired round settled before processing an on-time queued answer | Answer processed first; bounded settlement grace |
| Prompt withheld until countdown ended, requiring another slow GET | Current prompt preloaded and acknowledged before countdown |
| Taps showed no selection until response | Immediate pending selection; saved only after confirmation |
| Failed polling disabled answers | Direct submission remains available |
| Timer ignored return-trip delay | Four-timestamp clock samples exclude server processing |
| Later stale responses could replace newer state | Revision-first ordering |
| Lost answer acknowledgements caused duplicate errors | Same-choice retry is idempotent |
| Constant rapid idle polling | Phase-aware polling, timeout/backoff, foreground priority |
| Generic errors | Request ID, DB/total timings, structured rejection reasons |

## Regression coverage

An answer arrives at 14 seconds, then DB reads and a CAS conflict consume another eight seconds. It is accepted with elapsed 14,000 ms and 103 points. True post-deadline arrivals remain rejected. Other tests cover full-match scoring, no double scoring, delayed device preparation, hidden solutions, authorization, clock calculation and stale snapshots.

Local integration tests exercise eight concurrent joins/readiness acknowledgements/loading acknowledgements/answers. Browser tests introduce delayed response delivery and verify immediate feedback.

## Remaining limits

The architecture still uses D1-backed HTTP polling, not WebSockets. These fixes cannot make a ten-second infrastructure request instantaneous. Unanswered rounds may display a collection message for up to the eight-second grace plus polling/processing. The grace is not extra answering time. A request that finishes after an already-finalized round cannot reopen it.

Preparation avoids spending answer time downloading the question, but arbitrary countdown delivery delay/asymmetric links still affect synchronization. Server arrival scoring includes client-to-server travel. Local tests alone do not establish worldwide production speed improvement.

Use the new timings to separate storage/hosting delays from network delays. If they remain persistently high, evaluate a supported room coordinator with WebSockets as a separate infrastructure change.
