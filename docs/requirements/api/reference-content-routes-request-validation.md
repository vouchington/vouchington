# Content, list, household and public user route request validation

[Back to Request validation](reference-request-validation.md)

These routes validate their declared path, query, body and header carriers with
`validateRequestContract` after authentication and authorization and before the service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated
contract mechanics. This page records which operations are covered, which are skipped, and which
status each malformed input keeps or changes.

Unauthenticated malformed calls keep returning 401 with no schema diagnostic. A 422 names only the
carrier (`Invalid request body` or `Invalid request query`).

## Validated operations

| Group                          | Operations                                                                                                                                 | Contract                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Votes                          | `PUT`/`DELETE` vote on agent moderations, entity relations, hostnames and `users/:id/vouch-vote`; `GET` votes on the first three           | Closed `{choice}` body; `after`/`limit` query. The shared vote handler validates after the entity lookup by design.                  |
| Attestation and attribution    | `POST app-attestation/attest`, `POST app-attestation/challenge`, `POST attribution/referrer`                                               | Closed bodies with required keys.                                                                                                    |
| Bookmarks and entity relations | Bookmark `GET`/`PUT`/`DELETE`; entity-relation `GET`/`POST` by predicate                                                                   | Path carriers; the `GET` declares `sort`, `positiveNetVoteScore`, `minNetVoteScore`, `after`, `limit`.                               |
| Feeds by type                  | `GET feeds/posts/:feed_type`, `referral_links`, `rss_feed_items`                                                                           | `after`, `limit`, `community`, `sort`, `media_type`, `has_related_posts`, `min_score_*` as each route uses them.                     |
| Hostnames                      | `GET hostnames`, `GET`/`PATCH hostnames/:id`, `POST hostnames`                                                                             | Closed bodies; `blocked`, `crawlable`, `hostname`, `after`, `limit` query. `PATCH` validates before the 404 lookup.                  |
| Households                     | `GET`/`POST households`, `GET`/`PATCH`/`DELETE households/:id`, memberships `GET`/`POST`/`DELETE`                                          | Closed bodies (create and update take no fields); `access`, `after`, `limit` query.                                                  |
| Imports, landing pages, media  | `GET imports/:batchId/stream`, landing-page `visits`/`clicks`, `POST markdown/preview`, podcast `chapters` and `playback-position`         | Path UUIDs; closed bodies; `position_seconds` required.                                                                              |
| Lists                          | `GET`/`POST lists`, `GET`/`PATCH`/`DELETE lists/:id`, `import`, `items` (`GET`, `POST`, `DELETE` for posts and RSS feed items)             | Closed bodies; `after`, `limit`, `media_type`, `read` query. `GET /api/v1/lists` is covered beyond the original set.                 |
| Stories and URLs               | `POST stories/:storyId/discussions`, `GET urls/:id`, `GET urls/:id/crawls`, `GET urls/:id/crawls/:crawlId`                                 | `Idempotency-Key` header is a UUID; `after`/`limit` query.                                                                           |
| Users                          | `PATCH users/:idOrSlug`, `GET users` (search), collections for posts, users, rss-feeds, rss-feed-items, urls, domains, topics, communities | `PATCH` body is a closed object; collections take `after`, `limit` and the extras each route reads (`q`, `feed_type`, `media_type`). |

`users/:idOrSlug/users/:listType` rejects a repeated `q`, which was previously ignored.
`users/:idOrSlug/rss-feeds/:listType` now declares `limit`, `after` and `feed_type` in OpenAPI.

## Skipped operations

A path-only free-form id-or-slug carrier is a plain string, so the generated contract cannot
reject anything the handler does not already resolve to a 404. These operations are skipped. The
[coverage test](../../../backend/test-helpers/api-fixtures/openapi/content-routes-request-contract-coverage.test.mts)
fails when one of them gains a body, query or header carrier, so it is validated in the same change.

| Operation                                               | Reason                                                    |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `DELETE /api/v1/topics/:idOrSlug`                       | Unconditionally answers 405 and reads nothing.            |
| `GET`/`DELETE /api/v1/users/:idOrSlug`                  | Free-form id-or-slug path only.                           |
| `GET /api/v1/users/:id/vouch-context`                   | Free-form id-or-username path only.                       |
| `GET`/`POST /api/v1/users/:idOrSlug/data-request`       | Free-form id-or-slug path only.                           |
| `GET /api/v1/users/:idOrSlug/data-request/stream`       | Server-sent-event route with no query carrier; see below. |
| `GET /api/v1/users/:username/landing-page`, `.../:slug` | Free-form username and slug paths only.                   |

### Server-sent-event query carriers

`apiQuery` needs a registered response route, and SSE routes have none, so the generator throws
for `apiQuery` on them. The data-request stream asserts that `request_id` is a UUID inside the
handler and answers 422 (`Invalid request ID`). A malformed id previously reached PostgreSQL and
returned a 500. Follow-up: tooling support for SSE query carriers.

## Status decisions

- Parser and semantic 400s run first and are kept: malformed `limit`, repeated or malformed `after`
  from the pagination parsers, invalid `feed_type` or `media_type`, an unknown list type, the
  landing-page path id, the story id, and a playback position out of range.
- Out-of-range limits are still clamped, not rejected. Entity-relation `GET` keeps its clamping.
- Schema-shape failures are 422: wrong types, unknown JSON fields, missing required keys,
  repeated query keys, non-boolean flags, malformed body UUIDs, a malformed `Idempotency-Key`.
- Missing required body keys are now 422 on referrer, landing-page clicks, playback position,
  list item add and import.
- Household `access` outside `all|owned|member` moved from 400 to 422. Household create and update
  reject every body field.
- Lists: a JSON `null` update body moved from 200 to 422; malformed limits on `GET /lists` and
  list items are 422.
- Entity-relation `GET` with an invalid `sort`, `positiveNetVoteScore` or `summary` is 422.
- URL crawls: a malformed `limit` is 400 before the URL lookup; a malformed `crawlId` is 422 before it.
- `PATCH /api/v1/users/:idOrSlug` validates after `requireAuth` and the suspension check but
  before the service's own 404 and 403, because authorization lives inside `updateUser`. A malformed
  body from an authenticated non-owner is 422.
- Query coercion stays per route: the pagination parser runs first, then `prepareQueryForValidation`,
  then the parsed `limit` and `after` overwrite the raw values before validation. There is no shared
  Ajv coercion.
