# Dependency Updates

Two bots keep this repo's dependencies fresh:

- **Dependabot** — owns configured Vouchington package managers (npm, Docker, GitHub Actions). Config: [`.github/dependabot.yml`](../../.github/dependabot.yml).
- **Renovate** (Mend-hosted GitHub App) — owns the residual gaps Dependabot has no native manager for: the Node version in `.nvmrc`, plus version literals embedded in workflow YAML and shell scripts via regex `customManagers`. Config: [`renovate.json`](../../renovate.json).

## Review and merge

Dependency-bot PRs require a human merge decision. The Dependabot auto-merge workflow was removed,
and Renovate sets `automerge: false`; neither bot arms GitHub auto-merge. This does not change the
CI trust boundary: a human who queues a same-repository dependency-bot PR still causes a merge-group
run with the existing CI credential policy. Review the PR before placing it in the merge queue.

All configured release delays match: Dependabot's cooldown and pnpm's `minimumReleaseAge`.

pnpm itself is not pinned. The root `package.json` has no `packageManager` field, so local installs
run whichever pnpm is installed. CI uses the released shared tooling action to resolve an aged stable pnpm release and
download its native binary, avoiding a temporary npm project and its `npm ci` bootstrap. Jobs
with specialized install ownership use the shared resolver with the native installer; the shared
setup action owns ordinary workspace installs. Docker builds
continue to run `npm install -g pnpm@<major>` independently. Moving to the next major is a manual
edit. An enforced package-manager pin would make pnpm write `pnpm-lock.yaml` as two YAML documents,
which single-document lockfile readers and GitHub's dependency graph
(dependabot/dependabot-core#15904) do not fully read.

<a id="no-mistakes-releases"></a>A `no-mistakes` release can change more than rule behavior: the package also generates
`backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json`, which `db:snapshot:check` compares
byte for byte. When a bump changes the generated catalog, `tests-postgres-schema.yml` fails until a
maintainer comments `/postgresql-snapshot-update` on the PR, which commits the regenerated catalog. See
[schema snapshot](postgresql/schema-snapshot/README.md#no-mistakes-catalog). Its executor options
(`importSpecifier`) are explicit in `.no-mistakes.yml` and every `.oxlintrc.json`, so a release that
tightens executor selection reports a configuration error instead of skipping checks.

Dependabot groups only verified package families and release trains; catch-all version and security
groups are forbidden so each PR stays reviewable. Security updates are eligible immediately. Major
updates still require manual review. First-party GitHub Actions release trains are grouped one PR per
source repository, because a reusable workflow and a composite action from the same tagged release
otherwise surface as separate dependencies. See `.github/dependabot.yml` for the sources.

Native dependency policy and automation are owned by the
[client repository](https://github.com/vouchington/vouchington-clients).

## References

- <a id="frozen-install-policy"></a>[Frozen-install policy](reference-dependency-updates-frozen-install-policy.md)
- <a id="optional-peer-instance-keys"></a>[Optional peer instance keys](reference-dependency-updates-frozen-install-policy.md#optional-peer-instance-keys)
- [Docs pinning policy](#docs-pinning-policy)
- <a id="manually-maintained-pins"></a>[Manually maintained pins](reference-dependency-updates-manually-maintained-pins.md)
- <a id="adding-a-new-pinned-binary"></a>[Adding a new pinned binary](reference-dependency-updates-adding-a-new-pinned-binary.md)
- <a id="supply-chain-policy"></a>[Supply-chain policy](reference-dependency-updates-supply-chain-policy.md)

Remote GitHub Actions must be pinned to a 40-hex commit SHA with a version comment, so a re-pointed
tag cannot silently change what runs; no-mistakes `github-actions-pinned-hash` enforces it.

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
compatibility holds, incident records, and minimum SHAs. Dual executable pins
that both run (lychee and gitleaks in `.mise.toml` and workflow YAML) stay exact in those files and
are kept in lockstep by no-mistakes `version-pin-consistency`.
