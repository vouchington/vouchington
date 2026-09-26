# Auth API

User authentication endpoints including login, logout, session management, provider-based OAuth,
and email OTP.

## Endpoints

| Method | Route                                   | Authentication         | Description                                      |
| ------ | --------------------------------------- | ---------------------- | ------------------------------------------------ |
| POST   | `/api/v1/auth/logout`                   | Cookie-based           | Logout and clear session                         |
| GET    | `/api/v1/auth/me`                       | Cookie-based           | Get current user                                 |
| PUT    | `/api/v1/auth/oauth/:provider/connect`  | Required               | Connect an OAuth account                         |
| DELETE | `/api/v1/auth/oauth/:provider/connect`  | Required               | Disconnect an OAuth account                      |
| POST   | `/api/v1/auth/oauth/:provider/continue` | None (unauthenticated) | Login via OAuth                                  |
| POST   | `/api/v1/auth/bluesky/link`             | Required               | Begin AT Protocol account linking                |
| GET    | `/api/v1/auth/bluesky/callback`         | Required               | AT Protocol authorization-server redirect target |
| DELETE | `/api/v1/auth/bluesky/link`             | Required               | Unlink the current user's Bluesky account        |
| POST   | `/api/v1/auth/email-address/tokens`     | None                   | Request email OTP                                |
| POST   | `/api/v1/auth/email-address/login`      | None                   | Login with email OTP                             |

## POST /api/v1/auth/logout

Clears authentication cookies and revokes uid-bearing sessions in the backend. Anonymous cookie
pairs are cleared without writing a revocation marker.

**Response:** `204 No Content`

**Rate limiting:** Exempt. Users must always be able to end their current session.

**Optional request:** `{ "web_push_endpoint": "https://…", "web_push_subscription_id": "uuid" }`.
The fields are all-or-nothing and deactivate only the authenticated user's exact current push
generation before session revocation; absent bindings preserve the existing no-body logout contract.
Concurrent exact bindings admitted before revocation clean once; bindings first submitted after the
revocation fence are no-ops. Once both fields are present, the body is checked against the generated
contract (rejecting an unknown field or a wrong-typed field with `422`) before the URL/UUID-specific
checks; see
[Request Validation](../sessions-authentication/reference-request-validation.md#precondition-then-schema-ordering).

## GET /api/v1/auth/me

Returns the current authenticated user, or `401 Unauthorized` if not logged in.

## PUT /api/v1/auth/oauth/:provider/connect

Connects an OAuth account for the given provider to the currently authenticated user.

**Request:** Provider-specific OAuth payload from the client flow. Validated after `requireAuth`
against a permissive `Record_string_unknown` contract (any JSON object; the provider payload shape
is not further constrained) — see
[Request Validation](../sessions-authentication/reference-request-validation.md#endpoints-without-a-request-contract-schema).

## DELETE /api/v1/auth/oauth/:provider/connect

Disconnects the OAuth account for the given provider from the currently authenticated user.

**Response:** `204 No Content`

## POST /api/v1/auth/oauth/:provider/continue

Logs in or creates an account using the provider's OAuth payload. Only for unauthenticated users.

**Request:** Provider-specific OAuth payload from the client flow. Validated against the same
permissive `Record_string_unknown` contract as `PUT connect` above, after the route's existing
rate-limit check and before `continueOAuthFlow`.

**Response:** Sets auth cookies. Returns user info.

## POST /api/v1/auth/bluesky/link

Begins the AT Protocol OAuth flow for the given Bluesky handle, linking it to the currently
authenticated user. Unlike `PUT /api/v1/auth/oauth/:provider/connect`, which is a popup-based flow,
Bluesky account linking is a full-page redirect — this route returns the authorization URL as JSON
(an authenticated same-origin call) for the frontend to navigate to via `window.location.assign()`,
rather than issuing a redirect itself. See
[`../../bluesky/README.md`](../../bluesky/README.md) for the client-metadata document this flow
depends on.

**Request:** `{ "handle": "alice.bsky.social", "callback_mode": "web" | "native" }`.
`callback_mode` defaults to `web`.

**Response:** `{ "redirect_url": "https://bsky.social/oauth/authorize?..." }`
Native starts also return `flow_id`.

**Errors:** `422` for an unrecognized field (checked after `requireAuth`/`assertNotSuspended` and
after the checks below — see
[Request Validation](../sessions-authentication/reference-request-validation.md#precondition-then-schema-ordering)).
`400` if `handle` is missing, blank, or wrong-typed, or if `callback_mode` or
`completion_proof_challenge` is invalid. `409` if the current user already has a Bluesky
account linked.

## GET /api/v1/auth/bluesky/callback

The AT Protocol authorization server's redirect target, completing the OAuth flow started by
`POST /api/v1/auth/bluesky/link`. Redirect-only: no request-contract schema applies (see
[Request Validation](../sessions-authentication/reference-request-validation.md#endpoints-without-a-request-contract-schema)).
This path is fixed by `getBlueskyRedirectUri()` (baked into the
client-metadata document Bluesky validates `client_id`/`redirect_uris` against at authorize time)
and cannot be moved. The session cookie is available on this top-level redirect through its
`SameSite=Lax` policy. The callback requires that session, rejects a suspended user before calling
the AT Protocol SDK, and cross-checks the authenticated user against the flow's stored app state.

**Response:** Always a `302`, never JSON. Web flows redirect to `/my/identity`; native flows use the
fixed `voucha://auth/bluesky/callback` URI with `flow_id` and a one-time `completion_token`, or
`bluesky_error`. Web success uses `?bluesky=linked`. Web failure uses
`?bluesky_error=<code>`, one of `invalid_request` (400), `session_expired` (404),
`not_logged_in` (401), `account_suspended` (coded 403), `session_mismatch` (other 403),
`already_linked` (409, the DID is already linked to a different user), or `unknown`. Unexpected
(non-4xx) failures are still reported to Sentry through `onError`; the 302 shape does not change.

## POST /api/v1/auth/bluesky/link-completions

Finalizes a native flow for the authenticated initiating user.

**Request:** `{ "flow_id": "<uuid>", "completion_token": "<one-time token>" }`

**Response:** `204 No Content`. Expired, invalid, or replayed tokens return `404`; an owner mismatch
returns `403`.

## DELETE /api/v1/auth/bluesky/link

Unlinks the current user's Bluesky account: revokes the AT Protocol session and deletes the
`bluesky_linked_accounts` row.

**Response:** `204 No Content`

**Errors:** `404` if the current user has no Bluesky account linked.

## POST /api/v1/auth/email-address/tokens

Sends an OTP to the provided email address.

**Request:** `{ "email_address": "user@example.com" }`

**Delivery:** The transactional email contains a CTA button plus the full
`/login?emailAddress=...&otp=...` URL so the web login page can prefill the email/token and
auto-submit the verification step.

**Rate limiting:** 2 tokens per minute per email/IP/device/session.

**Errors:** `422` for an unrecognized field or wrong-typed value, checked after the rate limit and
honeypot checks below and before sending the OTP. `emailAddress`/`cfTurnstileResponse`/`uiLocale`
are accepted as aliases for `email_address`/`cf_turnstile_response`/`ui_locale` (both native clients
and the web client use different casings for the same fields).

**Honeypot:** If `hp_website` or `hp_phone` fields are non-empty, returns a fake `200 { email_address }` without creating a real token (bot detection — see [`@services/honeypot`](../../../services/honeypot/README.md)).

## POST /api/v1/auth/email-address/login

Verifies the OTP and logs in (or creates) the user.

**Request:** `{ "email_address": "user@example.com", "token": "ABCDEF12" }`

The route also accepts `otp` as an alias for `token`.

**Response:** Sets auth cookies. Returns full session info.

**Honeypot:** If `hp_website` or `hp_phone` fields are non-empty, returns `401` (same as invalid token) without verifying credentials.

## Performance

| Endpoint                          | Round Trips | Caching      | Notes                                                                                                                                    |
| --------------------------------- | ----------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| POST /api/v1/auth/logout          | 2           | None (write) | Exempt from route rate limits; revokes uid-bearing row + Valkey, skips anon markers                                                      |
| POST /api/v1/auth/bluesky/link    | 2           | None (write) | 1 DB read (existing-link check) + 1 AT Protocol PAR request (`beginBlueskyAccountLink`)                                                  |
| GET /api/v1/auth/bluesky/callback | 3           | None (write) | Required session and suspension guard, then 1 AT Protocol token exchange + Valkey session read + DB write (`completeBlueskyAccountLink`) |
| DELETE /api/v1/auth/bluesky/link  | 2           | None (write) | 1 DB read + 1 AT Protocol session revocation (`disconnectBlueskyAccountFromUser`)                                                        |

## Related

- Sessions: [../sessions-authentication/README.md](../sessions-authentication/README.md)
- Bluesky client metadata: [../../bluesky/README.md](../../bluesky/README.md)
- Error handling (callback reporting): [Error Handling](../../../../docs/overview/architecture/error-handling.md#propagation-chain)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
