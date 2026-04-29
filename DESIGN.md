# Design — Premzy Payment Link Script

## CLI Interface

```
yarn premzy:link
```

No arguments. Generates a single Premzy checkout URL for 300,000 Toman and prints it.

## Output

```
https://premzy.pro/checkout?jwt=eyJhbGciOiJFUzI1NiIs...
```

Just the URL, nothing else — easy to pipe or copy.

## Error Cases

| Condition | Behavior |
|---|---|
| Missing `PREMZY_VENDOR_ID` | Exit with error message |
| Missing `PREMZY_EC_PRIVATE_KEY_PATH` | Exit with error message |
| Private key file not found | Exit with error message |

## No Database

This script does not touch the database. The transaction ID is a one-off UUID generated at runtime — no persistence needed.
