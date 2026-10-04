# Copyright repeat-infringer and staff queue request validation

[Back to Request validation](reference-request-validation.md)

The repeat-infringer routes and the staff review queue under `backend/api/v1/copyright-notices/`
validate their path, query, and JSON body with `validateRequestContract` immediately before the first
service call. [Request validation](reference-request-validation.md) owns the ordering and the
generated contract mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the
legal flow. This page records the covered operations, the order each handler keeps, and which status
each malformed input keeps or changes. Other copyright route families have their own pages, listed
under [Route-family references](reference-request-validation.md#route-family-references); the form-intake,
restriction, and legal-hold resolution reviews, image-similarity candidates, and replay routes are on
the [staff decision page](reference-copyright-staff-decision-request-validation.md).

An unauthenticated or unauthorized malformed call keeps its bare `401` or `403` with no schema
diagnostic. A contract `422` names only the carrier (`Invalid request body` or `Invalid request query`).

## Validated operations

| Operation                                                                 | Contract                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /copyright-notices/:id/repeat-infringer-accounts`                    | `id` path only                                                 |
| `POST /copyright-repeat-infringer-incidents/:id/dispositions`             | Closed `CopyrightRepeatInfringerDispositionRequest` and path   |
| `POST /copyright-repeat-infringer-reviews/:id/outcomes`                   | Closed `CopyrightRepeatInfringerOutcomeRequest` and path       |
| `POST /copyright-repeat-infringer-accounts/:accountUserId/reinstatements` | Closed `CopyrightRepeatInfringerReinstatementRequest` and path |
| `GET /copyright-notices/review-queue`                                     | `after` and `limit` (1 to 100, default 100) query              |

The request types live in `repeat-infringer-request-types.mts` beside the routes, and the compiler
extracts the schema from them, so the OpenAPI document, the request-contract bundle, and the runtime
check share one source. Compiler-built assertions in
[`copyright-staff-request-contract-coverage.test.mts`](../../../backend/test-helpers/api-fixtures/openapi/copyright-staff-request-contract-coverage.test.mts)
verify the emitted carriers, and
[`repeat-infringer-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/repeat-infringer-request-validation.test.mts)
verifies order, status, and no-write behavior against the real database.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call last.

- Disposition, outcome, and reinstatement: content type (`415`), authentication and staff role
  (`401`, `403`), rate limit, suspension, body read, non-object body (`422`), field parsers
  (`422`), path UUID (`422`), contract (`422`), service.
- Account list: authentication and staff role, rate limit, suspension, path UUID (`422`), contract
  (`422`), service.
- Staff queue: authentication (`401`), suspension, staff role (`403`), pagination parser (`400`),
  contract (`422`), service.

The service decides whether the caller may record `restrict`, `terminate`, or a reinstatement
(administrators only) and whether a reinstatement applies, so a moderator who sends a malformed body
to an administrator action sees `422` rather than `403`, as field-parser rejections already did.

## Statuses

The route-level field parsers run before the contract, so every rejection that existed keeps its
status and its field-named message, except the non-object body below. The contract only adds `422`
for a body key the parsers did not look at.

- A missing or over-long `rationale`, a `disposition` outside `withdrawn`, `duplicate`, and
  `abusive`, an `outcome` outside `warning`, `no_action`, `restrict`, and `terminate`, and a
  malformed path id keep their existing `422` and message.
- A JSON `null` body on a disposition, outcome, or reinstatement now returns `422`
  (`Invalid request body`). Previously the handler read `rationale` from it and answered `500`. An
  array or scalar body was already `422`, and now carries `Invalid request body` instead of
  `rationale is required`. The check runs after authentication, so unauthorized callers still see a
  bare `401` or `403`.
- A `rationale` that is not a string stays `422` ('rationale is required'); the 10,000-character
  limit is enforced by `boundedString`, not by the schema.
- No status code changes for a valid request, and none for an invalid request that already answered
  with a `4xx`.

## Carriers the generated schema does not check

`GET /copyright-notices/review-queue` declares its query with `apiQuery` and validates through
`parseAndValidatePaginatedRequest`, but the shared pagination parser owns every query rejection
(`400` for a repeated or malformed `after`, a cursor outside the queue's scope or urgency tiers, and
a `limit` outside 1 to 100) and runs first. The carrier is therefore a drift guard: it cannot turn a
request the parser accepted into a `422`.

String lengths are not in the generated schema. Path ids are plain strings, so `validateUUIDParam`
stays.

## Specialized ingress

No named exclusions. Every covered route reads a bounded JSON body (`1mb`) or none; none verifies a
signature over, or re-serializes, a raw body.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client (`web/lib/api/client/copyright-repeat-infringer.ts`) sends only `disposition`, `outcome`, and
`rationale`. No native Swift or .NET copyright client exists in `vouchington-clients` (`5c4acb6`), so
no native request body depends on a key outside the schema.
