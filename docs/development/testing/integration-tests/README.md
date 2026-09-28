# Integration Tests

Source entrypoint: [integration-tests/README.md](../../../../integration-tests/README.md)

Fetch-based full-stack and API-helper integration tests. See [web/AGENTS.md](../../../../integration-tests/web/AGENTS.md) for agent conventions.

## No-Mock Policy

**Test files inside `integration-tests/` must not use mocking libraries.** Specifically, `vi.mock`,
`vi.doMock`, `vi.importMock`, `vi.fn`, `vi.spyOn`, `vi.stubGlobal`, `jest.mock`, `jest.doMock`, `msw`
(including subpaths like `msw/node`, both static and dynamic `import('msw/...')`), `nock`, and
`sinon` are forbidden in any `.mts` file under this directory. This rule is enforced automatically
by the repo-file-policy static analysis check.

The only permitted form of test isolation is `globalThis.fetch` reassignment, which is a **real URL
router** — it forwards relative paths to the in-process backend rather than fabricating responses.

**Permitted external-boundary setup** (lives in `backend/test-helpers/`, not this folder): the
`web-api` Vitest project's `setupFiles` include `vitest.setup.aws-mocks.mts` (mocks the AWS S3
presigner) and `vitest.setup.captcha-skip.mts` (skips captcha via an env flag). These sit at the
external-provider boundary and are permitted per the repo mock policy.

## Coverage

The `web-api` and `web-integration` Vitest projects run with `--coverage` in CI and instrument
`web/lib/api/**` source. The web area's full-LCOV patch gate enforces **100%** coverage for
`web/lib/api/**` under `.coverage-rules.yml`. Local coverage preview commands are not a CI
contract; run the owning suite locally and use the area's full-LCOV `area-check` only after
collecting its artifacts.

### Integration-infeasible files

The following files wrap external providers (Stripe, OAuth providers, WebAuthn/passkey hardware,
external image proxy) that require browser APIs or live external services not available in an
in-process backend test. They remain covered by colocated `*.mock.test.ts` unit tests in the `web`
project:

- `web/lib/api/client/memberships.ts` — Stripe checkout session creation
- `web/lib/api/client/identity-verification.ts` — identity-verification checkout
- `web/lib/api/client/auth.ts` (OAuth/WebAuthn/MFA portions) — `continueOAuthLogin`,
  `connectOAuthAccount`, `disconnectOAuthAccount`, `setupTotp`, `verifyTotpSetup`,
  TOTP-authenticator helpers, MFA-passkey helpers, re-auth helpers

## Test Suites

| Suite                                       | Directory                                                              | Command                         | Vitest project    |
| ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- | ----------------- |
| Full-stack (CF Worker → Next.js → backend)  | [`integration-tests/web/`](../../../../integration-tests/web/)         | `pnpm run test:integration:web` | `web-integration` |
| API-helper (web/lib/api → backend directly) | [`integration-tests/web-api/`](../../../../integration-tests/web-api/) | `pnpm run test:web-api`         | `web-api`         |

For browser, hydration, and interaction tests, see [`playwright/`](../../../../playwright/).

## [`integration-tests/web/`](../../../../integration-tests/web/)

Covers the full `client → Cloudflare Worker → Next.js → backend` path. Tests are built against the compiled Next.js app via the web integration workflow.

Use this suite for behavior that can be verified with `fetch` and parsed SSR HTML instead of a real
browser: status codes, redirects, route existence, headers/cache behavior, `robots.txt`/`llms.txt`,
metadata, canonical links, JSON-LD, static copy, and external-link attributes.

**Setup:** `pnpm run test:integration:web` automatically runs the `pretest:integration:web` step. Run `pnpm run test:integration:web:setup` manually when you want to prebuild once and then run `pnpm exec vitest --project web-integration` directly.

Helpers live in [`integration-tests/web/helpers/`](../../../../integration-tests/web/helpers/).

## [`integration-tests/web-api/`](../../../../integration-tests/web-api/)

Covers `web/lib/api/**` helpers talking directly to the backend (bypasses Next.js and CF Worker).

No setup step required — tests start an in-process backend server on an ephemeral port and point `NEXT_PUBLIC_API_BASE_URL` to it automatically. `DATABASE_URL` from `.env` is still needed for the in-process server to reach the database.

## Related

- [Web integration AGENTS.md](../../../../integration-tests/web/AGENTS.md) — Agent conventions and rules
- [Playwright](../playwright/README.md) — Browser and interaction tests
- [Backend test helpers](../backend/helpers.md) — Shared entity factories
