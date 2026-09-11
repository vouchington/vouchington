# Self-Hosted Runner Secret Isolation

[Back to Workflow Runners](RUNNERS.md#self-hosted-runner-secret-isolation)

Persistent self-hosted runners hold real secrets (deploy credentials, OIDC tokens, PATs) and also
run `pnpm`/`npm install`/build steps against repo/PR-controlled `package.json` and lockfile
content. Because the same host can be reused across jobs, anything a PR-controlled job leaves
behind in a persistent location is a potential attack surface for a later trusted job that reuses
that host. Mitigations (tracked from issue #7380):

- **Tool binaries install into a per-job `$RUNNER_TEMP` dir, never persistent `$HOME/.local/bin`,
  and version-skip checks resolve the absolute path — never a bare command that could still
  resolve to a stale binary on `PATH`.** `$RUNNER_TEMP` is intended to be cleared between jobs by
  the runner, so nothing installed there should survive for a later job to inherit — poisoned or
  not. This is best-effort, not a guarantee: GitHub documents that `RUNNER_TEMP` contents are not
  removed when the runner process lacks permission to delete them, and this repo's self-hosted
  hosts already have precedent for root-owned debris from container jobs surviving cleanup (see
  the runner-host recovery recipe for issue #6909). `setup-node-pnpm`/`setup-backend`
  (`${RUNNER_TEMP:-$HOME/.local}/pnpm/bin`) and `setup-lychee`
  (`${RUNNER_TEMP:-$HOME/.local}/bin`) follow the temp-first pattern. Gitleaks enforces the stricter Actions
  contract: `gitleaks.yml` requires `RUNNER_TEMP`, fails closed when it is absent, and installs only
  into `$RUNNER_TEMP/bin`. The tradeoff is that these installers
  can no longer skip a redundant download via a persistent version check — they re-download their
  small, checksum-verified archive every job. That's the point: there is no _persistent_ binary
  for a prior job to poison, only a best-effort-cleaned one. Not every installer is covered yet —
  see the Trivy residual below.
- **Fork PRs get a best-effort full workspace clean.** The `clean-workspace` composite action wipes
  the workspace (rather than incrementally reusing it) when checking out a fork PR, and writes a
  contamination sentinel outside the workspace so the next run on the same persistent runner
  force-cleans regardless of trust level. This is best-effort, not a guarantee: fork PR code runs
  as the same user and can delete the sentinel — see the separate-runner-pools residual below for
  what would close this fully.
- **The highest-privilege secrets stay scoped to trusted-context jobs.** Deploy credentials and
  secrets such as `OPENAI_API_KEY`/`STRIPE_SECRET_KEY` are only injected when
  `detect-changes.outputs.trusted-secret-context == 'true'` (same-repo push/merge). Coverage and
  Vitest-blob transport carries no `id-token: write` grant anywhere in the pipeline: producers and
  consumers upload and download GitHub artifacts with `actions: read`/`actions: write` only. See
  [COVERAGE.md](COVERAGE.md#provenance-and-transport).

**Deferred / accepted residuals** (tracked in issue #7572, not fixed here — each needs its own
design decision):

- `build-web.yml` and `build-backend.yml` install Trivy into persistent `$HOME/.local/bin` (with a
  bare-command version-skip check) rather than the `$RUNNER_TEMP` pattern above — the same
  persistent-binary shape this PR closes for `gitleaks`/`lychee`, on jobs that do carry
  secrets/OIDC permissions.
- The `::stop-commands::` stdout guard used elsewhere in CI does not cover a step directly
  appending to `$GITHUB_ENV`/`$GITHUB_PATH` via file writes — accepted risk within trusted-context
  jobs.
- Fork PRs currently share the same runner pool as trusted-context jobs, mitigated only by
  `clean-workspace`'s best-effort sentinel above, not by separate pools. Physically separate,
  secret-free runner pools for fork-PR jobs would be a stronger mitigation but is a larger infra
  change.
