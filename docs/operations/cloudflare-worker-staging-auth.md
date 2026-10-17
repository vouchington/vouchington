# Staging Worker Authentication

This public guide defines the application-owned authentication boundary for staging. Provider
controls, environment endpoints, access groups, credentials, and deployment commands are maintained
in private `vouchington-infra` operator runbooks.

## Behavior

- `BASIC_AUTH_CREDENTIALS` enables the gate. An unset or empty value disables it; any malformed
  configured entry keeps the gate enabled and fails closed with `401`.
- Covered requests consume the identity rate limiter before credentials are checked. A rejected
  request therefore returns `429` before an authentication response. Geo-blocked requests are
  rejected with `403` before this gate, so they do not consume the limiter or receive a Basic
  challenge.
- Ordinary clients send HTTP Basic credentials in `Authorization`. A backend Bearer request may put
  its Basic credential in `X-Voucha-Staging-Authorization`; ambiguous, duplicated, or malformed
  header combinations fail closed.
- Every staging control header is stripped before origin, cache, or service-binding forwarding, so
  credentials and fault controls cannot reach application logs or affect cache keys.
- The source of truth for method-scoped exemptions is `BASIC_AUTH_EXEMPT_METHODS_BY_PATH` in
  [`basic-auth.mts`](../../cloudflare-worker/src/basic-auth.mts). It covers machine ingress that has
  its own signature or bearer authentication, public federation discovery, health/cache-control
  endpoints, OAuth broker callbacks, and the credential-omitting Web App Manifest fetch. A
  wrong-method request is not exempt.
- The edge-cache canary remains protected by staging authentication. Its fault controls require the
  dedicated canary secret and accept only the source-defined fault kinds; the gateway converts them
  to an internal enum and strips all external and internal control headers before forwarding.

## Operator contract

- Use the approved staging identity and verify the target environment before
  a diagnostic or deployment action.
- Grant only the minimum read, deploy, or tail capability needed for the
  authorized task; do not substitute a broader identity after denial.
- Treat Worker access credentials and access-control configuration as secrets.
  Never include them in source, tickets, logs, or public documentation.
- Rotation is a two-deployment operation: add the replacement credential, validate it, then remove
  the retired credential. Follow the private runbook for provider-specific commands.

## Verify

After an authorized staging change, observe all of the following without recording credentials:

1. An unauthenticated covered request receives `401` with a Basic challenge, while an intentionally
   rate-limited request receives `429` first. A geo-blocked request receives `403` before either.
2. Both the retained and replacement credentials work during rotation; only the replacement works
   after retirement.
3. A Bearer request with the secondary staging-auth header reaches the backend, and the backend does
   not receive that secondary header.
4. Representative method-scoped machine and discovery exemptions reach their own authentication or
   route boundary; the same paths with a wrong method remain gated.
5. The protected edge-cache canary exercises a cache miss/hit and each supported fault kind without
   exposing control headers or changing the cache key.

Record authorization, scope, environment, validation result, and expiry in the private operator
record. If any check fails, stop the rollout and use the private rollback procedure.
