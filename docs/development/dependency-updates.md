# Dependency Updates

Two bots keep this repo's dependencies fresh:

- **Dependabot** — owns configured Vouchington package managers (npm, Docker, GitHub Actions). Config: [`.github/dependabot.yml`](../../.github/dependabot.yml).
- **Renovate** (Mend-hosted GitHub App) — owns the residual gaps Dependabot has no native manager for: the Node version in `.nvmrc`, plus version literals embedded in workflow YAML and shell scripts via regex `customManagers`. Config: [`renovate.json`](../../renovate.json).

## Review and merge

Dependency-bot PRs require a human merge decision. The Dependabot auto-merge workflow was removed,
and Renovate sets `automerge: false`; neither bot arms GitHub auto-merge. This does not change the
CI trust boundary: a human who queues a same-repository dependency-bot PR still causes a merge-group
run with the existing CI credential policy. Review the PR before placing it in the merge queue.

All configured release delays are two days: Dependabot's cooldown and pnpm's `minimumReleaseAge`.

pnpm itself is not pinned. The root `package.json` has no `packageManager` field, so local installs
run whatever pnpm is installed. CI (`pnpm/action-setup` `version: latest-12`) and the Docker builds
(`PNPM_VERSION=12`) name only a pnpm major, so new releases in that major reach them without a PR.
CI self-updates to the newest release that pnpm's default one-day `minimumReleaseAge` admits: the
action runs `pnpm self-update` outside this workspace, so the two-day setting above does not apply
to pnpm itself. Docker builds run `npm install -g pnpm@12`, which has no release delay. Moving to
the next major is a manual edit that `.github/workflows/pnpm-activation.test.mts` keeps consistent.
An enforced pin would make pnpm 12 write `pnpm-lock.yaml` as two YAML documents, which
single-document lockfile readers and GitHub's dependency graph (dependabot/dependabot-core#15904) do
not fully read.

<a id="no-mistakes-releases"></a>A `no-mistakes` release can change more than rule behavior: the package also generates
`backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json`, which `db:snapshot:check` compares
byte for byte. When a bump changes the generated catalog, `tests-postgres-schema.yml` fails until a
maintainer comments `/postgresql-snapshot-update` on the PR, which commits the regenerated catalog. See
[schema snapshot](postgresql/schema-snapshot/README.md#no-mistakes-catalog). Its executor options
(`importSpecifier`) are explicit in `.no-mistakes.yml` and every `.oxlintrc.json`, so a release that
tightens executor selection reports a configuration error instead of skipping checks.

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
- <a id="optional-peer-instance-keys"></a>[Optional peer instance keys](reference-dependency-updates-frozen-install-policy.md#optional-peer-instance-keys)

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

- `pnpm-lock.yaml`, which records what actually installs
- `.mise.toml` (Renovate)
- GitHub Actions 40-hex SHAs with a version comment

`package.json` specifiers are not exact pins. `pnpm run syncpack:lint` ([config](../../.syncpackrc.json))
requires every external dependency, including first-party `@vouchington/*` packages, to use a caret
(`^`) range and one version across all workspaces. The lockfile, not the specifier, fixes the
installed version. Dependabot keeps each specifier's existing prefix, so its bumps stay caret
ranges, and no repository workflow writes exact specifiers. Run `pnpm run syncpack:fix` after
adding or editing a dependency. An exception needs its own labelled `.syncpackrc.json` version
group that states the reason.

Living docs name majors or minimums, or point at those owner files. Do not copy a current `x.y.z`,
commit SHA, or image digest into markdown. A bot PR must not need a docs path to stay accurate.
Generated inventories follow the same rule: [JOBS.md](ci/workflows/JOBS.md) records
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
compatibility holds, incident records, and minimum SHAs such as `≥ 652a469`. Dual executable pins
that both run (lychee and gitleaks in `.mise.toml` and workflow YAML) stay exact in those files and
are kept in lockstep by no-mistakes `version-pin-consistency`.
