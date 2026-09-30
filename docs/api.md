# Game API

Endpoint: `/api/game`. JSON responses use `Cache-Control: no-store`.

## Authentication

Create/new join return a player token. Other requests send `Authorization: Bearer <token>`. A code or display name alone does not authorize an existing player's actions. POST requests with a foreign Origin header are rejected.

Read room: `GET /api/game?code=ABCDEF`. A GET may settle an expired round and write the reveal.

## POST actions

| action | Fields besides action | Rule |
| --- | --- | --- |
| create | name | Create room and host |
| join | code, name | Lobby, unique name, fewer than 8 players |
| ready | code, ready boolean | Set desired lobby readiness |
| start | code | Host, at least 2 players, all ready |
| loaded | code, match, round | Acknowledge current question; all loaded schedules countdown |
| answer | code, match, round, choice | Current round, choice 0–3, server arrival inside answering window |
| next | code, match, round | Host, reveal only |
| rematch | code | Host, finished only |
| cancel | code | Host, preparing only; reset match to lobby |
| leave | code | Lobby/results; host transfers if necessary |

```json
{"action":"answer","code":"ABCDEF","match":1,"round":0,"choice":2}
```

Round is zero-based. No client timestamp is trusted. Same-choice retries for the current match/round return the saved result; conflicting choices fail. Omitting `ready` toggles it for compatibility; new clients send a boolean.

## Responses

Envelope: `{game, receivedAt, serverTime, requestId}`; create/new join additionally return `token`.

Game view includes code, host, me, phase, round, match, start, revision, serverTime, loaded, answered count, mine, players, and current question. Public players omit token. Before reveal, mine contains only choice, current-round correctness is hidden, and the question omits answer/reference/explanation. A preparing/countdown snapshot includes prompt/options for preloading.

Outer receive/send times support clock synchronization. Revision orders snapshots ahead of timestamps. `Server-Timing` contains `db` and `total` durations; `X-Request-Id` identifies the request.

Errors: `{error, receivedAt, serverTime, requestId}`.

| Status | Meaning |
| --- | --- |
| 400 | Bad input/JSON, wrong phase, capacity, invalid or late answer |
| 401 | Missing/unrecognized player session |
| 403 | Host-only action or wrong origin |
| 404 | Missing, expired, closed room |
| 409 | Optimistic-concurrency retries exhausted |
| 413 | Body exceeds 4,096 JS characters (checked after reading text) |
| 503 | Unexpected service/database failure |

Rejected-request logs contain reason, status, request ID, DB/total times and attempt count, not names/tokens/full room state. Provider logs can independently include URLs.

Answer arrival is captured before database work. Settlement waits at most the configured grace before permitting reveal; an on-time request delayed past an already finalized round cannot reopen it. This is a bounded mitigation, not unlimited late acceptance.
