# Staff, admin, and operations request validation

[Back to Request validation](reference-request-validation.md)

Staff, admin, moderation-intake, membership, image, crawler, and operations routes validate their
path and body with `validateRequestContract` after authentication, the role or ownership gate, and
suspension checks, and before the first service call. An anonymous malformed request keeps a bare
`401` with no schema diagnostic; a caller without the role keeps `403`; only a permitted caller sees
the `422`. Ordering tests live beside each family:
`admin/staff-request-validation.test.mts`, `reports/__tests__/moderation-request-validation.test.mts`,
`memberships/__tests__/request-validation.test.mts`, and `images/__tests__/request-validation.test.mts`
under `backend/api/v1/`. Compiler-built carrier and schema assertions live in
`staff-request-contract-coverage.mts` next to the [API fixtures](../../../backend/test-helpers/api-fixtures/openapi/write-openapi.test.mts).

## Behavior changes

Route-local shape checks that used to answer `400` are replaced by the generated contract, which
answers `422`. Semantic checks (trim, length, range, cross-field, existence) keep their statuses.

- `POST /imports/topics`: a missing or non-string `csv` is `422`.
- `PUT /crawlers/referral-program`, `PATCH /crawlers/:id`: a missing or malformed `hostname_id`,
  `referral_program_id`, `crawler_type`, or selector array is `422`. The `PATCH` route now applies
  the edit gate (`currentUserCanEditCrawler`) before reading the body, so a non-editor sees `403`
  first; the service keeps its own guard.
- `POST /images/upload-url`: a missing or non-numeric `content_type` or `content_length` is `422`.
- `POST /membership-grants`: a missing or invalid `user_id`, `plan`, `sku_id`, or non-numeric
  `duration_days` is `422`. The `duration_days` range stays `400`.
- `POST /memberships/billing-portal-sessions`: a missing `return_url` is `422`; a non-relative one
  stays `400`.
- `POST /memberships/refunds`: every shape failure is `422`, including negative, fractional,
  scaled, or unsupported-currency money (`{amount: integer >= 0, currency: aud|cad|eur|gbp|jpy|usd}`).
  `amount > 0`, note length, and "charge or payment intent" stay `400`.
- `POST /psql/jobs`, `POST /valkey/flush`, `/valkey/caches/clear`, `/valkey/bloom-filters/rebuild`:
  an unknown `type`, `concern`, `filter`, or a missing `group` is `422`.
- `POST /admin/users/:userId/identity-verification-attempts`: a non-object body is `422`; a blank
  `note` stays `422`.
- `PUT /stories/:storyId/official`: an invalid `rss_feed_item_id` is `422`; an item outside the
  story stays `400`.
- `PATCH /stories/:id`: a non-string `title` is `422`; an empty or over-long title stays `400`.
  The route parameter was renamed from `:storyId` because OpenAPI merges same-shape paths.
- `GET /posts/:postId/disputes`: a non-staff caller now gets `403` before the UUID check.
- Already `422` and now contract-backed: topic-claim rejection and revocation, RSS category
  assignments and rejections, appeal and dispute resolution, annotation removal, batch annotation
  lookup, membership purchase intents and verifications.

## Carriers the generated schema does not check

A query carrier is skipped, with an inline `Intentional carrier skip` comment, when it holds an
integer `limit` (`ctx.query` carries raw strings and the registry does not coerce) or when the route
has no registered response contract, which `apiQuery` requires.

- `GET /appeals`, `/disputes`, `/reports`, `/admin/ai-costs`, `/admin/modlog`, `/posts/review-queue`,
  `/rss-feed-categories`: integer `limit`; the shared pagination parsers clamp and reject cursors.
- `GET /growth-metrics`, `/admin/moderation-analytics`: no response contract; an unknown `range`
  falls back to `30d` as documented.
- `GET /memberships/refundable-charges`: no response contract; `user_id` is checked locally
  (`400` when missing, `422` when not a UUID) after the administrator gate.

Path parameters are generated as plain strings without a UUID format, so each UUID route keeps
`validateUUIDParam` (or `isUUID`) before the path-only contract call. Path-only contracts cannot
reject anything the router already accepts; they document the carrier and are covered by the
routes' existing behavior tests.

## Specialized ingress

These routes keep a dedicated parser and are not routed through the JSON adapter. Each named
exclusion has a parser-boundary test.

| Route                                             | Parser and reason                                                                     | Boundary test                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /admin/mcp`                                 | MCP SDK JSON-RPC envelope, not an HTTP DTO; the audit is owned by the MCP work        | `admin/mcp.request-boundary.test.mts`                      |
| `POST /memberships/apple-app-store/notifications` | Apple JWS verifier over `signedPayload`; wrong shape is `400`                         | `memberships/__tests__/apple-notifications.test.mts`       |
| `POST /memberships/google-play/notifications`     | OIDC bearer checked before the body, then the re-serialized raw envelope; `401`/`503` | `memberships/__tests__/google-play-notifications.test.mts` |
| `POST /email-unsubscribe`                         | RFC 8058 one-click: form-encoded `List-Unsubscribe=One-Click`, token in query or body | `my/__tests__/email-preferences.test.mts`                  |
| ActivityPub inbox (outside v1)                    | Digest and HTTP Signature over the raw body                                           | `backend/api/activitypub/inbox.test.mts`                   |
| OAuth protocol endpoints (outside v1)             | Form-encoded RFC 6749 parameters with protocol error bodies                           | `backend/api/oauth/token-protocol.test.mts`                |

## Residual routes

Ownership follows the route directory. Routes outside `admin`, `appeals`, `disputes`, `reports`,
`memberships`, `images`, `crawlers`, `psql`, and `valkey` that still read a carrier without the
adapter (for example users, lists, households, hostnames, mq, dynamic-config, vote and report
integrity, curated aside items, attribution, landing-page clicks, app attestation, markdown,
fediverse, moderation exposure, and topic recommendations) belong to the remaining public and
inbound classification. `my/**`, `mcp/**`, API keys, and copyright routes have their own owners.
No Stripe webhook route exists under `backend/api`; Stripe events arrive through the
`stripe-events-sqs` worker. `POST /memberships/microsoft-store/service-tickets` reads no carrier and
ignores the empty JSON object the native clients send.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client bodies (`web/lib/api/client/**`) send only accepted fields, including `cf_turnstile_response`
on report, appeal, and dispute creation. The Swift and .NET request bodies in
`vouchington-clients` (`5c4acb6`) were checked route by route for report, appeal, dispute, membership
grant, purchase-intent, verification, refund, portal, image upload, warning, identity-verification,
psql, and valkey requests: each sends a subset of the schema keys, and both encoders omit null
optionals. No client branches on the changed `400` statuses or on server messages; the native
handlers test a `400`-`499` range.
