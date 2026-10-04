# Request validation

[Back to API Routes](README.md#route-helpers)

Routes authenticate and complete admission, visibility, suspension, and non-mutating ownership
preflights before detailed generated request validation. The generated path/body/query check then
runs before semantic resolution or writes; services retain authorization guards and transactional
rechecks. A lag-sensitive mutation preflight reads from the primary when it must observe a
preceding write.

```mermaid
flowchart LR
  admission[auth and admission] --> preflight[visibility or ownership preflight]
  preflight --> prepare[pure query preparation]
  prepare --> contract[generated path body query validation]
  contract --> resolve[semantic resolution]
  resolve --> recheck[service authorization and transactional recheck]
  recheck --> write[service write]
```

`validateRequestContract` is backed by `@services/runtime-request-validation`, which compiles the
generated bundle with `@vouchington/request-contract-validation`. Routes use the adapter rather
than its registry. A 422 names the carrier and does not include a JSON pointer. Signature-verified and raw-body routes keep their specialized
parsers. Query routes prepare a normalized wire projection before asynchronous identifier
resolution, preserving pagination clamping and malformed limit/cursor 400 behavior while malformed
typed values remain visible for 422. There is no shared Ajv coercion, and UUID routes retain
`validateUUIDParam` alongside generated path validation. A paginated list route runs its pagination
parser first, overwrites `limit` and `after` in the prepared query with the parsed values, and then
validates, so clamping and the parser's `400` survive and only the filters are checked;
[`validate-paginated-query.mts`](../../../backend/api/validate-paginated-query.mts) wraps those steps.
A lenient filter (an unknown enum that falls back to its default, or an ignored key) is validated
from its settled value so it cannot answer `422`.

The route inventory also covers ordinary query readers that previously had no declared query
carrier, including public search and trending feeds, communities, hostnames, localization,
recommendations, and staff integrity lists. Each declares its consumed query shape with
`apiQuery` and validates the same settled values it passes to its service. Existing authentication,
role checks, cursor parsing, and route-specific `400` preconditions run first; a malformed typed
query value that reaches the generated boundary answers `422` before service work.

The source-derived inventory includes every registered public REST and MCP route, including
protocol routes outside `/api/v1`. Its specialized entries include the six previously reviewed
MCP/admin-MCP, Apple, Google, email-unsubscribe, and OAuth broker callback cases; Bluesky's
AT Protocol OAuth callback; and seven public ActivityPub, WebFinger, and OAuth protocol routes.
Bluesky is an additional source-audited exception to the earlier six-case readiness list: its
state is consumed by the AT Protocol SDK parser and its successful response remains the
protocol-required redirect. The catalog also records six input-free public metadata/discovery
routes outside `/api/v1`; any new registered route must be assigned to a validated, specialized,
or explicitly input-free class.

A typed raw-body declaration or explicit request-contract marker must emit a meaningful body
schema: invoking the adapter against an empty object is not coverage. Compiler-built request-bundle
assertions in [API fixtures](../../../backend/test-helpers/api-fixtures/openapi/write-openapi.test.mts) verify
emitted carriers and schemas; route HTTP tests verify invocation order, status, and no-write
behavior.

## Coverage by route family

- [Content, list, household and public user routes](reference-content-routes-request-validation.md)
  record the validated operations, free-form path carriers, and the 400-versus-422
  decisions for that family.
- [Staff, admin, and operations routes](reference-staff-operations-request-validation.md) record
  their status changes, carrier skips, and specialized ingress.
- [Copyright notice, appeal, and counter-notice routes](reference-copyright-submission-request-validation.md)
  record their handler order, kept statuses, and cross-client verification.
- [Copyright guest capability and guest filing routes](reference-copyright-guest-request-validation.md)
  record their handler order, kept statuses, and why the capability header is never validated.
- [Copyright EU, UK, and jurisdiction policy routes](reference-copyright-territorial-request-validation.md)
  record the closed bodies, the one explicit-null `cf_turnstile_response` acceptance change, and the
  rejections the service still decides (ownership and jurisdiction availability `403`, `404`, `409`).
- [Copyright repeat-infringer and staff queue routes](reference-copyright-staff-request-validation.md)
  record their handler order, kept statuses, and the administrator-action ordering note.
- [Copyright email-intake routes](reference-copyright-email-intake-request-validation.md) record
  their handler order, the parsers that run before the contract, and the unknown-key `422` changes.
- [Copyright submission review routes](reference-copyright-submission-review-request-validation.md)
  record their handler order, the unknown-key `422` changes, and the carrier-free media-delivery
  replay skip.
- [Copyright staff decision routes](reference-copyright-staff-decision-request-validation.md) record
  the form-intake, restriction, and legal-hold resolution bodies, the lenient image-similarity
  `limit`, the body-free replay and staydown routes, and the one `500` to `422` change.
