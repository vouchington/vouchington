# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Web Client Auth Boundary

The root server component resolves the private user once, then projects it before crossing into
client components. `AuthProvider` receives only the user ID, roles, and the derived `account_type`
(`official`, `system`, `ai_agent` or `null`). It must not receive the private API `User` shape or
expose client-side user mutation.

UI that needs other account data receives a dedicated narrow view model. The root shell separately
projects profile-menu identity and suspension notice data, while settings pages pass only their
form-specific initial fields to client forms. Server components should continue using the cached
`getCurrentUser()` or `requireCurrentUser()` helpers.

## Tokens

Browser authentication separates request authority from refresh authority. The short-lived `st`
credential authenticates API requests; the longer-lived `dt` can refresh the same web session after
its access cookie expires. The refresh credential carries identity and binding, never role or
membership authority. Refresh checks durable revocation and updates current claims under the
service’s staleness and deadline policy.

Authenticated tokens carry a signed client classification. Browser credentials bind to browser
family and platform, preserving normal version updates. Optional JA4 binding uses only authenticated
Worker metadata and is skipped when that metadata is absent. A mismatch clears cookies and makes
the request anonymous; renewal failures lead to login. These checks constrain copied credentials
without proving the browser's identity. Only verified App Attest devices receive native lifetimes;
declared native metadata selects JSON transport alone.

PostgreSQL stores the current device credential digest, encrypted replay credential, original
issuance time, binding, expiry and revocation. Ordinary renewal rotates the credential under a row
lock while preserving its original expiry and identity. Reusing an old credential revokes the
session. Authentication checks durable state after a revocation-cache miss so cache loss cannot
restore a revoked session.

Web login delivers credentials through HTTP-only cookies and returns metadata in JSON. The Next.js
proxy forwards the original user agent but never rotates authenticated credentials during SSR.
Request-local enrichment preserves claim invalidation while leaving signed identity, assurance and
credential expiry unchanged.
Expired navigation hands off to browser renewal; browser callers serialize renewal across tabs
with Web Locks and share one pending request in each tab. A browser that cannot acquire this lock
recovers through login. This avoids racing old credentials against strict reuse detection.

Hardware attestation alone does not authenticate a user. The first native upgrade must retain the
caller's live session authority through its replacement: if logout or another revocation wins
while hardware proof is being checked, the caller must sign in again.

Chrome can additionally bind renewal to its own key. PostgreSQL retains that binding with the
session, while Valkey holds only single-use challenges. Browser-managed ceremonies can omit
application metadata and origin headers, so their exact ingress exceptions retain device/key
authorization. Key loss and terminal renewal failure lead to sign-in; logout remains available
and asks Chrome to discard its binding. See the [session architecture](reference-auth-overview-stateless-session-architecture.md).

Cookie attributes and token audiences remain centralized in the shared session package. Device and
session token audiences differ, and API authentication requires matching device/session identity.
Logout revokes web refresh authority even after its access cookie has expired, then removes or
rotates both credentials. See [CSRF Protection](../../requirements/security/CSRF.md) for the browser
request boundary and [App Attest](app-attestation.md) for attested devices.

JWT cryptography and key validation come from `@vouchington/session-jwt` in both backend and
Worker runtimes. The shared app adapter owns Voucha issuers, audiences, payload policy and
environment bindings; session storage, pairing and refresh remain application concerns. Rotation
keeps usable public keys available even when an unrelated configured candidate cannot be imported.
