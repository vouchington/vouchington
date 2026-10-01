# Runtime Request Validation

Source entrypoint: [backend/services/runtime-request-validation/README.md](../../../../../backend/services/runtime-request-validation/README.md)

Compiles the generated v1 request-contract bundle into runtime validators for third-party API
routes. The shared registry validates request bodies, headers, path parameters, and query
parameters against the same compiler-extracted contracts used by the published API fixtures.

## Security boundary

Routes must perform their existing authentication, role, scope, ownership, and plan checks before
calling `RuntimeRequestValidatorRegistry.shared.validateAuthenticated(...)`. Keeping validation
after authorization prevents an unauthenticated caller from using detailed validation failures to
probe protected request shapes. Validation still runs before any service execution or side effect.

Unknown generated operation names fail closed. Known operations without a schema for a particular
request carrier accept that carrier unchanged, while invalid values return one redacted,
carrier-specific error suitable for a `422` response. The message names the carrier, for example
`Invalid request body`, and does not include a JSON pointer.

Public and optional-auth routes have no prior authorization boundary to validate after; instead,
they validate after their existing transport/origin/rate-limit/anti-enumeration safeguards (route
rate limiting, honeypot checks, attempt-limit counters) and before any service call. Some public or
protected routes also accept a field group that is legitimately absent as a whole (an all-or-nothing
pair); for these, the route's own presence/pairing check runs first and pins its status code for the
absent or partial case, and the generated schema only runs once that precondition holds. See
[`docs/requirements/api/v1/sessions-authentication/reference-request-validation.md`](../../../../requirements/api/v1/sessions-authentication/reference-request-validation.md)
for named examples of both patterns.

## Generated contracts

The registry consumes `@voucha/api-fixtures/v1/request-contracts.json`. Do not hand-edit that
artifact; regenerate it through the repository's API-contract tooling whenever an exposed request
shape changes.

The same file carries a `responses` map, which this registry ignores: only `operations` define
request coverage. `@voucha/tools` reads `responses` to derive MCP output schemas.

## Adoption

`@vouchington/request-contract-validation` compiles carriers, rejects duplicate header names, and
refuses asynchronous schemas. This package injects the generated bundle and keeps the fail-closed
error for an unknown operation. Route-family integrations should remain small adapters at their
existing authorization boundary and add focused tests proving that invalid input is rejected before
execution.

The first REST adopter is `validateRequestContract` in
[`backend/api/response-helpers.mts`](../../../../../backend/api/response-helpers.mts) — see
[`docs/requirements/api/README.md`](../../../../requirements/api/README.md#route-helpers) for its call pattern. Later route
families should reuse that adapter rather than calling this registry directly.

## Related

- [Backend services](../README.md)
- [Generated OpenAPI document](../../../../../api-fixtures/v1/openapi.json)
- [Generated request contracts](../../../../../api-fixtures/v1/request-contracts.json)
