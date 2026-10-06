# Copyright notice, appeal, and counter-notice request validation

[Back to Request validation](reference-request-validation.md)

The copyright notice routes under `backend/api/v1/copyright-notices/` validate their path, query, and
JSON body with `validateRequestContract` immediately before the first service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records the covered operations, the order each handler keeps, and which status each malformed input
keeps or changes. Other copyright route families (guest capabilities, repeat-infringer and staff
queue, moderator review, email intake, EU, UK, and jurisdiction policy) are owned by their own
changes and are not covered here.

An unauthenticated malformed call keeps a bare `401` with no schema diagnostic. A contract `422`
names only the carrier (`Invalid request body` or `Invalid request query`).

## Validated operations

| Operation                                          | Contract                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /copyright-notices`                          | Closed `CopyrightNoticeFormRequest` body.                                               |
| `POST /copyright-notices/:id/appeals`              | Closed `CopyrightAppealRequest` body and `id` path.                                     |
| `POST /copyright-notices/:id/counter-notices`      | Closed `CopyrightCounterNoticeRequest` body and `id` path.                              |
| `GET /copyright-notices`                           | `after` and `limit` (1 to 100, default 100) query.                                      |
| `GET /copyright-notices/:id` and `.../participant` | `id` path only; the plain-string path cannot reject more than `validateUUIDParam` does. |

The request types live in `request-types.mts` beside the routes, and the compiler extracts the
schema from them, so the request-contract bundle and the runtime check share
one source. Compiler-built assertions in
[`copyright-submission-request-contract-coverage.test.mts`](../../../backend/test-helpers/api-fixtures/openapi/copyright-submission-request-contract-coverage.test.mts)
verify the emitted carriers, and
[`submission-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/submission-request-validation.test.mts)
verifies order, status, and no-write behavior against the real database.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call last.

- Notice: intake switch (`503`), content type (`415`), optional authentication and rate limit,
  suspension, body read, CAPTCHA or App Attest, field parser (`422`), `Idempotency-Key` (`400`),
  client IP (`400`), contract (`422`), service.
- Appeal and counter-notice: content type (`415`), authentication (`401`), suspension, path UUID
  (`422`), body read, CAPTCHA or App Attest, `Idempotency-Key` (`400`), field parser (`422`),
  contract (`422`), service.

The service resolves ownership of the targets inside its transaction, so a signed-in caller who is
not the affected poster and sends a malformed body sees `422` rather than `403`, as parser
rejections already did.

## Statuses

The route-level field parsers run before the contract, so every rejection that existed keeps its
status and its field-named message. The contract only adds `422` for shapes the parsers did not
look at: an unknown key at the top level or inside a target, and a non-string `cf_turnstile_response`.

- A missing or wrong-typed field, an unaccepted attestation, a malformed or duplicated UUID, an
  out-of-range array, and an over-long string keep their existing `422` and message.
- A missing or malformed `Idempotency-Key` stays `400` and wins over a schema diagnostic.
- Appeals and counter-notices gained route-level parsers (`parseCopyrightAppealForm` and
  `parseCopyrightCounterNoticeForm` in `@services/copyright-notices/http-input`) that mirror the
  messages the service already raised. A false or missing declaration therefore keeps
  `consent_to_federal_jurisdiction must be accepted` (and its two siblings) instead of becoming a
  generic schema message. The service guards remain.
- No status code changes for a valid request, and none for an invalid request that already failed.

Statutory attestations are the literal `true` in the schema: `has_good_faith_belief`,
`has_accuracy_authority_under_penalty_of_perjury`, `consent_to_federal_jurisdiction`,
`consent_to_service_of_process`, and `good_faith_misidentification_under_penalty_of_perjury`. The
notice `jurisdiction` is the literal `us_dmca`. Array bounds match
`@services/copyright-notices/http-input`: 1 to 20 targets, 1 to 20 unique `target_ids`. The CAPTCHA
or App Attest check and `COPYRIGHT_INTAKE_ENABLED` stay where they were; `cf_turnstile_response` is
optional because App Attest callers send none.

## Carriers the generated schema does not check

`GET /copyright-notices` declares its query with `apiQuery` and validates through
`parseAndValidatePaginatedRequest`, but the shared pagination parser owns every query rejection
(`400` for a repeated or malformed `after`, and for a `limit` outside 1 to 100) and runs first. The
carrier is therefore a drift guard: it cannot turn a request the parser accepted into a `422`.

String lengths and email format are not in the generated schema; the field parsers enforce them
with field-named messages. The `Idempotency-Key` header is checked locally rather than through a
header contract, to keep the `400` status.

## Specialized ingress

No named exclusions. Every covered route reads a bounded JSON body (`1mb`); none verifies a
signature over, or re-serializes, a raw body.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client (`web/lib/api/client/copyright-notices.ts` and the notice, appeal, and counter-notice forms)
sends only schema keys, with `cf_turnstile_response` present only when a token exists. No native
Swift or .NET copyright client exists in `vouchington-clients` (`5c4acb6`), so no native request body
depends on a key outside the schema.
