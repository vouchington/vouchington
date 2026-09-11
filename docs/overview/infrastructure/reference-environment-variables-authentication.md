# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Authentication

| Name                                   | Required | Where   | Notes                                                                                                                                                   |
| -------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64`  | Yes      | SM      | Base64-encoded JWT private keys (array)                                                                                                                 |
| `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`   | Yes      | SM + CF | Base64-encoded JWT public keys (array). Set on both backend and CF Worker                                                                               |
| `CF_WORKER_SECRET`                     | Yes      | SM + CF | Shared secret for CF Worker → backend verification                                                                                                      |
| `VOUCHA_OTP_TOKEN_HASH_SECRET`         | Yes      | SM      | HMAC secret for one-way email/phone OTP token hashes                                                                                                    |
| `VOUCHA_STORED_SECRET_ENCRYPTION_KEYS` | Yes      | SM      | Comma-separated `kid:base64url-32-byte-key` list for stored token encryption; local/test fixtures may use `kid:raw32:<obviously fake 32-byte sentence>` |
