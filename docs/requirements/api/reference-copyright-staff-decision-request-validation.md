# Copyright staff decision request validation

[Back to Request validation](reference-request-validation.md)

This page describes selected request-validation behavior for staff routes under
`backend/api/v1/copyright-notices/`.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records selected route behaviors, handler ordering, and status changes.

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

The route-level request tests in
[`staff-decision-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/staff-decision-request-validation.test.mts)
and
[`staff-path-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/staff-path-request-validation.test.mts)
exercise the field checks, access ordering, and status behavior against the real database.

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
- An unknown delivery or action intent stays `200 { replayed: false }`, and an unknown staydown
  match stays the service's `404`.

## Replay behavior

`POST /copyright-media-delivery/replays` retains its existing staff-only `403` and `200` behavior.
