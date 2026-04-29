# Recap — Premzy Payment Link Script

## What changed

- Added `src/premzy/generateLink.ts` — standalone CLI script that generates a Premzy checkout URL for 300,000 Toman
- Added `yarn premzy:link` script to package.json
- Added tests for `buildCheckoutUrl` in `src/premzy/__tests__/jwt.test.ts` (JWT signing, verification, uniqueness)
- Rewrote `ARCHITECTURE.md` and `DESIGN.md` to match the current branch scope
- Added `.test-keys/` to `.gitignore`

## Why

Need a quick way to generate payment links without running the full bot or database.

## Decisions

- No database dependency — transaction ID is a throwaway UUID
- Script prints only the URL to stdout for easy piping/copying
- Fixed 300,000 Toman amount as specified in WORKING.md
