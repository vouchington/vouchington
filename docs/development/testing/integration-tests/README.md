# Integration Tests

Source entrypoint: [integration-tests/README.md](../../../../integration-tests/README.md). Agent conventions: [web/AGENTS.md](../../../../integration-tests/web/AGENTS.md).

Fetch-based full-stack (`integration-tests/web/`, project `web-integration`) and API-helper (`integration-tests/web-api/`, project `web-api`) tests. Browser, hydration, and interaction tests belong in [`playwright/`](../playwright/README.md).

## No-mock policy

Test files under `integration-tests/` do not use mocking libraries (`vi.mock`, `vi.fn`, `vi.spyOn`, `msw`, `nock`, `sinon`, and the like); `repo-file-policy` enforces this. The one permitted isolation is a `globalThis.fetch` reassignment that is a real URL router forwarding relative paths to the in-process backend, not one that fabricates responses. External-provider boundary setup (the AWS presigner mock, the captcha skip flag) lives in `backend/test-helpers/`, not here.

In-process API servers use `createWebApiTestServer()`, which keeps the production request-client-info listener; browser URL routers use `buildWebApiTestProxyHeaders()` to assign the same first-party headers as the Next.js proxy. Deliberately bare listeners are limited to assertions that exclude that HTTP boundary.

## Coverage

`web/lib/api/**` must stay fully covered in the web area's patch gate. Files that wrap external providers needing browser APIs or live services (Stripe checkout, identity verification, OAuth/WebAuthn/MFA parts of `auth.ts`) cannot run in-process and are covered by colocated `*.mock.test.ts` unit tests in the `web` project instead.
