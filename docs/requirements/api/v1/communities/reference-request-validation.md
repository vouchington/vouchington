# Request Validation

[Back to Communities API](../../../../../backend/api/v1/communities/README.md)

Some community routes use `validateRequestContract` to check request values against the generated
`@voucha/api-fixtures/v1/request-contracts.json` schema. Validation ordering and coverage are
route-specific; the examples below describe selected runtime behaviors and are not a complete route
inventory. See
[`@services/runtime-request-validation`](../../../../overview/architecture/services/runtime-request-validation/README.md#security-boundary)
for the general ordering rule and
[`docs/requirements/api/README.md`](../../README.md#route-helpers) for the adapter's call pattern. A malformed
value rejected by a route's schema returns `422` with a redacted diagnostic. Authentication and
other access checks retain the ordering documented for each route below.

## Behavior changes

- Community modmail and saved-reply routes return `422` instead of `400` for non-object JSON
  bodies. Their route-specific field checks still return `400` for invalid or missing fields.
- `GET /api/v1/communities/:idOrSlug/moderation-transparency`: an unrecognized `range` value now
  returns `422` instead of silently falling back to `30d`. Omitting `range` still defaults to `30d`.

## Other tested input checks

- `PATCH /api/v1/communities/:idOrSlug` returns `422` for a non-object JSON body when sent by an
  owner and preserves `403` for a member without update access. Unauthenticated callers still get
  `401`.
- `POST /api/v1/communities/:idOrSlug/posts` validates the parsed body before the honeypot response.
  A non-object body such as JSON `null`, or an object with an invalid field, returns `422` after the
  contribution gates. A valid object with a filled honeypot field still receives the honeypot
  response without creating a real post. Unauthenticated callers still get `401`.
- `GET /api/v1/communities/:idOrSlug/agent-prompts/history` rejects malformed `promptId` and
  `before` values with `422` after its access checks. Agent-prompt routes also reject malformed
  `:promptId` values before using them to find prompts; routes with a role check preserve `403` for
  callers who fail that check.

## Query normalization

`GET /api/v1/communities/:idOrSlug/bans` returns `422` for a malformed `limit` after its access
checks, while a valid `limit` returns `200`. Public `GET
/api/v1/communities/:idOrSlug/posts` likewise returns `422` for a malformed `limit` and `200` for a
valid query.

`GET /api/v1/communities/:idOrSlug/moderation-analytics` returns the default 30-day result when
`range` is omitted or unrecognized. `GET /api/v1/communities/:idOrSlug/moderator-stats` keeps its
30-day default when `window` is omitted or unsupported.

`GET /api/v1/communities/:idOrSlug/moderation-queue` keeps its existing `limit` clamp and default,
but a supplied `source` must now match the declared `report`, `community_review`, or `automod_flag`
enum. An unknown source returns `422` after the membership/staff access check instead of being
silently omitted and returning an unfiltered queue.
