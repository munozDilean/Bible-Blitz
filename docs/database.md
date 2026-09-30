# Database specification

## Physical schema

Source: `db/schema.ts`. Initial migration: `drizzle/0000_silent_martin_li.sql`.

```sql
CREATE TABLE rooms (
  code TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER DEFAULT 0 NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX idx_rooms_expires ON rooms(expires);
```

| Column | Meaning |
| --- | --- |
| code | Six-character room code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| state | JSON game document, including private credentials and answer keys |
| revision | Monotonic optimistic-concurrency version |
| expires | Unix epoch milliseconds; creation + 86,400,000 (24 hours) |

The primary key supports exact room lookups. The expiry index supports retention queries. Creation uses `INSERT OR IGNORE`, retrying a code collision up to six times.

## Game JSON

| Property | Type / meaning |
| --- | --- |
| host | Host player UUID |
| players | Array of 1–8 Player records |
| phase | lobby / preparing / question / reveal / finished / closed |
| deck | Twelve randomized Question records, persisted for this match |
| round | Zero-based current round, 0–11 |
| start | Scheduled epoch millisecond start; 0 before scheduling |
| answers | Map from player UUID to current-round Answer |
| match | Integer generation, incremented on rematch/cancel |
| loaded | Optional UUID array acknowledging current-question receipt |

Player: `id` UUID, `token` UUID bearer secret, `name` trimmed string (1–20 JS characters), `score` integer, `correct` integer, `ready` boolean. Names are case-insensitively unique in the room.

Answer: `choice` integer 0–3, `points` integer (0 or 100–150), `elapsed` server-observed milliseconds from start. Answers clear on round advance; score/correct totals accumulate once at settlement.

Question: `id`, `category` 0–5, `prompt`, four `options`, correct `answer` string, Bible `reference`, and `explanation`. Complete decks and answer keys are never returned to the browser.

Nested JSON invariants are enforced in application code, not SQL constraints. No foreign keys or separate users/answers/history tables exist.

## Writes

```sql
UPDATE rooms SET state = ?, revision = revision + 1
WHERE code = ? AND revision = ?;
```

A zero-row update signals a conflict, causing a fresh read and retry. This prevents simultaneous joins/answers from overwriting one another. Each prepared statement contains one SQL statement.

## Migrations and retention

`DB` is a logical binding in `.openai/hosting.json`; Sites owns production resource provisioning. Local data under `.wrangler/state` is separate and never synchronizes with production.

Edit `db/schema.ts`, generate via `npm run db:generate`, inspect SQL, apply each pending local migration once, then commit schema/SQL/Drizzle metadata together. Never rewrite already-applied migrations. Production migrations run before Worker upload and may apply even if publishing later fails.

The latency fixes do not change SQL schema; optional `loaded` defaults to an empty array for older room documents.

Expiry is logical: requests reject expired rooms. **No scheduled physical deletion exists**, so expired rows remain until explicitly cleaned up. No separate match history or repository-managed backup job exists. Database exports contain bearer tokens and unrevealed answers; do not commit them or local database files.
