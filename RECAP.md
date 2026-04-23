# Marzban Service — Commit Recap

## What was built
A typed TypeScript client wrapping the entire Marzban VPN panel REST API (44 methods across 7 resource groups).

## Key choices
- **Axios** with request/response interceptors for auth and error handling
- **Singleton** — `initMarzban()` once at startup, `getMarzban()` everywhere else. Class not exported.
- **Lazy auth** — token fetched on first request, cached, auto-retried once on 401
- **Snake_case keys** — no transformation, mirrors the API exactly
- **TDD** — 76 tests across 10 files, all passing

## Files
```
src/core/marzban/
├── types.ts       # Interfaces + union types from OpenAPI spec
├── errors.ts      # MarzbanError + isMarzbanError()
├── client.ts      # MarzbanClient (private) — all 44 methods
├── singleton.ts   # initMarzban / getMarzban
├── index.ts       # Public barrel
└── __tests__/     # 10 test files, 76 tests
```

## Dig deeper
- Architecture & decisions → `ARCHITECTURE.md`
- API surface & type reference → `DESIGN.md`
- Usage guide & testing patterns → `docs/src/core/marzban/marzban_service.md`
