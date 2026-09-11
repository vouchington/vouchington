# @modules/token-secrets

Central helpers for storing token material safely.

The generic parsing and cryptographic mechanics are supplied by `@vouchington/utils/token-secrets`.
This module keeps Voucha environment names, cache behavior, and product-facing error contracts.

## Rules

- Use `hashToken(purpose, token)` for one-way OTP storage and comparison. It uses HMAC-SHA256 with `VOUCHA_OTP_TOKEN_HASH_SECRET`; purpose strings separate email, phone, and future token classes.
- Use `encryptSecret(plaintext, purpose)` / `decryptSecret(ciphertext, purpose)` for secrets that must be read back, such as OAuth access/refresh tokens and TOTP shared secrets. It uses AES-256-GCM with purpose as authenticated associated data.
- `VOUCHA_STORED_SECRET_ENCRYPTION_KEYS` is comma-separated `kid:base64url-32-byte-key` or
  `kid:raw32:<32-byte sentence>`, newest first. Key ids must match `/^[A-Za-z0-9_-]+$/`, be unique,
  and use canonical base64url material. Parsing delegates to `@vouchington/utils/token-secrets`
  `parseEncryptionKeys`. Keep old keys configured until every ciphertext using them has expired or
  been re-encrypted.
- Never log plaintext tokens, ciphertext values, or HMAC hashes.

## Related

- Backend rules: [../../CLAUDE.md](../../CLAUDE.md)
- Security requirements: [../../../docs/requirements/security/SECURITY.md](../../../docs/requirements/security/SECURITY.md)
- Environment variables: [../../../docs/overview/infrastructure/environment-variables.md](../../../docs/overview/infrastructure/environment-variables.md)
