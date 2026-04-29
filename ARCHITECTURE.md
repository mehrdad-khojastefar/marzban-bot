# Architecture — Premzy Payment Link Script

## Goal

A standalone CLI command that generates a Premzy checkout URL with a fixed price of 300,000 Toman. No database, no bot, no callback server — just sign a JWT and print a URL.

## How Premzy Links Work

Premzy uses ES256 (P-256 ECDSA) signed JWTs for checkout. The JWT payload contains:

```json
{
  "vendor_id": "<uuid>",
  "toman_amount": 300000,
  "transaction_id": "<unique-id>",
  "iat": <unix-timestamp>
}
```

The signed token is appended to `https://premzy.pro/checkout?jwt=<token>`.

## Existing Code

| File | What it does |
|---|---|
| `src/premzy/jwt.ts` | `initPremzyJwt()` loads EC private key; `buildCheckoutUrl(amount, txId)` signs JWT and returns URL |
| `src/core/utils/config.ts` | Zod-based env validation (full bot config — overkill for this script) |

## What the CLI Script Needs

1. Load `.env` (only `PREMZY_VENDOR_ID` and `PREMZY_EC_PRIVATE_KEY_PATH` are required)
2. Call `initPremzyJwt()` with vendor ID + key path
3. Generate a unique transaction ID (UUID)
4. Call `buildCheckoutUrl(300000, transactionId)`
5. Print the URL to stdout

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `PREMZY_VENDOR_ID` | Vendor UUID from Premzy |
| `PREMZY_EC_PRIVATE_KEY_PATH` | Path to EC private key (`.pem`) |

## Key Generation

EC P-256 key pair generated via `yarn keys:generate` (OpenSSL commands in package.json).
