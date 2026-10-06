# Copyright email-intake request validation

[Back to Request validation](reference-request-validation.md)

The staff email-intake routes under `backend/api/v1/copyright-notices/` validate their path, query,
and JSON body with `validateRequestContract` immediately before the first service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records the covered operations, the order each handler keeps, and which status each malformed input
keeps or changes. The legal-process route was already validated by its own change and is not
repeated here.

An unauthenticated or unauthorized malformed call keeps its bare `401` or `403` with no schema
diagnostic. A contract `422` names only the carrier (`Invalid request body` or `Invalid request query`).

## Validated operations

| Operation                                                     | Contract                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /copyright-email-intakes/:id`                            | `id` path only                                                 |
| `GET /copyright-email-intakes/:id/raw`                        | `id` path only                                                 |
| `GET /copyright-email-intakes/review-queue`                   | `after` and `limit` (1 to 100, default 100) query              |
| `POST /copyright-email-intakes/:id/reply/replays`             | `id` path only, no body                                        |
| `POST /copyright-email-intakes/:id/approvals`                 | Closed `CopyrightEmailApprovalRequest` and path                |
| `POST /copyright-email-intakes/:id/rejections`                | Closed `CopyrightEmailRejectionRequest` and path               |
| `POST /copyright-email-intakes/:id/correspondence`            | Closed `CopyrightEmailCorrespondenceRequest` and path          |
| `POST /copyright-email-intakes/:id/correspondence-rejections` | Closed `CopyrightEmailCorrespondenceRejectionRequest` and path |

The four request types live in `email-intake-request-types.mts` beside the routes. Maintain the
checked-in request contract schemas alongside those types; compiler discovery is removed.
See the [fixture update flow](../../development/testing/backend/api-fixtures.md#update-flow).
Runtime tests in
[`email-intake-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/email-intake-request-validation.test.mts)
verifies order, status, and no-write behavior against the real database. Valid queue requests are
covered by `email-intake-queue-pagination.test.mts`, which also walks a queue with an unknown query
key.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call after the
field parsers, before the first service or database call.

- Approvals, rejections, correspondence, and correspondence-rejections: content type (`415`),
  authentication and staff role (`401`, `403`), rate limit, suspension, path UUID (`422`), body read,
  non-object body (`422`), `rationale` (`422`), the route's field parsers (`422`), contract (`422`),
  service. Approvals also resolve every hosted image placement after the contract.
- Intake detail and original download: authentication and staff role, rate limit, suspension, path
  UUID (`422`), contract (`422`), service.
- Reply replay: authentication and staff role, rate limit, suspension, path UUID (`422`), contract
  (`422`), service.
- Review queue: authentication (`401`), suspension, staff role (`403`), pagination parser (`400`),
  contract (`422`), service.

The parsers that were inline in the decision handlers (`recommendation_id`, `manual_fallback_reason`,
`reply_email`, and the correspondence target ids and submission) now run before the contract call,
in their original order, so every rejection that existed keeps its status and field-named message.
The shared `parseCopyrightReviewRequest` helper gains only the non-object body check, ahead of its
first field read. The form-intake and legal-hold routes that also call it get that check and nothing
else: they declare no contract and keep every other status and message.

## Statuses

The route-level field parsers run before the contract, so the contract only adds `422` for input the
parsers never looked at. Apart from the non-object body, every one of these changes is a malformed
body that was previously accepted and ignored; none is a legal-workflow contract, and a valid
request behaves exactly as before.

- A JSON `null` body on any of the four decision routes now returns `422` (`Invalid request body`).
  Previously the shared reader read `rationale` from it and answered `500`. An array or scalar body
  was already `422`, and now carries `Invalid request body` instead of `rationale is required`. The
  check runs before any field read and after authentication, so unauthorized callers still see a
  bare `401` or `403`.
- An unknown top-level key on any of the four decision bodies now returns `422`
  (`Invalid request body`). Previously it was silently dropped.
- An unknown key inside an approval `targets[]` item now returns `422`.
- A rejection `response_message` that is neither a string nor `null` now returns `422`. Previously it
  was treated as no message.
- A kind-inapplicable correspondence key of the wrong type now returns `422`: a `consent_*` or
  `good_faith_*` attestation that is not the literal `true`, a non-string `submission_summary`,
  `appeal_reason`, `name`, `address`, `telephone`, or `electronic_signature`, or `target_ids` that is
  not one to twenty distinct UUIDs, on a kind whose parser does not read it. Previously the key was
  ignored. On the kind that reads it, the parser still answers first with its field-named message.
- A missing or over-long `rationale`, a malformed `recommendation_id`, `manual_fallback_reason`, or
  `reply_email`, a `response_kind` outside `rejected` and `needs_information`, an unknown
  correspondence `kind`, every approval field error, and a malformed path id keep their existing
  status and message.
- The review queue changes no status: an unknown query key is ignored, and `limit` or `after` errors
  stay `400`.

## Carriers the generated schema does not check

`GET /copyright-email-intakes/review-queue` declares its query with `apiQuery` and validates through
`parseAndValidatePaginatedRequest`, but the shared pagination parser owns every query rejection and
runs first. The carrier is therefore a drift guard: it cannot turn a request the parser accepted into
a `422`.

String lengths, the correspondence kind rules (which keys a kind requires), and the notice target
ownership and placement checks stay in the parsers and services. Path ids are plain strings, so
`validateUUIDParam` stays.

## Specialized ingress

No named exclusions. Every covered route reads a bounded JSON body (`1mb`) or none. The original
email download streams stored bytes and reads no request body, and the SES ingestion of a raw
message is a separate worker, not one of these routes.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client (`web/lib/api/client/copyright-email-intakes.ts` and the approval and correspondence models
in `web/components/copyright/`) sends only schema keys: approvals send the notice form fields and
targets stripped to `post_id`, `image_id`, and `target_url`, and correspondence sends the keys of the
selected kind. No native Swift or .NET copyright client exists in `vouchington-clients` (`5c4acb6`),
so no native request body depends on a key outside the schema.
