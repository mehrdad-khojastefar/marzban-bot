# RECAP — Step 3: Marzban client hardening

## What changed
- `src/core/marzban/client.ts`:
  - **HTTP keep-alive** — `http.Agent` and `https.Agent` with `keepAlive: true` and a configurable `maxSockets` (default 50) on the shared axios instance. New TCP connections were being opened per call.
  - **Per-request timeout** — default 8 s (configurable via `MarzbanClientConfig.timeoutMs`). Previously: none, so a hung Marzban instance could pin a Node task indefinitely.
  - **Proactive token refresh** — track `tokenIssuedAt`; refresh when 80% of the TTL has elapsed. TTL is taken from the OAuth2 `expires_in` field when present, otherwise falls back to 30 min (`tokenTtlMs` config or default). Previously: token was cached until a 401 forced a refresh.
  - **Transient retry** — one retry on network errors or 5xx with a small fixed delay (`retryDelayMs`, default 250 ms). 4xx still fails immediately. The existing 401 → token-refresh path is preserved as a separate retry flag so a request can still be retried once for auth *and* once for transient errors.
  - The 401 retry now invalidates token + issued-at + the in-flight fetch promise as a single `invalidateToken()` helper.
- `src/core/marzban/types.ts`: `Token.expires_in?: number` added, and `MarzbanClientConfig` gains four optional knobs (`timeoutMs`, `keepAliveMaxSockets`, `retryDelayMs`, `tokenTtlMs`).
- New tests:
  - `src/core/marzban/__tests__/transientRetry.test.ts` — 5xx and network-error retries succeed; 4xx does not retry; retry-once is honored; 401 stays on the auth path, not the transient path.
  - `src/core/marzban/__tests__/tokenExpiry.test.ts` — token reused before 80% TTL; refreshed after; server-provided `expires_in` overrides the default.
- `CLAUDE.md`: added a "Performance Standards" section codifying the project-wide perf rules (indexing, `select` discipline, DB factory usage, Marzban client usage, no-PII logging).

## Why
Each Marzban call previously paid for a fresh TCP connection (no keep-alive) and could hang forever (no timeout). Tokens were only refreshed on a 401 — meaning every long-lived process eventually paid for a synchronous round-trip mid-flow. There was no recovery from transient 5xx or network blips. At 10K-user load these compound into avoidable p95 spikes.

## Decisions
- **One transient retry, not exponential backoff.** A 250 ms delay is enough to ride out a brief blip; multiple retries would just stack latency for users when Marzban is genuinely down. If we ever need more we can switch to a small bounded backoff.
- **Separate flags** for `_retriedAuth` and `_retriedTransient`. A request can be retried once for each cause — that's intentional, since the two failure modes are orthogonal.
- **Token TTL is server-driven, with a defensive fallback.** We read `expires_in` from the OAuth response (RFC 6749) and only fall back to 30 min if it's missing.
- **No circuit breaker yet.** WORKING.md explicitly defers this until we measure. Simpler is better.

## Verification
- `yarn test` — 112/112 pass (7 new tests: 5 retry, 2 token expiry).
- `npx eslint src/core/marzban` — clean.
- Pre-existing main-branch tsc errors (Telegraf typings, socks-proxy-agent module resolution) unrelated to this PR.

## What's next
Step 4 in `WORKING.md`: remove the N+1 `findUnique` chain in `adminViewAccount.ts` by caching the viewed account in `ctx.session`.
