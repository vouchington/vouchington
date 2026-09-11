# Security Architecture reference

[Back to Security Architecture](SECURITY.md)

## Authentication & Sessions

- **JWT algorithm**: RS512 (asymmetric); configured JWKs must be RSA signature keys with unique
  `kid` values
- **Device token** (`dt` cookie): expires in 30 days (JWT expiry matches Valkey TTL)
- **Session token** (`st` cookie): expires in 2 days
- **Cookie flags**: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production
- **CSRF**: `SameSite=Lax` is one of several layered defenses (origin guard, JSON-only content-type
  enforcement, no cross-origin CORS); no CSRF tokens are used. See [CSRF Protection](./CSRF.md).
- **Cookie value safety**: backend- and edge-minted `dt`/`st` values must not contain semicolons
  or ASCII control characters before they are serialized into `Set-Cookie` or outbound origin
  `Cookie` headers. JWTs are base64url plus dots, so valid session tokens never need those
  characters.
- **Mostly stateless sessions**: backend verifies the `dt`/`st` JWT pair on every request and checks
  the Valkey revocation flag for uid-bearing sessions, so revocation takes effect immediately for
  authenticated API requests
- **No `st`-only auth**: a valid session JWT without a matching valid device JWT must not
  authenticate a request
- **JWT key env vars**:
  - `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64`: base64-encoded JSON array of private JWKs, newest
    first
  - `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`: base64-encoded JSON array of public JWKs, newest
    first
- **Key rotation**: prepend the new key, deploy both backend and Cloudflare Worker, wait for old
  tokens to expire, then remove the old trailing key

### Multi-Factor Authentication

- Users may register **multiple passkeys** (WebAuthn/FIDO2) and **multiple TOTP authenticators**; both types coexist per account.
- Any single enrolled MFA method is sufficient to satisfy an MFA challenge — all enrolled methods are tried.
- Removing the **last** MFA method requires re-authentication with an existing factor (email OTP or TOTP code). The re-auth proof token is short-lived (5-minute TTL) and consumed atomically on use.
- TOTP codes use a 30-second period with **±30 seconds of clock skew tolerance** (window = 1) to accommodate minor client/server drift.
- TOTP secrets are returned only once at setup time and are never exposed again.
- MFA login attempts are stored in Valkey with a 5-minute TTL and are consumed atomically to prevent replay.
- Failed MFA login verifications are rate-limited by login attempt, user, device, and session within
  the same 5-minute attempt window.

### Token Storage

- Email and phone OTP values are never stored directly. Store a purpose-bound HMAC-SHA256 hash using `VOUCHA_OTP_TOKEN_HASH_SECRET`; use distinct purposes for email and phone flows.
- API/RSS keys are one-way, one-time display credentials. Store only `key_hash`, validate with checksum plus hash lookup, and invalidate with `revoked_at`.
- OAuth/social access tokens, OAuth refresh tokens, and TOTP shared secrets must be stored as authenticated ciphertext using `@modules/token-secrets` and `VOUCHA_STORED_SECRET_ENCRYPTION_KEYS`.
- `VOUCHA_STORED_SECRET_ENCRYPTION_KEYS` rotation is prepend-only: deploy the new key first, keep old key IDs configured for decrypt, then remove old keys only after their ciphertexts are expired or re-encrypted.

### Edge Cache Classification

The CF Worker may verify the signed `st` payload and bypass cache when `uid` is present and `dt`
also exists. This is a cache-safety classification only; it is not an auth decision.

---

## Origin Validation (CF Worker → Backend/Web)

The CF Worker sets a shared secret header on every request it proxies to an origin:

```
x-cf-worker-secret: <secret>
```

The backend rejects requests missing this header or presenting the wrong value with `403 Forbidden`.

### Environment Variables

**CF Worker** (`cloudflare-worker/.dev.vars` in dev, Cloudflare dashboard in production):

```
CF_WORKER_SECRET=<shared-secret>
VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64=<base64-encoded JSON array of public JWKs>
```

**Backend** (`.env` / `~/voucha.env`):

```
CF_WORKER_SECRET=<same-shared-secret>
VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64=<base64-encoded JSON array of private JWKs>
VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64=<optional base64-encoded JSON array of public JWKs>
VOUCHA_OTP_TOKEN_HASH_SECRET=<random HMAC secret>
VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=<kid:base64url-32-byte-key>
```

`VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64` is intentionally omitted from deployed backend ECS
task definitions until the backend edge-anon public-key rollout is wired in OpenTofu. Until then,
deployed Worker edge-anon minting with a distinct keypair must stay off: backend flows treat
Worker-minted `dt`/`st` cookies as invalid unless the backend has that public key. The backend still
tries legacy session public keys as fallback candidates; for exact candidate resolution, see
[`verify.mts`](../../../backend/services/jwt-session/verify.mts).

Keep these rollout-gated Worker env vars unset in deployed environments until that backend
public-key wiring ships:

```
VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64=<base64-encoded JSON array of private JWKs>
VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64=<base64-encoded JSON array of public JWKs>
```

Generate the HMAC secret with `openssl rand -base64 32`. Generate an encryption key with
`printf 'local:%s\n' "$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '=')"` and rotate
by prepending a new `kid:key` entry while keeping older entries configured.
Local and test-only fake values may use `kid:raw32:<obviously fake 32-byte sentence>` so
examples do not look like real secrets.

> **Dev**: `./dev/initialize web` generates `CF_WORKER_SECRET` automatically. The secret is written to `.env` (backend + Next.js SSR) and `cloudflare-worker/.dev.vars` (CF Worker). These files are only created in web mode — monorepo-only init (`./dev/initialize monorepo`) does not generate them. To use a shared secret across worktrees, add `CF_WORKER_SECRET=<value>` to `~/voucha.env`.

---

## Native TLS Pinning

Swift and .NET native clients can enforce SPKI public-key pins for the public API hosts derived from
the OpenTofu topology: `voucha.ai` and `staging.voucha.ai`. Pin enforcement is disabled by default
until those hosts use controlled Cloudflare edge certificate keys with a prepared backup pin.

Native clients connect to the Cloudflare edge, not directly to the ALB. Therefore native API pins
must match the Cloudflare edge certificate SPKI. Do not pin `aws_acm_certificate.alb`; that ACM
certificate protects only Cloudflare-to-origin traffic.

Pin mismatches on configured production or staging API hosts fail the request after normal platform
trust evaluation. Localhost, non-HTTPS, and custom development origins are not pinned. Rotation and
rollout steps live in [Native TLS Pinning](../../runbooks/native-tls-pinning.md).

---

## Rate Limiting

Applied at the CF Worker edge via Cloudflare Rate Limiting bindings:

- Separate limits for `GET`/`HEAD` vs mutating methods
- Separate limits for `/api/*` vs web routes
- Fully cached routes (sitemaps, `robots.txt`) are exempt
- Requests without a client IP are **blocked** when a binding is configured (misconfigured proxy indicator)
- Email OTP endpoints have additional backend-level limits on both token issuance and verification

---
