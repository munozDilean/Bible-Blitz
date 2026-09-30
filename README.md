# Bible Blitz

A Bible-themed party game for **2–8 remote players**.

**Play:** https://bible-blitz-party.dileanmunoz.chatgpt.site/

## Game

Join by room code, mark ready, and play twelve challenges—two from each of six categories: Who Am I?, What Happened First?, Finish the Verse, Bible Facts, Bible Story Badly Explained, and Biblical Group Chat.

Each question has four choices and a 15-second answering window. Correct answers score 100 plus up to 50 for speed; wrong/missed answers score zero. The host also plays and advances after each reveal. Highest score wins; ties share the win. Rematches keep the group together.

The initial bank has 24 questions. No question ID repeats within a match; later matches can reuse questions. Verse excerpts use the ESV; fictional chats are clearly labeled. Rooms last 24 hours.

## Documentation

- [Architecture and tech stack](docs/architecture.md)
- [Database schema and JSON models](docs/database.md)
- [API reference](docs/api.md)
- [Local development, testing, deployment and security](docs/development.md)
- [Latency investigation and limitations](docs/performance.md)

## Quick start

Node.js >=22.13.0, npm, and Git required. From this repository root:

~~~sh
npm ci
npm run build
# Initialize a fresh local database only:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_silent_martin_li.sql
npm start -- --port 8787
~~~

Open http://127.0.0.1:8787 in two fresh tabs using different names. Do not replay the initial migration against an already initialized database. For hot reload use npm run dev.

## Checks

~~~sh
npm run typecheck
npm test
# With the local built server running:
npm run test:integration
~~~

## Layout

~~~text
app/page.tsx             Screens, session, polling, answer feedback
app/api/game/route.ts    GET/POST API entry point
lib/game.ts             Rules, scoring, state transitions
lib/game-service.ts     Timing, authorization, D1 concurrency
lib/client-timing.ts    Snapshot ordering and clock synchronization
lib/questions.ts        Server-only question bank
db/schema.ts            Drizzle schema
drizzle/                Versioned migrations
docs/                   Technical documentation
~~~

The game uses HTTP polling, not WebSockets. D1 owns state; browser storage only retains the local player credential/name. GitHub pushes do not automatically deploy the Site.

## Content

Preserve ESV attribution and review [Crossway permissions](https://www.crossway.org/permissions/) when expanding quotations. Questions, explanations and humorous dialogue are original game content, not Scripture quotations. Third-party dependencies retain their licenses; this README does not assign a new open-source license to the application.
