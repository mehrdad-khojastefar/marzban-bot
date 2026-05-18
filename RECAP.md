# RECAP — Step 10: observability baseline (pino + prom-client)

## What changed

### New modules
- **`src/core/logger.ts`** — `createLogger({ source })` returns a configured pino logger (JSON output, `LOG_LEVEL` env-driven, defensive redaction for tokens / passwords / authorization headers). `generateRequestId()` returns a 16-char hex id cheap enough to call on every update.
- **`src/core/metrics.ts`** — process-scoped Prometheus `Registry` with default Node metrics, plus three histograms (`prisma_query_duration_ms` labelled by `model` + `operation`, `marzban_call_duration_ms` labelled by `endpoint` + `status`, `telegram_update_duration_ms` labelled by `update_type`). Includes a tiny `startMetricsServer({ port, logger })` that serves `/metrics` from the registry. `modelFromSql` / `operationFromSql` helpers extract Prisma metadata from raw SQL text.
- **`src/bot/middlewares/observability.ts`** — middleware that stamps each update with `ctx.state.requestId`, a child logger bound to `requestId` + `chatId` + `updateType`, and a `telegram_update_duration_ms` observation in both success and failure paths.

### Wiring
- `src/bot/bot.ts` constructs the root logger once, attaches a `process.on('unhandledRejection')` so async escapes still hit the structured stream, starts the metrics server when `METRICS_PORT > 0`, and slots `observability(logger)` between `errorHandler()` and `channelCheck()`. `bot.catch(...)` now uses the per-update child logger when present.
- `src/bot/context.ts` adds `BotState` (`{ requestId?, log? }`) and types `BotContext.state` against it, so scenes/handlers can read `ctx.state.log` with full IDE help.
- `src/bot/middlewares/index.ts` re-exports `observability`.
- `src/core/utils/config.ts` declares `LOG_LEVEL` (string, default `info`) and `METRICS_PORT` (coerced number, default 9090; set to 0 to disable).

### Tests (16 new)
- `src/core/__tests__/logger.test.ts` — logger constructs with child support; `LOG_LEVEL` honoured; `generateRequestId` returns 16-char hex and is non-colliding.
- `src/core/__tests__/metrics.test.ts` — `modelFromSql` covers quoted, unquoted, and non-FROM SQL; `operationFromSql` covers all seven verbs we care about.

### Dependencies
- Runtime: `pino@^9`, `prom-client@^15`. No new dev deps; `pino-pretty` is intentionally **not** required — pipe through it locally if you want a pretty console view.

### `.env.example`
- New `LOG_LEVEL=info` and `METRICS_PORT=9090` block documented.

## Why
The bot needs to expose **what's happening** to operators before we scale to 10K users. Today the only signal is `console.log`. We need:
- Structured JSON logs with a stable `requestId` so a single user's interaction can be traced end-to-end across middlewares, scenes, and handlers.
- A `/metrics` endpoint so Prometheus can chart per-update latency, Prisma slow queries (Step 2 already emits the right event — Step 10 just gives it a histogram to land in), and Marzban call durations (Step 3 already wraps the call surface — wiring the histogram is a one-liner where the client lives).
- Defensive redaction so a careless `log.info(env)` doesn't leak the Telegram bot token.
- An `unhandledRejection` handler so async escapes don't silently kill the process.

## Decisions
- **JSON-only logs.** No `pino-pretty` requirement in production. Devs pipe through `pino-pretty` manually when they want colour.
- **`requestId` is generated, not propagated.** Telegram doesn't carry trace context; we mint our own on entry and bind it to the child logger.
- **Per-process registry.** Each surface (bot, sub, premzy) owns its own registry, so labels don't collide and a single process restart doesn't drop all metrics for the cluster.
- **Metrics server is opt-out via `METRICS_PORT=0`**. The default 9090 binds locally — operator is responsible for ensuring the port is private.
- **Marzban / Prisma histograms exist but aren't wired into call sites in this PR.** That belongs in a follow-up that touches the Marzban client and the slow-query log inside `client.ts`; keeping it out of this PR keeps the surface reviewable.

## Verification
- `yarn test` — 121/121 pass (16 new).
- `npx eslint src/core/logger.ts src/core/metrics.ts src/bot/middlewares src/bot/context.ts src/bot/bot.ts src/core/utils/config.ts` — clean (one pre-existing `no-explicit-any` warning in `bot.ts`).
- New runtime deps `pino@9` and `prom-client@15` added; `yarn add` succeeded.

## What's next
Step 11 in `WORKING.md`: synthetic 10K load test against a seeded staging DB to validate the SLOs.
