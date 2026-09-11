# Integration Tests

Fetch-based full-stack and API-helper integration tests. See [web/CLAUDE.md](web/CLAUDE.md) for agent conventions.

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
`web/lib/api/**` source. Patch coverage for `web/lib/api/**` is enforced at **100%** by
`.coverage-rules.yml`.

To measure integration-suite-only coverage of `web/lib/api/` locally:

```sh
pnpm run test:web-api:coverage
```

This runs the `web-api` project with `VITEST_COVERAGE_SCOPE=web-lib-api`, scoping the report to
`web/lib/api/**/*.{ts,mts}`. The `web-integration` project is excluded from this command because it
requires prebuilt CF Worker + Next.js artifacts (run `pnpm run test:integration:web:setup` first if
you also want full-stack coverage).
Local coverage loads the validated worktree `.env`, then removes `CF_WORKER_SECRET` for both
projects so API-helper and full-stack coverage cannot inherit Worker-to-backend authentication.

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

| Suite                                       | Directory                                | Command                         | Vitest project    |
| ------------------------------------------- | ---------------------------------------- | ------------------------------- | ----------------- |
| Full-stack (CF Worker → Next.js → backend)  | [`integration-tests/web/`](web/)         | `pnpm run test:integration:web` | `web-integration` |
| API-helper (web/lib/api → backend directly) | [`integration-tests/web-api/`](web-api/) | `pnpm run test:web-api`         | `web-api`         |

For browser, hydration, and interaction tests, see [`playwright/`](../playwright/).

## [`integration-tests/web/`](web/)

Covers the full `client → Cloudflare Worker → Next.js → backend` path. Tests are built against the compiled Next.js app via the web integration workflow.

Use this suite for behavior that can be verified with `fetch` and parsed SSR HTML instead of a real
browser: status codes, redirects, route existence, headers/cache behavior, `robots.txt`/`llms.txt`,
metadata, canonical links, JSON-LD, static copy, and external-link attributes.

**Setup:** `pnpm run test:integration:web` automatically runs the `pretest:integration:web` step. Run `pnpm run test:integration:web:setup` manually when you want to prebuild once and then run `pnpm exec vitest --project web-integration` directly.

Helpers live in [`integration-tests/web/helpers/`](web/helpers/).

## [`integration-tests/web-api/`](web-api/)

Covers `web/lib/api/**` helpers talking directly to the backend (bypasses Next.js and CF Worker).

No setup step required — tests start an in-process backend server on an ephemeral port and point `NEXT_PUBLIC_API_BASE_URL` to it automatically. `DATABASE_URL` from `.env` is still needed for the in-process server to reach the database.

## Related

- [Web integration CLAUDE.md](web/CLAUDE.md) — Agent conventions and rules
- [Playwright](../playwright/README.md) — Browser and interaction tests
- [Backend test helpers](../backend/test-helpers/README.md) — Shared entity factories
