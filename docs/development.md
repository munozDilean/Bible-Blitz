# Development, tests, and operations

## Local setup

Requirements: Node.js >=22.13.0, npm, Git. Work inside the `bible-blitz` checkout (the root of the GitHub repository).

```sh
npm ci
npm run build
# Fresh local database only:
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_silent_martin_li.sql
npm start -- --port 8787
```

Open the printed localhost URL in two fresh tabs with different names. The same tab retains identity after refresh. Duplicating a tab can copy its session token. Loopback is accessible only from the host computer, not another phone.

`npm run dev` starts hot reload, normally on port 5173. Both previews share `.wrangler/state`; production is separate. Build before applying local migrations to generate the Wrangler binding configuration. Apply only pending SQL files once; do not replay the initial migration against existing tables.

On Windows use PowerShell. If a system npm shim is broken, invoke the installed npm CLI by its actual path; do not commit a machine-specific path. Subprocess/network permissions may be needed in restricted environments. `.sites-runtime` is ignored local configuration/output.

## Checks

```sh
npm run typecheck
npm test
# Requires the local built server:
npm run test:integration
```

Unit tests transpile rule/service modules to ignored `.sites-runtime/tests`. They verify the complete match, loading barrier, score secrecy, host permissions, duplicate retries, delayed DB/CAS processing, true late arrivals, timeout grace, clock sampling, and snapshot ordering. Integration tests use eight concurrent players and are restricted to loopback. Override `GAME_BASE_URL` if using a different local port.

Optional browser checks: `node scripts/test-browser.mjs`. They require an installed Playwright package/browser. `PLAYWRIGHT_MODULE_PATH` can point to an external Playwright installation; `PLAYWRIGHT_BROWSER_CHANNEL` can select `msedge` or `chrome`. Otherwise the package/default Chromium is used. Tests simulate response delays with independent players and verify immediate answer feedback and phone layout.

## Question authoring

Edit `lib/questions.ts`; each row has category, prompt, correct option, three distractors, Bible reference, explanation. Keep four distinct choices and at least two questions per category. Verify ESV excerpts, preserve attribution, and review Crossway permissions before expanding quotation volume. Clearly mark invented dialogue. Avoid ambiguous timelines or denomination-specific assumptions.

Question IDs derive from row position; existing rooms retain their own stored deck. Do not import this bank into client components.

## GitHub and Sites

GitHub origin: https://github.com/munozDilean/Bible-Blitz.git. Sites has a separate source repository. Preserve GitHub `origin`; Sites pushes use the connector's URL directly. A GitHub push alone does not deploy the Site; no GitHub Actions workflow is configured here.

Publishing sequence: synchronize the existing Site, test/build, push exact source through the Sites workflow, package that build, save a version, deploy it preserving the public audience, and verify success. Keep short-lived credentials only in memory/stdin. Never put tokens in commands, files, or logs.

The Sites Windows packager needs Git Bash and may need `TAR_OPTIONS=--force-local` for drive-letter paths. Local gameplay does not require Bash. Preserve the build's Sites plugin and manifest. Migrations can apply before a failed Worker upload; inspect their status before recovery.

## Troubleshooting and security

- Inspect `/api/game` Worker wall times, HTTP status, rejection reason and request ID.
- Inspect browser `Server-Timing`: DB vs total vs full network duration.
- Refresh the same tab to recover the room; lost session storage cannot recover that player.
- Cancel stalled preparation as host to reset the match. Mid-match automatic host takeover is not implemented.
- Do not reset production data to diagnose lag. Database exports contain private tokens and answer keys.
- No runtime external API keys are required. Do not commit `.env`, `.wrangler`, `dist`, credentials or database exports.
- Tokens are bearer credentials stored in room JSON and tab session storage. Anyone with a room code can join an open lobby.
- Rate limiting, CAPTCHA, room quotas, automatic physical expiry cleanup, and historical match audit are not implemented.
- Preloaded prompts can be inspected by technical players; this is not a prize-competition anti-cheat system.

For sustained real-time use, investigate the measured hosting bottleneck and a supported stateful WebSocket coordinator rather than assuming faster polling solves it.
