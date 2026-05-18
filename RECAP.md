# Commit Recap — Error Tracer

## What was built
A shared error-reporting service that forwards full tracebacks from the
bot, sub proxy, and Premzy callback server to a private Telegram group.
Process-level errors (`uncaughtException`, `unhandledRejection`) are also
captured, but the process does NOT exit — it reports and keeps running.

## Why
Operator currently has to tail server logs to see production errors. With
this, any thrown error (handler, scene, HTTP route, or top-level) appears
in the operator's Telegram group with full stack, cause chain, and context
(user, scene, callback action, route, etc.).

## How it works
- `src/core/utils/errorReporter.ts` — singleton service. `initErrorReporter`
  at startup, `reportError(err, context)` from anywhere, `registerProcessHandlers(source)`
  to override Node's default-exit behavior.
- Each entrypoint (`src/bot/main.ts`, `src/sub/main.ts`, `src/premzy/main.ts`)
  initializes the reporter and registers process handlers.
- Bot middleware (`errorHandler.ts`) and `bot.catch` both delegate.
- Sub and Premzy HTTP error blocks delegate.
- `reportError` itself NEVER throws — failures land in `console.error`.

## Design decisions
- **No-op without `ERROR_CHAT_ID`** — service degrades gracefully so dev
  environments don't need the var.
- **Dedupe within 60s** keyed on `errorName + first stack frame` — prevents
  the same recurring error from spamming the group. Suppressed count is
  flushed when the TTL expires.
- **Hard rate cap** of 30 reports/minute per process.
- **Chunking** at ~3,800 chars to stay under Telegram's 4,096 limit;
  multi-message reports tagged `(1/N)`.
- **Cause chain** walked up to depth 5.
- **HTML escape** all user content before wrapping in `<pre>`.
- **Process no-exit**: `uncaughtException` reports but returns; Node's
  default-exit is explicitly overridden per the user's requirement
  ("the bot should not exit, just send the trace").

## Files
### New
- `src/core/utils/errorReporter.ts`
- `src/core/utils/__tests__/errorReporter.test.ts` (15 tests)

### Modified
- `ARCHITECTURE.md` — added Error Reporting section + updated startup sequence
- `DESIGN.md` — added Error Reporting (operational) section
- `.env.example` — added `ERROR_CHAT_ID`, `ERROR_REPORTING_ENABLED`
- `src/core/utils/config.ts` — added env schema entries
- `src/core/utils/index.ts` — re-exports
- `src/bot/bot.ts` — init reporter, wire `bot.catch`
- `src/bot/main.ts` — `registerProcessHandlers('bot')`
- `src/bot/middlewares/errorHandler.ts` — delegate to `reportError`
- `src/sub/main.ts` — init reporter + process handlers
- `src/sub/server.ts` — delegate in HTTP catch block
- `src/premzy/main.ts` — init reporter + process handlers
- `src/premzy/server.ts` — delegate in HTTP catch block

## Tests
- 120 passing (15 new for errorReporter)
- Covers format, HTML escape, non-Error values, cause chain, dedupe,
  suppression summary, rate limit, sendMessage failure isolation, and
  multi-chunk tagging.

## Env vars added
| Var | Required | Default | Purpose |
|---|---|---|---|
| `ERROR_CHAT_ID` | no | — | Telegram group id. Unset → reporter no-ops. |
| `ERROR_REPORTING_ENABLED` | no | `"true"` | Kill-switch. |
