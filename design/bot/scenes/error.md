# Error Scene

## Purpose
Generic error handler. Shows a user-friendly message and returns to Home.

## UI
```
{error.message}

[ 🔙 بازگشت به منو ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `error.message` | خطایی رخ داد. لطفاً دوباره تلاش کنید. |

## Transitions
```
ERROR → HOME (always)
```

## Notes
- Log the actual error server-side
- Never expose technical details to the user
