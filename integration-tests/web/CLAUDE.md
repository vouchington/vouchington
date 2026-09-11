# Web Integration Tests

Fetch-based full-stack tests: `client → Cloudflare Worker → Next.js → backend`. Use
[README.md](README.md) and [tests.md](../../docs/development/tests.md) for commands, architecture,
patterns, and coverage gaps.

## Rules

- Suite must boot the built Cloudflare Worker and built Next.js standalone server. Global setup must fail fast if build artifacts are missing — do not build them implicitly.
- Repeated runs must pass without manual cleanup between runs.
- Tests must not depend on a pristine database; setup must reseed or overwrite only state the suite owns.
- Any prebuild state must be explicit, deterministic, and reusable.
- Tests use plain `fetch`, not Playwright or browser automation.
- All worker traffic goes through `WebIntegrationClient.request()` (`helpers/client.mts`); do not `fetch` the worker origin directly — that bypasses the restart-window transport retry that makes a supervised `wrangler dev` restart (#10819) transparent to the suite.
- Record backend API fan-out for every HTML page load (persisted to the page artifact JSON). Print to stdout only when `WEB_INTEGRATION_VERBOSE=1` is set; leave it unset in CI to reduce noise.
- Fail on any traced backend `5xx` during page rendering.
