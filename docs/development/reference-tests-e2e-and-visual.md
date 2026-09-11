# E2E and Visual

[Back to Tests and Checks](tests.md#e2e-and-visual)

| Command                    | What                                   | Init |
| -------------------------- | -------------------------------------- | ---- |
| `pnpm run test:playwright` | E2E, a11y page scans, visual snapshots | web  |

In CI, PRs run the Playwright specs selected by the `no-mistakes` N-API test-plan
environment `pullRequest` (direct, coverage, dependency, and 1% sample groups), falling
back to the full suite for configured high-risk dependency changes or the `playwright:full`
PR label. Main pushes run the full suite when Playwright tests run at all — docs-only
changes short-circuit CI and skip all test jobs. See [ci.md § Playwright CI Selection](ci.md#playwright-ci-selection) for the full rules and configuration variables.

Inspect local planner behavior with:

```bash
pnpm exec no-mistakes tests plan playwright --environment pullRequest --changed-file web/components/sidebar-site-footer.tsx --changed-file web/app/layout.tsx --format json > plan.json
pnpm exec no-mistakes tests why playwright/tests/navigation/sidebar.spec.mts --plan plan.json --format json
```

### Credentialed E2E Suite

A separate credentialed suite lives under `playwright/credentialed/` and uses
`playwright.credentialed.config.mts`. It tests features that require real cloud credentials:
real S3 presigned PUT uploads (CORS validation) and real OpenAI chat responses. Run it locally with:

```bash
source .env
pnpm exec playwright test --config playwright.credentialed.config.mts
```

Individual specs skip themselves when credentials are absent (`S3_AWS_ACCESS_KEY_ID`,
`AWS_ACCESS_KEY_ID`, or `OPENAI_API_KEY`), so the command is safe to run without credentials.
In CI, the suite runs only on trusted PRs via the `test-playwright-credentialed` job.
See [ci.md § Playwright CI Selection](ci.md#playwright-ci-selection) for details.

Playwright and web-integration tests always run against **production builds** — never dev
servers. `pnpm run test:playwright` and `pnpm run test:integration:web` automatically build
both targets first (`ci/setup-web-integration.mts` via the `pretest:*` lifecycle hooks). The
Next.js standalone server (`node server.js`) and the pre-built Cloudflare Worker bundle
(`wrangler dev dist/index.js --no-bundle`) are the only accepted server modes for automation.
`next dev` and on-the-fly `wrangler dev` (without `--no-bundle`) are dev-loop only
(`./dev/tmux`, `pnpm --dir web dev`).

Next.js automation builds set `NEXT_TEST_BUILD=1`, which keeps `reactCompiler: true` but
skips build-only post-processing that does not affect localhost behavior: JS minification,
and Next.js gzip compression.
In React Compiler work, a **compiler-enabled build test** means this `NEXT_TEST_BUILD=1` Next.js
build: it proves production source is transformed by the compiler. It does not mean compiling
Vitest or Storybook, which remain behavior-focused and intentionally use their normal transforms.
Docker image builds and manual `pnpm --dir web build` runs do not set this flag, so production builds
keep the full production optimization path. Set `NEXT_TEST_BUILD=0` before local automation
commands when debugging fully optimized build behavior.

In-build TypeScript type checking is disabled for **every** build
(`typescript.ignoreBuildErrors: true`), not just `NEXT_TEST_BUILD` ones. Types are still
checked by the dedicated `Typecheck web` step in `tests-web.yml`
(`next typegen && tsc --noEmit --incremental`), which runs before the test workflow's
build and gates the main web build; type errors never affect `next build`'s emit anyway, so the in-build pass is
pure redundant work (~46s/build). Note: `build-web.yml` triggered via `workflow_dispatch`,
and local `pnpm --dir web build` runs, bypass that gate — run `pnpm run typecheck:web`
explicitly in those contexts.

Test setup also clears Next.js runtime output and Wrangler/Miniflare state before starting
servers. This is stale-cache prevention: old `.next` output or persisted worker cache can
produce false failures such as hydration mismatches or cached stale HTML. Persistent runners may
preserve `web/.next/cache` as build-performance state; it is never treated as runtime output.
