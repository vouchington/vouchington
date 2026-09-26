# Request Validation

[Back to Sessions & Authentication API](README.md#request-validation)

Every route in this directory (and [`../auth/`](../auth/README.md)) that accepts a JSON body now
validates it against the generated `@voucha/api-fixtures/v1/request-contracts.json` schema via
`validateRequestContract` before running any service call. See
[`@services/runtime-request-validation`](../../../services/runtime-request-validation/README.md#security-boundary)
for the general ordering rule, including the public/optional-auth route ordering, and
[`backend/api/README.md`](../../README.md#route-helpers) for the adapter's call pattern. A malformed
body, an unrecognized top-level field, or a wrong-typed field returns `422` with a redacted
diagnostic. A protected route still returns a bare `401` for an unauthenticated caller regardless of
body shape, since `requireAuth` runs first; the schema is never checked before authentication.

## Precondition-then-schema ordering

Some routes accept a body where a field group is legitimately absent as a whole (an all-or-nothing
pair) but must match the generated shape exactly once any of those fields is present. For these, the
route's manual presence/pairing check runs first and pins its own status code for the absent or
partial case; the generated schema only runs once that precondition holds. Where the schema runs
relative to other manual checks (format/value checks, attempt-limit counters) varies by route — see
each bullet below. This pattern is used by:

- `POST /api/v1/auth/bluesky/link` / `POST /api/v1/auth/bluesky/link-completions` — the manual
  mode/field pairing checks run first (after `requireAuth`/`assertNotSuspended`); the schema check
  runs after them, rejecting only unrecognized top-level fields. See
  [Bluesky account linking](reference-bluesky-account-linking.md).
- `POST /api/v1/auth/oauth/:provider/authorizations` — the same manual-first, schema-once-paired
  ordering as the Bluesky routes above.
- `POST /api/v1/auth/logout` (in [`../auth/`](../auth/README.md)) — the all-or-nothing web-push
  binding pair is checked for presence first; the schema only runs once both fields are present, so
  the normal no-body logout (and a body with neither field) never reaches a schema built for the
  fully-supplied pair. Here the schema runs before the format-specific checks (HTTPS URL, UUID) that
  follow it, unlike the Bluesky and OAuth-authorizations routes above. `LogoutRequest` keeps both
  fields non-optional in the generated contract precisely so the pair stays enforced once supplied —
  do not loosen the type to "fix" a test that expects the schema to run unconditionally; move the
  call, not the contract.
- MFA verification routes with an attempt-limit counter (e.g. TOTP, passkey MFA) — the counter check
  runs before the schema check, so a caller that has already exhausted attempts sees the existing
  limit response rather than a schema diagnostic for a request that will be blocked regardless.

## Endpoints without a request-contract schema

- `GET /api/v1/auth/sessions`, `GET /api/v1/auth/passkeys`, and `GET /api/v1/auth/totp` carry no
  JSON body (list endpoints, query/path only). Each has a `query`-only entry in the generated
  operations map (from the route's own `apiQuery(...)` call, for OpenAPI documentation), but no
  route calls `validateRequestContract` for it — the query is parsed and validated manually
  (`createPaginationParser`/`totpParser`) instead.
- `GET /api/v1/auth/mfa/status` carries no JSON body and has no entry in the generated operations
  map at all.
- `GET /api/v1/auth/oauth/:provider/broker-callback` and `GET /api/v1/auth/bluesky/callback` are
  redirect-only provider callback targets. The former has only a `path` schema for `:provider`; the
  latter has no generated operation at all. Neither validates a query or body carrier.
- `PUT /api/v1/auth/oauth/:provider/connect` and `POST /api/v1/auth/oauth/:provider/continue`
  validate against a fully permissive `Record_string_unknown` schema (any JSON object, no property
  constraints) because the accepted body varies per OAuth provider. The schema still rejects a
  non-object body (array, `null`, primitive); it does not constrain provider-specific fields.

## WebAuthn `response` payloads

`POST /api/v1/auth/passkeys/authentication/verify`, `POST /api/v1/auth/passkeys/registration/verify`,
and `POST /api/v1/auth/mfa/passkeys/authentication/verification` type the WebAuthn `response` field
as `unknown` in the route handler. The compiler's implicit-harvest extraction generates an
unconstrained (`{}`) schema for any field typed `unknown`, so only the sibling top-level keys
(`name` for registration, `login_attempt_id` for the MFA challenge) are schema-constrained together
with the presence of `response` itself — the nested WebAuthn assertion/attestation object has no
shape constraints. This is intentional: real authenticators vary the exact fields inside that object
(extension outputs, `authenticatorAttachment`, etc.), and constraining it risks rejecting valid
responses. Confirmed against the generated schema, not assumed: all three operations resolve to
`additionalProperties: false` at the top level with `response: {}`.

## Cross-repo client verification

Web (`web/lib/api/client/**`), Swift (`swift-clients/core/Sources/VouchaAPI/Endpoint+Auth.swift`,
`APIClient+Session.swift`), and .NET (`Voucha.Client.Core/Api/VouchaApiEndpoints.Auth.cs`,
`ApiEndpointBodies.cs`, `ClientMetadataHandler.cs`) client payloads for session bootstrap
(`PATCH`/`DELETE /api/v1/session`), email OTP request/login, MFA TOTP verification, and passkey
authentication verify were checked against the generated schemas above and send only accepted
fields. Notably, `EmailAddressTokenBody`/`EmailAddressLoginBody` accept both `camelCase` and
`snake_case` aliases for the same logical field because real traffic uses both: Swift's
`Endpoint` applies `JSONEncoder.KeyEncodingStrategy.convertToSnakeCase` (so it sends
`email_address`/`cf_turnstile_response`/`ui_locale`), while the .NET client sends explicit
`JsonPropertyName`s that are `camelCase` for some fields (`emailAddress`, `cfTurnstileResponse`) and
`snake_case` for others (`ui_locale`, `login_attempt_id`). The native clients do not currently call
the TOTP self-service management routes (`POST`/`GET /api/v1/auth/totp`,
`POST /api/v1/auth/totp/setup/verification`, `PATCH`/`DELETE /api/v1/auth/totp/:id`) or the passkey
registration routes — those are web-only today, so only the web-client check above applies to them.
