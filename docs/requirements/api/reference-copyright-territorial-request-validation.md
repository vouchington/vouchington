# Copyright EU, UK, and jurisdiction policy request validation

[Back to Request validation](reference-request-validation.md)

The EU, UK, and jurisdiction policy routes under `backend/api/v1/copyright-notices/` validate their
path and JSON body with `validateRequestContract` immediately before the first service call.
[Request validation](reference-request-validation.md) owns the ordering and the generated contract
mechanics; the [Copyright Notices API](v1/copyright-notices/README.md) owns the legal flow. This
page records the covered operations, the order each handler keeps, and which status each malformed
input keeps or changes. Other copyright route families (notice, appeal, and counter-notice
submission, guest capabilities, moderator review, email intake, repeat-infringer, and the staff
queue) are owned by their own changes and are not covered here.

A malformed authenticated-only or staff call keeps its bare `401` or `403` before a schema
diagnostic. EU notice receipt permits guests and uses optional authentication. A contract `422` names only the carrier (`Invalid request body` or
`Invalid request path`).

## Validated operations

| Operation                                                                        | Contract                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /copyright-eu-notices`                                                     | Closed `CopyrightEuNoticeRequest`, including name, email and literal-true good faith                 |
| `POST /copyright-uk-notices`                                                     | Closed `CopyrightTerritorialNoticeRequest`; EU fields refused                                        |
| `POST /copyright-{eu,uk}-notices/:id/redress-requests`                           | Closed `CopyrightTerritorialRedressRequest` and path                                                 |
| `POST /copyright-eu-notices/:id/statements-of-reasons`                           | Closed decision request (`outcome`, `statement`, `public_explanation`, conditional targets) and path |
| `POST /copyright-uk-notices/:id/reviews`                                         | Closed decision request (`outcome`, `rationale`, `public_explanation`, conditional targets) and path |
| `POST /copyright-{eu,uk}-notices/:id/redress-requests/:redressId/decisions`      | Closed `CopyrightTerritorialRedressDecisionRequest` and path                                         |
| `POST /copyright-eu-notices/:id/supervised-complaints`                           | Closed `CopyrightTerritorialSupervisedComplaintRequest`, path                                        |
| `POST /copyright-eu-notices/:id/dispute-settlements`                             | Closed referral request and path                                                                     |
| `POST /copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes`        | Closed outcome request and path                                                                      |
| `POST /copyright-eu-notices/:id/dispute-settlements/:referralId/implementations` | Closed implementation request and path                                                               |
| `GET /copyright-eu-reports`                                                      | Required period query and closed `format` enum (`json`, `csv_notices`, `csv_complaints`)             |
| `POST /copyright-eu-reports`                                                     | Closed `CopyrightTerritorialReportRequest`                                                           |
| `POST /copyright-jurisdiction-policies`                                          | Closed `CopyrightJurisdictionPolicyRequest`                                                          |
| `POST /copyright-{eu,uk}-notices/:id/acknowledgment-failures`                    | `id` path only                                                                                       |
| `POST /copyright-jurisdiction-policies/:id/withdrawals`                          | `id` path only                                                                                       |

The request types live in `territorial-request-types.mts` beside the routes, and the compiler
extracts the schema from them, so the OpenAPI document, the request-contract bundle, and the runtime
check share one source. The EU handlers are split between `eu-copyright-routes.mts` (claimant) and
`eu-copyright-staff-routes.mts` (staff and reporting) to stay inside the file-length limit.
Compiler-built assertions in
[`copyright-territorial-request-contract-coverage.test.mts`](../../../backend/test-helpers/api-fixtures/openapi/copyright-territorial-request-contract-coverage.test.mts)
verify the emitted carriers, and
[`territorial-claimant-request-contract.test.mts`](../../../backend/api/v1/copyright-notices/territorial-claimant-request-contract.test.mts)
and
[`territorial-staff-request-contract.test.mts`](../../../backend/api/v1/copyright-notices/territorial-staff-request-contract.test.mts)
verify order, status, and no-write behavior against the real database.

## Handler order

Each handler keeps the order it had before the contract existed and adds the contract call last.

- EU notice receipt: intake kill switch (`503`), content type (`415`), optional authentication and
  rate limit, suspension when signed in, client-IP check (`400`), body read, CAPTCHA,
  `Idempotency-Key` (`400`), field parsers (`422`), closed contract (`422`), service.
- UK notice receipt: intake kill switch (`503`), content type (`415`), authentication (`401`),
  suspension, body read, CAPTCHA, `Idempotency-Key`, field parsers, contract, service.
- Redress request: content type, authentication, suspension, body read, CAPTCHA, path UUID,
  `Idempotency-Key`, field parsers, contract, service.
- Supervised complaint (EU): authentication, suspension, content type, body read, path UUID, field
  parsers, contract, service. It has no CAPTCHA, kill switch, or idempotency key.
- Staff routes (decisions, acknowledgment failures, Art. 21 records) and policy routes: authentication
  and role (`401`, `403`), rate limit, suspension, content type, body read, path UUIDs, field
  parsers, contract, service. The role check is on the route, so a caller without the role never
  reaches the contract.

- Report routes: authentication and review role, rate limit, suspension, reporting switch (`404`
  while disabled), then content type and closed body validation for POST, or query validation for
  GET, before the service. No jurisdiction approval is read. CSV midnight bounds are validated
  after the gate; invalid periods or formats answer `422`.

The route reads each path id and field parser result into a local in the order the handler already
evaluated them, so the first failing check is the same one that failed before.

## Statuses

The route-level field parsers run before the contract, so every rejection that existed keeps its
status and its field-named message. The contract only adds `422` for a body key the parsers did not
look at.

- A missing or mistyped `contact`, `content_description`, `grounds`, `hosted_use_url`, `explanation`,
  `statement`, `rationale`, `authority_reference`, `period_start`, `period_end`, `jurisdiction`, or
  `policy_version`, a `staff_disposition` outside `maintain` and `revoke`, a malformed path id, and
  a missing or malformed `Idempotency-Key` keep their existing status and message. The new decision
  fields `outcome`, `public_explanation`, and conditional `targets` are parser-validated with `422`.
  EU notifier name and email are bounded and email-validated; `has_good_faith_statement` must be `true`.
  Art. 21 parsers validate party, outcome, bounded body name, and timestamps before the closed
  contract rejects unknown keys.
- A redress decision `rationale` that is not a string is now rejected by
  `parseTerritorialRedressDecision` with `422` and `rationale is required`, the message the service
  already gave a missing or blank one. The staff role `403` is on the route and runs first, so no
  status or message changes.
- String lengths are not in the generated schema. Every length bound stays in the parsers and
  services (for example `policy_version` at 64, `authority_reference` at 200, `contact` at 4096,
  `hosted_use_url` at 2048, free-text receipt fields at 50,000, and `public_explanation` at 2,000).
  The decision parser also requires `targets` for `restrict` and forbids them for `no_action`; each
  target must explicitly identify a `post-image` and carry its post id, image id, and notifier URL.
- No status code changes for a valid request, and none for a request that already failed on a
  field the parsers check. A request that also carries an unknown key (or a non-string
  `cf_turnstile_response`) and that the service would have rejected with `404`, `409`, or an
  ownership `403` now answers `422` first; see "Rejections the service still decides".

### One acceptance change

`cf_turnstile_response` is optional and string-only on the four notice and redress bodies. A
non-string or explicit-`null` value used to proceed when CAPTCHA verification did not read it (an
attested caller, or Turnstile configured to always approve); it now answers `422`. A caller with
neither of those already failed CAPTCHA for a missing token. No client in the repository sends a
null token. Both cases are pinned in the route tests, and the coverage test asserts the token is a
plain optional string.

### Rejections the service still decides

These rejections depend on stored state and stay in the service, so a malformed body answers `422`
before them, as a missing field already did:

- Ownership `403` on a redress request: the notifier, an affected post owner, or a reviewer may
  file. A supervised complaint keeps its requester-or-reviewer authorization. A valid body reaches
  these checks; malformed bodies answer `422` first. A complaint replay is caller-scoped and
  precedes the six-month period check, which answers `422` once that recipient's window has ended.
- Jurisdiction availability `403` (`lockCurrentCopyrightJurisdictionPolicy`) applies to new receipts:
  the intake service checks current policy approval after its idempotent replay lookup. Post-receipt
  operations instead validate the stored receipt and its approval snapshot, so withdrawal does not
  block acknowledgment, decisions, enforcement, delivery, redress, complaint decisions, or
  restoration. Contract validation still precedes service-level ownership, existence, and conflict
  checks; the intake kill switch, authentication, and role checks run first where applicable.
- `404` for a missing notice and `409` for a reused key, an existing decision, or a repeated
  complaint. A request with an unknown key used to reach these and now answers `422` first. The
  route tests pin the missing-notice `404` on the redress, supervised complaint, and statement or
  review routes, and the recorded-decision and recorded-policy `409`, each beside the `422`.

## Carriers the generated schema does not check

Path ids are plain strings, so `validateUUIDParam` stays and answers a malformed id first. The three
path-only operations (both acknowledgment-failure routes and the policy withdrawal) read no body,
so their contract declares the path carrier only.

## Specialized ingress

No named exclusions. Every covered route reads a bounded JSON body (`1mb`) or none; none verifies a
signature over, or re-serializes, a raw body.

## Cross-client verification

The closed schemas reject unknown keys. The web EU form and complaint wrappers send only declared
keys and use the shared CAPTCHA/idempotency helpers. Art. 21 recording is staff API tooling until
the staff screen ships. Native EU UI remains deferred to #1229; see the
[client parity matrix](../CLIENT-PARITY-MATRIX.md).
