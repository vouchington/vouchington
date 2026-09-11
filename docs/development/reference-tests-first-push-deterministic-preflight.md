# First-Push Deterministic Preflight

[Back to Tests and Checks](tests.md#first-push-deterministic-preflight)

Agents should batch local fixes before the first push because commits are cheap and pushes are
expensive. GitHub Actions is the full gate. Run only the cheap local commands from
[Before Pushing](../../.agents/skills/agent-workflow/before-pushing.md), then push.

1. `pnpm exec oxlint --deny-warnings --type-aware <changed TS/MTS files>`
2. `pnpm exec vitest run <directly changed test files> --bail=3`
3. `git diff --name-only origin/main...HEAD`
4. `pnpm exec oxfmt --check <changed supported files>`

Do not run `pnpm run no-mistakes`, Knip, typecheck-\*, dep-cruise, Playwright, or native harnesses
as a before-push requirement. Reproduce a CI failure from [tests.md](tests.md) and [ci.md](ci.md).

If the most recent `git rebase origin/main` touched `pnpm-lock.yaml`, run `pnpm install` before the
next `pnpm` command — see the `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` row in
[Local Web Validation Recovery](reference-tests-local-web-validation-recovery.md#local-web-validation-recovery).
Always unblock with `pnpm install` (no flags). Never use `pnpm install --frozen-lockfile` after a
rebase. `.husky/post-rewrite` handles rebase, `.husky/post-merge` handles merge, and
`.husky/post-checkout` handles branch switches that change manifests.

### Review-Anticipation Checks

CI owns the static-analysis matrix, Storybook component coverage, and `data-pw` Playwright selector
coverage (`no-mistakes` `playwright-coverage` in `.no-mistakes.yml`). Add a story or exclusion when
`web/components/` or `web/storybook/` changes. Add or update a Playwright spec when a `data-pw`
attribute is added, changed, or removed.

DB-backed tests run against persistent dirty databases. Fixtures must randomize IDs, slugs, usernames, hostnames, titles, and other unique fields. Cleanup tests should use `createTestRetentionWindow()` from `@voucha/test-helpers`, pass its fixed `now` and `lowerBoundDate`, and assert owned fixture IDs instead of exact global counts. Duplicate-detection tests that need matching titles/slugs should derive all repeated fields from one per-test random suffix.

Backend API tests using `createRequest()` get a unique `X-Forwarded-For` value per Supertest agent so route-rate-limit IP buckets stay isolated across parallel files and CI shards. Tests that intentionally assert shared IP rate limiting should override `x-forwarded-for` explicitly on the requests that must share a bucket.

Parser, tokenizer, serializer, decoder, and format-library replacements must start with characterization tests for the current behavior. Use the [Parser and Library Swap Checklist](../checklists/parser-library-swap.md) before swapping implementations so malformed input, legacy encodings, language-specific quoting, scalar coercion, offsets, and fallback behavior are covered first.

`__tests__` directories are for executable tests only. Shared TypeScript helpers, registries, fixture loaders, and assertion support must live in a nearby `test-helpers/` directory or an existing workspace helper package. The `no-exports-in-tests-folder*` AST-grep rules enforce this for `.ts`, `.mts`, `.cts`, and `.tsx` files by banning exports under `**/__tests__/**`; the `backend-no-test-file-imports` rule separately bans backend Vitest files from importing or dynamically loading other backend `*.test.mts` files so shared support stays in helper modules instead of drifting between tests. Keep literal shell/script fixture strings in tests instead of adding regex exceptions. Swift and .NET test bundles still use their native `Tests/` project layouts for fixture and registry files, so add a dedicated test-support target/project before introducing equivalent native guards.
