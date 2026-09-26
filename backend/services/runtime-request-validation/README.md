# Runtime Request Validation

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
carrier-specific error suitable for a `422` response.

Public and optional-auth routes have no prior authorization boundary to validate after; instead,
they validate after their existing transport/origin/rate-limit/anti-enumeration safeguards (route
rate limiting, honeypot checks, attempt-limit counters) and before any service call. Some public or
protected routes also accept a field group that is legitimately absent as a whole (an all-or-nothing
pair); for these, the route's own presence/pairing check runs first and pins its status code for the
absent or partial case, and the generated schema only runs once that precondition holds. See
[`backend/api/v1/sessions-authentication/reference-request-validation.md`](../../api/v1/sessions-authentication/reference-request-validation.md)
for named examples of both patterns.

## Generated contracts

The registry consumes `@voucha/api-fixtures/v1/request-contracts.json`. Do not hand-edit that
artifact; regenerate it through the repository's API-contract tooling whenever an exposed request
shape changes.

## Adoption

This package provides the shared compiler and registry. Route-family integrations should remain
small adapters at their existing authorization boundary and add focused tests proving that invalid
input is rejected before execution.

The first REST adopter is `validateRequestContract` in
[`backend/api/response-helpers.mts`](../../api/response-helpers.mts) — see
[`backend/api/README.md`](../../api/README.md#route-helpers) for its call pattern. Later route
families should reuse that adapter rather than calling this registry directly.

## Related

- [Backend services](../README.md)
- [Generated OpenAPI document](../../../api-fixtures/v1/openapi.json)
- [Generated request contracts](../../../api-fixtures/v1/request-contracts.json)
