# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Signed credentials and durable authority

Signed access credentials carry request claims, while PostgreSQL determines whether the owning
user and session remain live. Device credentials authorize renewal of that session; they do not
authorize an ordinary mutation without a paired access credential. This separation lets access
credentials expire frequently without turning a copied device cookie into a general API credential.

The primary session row retains current device authority, its original lifetime and revocation.
Valkey revocation markers provide early rejection; a cache miss cannot establish that a session
is active. Missing or revoked primary authority cannot be recovered by presenting a device cookie.
Session rows also retain the mint receipt needed by exact OAuth completion replay, so pruning them
independently of their owner would weaken that protocol.

### Request claim freshness

Hot, warm and cold claim paths control when current user claims need reloading, independently of
credential rotation. Request-local enrichment can reflect changed membership or roles without
changing the signed principal, device epoch, expiry or original authentication assurance.

Server rendering never renews authenticated credentials. Browser renewal coordinates across tabs
to avoid racing a rotating device credential against its own reuse detection. Failed coordination
or failed renewal reaches sign-in. Binding mismatches become anonymous requests rather than
preventing logout or recovery.

### Browser key possession

Chrome device-bound sessions add a browser-held public-key proof to renewal. The key binding lives
on the same PostgreSQL session row as device authority. Valkey stores only consumable challenges:
challenge eviction asks for a new proof without losing the binding, and an unbound session has no
challenge-authority document to lose.

Registration and renewal are browser-owned background protocols. Their narrow ingress exception
permits missing browser-origin and application-metadata headers; it does not bypass authenticated
Worker ingress or the device credential, nonce and key checks. Key possession is checked inside
the authority lock used for credential rotation, preventing an ordinary renewal from racing a
registration into an unbound session.

The implementation follows the current Chromium producer rather than assuming every field in an
earlier specification draft is emitted. Its proofs use raw compact JWT values, a registration key
in the protected header, and optional audience binding. See the
[Chromium implementation](https://chromium.googlesource.com/chromium/src/+/main/net/device_bound_sessions/)
and [Chrome protocol documentation](https://developer.chrome.com/docs/web-platform/device-bound-session-credentials).

Recovery and credential bootstrap remain available when a browser loses its key. A failed bound
renewal reaches sign-in instead of removing the durable binding and silently continuing unbound.
Logout tells Chrome to discard its cookie-bound session. Bound and unbound renewal preserve the
same suspended-account access needed for appeals; mutation restrictions remain separate.

### Revocation

Logout calls `revokeSession(sid)` for verified uid-bearing sessions, which sets
`voucha:jwt-revoked:{sid}` in Valkey with a TTL of `REVOCATION_EXPIRATION_SECONDS`
([`session-revocation-keys.mts`](../../../backend/services/jwt-session/session-revocation-keys.mts)),
the longest supported session lifetime. The same TTL applies to every revoked session regardless of
device class, so the marker outlives even an attested device's longer-lived session. Anonymous
logout and reset only clear or rotate cookies because anonymous revocation markers are not checked
by request context.
Request context checks this flag for uid-bearing sessions before resolving the current user, so
logout takes effect immediately for API requests. `PATCH /api/v1/session` also checks revocation on
the warm/cold refresh paths and rotates revoked sessions back to anonymous.
If a regular API request sees a revoked uid-bearing session first, request context also returns an
anonymous user and sets a fresh anonymous `st` cookie for subsequent requests.

### Active Session Registry

The backend also persists an active-session registry in `user_sessions`, keyed by JWT `sid` and
partitioned `RANGE(id)` with a default partition only. `created_at` is derived from
`uuid_extract_timestamp(id)`, so the public API still returns creation time without a separate
mutable timestamp column. Login flows (`email OTP`, `OAuth`, `discoverable passkey`, and MFA
completion) insert or refresh the current session row with the current device/IP/user-agent
metadata. A missing current row invalidates an already-issued authenticated JWT; session listing
requires the durable row and never recreates it. `DELETE /api/v1/auth/sessions/:id` revokes a
single owned session, `POST /api/v1/auth/sessions/revocations`
revokes all of the current user's active sessions, and logout marks the current row revoked
alongside the Valkey revocation flag. `last_seen_at` advances on login, logout, revoke, and
warm/cold refreshes, but not on listing or the hot JWT verification path.

Browser refresh authority also has a session record, independent of the signed access claims.
That record preserves browser-key binding across every renewal path, including access-cookie
rotation and credential-completion replay. Losing the record requires sign-in instead of restoring
an unbound session from a device cookie. Access verification remains separate from key-possession
proof: DBSC controls renewal, not each ordinary request.
