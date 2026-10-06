# Copyright guest capability request validation

[Back to Request validation](reference-request-validation.md)

The staff guest-capability routes and the guest filing route under
`backend/api/v1/copyright-notices/` validate their path, query, and JSON body with
`validateRequestContract` immediately before the first service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This page
records the covered operations, the order each handler keeps, and which status each malformed input
keeps or changes. Other copyright route families (notice, appeal, and counter-notice submission,
repeat-infringer and staff queue, moderator review, email intake, EU, UK, and jurisdiction policy)
are owned by their own changes and are not covered here.

An unauthenticated or unauthorized malformed call keeps its bare `401` or `403` with no schema
diagnostic. A contract `422` names only the carrier (`Invalid request body` or `Invalid request query`).

## Validated operations

| Operation                                                        | Contract                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /copyright-notices/:id/guest-capabilities`                 | Closed `CopyrightGuestCapabilityIssueRequest` body and `id` path |
| `POST .../guest-capabilities/:capabilityId/revocation`           | `id` and `capabilityId` path; no body                            |
| `POST .../guest-capabilities/:capabilityId/information-requests` | Closed `CopyrightGuestInformationRequest` body and path          |
| `POST /copyright-notices/:id/guest-filings`                      | Closed `CopyrightGuestFilingRequest` body and `id` path          |
| `GET /copyright-notices/:id/guest-capabilities`                  | `after` and `limit` (1 to 100, default 25) query and `id` path   |

The request types live in `guest-capability-request-types.mts` beside the routes, and the compiler
extracts the schema from them, so the request-contract bundle and the runtime
check share one source. Compiler-built assertions in
[`copyright-guest-request-contract-coverage.test.mts`](../../../backend/test-helpers/api-fixtures/openapi/copyright-guest-request-contract-coverage.test.mts)
verify the emitted carriers, and
[`guest-capability-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/guest-capability-request-validation.test.mts)
verifies order, status, and no-write behavior against the real database.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call last.

- Issue and information request: content type (`415`), authentication and staff role (`401`,
  `403`), rate limit, suspension, body read, field parser (`422`), path UUIDs (`422`), contract
  (`422`), service.
- Revocation: authentication and staff role, rate limit, suspension, path UUIDs (`422`), contract
  (`422`), service. The route reads no body.
- Guest filing: content type (`415`), optional authentication and rate limit, body read, CAPTCHA or
  App Attest, `kind` and `statement` parsers (`422`), capability header (`403`), path UUID (`422`),
  contract (`422`), service.
- List: authentication and staff role, rate limit, suspension, path UUID (`422`), pagination parser
  (`400`), contract (`422`), service.

## Statuses

The route-level field parsers run before the contract, so every rejection that existed keeps its
status and its field-named message. The contract only adds `422` for shapes the parsers did not look
at: an unknown body key, and a `cf_turnstile_response` that is not a string.

- A missing or wrong-typed `expires_at`, `statement`, or `kind`, an expiry that is not in the future,
  and a malformed path id keep their existing `422` and message.
- A missing, empty, or over-long `Copyright-Guest-Capability` header stays `403` and wins over a
  schema diagnostic.
- `expires_at` is a plain string in the schema. The parser requires a future instant and the
  service enforces the 30-day ceiling, so a request the route accepted before is still accepted.
- `cf_turnstile_response` is optional (`string`): App Attest callers send none, and the web client
  omits the key when it has no token. The earlier generated schema marked it required and nullable;
  no client relied on that. An explicit `null` is now rejected with `422` on purpose; before, the
  route accepted it as "no token".
- Apart from an explicit `null` CAPTCHA token, no status code changes for a valid request, and none
  for an invalid request that already failed.

## The capability header is never exposed

`Copyright-Guest-Capability` carries a bearer token. The guest filing route checks it locally and
does not pass the header carrier to `validateRequestContract`, so a schema diagnostic cannot echo it,
and the route never logs it. The contract `422` body is the fixed `Invalid request body` text.
[`guest-capability-request-validation.test.mts`](../../../backend/api/v1/copyright-notices/guest-capability-request-validation.test.mts)
asserts that a rejection body does not contain the token. The API error hook does not log responses
below `500`, so the response body is the observable disclosure surface for a rejected request.

## Carriers the generated schema does not check

`GET /copyright-notices/:id/guest-capabilities` declares its query with `apiQuery` and validates
through `parseAndValidatePaginatedRequest`, but the shared pagination parser owns every query
rejection (`400` for a repeated or malformed `after`, and for a `limit` outside 1 to 100) and runs
first. The carrier is therefore a drift guard: it cannot turn a request the parser accepted into a
`422`.

String lengths are not in the generated schema; `boundedString` enforces the 50,000-character
`statement` limit with a field-named message. Path ids are plain strings, so `validateUUIDParam`
stays.

## Specialized ingress

No named exclusions. Every covered route reads a bounded JSON body (`1mb`) or none; none verifies a
signature over, or re-serializes, a raw body.

## Cross-client verification

The closed schemas reject unknown keys, so every client body must be a subset of the schema. The web
client (`web/lib/api/client/copyright-guest.ts`) sends only schema keys: `expires_at`, `statement`,
and for a guest filing `kind`, `statement`, and an optional `cf_turnstile_response`. No native Swift
or .NET copyright client exists in `vouchington-clients` (`5c4acb6`), so no native request body
depends on a key outside the schema.
