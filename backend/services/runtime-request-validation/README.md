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
carrier-specific error suitable for a `400` response.

## Generated contracts

The registry consumes `@voucha/api-fixtures/v1/request-contracts.json`. Do not hand-edit that
artifact; regenerate it through the repository's API-contract tooling whenever an exposed request
shape changes.

## Adoption

This package provides the shared compiler and registry. Route-family integrations should remain
small adapters at their existing authorization boundary and add focused tests proving that invalid
input is rejected before execution.

## Related

- [Backend services](../README.md)
- [Generated OpenAPI document](../../../api-fixtures/v1/openapi.json)
- [Generated request contracts](../../../api-fixtures/v1/request-contracts.json)
