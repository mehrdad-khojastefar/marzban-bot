# Account Search — Flexible Admin Search

## Goal
Enhance the ADMIN_ACCOUNTS scene search to support multiple search fields,
so admin can find any account by any identifier they have.

## Searchable Fields
| Input | Matches on | DB path |
|---|---|---|
| Marzban username | `account.marzban_username` | direct field |
| Subscription token | `account.marzban_sub_token` | direct field |
| Telegram chat ID | `account.user.chat_id` | relation → User |
| Telegram @username | `account.user.username` | relation → User |
| Account note | `account.note` | direct field |

## Current State
- `adminAccounts.ts` already has search — only matches `marzban_username` and `note` (lines 46-51).
- Search is triggered by text input when no `adminCreateStep` is active.
- Results integrate with existing filter (paid/unpaid) and pagination.

## Implementation Plan
1. ~~Update ARCHITECTURE.md and DESIGN.md~~ (done)
2. Modify the `where` clause in `renderAccountList()` to build an `OR` array across all 5 fields.
3. For `chat_id` search: detect numeric input → add `user: { chat_id: BigInt(input) }` condition.
4. For `marzban_sub_token`: add `{ marzban_sub_token: { contains: search, mode: 'insensitive' } }`.
5. For `user.username`: add `{ user: { username: { contains: search, mode: 'insensitive' } } }`.
6. Update search prompt text to reflect the expanded search scope.
7. Write tests for the search logic.
8. Run `yarn lint` + `yarn test`.
