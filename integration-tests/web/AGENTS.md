# Web integration tests

- Load skills: `test-authoring`, `testing-rules`.
- Suite docs: [integration test index](../../docs/development/testing/integration-tests/README.md).
- Tests exercise `client → Cloudflare Worker → Next.js → backend`.
- Boot built Worker and Next standalone artifacts.
- Use plain `fetch`, never browser/Playwright automation. Worker traffic always uses
  `WebIntegrationClient.request()` in `helpers/client.mts`, preserving restart-window transport retry.
- Persist backend fan-out for every HTML load in page artifact JSON; print it only with
  `WEB_INTEGRATION_VERBOSE=1`.
