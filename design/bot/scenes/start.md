# Start Scene

## Purpose
Entry point triggered by `/start`. Registers new users, detects sellers, and redirects to Home.

## Flow
1. User sends `/start`
2. Check if user exists in DB (by `chat_id`)
3. If new → create user record (chat_id, username, first_name, last_name)
4. **Seller check:** look up `sellers` table by `chat_id`
   - If seller record exists with `user_id = null` → link `user_id`, show `seller.welcome`
5. Transition → `HOME`

## UI
No persistent UI — sends a welcome message then immediately shows the Home scene.

## Messages
| Key | Default (Persian) |
|---|---|
| `start.welcome_new` | سلام {first_name}! به ربات VPN خوش آمدید. |
| `start.welcome_back` | سلام {first_name}! خوش برگشتید. |
| `seller.welcome` | شما به عنوان فروشنده ثبت شده‌اید! از منوی اصلی به پنل فروشنده دسترسی دارید. |

## Backend
- `db.user.findByChat(chatId)` — check existence
- `db.user.create(userData)` — register
- `db.seller.findByChat(chatId)` — check if seller
- `db.seller.linkUser(sellerId, userId)` — link seller to user

## Transitions
```
START → HOME (always)
```

## Edge Cases
- User sends `/start` again while already registered → show `welcome_back`, go to HOME
- Telegram user without username → store as null
- Seller already linked (`user_id` set) → no re-linking, just show HOME with seller button
- Seller added by admin but hasn't started → on first `/start`, link and show `seller.welcome`
