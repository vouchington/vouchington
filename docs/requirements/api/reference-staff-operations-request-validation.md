# Staff, admin, and operations request validation

[Back to Request validation](reference-request-validation.md)

Staff, admin, moderation, integrity, membership, image, crawler, and operations routes validate their
path, query, and body with `validateRequestContract` after authentication, the role or ownership
gate, and suspension checks, and before the first service or queue call. An anonymous malformed
request keeps a bare `401` with no schema diagnostic; a caller without the role keeps `403`; only a
permitted caller sees the `422`. Ordering tests live beside each family:
`admin/staff-request-validation.test.mts`, `admin/staff-query-validation.test.mts`,
`reports/__tests__/moderation-request-validation.test.mts`,
`memberships/__tests__/request-validation.test.mts`, and `images/__tests__/request-validation.test.mts`
under `backend/api/v1/`. The moderation, integrity, and operations families
(`users/__tests__/moderation-request-validation.test.mts`, `report-integrity`, `vote-integrity`,
`topic-recommendations`, `curated-aside-items`, `blacklist`, `mq`, `urls`, `fediverse`,
`dynamic-config`, and the `appeals`, `disputes`, and `reports` query suites) keep the same shape: a
malformed anonymous or non-staff call answers `401` or `403` with no diagnostic, a malformed staff
call answers a bounded `4xx`, and a valid call keeps its behavior. Most suites register their cases
through the shared `backend/test-helpers/staff-request-contract-matrix.mts` registrar, which asserts
only the three statuses and the absence of a schema diagnostic for anonymous and non-staff callers.
Validation runs before the first service or queue call by construction; the suites assert that
nothing changed only for the routes named under [Side effects](#side-effects). Compiler-built carrier and schema
assertions live in `staff-request-contract-coverage.mts` and
`moderation-operations-request-contract-coverage.mts` next to the
[API fixtures](../../../backend/test-helpers/api-fixtures/openapi/write-request-contracts.test.mts).

## Behavior changes

Route-local shape checks that used to answer `400` are replaced by the generated contract, which
answers `422`. Semantic checks (trim, length, range, cross-field, existence) keep their statuses.
Typed request DTOs are closed, so a body with an unknown key or a value of the wrong type that a
handler used to accept now answers `422` on every route below that reads a JSON body.

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
  `amount > 0`, note length, and "charge or payment intent" stay `400`. A blank or whitespace-only
  `invoice_id` is `400` (`invoice_id must not be blank`) before any Stripe call.
- `POST /psql/jobs`, `POST /valkey/flush`, `/valkey/caches/clear`, `/valkey/bloom-filters/rebuild`:
  an unknown `type`, `concern`, `filter`, or a missing `group` is `422`.
- `POST /admin/users/:userId/identity-verification-attempts`: a non-object body is `422`; a blank
  `note` stays `422`.
- `PUT /stories/:storyId/official`: an invalid `rss_feed_item_id` is `422`; an item outside the
  story stays `400`.
- `PATCH /stories/:id`: a non-string `title` is `422`; an empty or over-long title stays `400`.
  The route parameter was renamed from `:storyId` to keep same-shape route registrations consistent.
- `GET /posts/:postId/disputes`: a non-staff caller now gets `403` before the UUID check.
- Already `422` and now contract-backed: topic-claim rejection and revocation, RSS category
  assignments and rejections, appeal and dispute resolution, annotation removal, batch annotation
  lookup, membership purchase intents and verifications.

### Moderation, integrity, and operations routes

`400` to `422` (a shape failure the route used to answer with a local `400`):

- `POST /curated-aside-items`, `PUT /curated-aside-items/order`: a body that is not an object, a
  missing or non-string `aside_type` or `entity_id`, or a non-array `item_ids`. A blank value, an
  unknown aside type, a malformed UUID, a duplicate id, and a non-integer `position` keep their
  statuses.
- `PATCH /dynamic-config/namespaces/:namespace`: a missing, null, array, or scalar `config` (was
  `400 Missing config object`), and an unknown top-level key. The namespace lookup (`404`) and role
  gate still run first, and field-schema failures stay `400`.
- `POST /blacklist/source-sync`: a body that is not an object, a missing `sourceId`, or a `sourceId`
  that is neither a string nor a number. A non-positive or non-integer `sourceId` stays `400`.
- `PUT /users/:userId/vote-weight`: a non-number `weight`. A number outside the allowed range stays
  `400`.

`500` to a bounded `4xx` (a caller input that used to fail inside the handler):

- `PUT` and `DELETE /users/:userId/vote-weight` with a non-UUID `userId` are now `422` through
  `validateUUIDParam`.
- `GET /appeals` and `GET /disputes` with a fractional `limit` (for example `1.5`) is now `422`.
  The pagination parser accepted the value and the SQL layer rejected it.

`200` to `422` (input the handler used to accept and ignore or misread):

- Closed typed bodies: `POST /moderation/reveals`, `PATCH /report-integrity/flags/:id`,
  `PATCH /vote-integrity/flags/:id`, `POST /users/:userId/mod-notes`,
  `PUT /users/:userId/suspension` (a non-string `reason` used to be silently dropped),
  `POST /topic-recommendations`, `PATCH /topic-recommendations/:id`,
  `POST /topic-recommendations/:id/rejections`, `POST /blacklist/source-sync`,
  `POST /fediverse/instances`, `POST /fediverse/instances/:id/integration-changes`, and
  `PATCH /dynamic-config/namespaces/:namespace` reject an unknown key or a wrong-typed field.
- `PATCH /report-integrity/flags/:id` with `resolution: "penalized"` keeps a specific `422` that names
  `POST /api/v1/report-integrity/flags/:id/penalties`, because the contract enum only allows
  `dismissed`. `PATCH /vote-integrity/flags/:id` accepts `dismissed`, `penalized`, and `suspended`,
  so it needs no hint.

`POST /report-integrity/flags/:id/penalties`, `POST /vote-integrity/flags/:id/penalties`, and
`POST /topic-recommendations/:id/approvals` read no request body, so they validate only the path and
never answered `200` to a malformed body that this change now rejects. A body sent to them is
ignored, as before.

Same status, different order:

- `GET /reports` runs its filter contract before the cursor decode. Every cursor error was already
  `422`.
- A malformed or repeated id filter (`community_id`, `actor_user_id` on the modlog, `cluster` on reports,
  `verification` on OAuth clients, `mapping` on top hashtags) was already `422` and is now the
  contract's `422`. A repeated `q` on top hashtags is still ignored.

Lenient inputs stay `200` (the schema validates the settled value, so it cannot fail): an oversized
`limit` clamps, an unknown enum for a documented fallback (`range`, `status`, `sort`, `mine`,
`action_type`) falls back to its default, and unknown keys are ignored. Malformed or out-of-range
`limit` and `after` on the paginated routes keep the parser's `400` (or the route's existing `422`).

Fediverse search keeps its limits: authenticated callers clamp to `100` and anonymous callers to
`25`; a fractional `limit` is truncated. The published `limit` maximum is `100` and its description
notes the anonymous cap.

## Query carriers

Every query carrier on these routes goes through the generated contract, with `apiQuery` declared
inside the handler. Integer and paginated values are not coerced by the registry, so a route that
owns a pagination parser follows this order:

1. authenticate and check the role;
2. run the route's pagination parser (its `400`, clamping, and cursor answers are unchanged);
3. `prepareQueryForValidation(ctx.query, parser.queryContract)`, then overwrite `limit` and `after`
   with the parsed values;
4. `validateRequestContract`.

`backend/api/validate-paginated-query.mts` implements steps 2 to 4 for the list routes
(`parseAndValidatePaginatedRequest`). `GET /appeals` and `GET /disputes` read their filters
leniently instead, and share `backend/api/case-list-query-helpers.mts`: unreadable limits and
unknown statuses settle to the defaults before the contract runs, and the helper also owns the
cursor decode and `page_info` envelope for those two lists. Routes with a bespoke limit (`mod-notes`, fediverse search,
`currencies`) validate the settled value the same way. Routes with no response contract wrap the
existing payload in `apiResponse(...)` (an identity) so `apiQuery` applies; the response fixtures for
`GET /memberships/refundable-charges` and `GET /rss-feed-categories` were added for that reason.

The eleven routes previously skipped are validated: `GET /appeals`, `/disputes`, `/reports`,
`/admin/ai-costs`, `/admin/modlog`, `/posts/review-queue`, `/rss-feed-categories`,
`/growth-metrics`, `/admin/moderation-analytics`, `/memberships/refundable-charges`, and
`/admin/oauth-clients` (which had no remaining reason to skip once query preparation existed).

## Carriers the generated schema does not check

- `POST /topic-recommendations`: the `Idempotency-Key` header is declared in the generated contract
  but not passed to `validateRequestContract`. The contribution admission layer answers a malformed
  key with its own coded `400`, which is the documented status.
- `GET /report-integrity/flags`, `/report-integrity/penalties`, `/vote-integrity/flags`, and
  `/vote-integrity/penalties` (the list routes) have no request contract and are not covered here.

Path parameters are generated as plain strings without a UUID format, so each UUID route keeps
`validateUUIDParam` (or `isUUID`) before the path-only contract call. Path-only contracts cannot
reject anything the router already accepts; they document the carrier and are covered by the
routes' existing behavior tests. This covers the five `mq` actions, the id-only `GET` and `DELETE`
routes, and `POST /urls/:id/crawl`, which asserts `currentUserCanTriggerCrawl` before the path
contract.

## Side effects

The matrix registrar asserts statuses only. These suites also assert that a malformed request changed
nothing, then that a valid one still works:

- `PATCH /report-integrity/flags/:id` (including `penalized`) and `PATCH /vote-integrity/flags/:id`
  leave the flag unresolved (`report-integrity/request-validation.test.mts`,
  `vote-integrity/request-validation.test.mts`).
- `PUT /users/:userId/suspension`, `PUT /users/:userId/vote-weight`, and
  `POST /users/:userId/mod-notes` leave the user unsuspended, the vote weight unset, and the note
  list empty (`users/__tests__/moderation-request-validation.test.mts`).
- `PUT /curated-aside-items/order` keeps the previous order
  (`curated-aside-items/request-validation.test.mts`).
- `PATCH /dynamic-config/namespaces/:namespace` writes no audit row
  (`dynamic-config/request-validation.test.mts`).
- `POST /memberships/refunds` with a blank `invoice_id` calls no Stripe API and writes no refund
  (`memberships/refund.test.mts`).
- `PUT /admin/classifiers/:classifierId/candidates/:candidateId/threshold` and its `/rollback`
  answer a malformed body with `422` and write no revision, so the active threshold and the
  revision history stay as they were (`admin/classifiers/thresholds.test.mts`).

The other cases in the matrix (blacklist, `mq`, URL crawl path checks, and the rest) assert the
status and the absent diagnostic, not the absent side effect.

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

Ownership follows the route directory. Routes outside the families above that still read a carrier
without the adapter (for example lists, households, hostnames, attribution, landing-page clicks, app
attestation, and markdown) belong to the remaining public and inbound classification. `my/**`,
`mcp/**`, API keys, and copyright routes have their own owners. No Stripe webhook route exists under
`backend/api`; Stripe events arrive through the `stripe-events-sqs` worker.
`POST /memberships/microsoft-store/service-tickets` reads no carrier and ignores the empty JSON
object the native clients send.

Known latent failure, not changed here: `PUT /users/:userId/suspension` accepts a username as the
route id through `getPrivateUserByAny`, and `ensureUserSuspendedInTransaction` then compares it with
a UUID column, which fails as a `500`. Web callers always send the UUID.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client bodies (`web/lib/api/client/**`) send only accepted fields, including `cf_turnstile_response`
on report, appeal, and dispute creation. The moderation and operations callers were checked the same
way and send nothing the new schemas reject: moderator notes (`{body, community_id?}`), media reveals
(`{postId?, reportId?, surface}`), suspension, vote weight, curated aside items, integrity `PATCH`,
topic recommendations, dynamic config, `mq` actions, URL crawl, fediverse search (`q`, `providers`,
`type`, `limit`, `after`), the RSS feed category list, and refundable charges (`?user_id=`). No web
caller exists for the blacklist or the fediverse instance `POST` routes.

The Swift and .NET request builders in `vouchington-clients` at `5c4acb6` (`main`,
`feat(ci): cache the pnpm store for native contract installs (#162)`, 2026-09-21; the repository
has no pin file) were checked read-only with `git show` and `git grep`. For report, appeal, dispute,
membership grant, purchase-intent, verification, refund, portal, image upload, warning,
identity-verification, psql, and valkey requests, each sends a subset of the schema keys, and both
encoders omit null optionals. For the moderation and operations routes above:

- **Integrity `PATCH`:** `Endpoint+ModerationIntegrity.swift` sends only `{resolution: "dismissed"}`
  for a report-integrity flag and `{resolution}` for a vote-integrity flag. In
  `VouchaApiEndpoints.ModerationOps.cs`, `ResolveReportIntegrityFlagBody` is `Dismissed`-only. Neither
  client sends `penalized`. Both penalties `POST` routes are sent with no body.
- **Media reveals:** `Endpoint+ModerationOps.swift` (surface raw values in `ModerationOpsModels.swift`)
  and `ApiEndpointBodies.ModerationParity.cs` send `{postId?, reportId?, surface}`, with `surface` one
  of `mod_queue`, `review_queue`, `reports`, `post_page`: the server enum.
- **Dynamic config:** `Endpoint+DynamicConfig.swift` and `VouchaApiEndpoints.DynamicConfig.cs` send
  `{config: {...}}` only.
- **Topic recommendations:** the Swift create and edit bodies
  (`Endpoint+UserFacing.swift`, `NativeTopicRecommendationViewModel+Mutations.swift`) use only keys
  that are in the closed `CreateTopicRecommendationInput` schema, and the edit body omits
  `cf_turnstile_response`, which `Partial_CreateTopicRecommendationInput` does not define. The .NET
  client has read requests only. Value types (for example the array fields) were not compared.
- **Operations calls:** the `mq` action and URL crawl `POST` routes are sent with no body in both
  clients (`Endpoint+EngineeringOps.swift`, `Endpoint+DomainsUrls.swift`,
  `VouchaApiEndpoints.Engineering.cs`, `VouchaApiEndpoints.WebSearch.cs`).
- **Queries:** fediverse search (`q`, `providers`, `type`, `limit`, `after`), top hashtags (`q`,
  `mapping`, `limit`, `after`), AI costs (`limit`, `after`), and growth metrics (`range`) send only the
  query keys the contracts declare, as do the Swift modlog, moderation analytics, transparency, and
  review queue builders (`Endpoint+ModerationOps.swift`). Keys were compared; values were not.
- **No native builder:** neither client has a request for mod notes, user suspension, vote weight,
  curated aside items, blacklist source-sync, fediverse instance creation or integration changes,
  topic-recommendation approvals or rejections, RSS feed categories, or refundable charges, so those
  routes are not verified against native callers.

No client branches on the changed `400` statuses or on server messages; the native handlers test a
`400`-`499` range. The check is a point-in-time read of `5c4acb6` and does not cover later client
changes.
