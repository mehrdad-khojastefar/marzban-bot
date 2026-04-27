# Vendor Integration Guide

This document is for third-party services that integrate with Premzy to sell Telegram Stars through their own bots.

Contact the Premzy team to get set up. They will create your vendor account, share your **Vendor UUID**, and store your **EC public key**.

---

## How it works

```
Your bot                  User                    Premzy
   │                        │                        │
   │  (sign JWT locally)    │                        │
   │                        │                        │
   │── send checkout URL ──►│                        │
   │                        │── open checkout URL ──►│
   │                        │◄── phone form ─────────│
   │                        │── enter phone + OTP ──►│
   │                        │◄── payment redirect ───│
   │                        │── completes payment ──►│
   │                        │                        │
   │◄── POST /your-callback (order_id: <uuid>) ──────│
```

1. Your bot signs a JWT locally using your EC private key.
2. Your bot sends `https://premzy.pro/checkout?jwt=<token>` to the Telegram user.
3. The user opens the URL, verifies their phone via OTP, and completes payment on Premzy's checkout page.
4. Premzy collects the payment and calls your callback with an `order_id` UUID.
5. **Your system handles star delivery.** Premzy does not send stars for vendor orders — it only processes the payment and notifies you.

---

## Authentication

You authenticate each checkout request by signing a short-lived JWT with your **EC private key** (P-256 / ES256). Premzy verifies it using your public key on file.

**Key setup (one time)**

Generate a P-256 key pair and send the public key to the Premzy team:

```bash
# generate key pair
openssl ecparam -name prime256v1 -genkey -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# share public.pem with the Premzy team — keep private.pem secret
```

The Premzy team will store your `public.pem` and give you your **Vendor UUID**.

---

## Step 1 — Build the checkout URL

Sign a JWT containing your Vendor UUID and the amount, then append it to the checkout URL.

**JWT payload**

| Field | Type | Description |
|---|---|---|
| `vendor_id` | string | Your Vendor UUID (provided by Premzy) |
| `toman_amount` | integer | Purchase amount in Toman |

**Python example**

```python
import jwt  # pip install PyJWT cryptography

with open("private.pem") as f:
    private_key = f.read()

payload = {
    "vendor_id": "your-vendor-uuid",
    "toman_amount": 500000,
}
token = jwt.encode(payload, private_key, algorithm="ES256")
checkout_url = f"https://premzy.pro/checkout?jwt={token}"
```

**Node.js example**

```js
const jwt = require('jsonwebtoken');  // npm install jsonwebtoken
const fs = require('fs');

const privateKey = fs.readFileSync('private.pem');
const token = jwt.sign(
  { vendor_id: 'your-vendor-uuid', toman_amount: 500000 },
  privateKey,
  { algorithm: 'ES256' }
);
const checkoutUrl = `https://premzy.pro/checkout?jwt=${token}`;
```

**Error responses** (HTTP redirect to error page)

| Cause | Description |
|---|---|
| Invalid signature | JWT was tampered with or signed with a different key |
| Unknown `vendor_id` | UUID not found or vendor is inactive |
| Missing / invalid `toman_amount` | Value missing, non-numeric, or ≤ 0 |
| Amount out of range | Converts to fewer than the minimum or more than the maximum allowed stars |

---

## Step 2 — Send the URL to the user

Forward `checkout_url` to the Telegram user. The page handles phone collection, OTP verification, and payment. You do not need to do anything else until the callback arrives.

Unlike the API-based flow, there is no pre-issued `order_id` — you receive it only via the callback once payment is confirmed.

---

## Step 3 — Handle the callback

When the user's payment is confirmed, Premzy POSTs to your configured callback URL:

```
POST <your-callback-url>
Content-Type: application/json
Authorization: <your-vendor-token>

{"order_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}
```

Use `order_id` to look up the pending purchase in your system and deliver the stars.

**Verify the `Authorization` header on every incoming callback.** Premzy sends your token with each request so you can confirm it originated from Premzy and not from an arbitrary third party. Reject any request where the header is missing or does not match your token.

**Your endpoint must return any `2xx` status.** Any other response or connection error leaves the order in a retryable state — the Premzy team will re-trigger the callback manually.

**Example (Python / FastAPI)**

```python
from fastapi import FastAPI, Header, Request, HTTPException

app = FastAPI()

VENDOR_TOKEN = "your-token-here"  # keep in an env var, not hardcoded

@app.post("/premzy/callback")
async def premzy_callback(request: Request, authorization: str = Header(None)):
    if authorization != VENDOR_TOKEN:
        raise HTTPException(status_code=401, detail="invalid token")

    body = await request.json()
    order_id = body.get("order_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="missing order_id")

    await deliver_stars_for_order(order_id)  # your logic here

    return {"ok": True}
```

**Example (Node.js / Express)**

```js
const VENDOR_TOKEN = process.env.VENDOR_TOKEN;

app.post('/premzy/callback', express.json(), async (req, res) => {
  if (req.headers['authorization'] !== VENDOR_TOKEN) {
    return res.status(401).json({ error: 'invalid token' });
  }

  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'missing order_id' });

  await deliverStarsForOrder(order_id);  // your logic here

  res.json({ ok: true });
});
```

---

## Notification types

Tell the Premzy team which type you need when requesting your account.

| Type | Behaviour |
|---|---|
| `callback` | Premzy POSTs `{"order_id": "<uuid>"}` to your URL after each confirmed payment. |
| `manual` | No automated callback. The Premzy team notifies you through an agreed channel. |
