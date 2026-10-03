# Copyright staff decision request validation

[Back to Request validation](reference-request-validation.md)

The remaining staff copyright routes under `backend/api/v1/copyright-notices/` validate their path,
query, and JSON body with `validateRequestContract` immediately before the first service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records the covered operations, the order each handler keeps, which status each malformed input keeps
or changes, and the one operation in this family that needs no change. With this page every
`/api/v1/copyright-*` operation either validates its request or is the documented carrier-free skip
below.

An unauthenticated or unauthorized malformed call keeps its bare `401` or `403` with no schema
diagnostic. A contract `422` names only the carrier (`Invalid request body`).

## Validated operations

| Operation                                                                  | Contract                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /copyright-form-intakes/:id/reviews`                                 | Closed `CopyrightFormIntakeReviewRequest` and `id` path    |
| `POST /copyright-notices/:id/restrictions/:restrictionId/reviews`          | Closed `CopyrightRestrictionReviewRequest` and path        |
| `POST /copyright-legal-hold-assessments/:id/resolutions`                   | Closed `CopyrightLegalHoldResolutionRequest` and `id` path |
| `GET /copyright-notices/:id/targets/:targetId/image-similarity-candidates` | `limit` (1 to 50) query and path                           |
| `POST /copyright-notices/:id/delivery-intents/:intentId/replays`           | Path only (no body)                                        |
| `POST /copyright-notices/:id/action-intents/:intentId/replays`             | Path only (no body)                                        |
| `POST /copyright-notices/:id/staydown-matches/:matchId/reviews`            | Path only (no body)                                        |

The three body types live in `staff-decision-request-types.mts` beside the routes. The form-intake
review and the resolution handlers share the `parseCopyrightReviewRequest` body reader, so each
declares its type with `apiRequestContract`; the compiler cannot see through the shared helper. The
restriction review reads its own body, so a typed cast carries the type. The compiler extracts the
schema from the types, so the OpenAPI document, the request-contract bundle, and the runtime check
share one source. Compiler-built assertions in
[`copyright-staff-decision-request-contract-coverage.test.mts`](../../../backend/test-helpers/api-fixtures/openapi/copyright-staff-decision-request-contract-coverage.test.mts)
verify the emitted carriers, and
[`staff-decision-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/staff-decision-request-validation.test.mts)
and
[`staff-path-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/staff-path-request-validation.test.mts)
verify order and status against the real database.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call after the
field parsers, before the first service or database call.

- Form-intake reviews and legal-hold resolutions: content type (`415`), authentication and staff
  role (`401`, `403`), rate limit, suspension, path UUID (`422`), body read, non-object body
  (`422`), `rationale` (`422`), then `accepted` (a boolean) or `resolution_kind` (one of the three
  kinds), contract (`422`), service.
- Restriction reviews: the same order with both path UUIDs (`id`, `restrictionId`), then
  `rationale` and `action` (`confirm` or `reverse`). The route previously had no non-object check;
  it now shares the one in the review reader.
- Image-similarity candidates: authentication and staff role, rate limit, suspension, path UUIDs
  (`422`), the `limit` parser, contract, service.
- Replays and staydown reviews: authentication and staff role, rate limit, suspension, path UUIDs
  (`422`), contract, service. The staydown route used to read its UUIDs while building the service
  arguments; they are now read first, which keeps their order relative to the service call.

## Statuses

The route-level field parsers run before the contract, so the contract only adds `422` for input the
parsers never looked at. No `400` becomes `422` in this change. A valid request behaves exactly as
before.

| Route                                                  | Input                 | Old status                      | New status                     |
| ------------------------------------------------------ | --------------------- | ------------------------------- | ------------------------------ |
| `POST /copyright-notices/:id/restrictions/.../reviews` | JSON `null` body      | `500`                           | `422` (`Invalid request body`) |
| `POST /copyright-notices/:id/restrictions/.../reviews` | Array or scalar body  | `422` (`rationale is required`) | `422` (`Invalid request body`) |
| Form-intake review, restriction review, resolution     | Unknown top-level key | accepted (key ignored)          | `422` (`Invalid request body`) |

- A JSON `null` body on the restriction review used to be read as `body.rationale` and throw a
  `TypeError`. The form-intake review and the resolution already answered `422` through the shared
  reader.
- A missing or over-long `rationale`, an `accepted` that is not a boolean, an `action` outside
  `confirm` and `reverse`, a `resolution_kind` outside `dismissed`, `proceeding_ended`, and
  `superseded`, and a malformed path id keep their existing `422` and field-named message. An
  unknown intake stays the service's `404`, an unknown assessment stays `404`, and a restriction
  review for an unknown notice stays `409`.
- The image-similarity `limit` stays lenient: a missing, malformed, fractional, or out-of-range
  value is ignored and the default applies. The contract validates the value the parser settled on
  instead of the raw query string, so no `limit` answers `422`. An unknown query key is dropped
  before validation and never answers `422`.
- The replay and staydown routes read no body and the web client posts `{}`. The contract names only
  the path ids, so a body of any shape is still ignored. An unknown delivery or action intent stays
  `200 { replayed: false }`, and an unknown staydown match stays the service's `404`.

## Operations that need no change

- `POST /copyright-media-delivery/replays` reads no body, path, or query, so the compiler emits no
  request-contract entry for it and a `validateRequestContract` call would have nothing to check.
  It is the carrier-free skip described in
  [Skipped operations](reference-content-routes-request-validation.md#skipped-operations) and in the
  [submission review page](reference-copyright-submission-review-request-validation.md#operations-that-need-no-change);
  that page's coverage test fails if the route gains a request carrier.

## Specialized ingress

No named exclusions. Every body here is bounded JSON (`1mb`) read by the standard parser; no
raw-body, MIME, or signature parser is involved.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client sends only schema keys: `accepted` and `rationale` for form-intake reviews, `action` and
`rationale` for restriction reviews, and `resolution_kind` and `rationale` for resolutions. It posts
`{}` to the staydown review and to both replays, which the routes ignore. The web client does not
call the image-similarity route; the native moderation fixture requests it with no query. No native
Swift or .NET copyright client exists in `vouchington-clients` (`5c4acb6`), so no native request body
depends on a key outside the schema.
