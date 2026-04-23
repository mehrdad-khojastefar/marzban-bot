# Start Scene

## Purpose
Entry point triggered by `/start`. Registers new users and redirects to Home.

## Flow
1. User sends `/start`
2. Check if user exists in DB (by `chat_id`)
3. If new → create user record (chat_id, username, first_name, last_name)
4. Transition → `HOME`

## UI
No persistent UI — sends a welcome message then immediately shows the Home scene.

## Messages
| Key | Default (Persian) |
|---|---|
| `start.welcome_new` | سلام {first_name}! به ربات VPN خوش آمدید. |
| `start.welcome_back` | سلام {first_name}! خوش برگشتید. |

## Backend
- `db.user.findByChat(chatId)` — check existence
- `db.user.create(userData)` — register

## Transitions
```
START → HOME (always)
```

## Edge Cases
- User sends `/start` again while already registered → show `welcome_back`, go to HOME
- Telegram user without username → store as null
