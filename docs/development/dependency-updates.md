# Dependency Updates

Two bots keep this repo's dependencies fresh:

- **Dependabot** — owns configured Vouchington package managers (npm, Docker, GitHub Actions). Config: [`.github/dependabot.yml`](../../.github/dependabot.yml).
- **Renovate** (Mend-hosted GitHub App) — owns the residual gaps Dependabot has no native manager for: the pnpm toolchain pin in the root `package.json`, the Node version in `.nvmrc`, plus version literals embedded in workflow YAML and shell scripts via regex `customManagers`. Config: [`renovate.json`](../../renovate.json).

## Review and merge

Dependency-bot PRs require a human merge decision. The Dependabot auto-merge workflow was removed,
and Renovate sets `automerge: false`; neither bot arms GitHub auto-merge. This does not change the
CI trust boundary: a human who queues a same-repository dependency-bot PR still causes a merge-group
run with the existing CI credential policy. Review the PR before placing it in the merge queue.

All configured release delays are two days: Renovate does not create a pnpm toolchain branch or PR
until that delay elapses.

Dependabot checks all configured ecosystems every day at 04:00 America/Los_Angeles. Renovate runs before 6am Monday in the same timezone.

Dependabot groups only verified package families and release trains, across major, minor, and patch
updates. Unrelated dependencies remain independent so each PR is reviewable; catch-all version and
security groups are forbidden. Security updates are eligible immediately and remain independent
unless a verified package family requires a narrow security group. Major updates still require
manual review. Each configured ecosystem is capped at five open
version-update PRs.

First-party GitHub Actions release trains are grouped one PR per source repository — a reusable
workflow and a composite action from the same tagged release otherwise surface as separate
dependencies — and are exempt from the two-day cooldown, mirroring how first-party npm packages are
already grouped and exempted. See `.github/dependabot.yml` for the current sources and patterns.

Native dependency policy and automation are owned by the
[client repository](https://github.com/vouchington/vouchington-clients).

## Coverage and installation references

- <a id="coverage-matrix"></a>[Coverage matrix](reference-dependency-updates-coverage-matrix.md)
- <a id="frozen-install-policy"></a>[Frozen-install policy](reference-dependency-updates-frozen-install-policy.md)

### Sentry 10.72/10.73 compatibility hold

`@sentry/nextjs` 10.72.x and 10.73.x throw `TypeError: The URL must be of scheme file` at module
scope whenever a `document` global exists, which is the normal jsdom state for web Vitest. The four
direct Sentry JS SDKs are exact-pinned to `10.71.0` (no caret — a caret range still resolves to the
broken 10.72/10.73 on a fresh install), and `.github/dependabot.yml` ignores `10.72.x` and `10.73.x`
for `@sentry/nextjs`, `@sentry/node`, `@sentry/cloudflare`, and `@sentry/aws-serverless` under issue
#10523. Do not replace the pins with a pnpm override or patch.

The exclusion is deliberately only those two minors. Dependabot may propose 10.74 or later. Remove
the hold only after that PR's web Vitest jsdom import of `@sentry/nextjs` succeeds.

## Pinning and verification references

- [Docs pinning policy](#docs-pinning-policy)
- <a id="manually-maintained-pins"></a>[Manually maintained pins](reference-dependency-updates-manually-maintained-pins.md)
- <a id="pinning-style-for-github-actions"></a>[Pinning style for GitHub Actions](reference-dependency-updates-pinning-style-for-github-actions.md)
- <a id="adding-a-new-pinned-binary"></a>[Adding a new pinned binary](reference-dependency-updates-adding-a-new-pinned-binary.md)
- <a id="verifying-a-renovate-change"></a>[Verifying a Renovate change](reference-dependency-updates-verifying-a-renovate-change.md)
- <a id="supply-chain-policy"></a>[Supply-chain policy](reference-dependency-updates-supply-chain-policy.md)
- <a id="related"></a>[Related](reference-dependency-updates-related.md)

### <a id="docs-pinning-policy"></a>Docs pinning policy

Exact pins belong in package-manager, lock, or toolchain files that Dependabot, Renovate, or a
frozen install can update:

- npm/pnpm caret ranges in `package.json` plus `pnpm-lock.yaml` (syncpack requires `^`)
- `.mise.toml` (Renovate)
- GitHub Actions 40-hex SHAs with a version comment

Living docs name majors or minimums, or point at those owner files. Do not copy a current `x.y.z`,
commit SHA, or image digest into markdown. A bot PR must not need a docs path to stay accurate.
Generated inventories follow the same rule: [JOBS.md](../../.github/workflows/JOBS.md) records
reusable-workflow callees without the `@ref` pin so a GitHub Actions Dependabot bump does not
require a markdown regen. Pins stay in the workflow YAML.

`repo-file-policy` (`living-docs-pin-guard.mts`) enforces this on the pages this policy cleaned,
including docs-only PRs. Do not keep that check only in `test-tooling` Vitest, and do not add those
READMEs to `TEST_FIXTURE_DOCS` just to run the assertion — that would skip the docs-only path and
expand ordinary docs PRs into full CI. A single page never qualifies for `TEST_FIXTURE_DOCS` merely
to reach a static guard; a whole tree qualifies only when every markdown file in it is read by a
Vitest test at runtime (see `docs/prompts/**` and `.agents/skills/**` in
[`ci-fixture-doc-classifier.test.mts`](../../.github/workflows/ci-fixture-doc-classifier.test.mts)).

Coverlet configuration for native clients lives in the
[client repository](https://github.com/vouchington/vouchington-clients).

Exact versions in docs are allowed only when they are historical facts that will not be restamped:
compatibility holds (such as the Sentry exclusion above), incident records, and minimum SHAs such
as `≥ 652a469`. Dual executable pins that both run (lychee and gitleaks in
`.mise.toml` and workflow YAML) stay exact in those files and are kept in lockstep by no-mistakes
`version-pin-consistency`.
