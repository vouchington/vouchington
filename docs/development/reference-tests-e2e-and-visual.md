# E2E and Visual

[Back to Tests and Checks](tests.md#e2e-and-visual)

`pnpm run test:playwright` runs E2E, a11y page scans, and visual snapshots against production builds. CI runs the full suite whenever the Playwright path filter matches; docs-only changes skip all test jobs ([area test suites](ci.md#area-test-suites)).

## Timeouts

Playwright tests have a maximum deadline in every config. The shared config and a browser-free fixture reject disabled, non-finite, or over-limit deadlines, and AST-grep rejects in-test deadline changes such as `test.setTimeout` and `test.slow`. Action, navigation, assertion, protocol, and web-server startup timeouts keep their own budgets. Shorten slow scenarios or seed closer to the behavior under test instead of extending a deadline.

## Credentialed suite

`playwright/credentialed/` (with `playwright.credentialed.config.mts`) covers features that need real cloud credentials: real S3 presigned uploads and sideloaded images through the image lambda. A spec fails when its credentials are absent ([R6](tests.md#test-suite-rules)). CI runs it only in a trusted secret context; the job is informational and does not gate `web` ([live-provider smoke checks](tests.md#live-provider-smoke-checks)).

## Production builds only

Playwright and web-integration tests run against production builds, never dev servers: the Next.js standalone server and the pre-built Cloudflare Worker bundle are the only accepted modes for automation. `next dev` and on-the-fly `wrangler dev` are dev-loop only. Local automation builds default to `NEXT_TEST_BUILD=1` (React Compiler stays on; minification and gzip are skipped); CI sets `NEXT_TEST_BUILD=0`. Set it to 0 locally when reproducing CI's fully optimized build. A compiler-enabled build test can use the local build, but Vitest and Storybook intentionally keep their normal transforms.

In-build TypeScript checking is disabled for every build (`typescript.ignoreBuildErrors`); the dedicated typecheck step gates instead, so direct `pnpm --dir web build` runs bypass it and need `pnpm run typecheck:web`.

Test setup clears Next.js runtime output and Wrangler/Miniflare state before starting servers, because stale `.next` output or persisted worker cache produces false failures such as hydration mismatches and cached stale HTML. `web/.next/cache` is build-performance state and may be preserved.
