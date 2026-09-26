# Adding a Trusted/Credentialed CI Job

[Back to CI Reference](ci.md)

These are the predictable failure modes when wiring a new job that needs real cloud credentials (AWS OIDC role, external API keys). Each cost multiple fix commits in PR #4358 — document them once so future jobs get them right the first time.

Before renaming a repo variable, secret, workflow input, or package-boundary token, run
`./dev/audit-rename OLD_NAME NEW_NAME` and review the grouped old-name and new-name matches across
Vouchington app code, dev scripts, `.env.example`, and CI/deploy workflows. Search the separate
`vouchington-infra` checkout independently when the rename crosses its private deployment contract.

### 1. Unique concurrency group

Every reusable workflow must declare its own `concurrency.group`. The group name must be unique across all workflows — include the workflow name and `github.event.pull_request.number || github.sha`. See the [GitHub Actions checklist](../checklists/github-actions.md) and [runner concurrency topology](../../.github/workflows/reference-github-actions-concurrency-locks.md).

### 2. Path filters in both places

There are two distinct filter locations, both must be updated:

**Primary filter** (`ci.yml` → `detect-changes` job → `dorny/paths-filter` step `id: filter`): add a named entry listing source paths that should trigger the job. Example: `playwright-credentialed` lists its config and the web/backend source paths that exercise the credentialed features. Do not add workflow or local-action paths: the `workflow-action-changes` filter already starts every area job for those edits.

**Fan-in `if:` condition** (`ci.yml` → the new job): gate the job on `needs.detect-changes.outputs.<filter-name> == 'true'`. A filter that exists in the `filter` step but is **not** referenced in the job's `if:` means the job never runs on path-matched PRs. The `tests-playwright-credentialed.test.mts` workflow consistency test (`github-actions` Vitest project) catches this: it asserts that every credentialed job's `if:` references a filter name that exists in the `detect-changes` step.

The `refine-runtime-web` step (`id: refine-runtime-web`) applies additional negated globs to strip Markdown/test/Storybook-only changes from expensive runtime jobs. Positive-only filters such as the PR-only `build-backend-infra` and `build-web-infra` filters remain in the primary filter step (`id: filter`) and are exported directly from it.

**Filter hygiene example:** the storybook filter includes `pnpm-lock.yaml` (a real dep change must trigger story re-validation) but intentionally omits root `package.json` (automated version bumps from `pr-shepherd` only change the `version` field, which doesn't affect story content or dependencies). When a refined filter changes, update **both** the primary filter list and the corresponding brace-group glob in `refine-runtime-web`; positive-only filters instead need exact match/miss coverage. The `vitest-ci-triggers.part-2.test.mts` test (`github-actions` project) enforces both forms.

**Contrast — the PR Docker filters exclude the lockfile:** unlike storybook, `build-backend-infra` and `build-web-infra` deliberately omit both `pnpm-lock.yaml` and root `package.json`. The lockfile is monorepo-wide, so any dependency change anywhere (a web-only bump, a `cloudflare-worker`/`lambdas`/dev-tooling bump, or a change scoped to the opposite image) would otherwise rebuild both images regardless of whether their bytes actually change. Each filter instead keys on the per-workspace `package.json` manifests that are actually copied into that image's Dockerfile (see [AUTHORING.md § Docker Image Path Filters](../../.github/workflows/AUTHORING.md#docker-image-path-filters)), which is the precise signal that a dependency going into _that_ image changed. The tradeoff: a transitive-only dependency bump (lockfile moves, no in-subgraph manifest touched) is not validated pre-merge — it is built, smoke-tested, and scanned by the `main` build instead, since `main-backend.yml`/`main-web.yml` `on.push.paths` still include `pnpm-lock.yaml`. The `vitest-ci-triggers.part-4.test.mts` test enforces both the per-workspace matches and the lockfile/cross-half misses.

### 3. Role-assumption env and secrets at job level

AWS OIDC role assumption and external API key secrets must be declared at **job level** (not step level), and gated on `trusted-secret-context`. Model: the `test-playwright-credentialed` job in `ci.yml` uses:

```yaml
needs.detect-changes.outputs.trusted-secret-context == 'true'
```

in its `if:`, and passes secrets only when that output is `'true'`:

```yaml
secrets:
  OPENAI_API_KEY: ${{ needs.detect-changes.outputs.trusted-secret-context == 'true' && secrets.OPENAI_API_KEY || '' }}
```

The `__tests__/secret-context.permissions.test.mts` and `__tests__/secret-context.wiring.test.mts` files (`github-actions` project) validate that credentialed jobs have the correct permissions, secrets wiring, and `trusted-secret-context` gating.

### 4. CORS origin exactness

CORS `Access-Control-Allow-Origin` entries require the exact scheme + host + port. `http://localhost:8787` and `https://localhost:8787` are different origins. Locally wrangler dev defaults to HTTP; use `http://` in test CORS configs.
