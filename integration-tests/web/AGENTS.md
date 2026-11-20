# Web integration tests

- Suite docs: [integration test index](../../docs/development/testing/integration-tests/README.md).
- Tests exercise `client → Cloudflare Worker → Next.js → backend`.
- Boot built Worker and Next standalone artifacts; fail fast when missing, never implicitly build.
  Prebuild state is explicit, deterministic, and reusable.
- Reserve child-process ports outside the kernel ephemeral range. A `listen(0)` port can be taken
  as a connect source port before the child binds.
- Repeated runs need no manual cleanup. Reseed/overwrite only suite-owned state; never depend on
  pristine databases.
- Use plain `fetch`, never browser/Playwright automation. Worker traffic always uses
  `WebIntegrationClient.request()` in `helpers/client.mts`, preserving restart-window transport retry.
- Persist backend fan-out for every HTML load in page artifact JSON; print it only with
  `WEB_INTEGRATION_VERBOSE=1`.
- Fail on every traced backend `5xx` during rendering.
