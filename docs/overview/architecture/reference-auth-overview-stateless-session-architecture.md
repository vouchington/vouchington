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
