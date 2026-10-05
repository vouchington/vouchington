# Copyright submission review request validation

[Back to Request validation](reference-request-validation.md)

This page describes request behavior for staff submission-review routes under
`backend/api/v1/copyright-notices/`.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records route behavior, handler ordering, and status changes.

An unauthenticated or unauthorized malformed call keeps its bare `401` or `403` with no schema
diagnostic. A contract `422` names only the carrier (`Invalid request body`).

## Validated operations

| Operation                                                | Contract                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /copyright-submissions/:id/appeal-reviews`         | Closed `CopyrightAppealReviewRequest` and `id` path        |
| `POST /copyright-submissions/:id/counter-notice-reviews` | Closed `CopyrightCounterNoticeReviewRequest` and `id` path |
| `POST /copyright-submissions/:id/legal-hold-assessments` | Closed `CopyrightLegalHoldAssessmentRequest` and `id` path |

Appeal `decisions` are one to twenty `{ restriction_id, action }` items, and legal-hold `target_ids`
are one to twenty distinct UUIDs. The runtime request tests in
[`submission-review-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/submission-review-request-validation.test.mts)
verify order, status, and no-write behavior against the real database.

`POST /copyright-legal-hold-assessments/:id/resolutions` shares the body reader but is validated with
the other remaining staff decision routes; see
[staff decision request validation](reference-copyright-staff-decision-request-validation.md).

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call after the
field parsers, before the first service or database call: content type (`415`), authentication and
staff role (`401`, `403`), rate limit, suspension, path UUID (`422`), body read, non-object body
(`422`), `rationale` (`422`), the route's field parsers (`422`), contract (`422`), service.

- Appeal reviews: `decisions` (a non-empty array of at most twenty objects, each with a UUID
  `restriction_id` and a `confirm` or `reverse` `action`), `recommendation_id`, then
  `manual_fallback_reason`.
- Counter-notice reviews: `accepted` must be a boolean.
- Legal-hold assessments: `proceeding_kind`, `ccb_claim_kind`, `commenced_at`,
  `received_by_designated_agent_at`, the two boolean fields, the proceeding and CCB consistency
  rules, then `target_ids`. The target id parser ran while the service arguments were built, so
  hoisting it above the contract keeps its order relative to the service call.

The shared `parseCopyrightReviewRequest` helper gains only the non-object body check, ahead of its
first field read (see the
[email-intake page](reference-copyright-email-intake-request-validation.md#statuses)).

## Statuses

The route-level field parsers run before the contract, so the contract only adds `422` for input the
parsers never looked at. Apart from the non-object body, every one of these changes is a malformed
body that was previously accepted and ignored; none is a legal-workflow contract, and a valid
request behaves exactly as before.

- A JSON `null` body on any of the three routes now returns `422` (`Invalid request body`).
  Previously the shared reader read `rationale` from it and answered `500`. An array or scalar body
  was already `422`, and now carries `Invalid request body` instead of `rationale is required`.
- An unknown top-level key on any of the three bodies now returns `422` (`Invalid request body`).
  Previously it was silently dropped.
- An unknown key inside an appeal `decisions[]` item now returns `422`.
- A counter-notice review body that carries `recommendation_id` or `manual_fallback_reason` now
  returns `422`. The route never read either key; only the appeal review does.
- A missing or over-long `rationale`, a malformed `decisions` entry, `recommendation_id`, or
  `manual_fallback_reason`, a non-boolean `accepted`, `is_from_original_claimant`, or `is_same_material`, a
  `proceeding_kind` or `ccb_claim_kind` outside its values, a malformed date, a missing `commenced_at`
  or CCB claim kind, a `target_ids` list that is empty, over twenty, not UUIDs, or not distinct, and
  a malformed path id keep their existing status and message. An unknown submission stays the
  service's `404`.

## Related behavior

- `POST /copyright-media-delivery/replays` remains a staff-only replay route. Its existing replay
  coverage keeps the `403` and `200` outcomes.
- For repeat-infringer routes (the notice accounts read, dispositions, outcomes, and reinstatements),
  see
  [repeat-infringer and staff queue routes](reference-copyright-staff-request-validation.md).
