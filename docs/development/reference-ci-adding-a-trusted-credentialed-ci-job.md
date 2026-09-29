# Adding a Trusted/Credentialed CI Job

[Back to CI Reference](ci.md)

These are the predictable failure modes when wiring a new job that needs real cloud credentials (AWS OIDC role, external API keys). Each cost multiple fix commits in PR #4358 — document them once so future jobs get them right the first time.

Before renaming a repo variable, secret, workflow input, or package-boundary token, run
`./dev/audit-rename OLD_NAME NEW_NAME` and review the grouped old-name and new-name matches across
Vouchington app code, dev scripts, `.env.example`, and CI/deploy workflows. Search the separate
`vouchington-infra` checkout independently when the rename crosses its private deployment contract.

### 1. Concurrency belongs to the caller

A reusable test workflow declares no top-level `concurrency`: its area-workflow caller owns the group. A reusable's own group would be shared by every caller running it for the same revision, so one call would cancel or queue behind another. An area workflow's group starts with a literal area prefix, because under `workflow_call` `github.workflow` names the caller (`nightly.yml`) and would collide the area calls. See the [GitHub Actions checklist](../checklists/github-actions.md) and [runner concurrency topology](ci/workflows/reference-github-actions-concurrency-locks.md).

### 2. Path filters in both places

There are two distinct filter locations, both must be updated:

**Primary filter** (the owning area workflow's `changes` job → `ci-detect-changes.yml` → `dorny/paths-filter` step `id: filter`): add a named entry listing source paths that should trigger the job. Example: `playwright-credentialed` lists its config and the web/backend source paths that exercise the credentialed features. Do not add workflow or local-action paths: the `workflow-action-changes` filter already starts every area job for those edits.

**Area `if:` condition** (the owning area workflow → the new job): gate the job on `needs.changes.outputs.<filter-name> == 'true'`. It should also need `static-<area>` and run whenever that area is selected. A filter that exists in the `filter` step but is **not** referenced in the job's `if:` means the job never runs on path-matched PRs. The `tests-playwright-credentialed.test.mts` workflow consistency test (`github-actions` Vitest project) catches this: it asserts that every credentialed job's `if:` references a filter name that exists in the `detect-changes` step.

The `refine-runtime-web` step (`id: refine-runtime-web`) applies additional negated globs to strip Markdown/test/Storybook-only changes from expensive runtime jobs. Positive-only filters such as the PR-only `build-backend-infra` and `build-web-infra` filters remain in the primary filter step (`id: filter`) and are exported directly from it.

**Filter hygiene example:** the storybook filter includes `pnpm-lock.yaml` (a real dep change must trigger story re-validation) but intentionally omits root `package.json` (automated version bumps from `pr-shepherd` only change the `version` field, which doesn't affect story content or dependencies). When a refined filter changes, update **both** the primary filter list and the corresponding brace-group glob in `refine-runtime-web`; positive-only filters instead need exact match/miss coverage. The `area-ci-triggers.part-2.test.mts` test (`github-actions` project) enforces both forms.

**Contrast — the PR Docker filters fail open at the root dependency boundary:** unlike storybook, `build-backend-infra` and `build-web-infra` include root `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` alongside the per-workspace `package.json` manifests that each image's Dockerfile copies. The lockfile is monorepo-wide, so any dependency change (a web-only bump, a `cloudflare-worker`/`lambdas`/dev-tooling bump, or a change scoped to the opposite image) builds both PR images. That cost is accepted because a transitive-only dependency update can change either image without touching an in-subgraph manifest, and the root boundary gives both images pre-merge build, smoke, and scan validation. A per-workspace manifest on its own still selects only the image that copies it (see [Docker Image Path Filters](ci/workflows/reference-docker-image-path-filters.md)). The `area-ci-triggers.part-4.test.mts` test enforces the root-boundary matches, the per-workspace matches, and the cross-image misses.

### 3. Role-assumption env and secrets at job level

AWS OIDC role assumption and external API key secrets must be declared at **job level** (not step level), and gated on `trusted-secret-context`. Model: the `test-playwright-credentialed` job in `web.yml` uses the following:

```yaml
needs.changes.outputs.trusted-secret-context == 'true'
```

in its `if:`, and passes secrets only when that output is `'true'`:

```yaml
secrets:
  OPENAI_API_KEY: ${{ needs.changes.outputs.trusted-secret-context == 'true' && secrets.OPENAI_API_KEY || '' }}
```

The `__tests__/secret-context.permissions.test.mts` and `__tests__/secret-context.wiring.test.mts` files (`github-actions` project) validate that credentialed jobs have the correct permissions, secrets wiring, and `trusted-secret-context` gating.

### 4. CORS origin exactness

CORS `Access-Control-Allow-Origin` entries require the exact scheme + host + port. `http://localhost:8787` and `https://localhost:8787` are different origins. Locally wrangler dev defaults to HTTP; use `http://` in test CORS configs.
