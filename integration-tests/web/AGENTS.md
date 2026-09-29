# Web integration tests

- Tests exercise `client → Cloudflare Worker → Next.js → backend`; use [suite docs](../../docs/development/testing/integration-tests/web/README.md) and [test commands](../../docs/development/tests.md).
- Boot built Worker and Next standalone artifacts; fail fast when missing, never implicitly build. Prebuild state is explicit, deterministic, and reusable.
- Repeated runs need no manual cleanup. Reseed/overwrite only suite-owned state; never depend on pristine databases.
- Use plain `fetch`, never browser/Playwright automation. Worker traffic always uses `WebIntegrationClient.request()` in `helpers/client.mts`, preserving restart-window transport retry.
- Persist backend fan-out for every HTML load in page artifact JSON. Print only with `WEB_INTEGRATION_VERBOSE=1`; leave unset in CI.
- Fail on every traced backend `5xx` during rendering.
