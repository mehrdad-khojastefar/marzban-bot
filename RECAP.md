# Commit Recap

## What changed
Call `initSettingService(db)` at the top of `startPremzyServer` so the premzy callback process can read the `events_enabled` setting. Without this, every `logEvent` call inside the premzy server threw `"Setting service not initialized"` inside `getSetting('events_enabled')`, the error was swallowed by the fire-and-forget `.catch` in `logEvent`, and every premzy webhook event was silently dropped.

## Key decisions
- **Initialize once at server start, not per request:** the setting service is process-global state, same pattern the bot process uses. Re-initializing per request would invalidate the 30s cache for nothing.
- **Use the same `db` that the rest of the server already constructed:** premzy already builds a `PrismaClient` for provisioning — reuse it instead of opening a second pool just for settings.

## Files changed
```
src/premzy/server.ts    # initSettingService(db) right after PrismaClient construction
```

## Verification
- `npx tsc --noEmit -p tsconfig.bot.json`: no new TS errors in `src/premzy/server.ts` (pre-existing errors elsewhere unchanged).
- The fix is a one-call wiring change; no test changes needed — the setting service already has its own unit coverage.
