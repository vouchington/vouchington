# Pinning style for GitHub Actions

[Back to Dependency Updates](dependency-updates.md#pinning-style-for-github-actions)

Every remote GitHub Action (`actions/*`, `github/*`, and third-party) must be pinned to a 40-hex commit SHA with a version comment on the same line (major-only is acceptable; both `# v4` and `# v4.1.2` are valid). Local `./` composite paths are not pinned. Branch refs such as `@main` are mutable and are not allowed. Enforcement owner: no-mistakes `github-actions-pinned-hash` (`pnpm run no-mistakes`).

```yaml
uses: org/action@4907a6ddec9925e35a0a9e82d7399ccc52663121 # v4
```

This prevents tag re-pointing attacks where a maintainer (or an attacker who compromises a maintainer account) silently changes what code a version tag points to. The `# vX.Y.Z` comment preserves human-readability and is the anchor for automated updates.

Renovate's `github-actions` manager (enabled via `helpers:pinGitHubActionDigests` in `renovate.json`) opens PRs when a new release is available, updating both the SHA and the version comment. Non-major bumps auto-merge once CI passes; majors require manual review.

Use `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` to resolve a version tag to a runnable commit SHA when first pinning an action. Do not pin an annotated-tag object SHA — that SHA is unrunnable and fails in CI when the action is invoked.

**Shared composite actions and topology:** Breakage introduced by action-file edits (including
version bumps) is caught by CI through `ciTopologyImpact`, which selects each discovered caller
from the exact base/head graph. Do not re-add `.github/actions/**` to per-producer PR filters: it
would wake unrelated jobs. `test-tooling` still covers action contract tests, while malformed or
unresolvable topology fails open.
