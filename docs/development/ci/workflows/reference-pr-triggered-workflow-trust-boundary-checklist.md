# Workflow Trust Boundary Checklist

Apply this before the first push of any PR-triggered or unattended workflow change (commits are
free, pushes are expensive; see [workflow instructions](../../../../.github/workflows/AGENTS.md)).
Each item is a judgment a test cannot make. Mechanical rules (pinned action SHAs, runner allowlist,
permission unions, checkout credentials, zizmor, actionlint) are enforced by tests and CI and are
not restated here. The pin guard checks only the 40-hex shape: when pinning from an annotated tag,
resolve the commit with `<tag>^{commit}`, not the tag object's SHA, or Actions cannot load it.

## PR-triggered workflows

- **Untrusted PR code execution.** Does any job check out PR-head code and then execute it in a
  context that holds secrets or a write token? If so, gate it behind the trusted-secret-context
  flag or skip the sensitive steps.
- **Privileged dependency repair.** Keep the immutable base checkout as the only executable tree.
  PR manifests and locks may be fetched by SHA and parsed as data, never run through SwiftPM,
  package plugins, MSBuild, shell helpers, or repository scripts. A publisher may check out an
  already-validated PR head only to apply a fixed regular-file artifact and create a non-force
  commit, after revalidating identity, base, head, changed-file allowlist, provenance, and hashes
  immediately before the push.
- **Local action and composite source.** Check local composite actions and reusable workflows out
  from the trusted base ref into a separate path, and pass that ref explicitly so the action's
  prompts and scripts also come from base.
- **Runner contamination.** PR jobs use fresh GitHub-hosted runners. Do not introduce self-hosted
  PR execution without a threat model for cross-run workspace contamination.
- **Skip and `continue-on-error`.** If a leaf job is `continue-on-error: true`, confirm its area
  gate still reports the intended result.
- **`secrets: inherit`.** Confirm it passes only what the callee declares.
- **Script consolidation.** When merging or deleting `ci/*` scripts, confirm tests still cover
  missing-`needs` producer detection, failed or cancelled producer gating, skipped producers, and
  single-artifact normalization.

## Scheduled workflows that force-update a fixed branch and open a PR

- Run commit-creating jobs on GitHub-hosted runners; persistent self-hosted runners must not
  receive git identity or fixed-branch writes.
- Use a non-`GITHUB_TOKEN` secret when a follow-on PR, label, comment, merge, or workflow trigger
  is needed. Inject it as the git credential only into the single branch-update command, and pass
  it as `GH_TOKEN` to each `gh` command that must act with it; otherwise `gh` uses the default
  token and the follow-on trigger is suppressed.
- Commit and update the branch with repository hooks disabled so hooks cannot run unattended.
- Owner-qualify PR lookups by head repository owner and ref, and validate the result before
  mutating the PR.
- Pass the token explicitly to GitHub-backed updater CLIs rather than relying on ambient checkout
  credentials.

## Changing workflow behavior around a third-party tool

- Prove the current upstream state first: read the release notes and inspect the exact failing run,
  and record the observation in the PR. Disabling an expensive feature such as TurboSnap or
  `onlyChanged` is a cost, coverage, and runtime tradeoff that the PR must state.
- When deleting infrastructure roles or outputs, scan workflow YAML, workflow tests, and docs for
  the retired role, secret, output, or environment name before the first push.
