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
membership authority. Refresh checks revocation and reloads the current user before issuing access.

Authenticated tokens carry a signed client classification. Web tokens also bind to the original
user-agent string. Refresh and request authentication enforce that binding independently of the
client headers a caller declares. A changed user agent requires sign-in again. This is a consistency
check, not cryptographic proof of a browser or protection against a caller copying the same user
agent. Device-bound proof is a separate capability.

Web login and refresh deliver credentials through HTTP-only cookies. Browser JSON contains session
metadata without raw tokens. The Next.js proxy forwards the original browser user agent and uses
the backend's `Set-Cookie` response to renew cookies. Browser API calls may refresh once after an
`AUTH_REQUIRED` rejection; user-agent mismatch errors are not retried. Native clients retain their
native token transport and lifetime. Declared native client metadata alone is not attestation.

Cookie attributes and token audiences remain centralized in the shared session package. Device and
session token audiences differ, and API authentication requires matching device/session identity.
Logout revokes web refresh authority even after its access cookie has expired, then removes or
rotates both credentials. See [CSRF Protection](../../requirements/security/CSRF.md) for the browser
request boundary and [App Attest](app-attestation.md) for attested devices.

JWT cryptography and key validation come from `@vouchington/session-jwt` in both backend and
Worker runtimes. The shared app adapter owns Voucha issuers, audiences, payload policy and
environment bindings; session storage, pairing and refresh remain application concerns. Rotation
keeps usable public keys available even when an unrelated configured candidate cannot be imported.
