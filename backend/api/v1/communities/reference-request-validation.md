# Request Validation

[Back to Communities API](README.md)

Every non-test route under this directory that accepts a path, query, body, or header carrier now
validates it against the generated `@voucha/api-fixtures/v1/request-contracts.json` schema via
`validateRequestContract`, placed after the route's last auth/role/ownership/plan check and before
its first service call. See
[`@services/runtime-request-validation`](../../../services/runtime-request-validation/README.md#security-boundary)
for the general ordering rule and
[`backend/api/README.md`](../../README.md#route-helpers) for the adapter's call pattern. A malformed
body, an unrecognized top-level field (where the schema sets `additionalProperties: false`), or a
wrong-typed field returns `422` with a redacted diagnostic. A protected route still returns a bare
`401` for an unauthenticated caller regardless of body shape, since `requireAuth` runs first — the
schema is never checked before authentication.

## Behavior changes

- Four operations — `POST`/`PATCH .../modmail`, `PATCH .../modmail/:conversationId`, `POST
.../modmail/:conversationId/messages`, and `POST .../saved-replies` — now return `422` instead of
  `400` for a non-object JSON body (`null`, an array, or a scalar). Each of these bodies validates
  against the generic `Record_string_unknown` schema (`{type: "object"}`, no property constraints),
  which replaces a route-local `body !== null && typeof body === 'object' && !Array.isArray(body)`
  guard that used to return `400 Invalid request body`. Field-level checks these routes still run
  locally (e.g. `saved-replies`' `body.body` presence/length, `modmail-messages`' `body.text`
  presence) are unaffected and still return `400` — the schema for these operations does not
  constrain those fields, so `{}` still reaches the local check.
- `GET /api/v1/communities/:idOrSlug/moderation-transparency`: an unrecognized `range` value now
  returns `422` instead of silently falling back to `30d` and returning `200`. The generated schema
  constrains `range` to its enum; omitting `range` still defaults to `30d` (the schema's `default`
  is not runtime-enforced by the shared AJV instance — the route's own default logic still handles
  the omitted case).

## Endpoints that skip a declared carrier

- `GET /api/v1/communities/:idOrSlug/reports/pending` intentionally skips query-carrier validation
  (only `path` is validated). The generated query contract types `limit` as an integer (1-100)
  sourced from the route's own pagination parser, but `ctx.query` always carries raw HTTP strings
  and the shared registry performs no type coercion. The existing pagination parser also clamps an
  out-of-range `limit` to 100 and returns `200`, and `sort` defaults to `'severity'` on any
  unrecognized value rather than rejecting it — running the shared validator against the raw query
  here would turn today's clamping/defaulting behavior into a `422`. See the inline comment in
  `reports.mts` at the `apiQuery(...)` call for this operation.

## Endpoints without a query schema at all

- `GET /api/v1/communities/:idOrSlug/agent-prompts/history` has no generated `query` entry in the
  operations map — its route never calls `apiQuery(...)` for this operation, so there is no
  contract to validate against. The route's local `promptId`/`before` UUID-format checks are the
  only validation for these query parameters today. This is a pre-existing documentation gap (no
  `apiQuery` call was ever added for this operation's query params), not a carrier this task skips
  intentionally — closing it requires adding an `apiQuery(...)` call and regenerating the contract,
  which is out of scope here since it does not follow from making the _existing_ generated contract
  authoritative.

## Path-only operations

Several operations (e.g. most `DELETE` routes, and simple `GET`s like
`GET /api/v1/communities/:idOrSlug`) have a generated schema of only `{idOrSlug: {type: 'string'}}`
(or similarly unconstrained path params) — a bare string-typed path segment that Express-style
routing already guarantees is a non-empty string before the handler runs. These cannot produce a
genuine malformed-request rejection: any path segment the router dispatches on already satisfies
`{type: 'string'}`. No route-boundary test claims 422 coverage for these; they are covered only by
the routes' existing behavioral tests (401/403/404/2xx).

## Cross-client verification

`web/lib/api/client/communities.ts`, `web/lib/api/client/community-bans.ts`, and
`web/lib/api/client/community-restrictions.ts` payloads were checked against the generated schemas
above and send only accepted fields; `applyToCommunity`'s optional `message` is only ever sent when
truthy, so the contract's non-nullable `message: string` is never violated by the web client's
`null` case (dead-code cleanup only, see `applications.mts`).
