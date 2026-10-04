# Content, list, household and public user request behavior

[Back to Request validation](reference-request-validation.md)

This page records selected runtime request-validation behavior for content, list, household, and
public user routes. The shared [request-validation reference](reference-request-validation.md)
describes the adapter and ordering guidance.

## User collection and search queries

For the user collections covered by route tests, malformed pagination keeps the parser's `400`
response: non-integer limits and repeated cursors are rejected. A repeated `q` on
`GET /api/v1/users/:idOrSlug/users/:listType` returns `422`; unsupported feed and media types retain
their route-specific `400` response.

On `GET /api/v1/users`, a supplied `username` lookup takes precedence over `q`, including when an
unused `limit` is malformed. In search mode, repeated `q` values use the first value. Malformed
search pagination retains `400`, and an unauthenticated search still returns `401`.

## User updates and data-request stream

`PATCH /api/v1/users/:idOrSlug` returns `422` for an invalid body without changing the user. A valid
update by another user remains `403`.

`GET /api/v1/users/:idOrSlug/data-request/stream` returns `422` for a malformed `request_id` and
`404` for a well-formed UUID that does not identify a request. An unauthenticated caller still gets
`401`.

## Community query behavior

`GET /api/v1/communities/:idOrSlug/bans` returns `422` for a malformed `limit` after access checks;
a valid limit returns `200`. Public `GET /api/v1/communities/:idOrSlug/posts` returns `422` for a
malformed limit and serves a valid query with `200`.

`GET /api/v1/communities/:idOrSlug/moderation-transparency` returns `422` for an unrecognized
`range`; omitting it keeps the 30-day default. `GET /api/v1/communities/:idOrSlug/moderation-analytics`
uses its 30-day default for an omitted or unrecognized range, and
`GET /api/v1/communities/:idOrSlug/moderator-stats` retains its 30-day default for an unsupported
window. A supplied moderation-queue `source` outside the supported values returns `422` after the
community access check.

## Community request bodies

`PATCH /api/v1/communities/:idOrSlug` returns `422` for a non-object JSON body from an owner and
preserves `403` for a member without update access. An unauthenticated caller gets `401`.

Community modmail and saved-reply routes return `422` instead of `400` for non-object JSON bodies.
Their route-specific field checks still return `400` for invalid or missing fields.

`POST /api/v1/communities/:idOrSlug/posts` validates the parsed body before its honeypot response.
Malformed supplied fields return `422` after the contribution gates; a valid filled honeypot still
gets a fake creation response without creating a real post. Unauthenticated callers still get
`401`.
