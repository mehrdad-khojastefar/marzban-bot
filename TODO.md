# TODO — Deferred Features

These features are out of scope for the current phase (Telegram bot). They will be picked up after the bot is stable.

## CLI Tool
- Commander.js admin commands
- Seed plans, manage admins, run migrations
- See `ARCHITECTURE.md` → CLI Layer

## Admin Panel
- Next.js dashboard for managing users, plans, payments
- Admin-only auth (session-based)
- See `ARCHITECTURE.md` → Panel Layer

## Payment Gateway Integration
- Replace manual admin approval with automated payment (e.g., Zarinpal, crypto)
- Webhook-based confirmation

## Referral System
- Referral codes
- Reward tracking (free data, discounts)

## Multi-Device Plans
- Plans that allow multiple simultaneous connections
- Device limit enforcement

## Subscription Auto-Renewal
- Recurring payments
- Pre-expiry notifications
- Automatic plan extension on payment
