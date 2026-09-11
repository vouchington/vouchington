# Self-Hosted Runner Secret-Isolation — Accepted Residuals (#7572)

[Back to Workflow Runners](RUNNERS.md)

Self-hosted runners are persistent hosts shared across jobs, unlike GitHub-hosted runners that are
destroyed after each job. The live residuals below remain accepted for this private repository.
`./.github/actions/clean-workspace` is best-effort protection against same-user host persistence;
physical pool separation remains the stronger boundary.

## Fork-PR runner pools

Fork PRs are not physically separated from trusted jobs on persistent self-hosted pools. The live
residual path is bot-introduced dependency code: Dependabot and Renovate lockfile PRs are excluded
from `trusted-secret-context`, but their test jobs can execute not-yet-reviewed dependency code on
hosts later used by trusted jobs. Mitigations are the trusted-context gates, workspace cleaning,
read-only permissions on untrusted paths, and dedicated runner labels for credentialed work.

If the repository becomes public, re-open this decision. The actor set would expand to anonymous
forks, requiring isolated pools for untrusted jobs rather than relying on same-user cleanup.

## GitHub environment-file poisoning

Any step in a job can write `$GITHUB_ENV` or `$GITHUB_PATH` and influence later steps in that job.
This is inherent to GitHub Actions. Secret-bearing jobs remain `trusted-secret-context`-gated. No
job in the coverage or Vitest-blob transport pipeline requests `id-token: write`; PR-controlled
producers and consumers use `actions: read`/`actions: write` for GitHub artifacts only.

## Auto Harness boundary

The [Harness dispatcher](harness-dispatch.yml) runs under the protected
`auto-harness` Environment, restricted to `main`. `HARNESS_API_KEY` is a repository-level secret;
only each caller's `dispatch` job forwards it (`secrets: { HARNESS_API_KEY: ... }`) through that
`workflow_call` — never via `secrets: inherit`, which would leak every caller secret instead of
just this one. Caller
checkouts and prompt-rendering jobs never receive it. All caller entry jobs require the unset-by-default master gate and their exact
per-surface gate; disabled runs cannot react, comment, checkpoint, rerun infrastructure, render or
transfer prompts, or escalate.

The selected agent runs in an isolated worktree on a trusted host with repository-scoped git and
`gh` credentials. That direct mutation authority, persistent-host exposure, and provider prompt
injection risk are explicitly accepted and bounded by the controls in the
[Auto Harness automation security boundary](reference-harness-automation-accepted-risk.md).

## HARNESS_API_KEY repository-secret scope (accepted 2026-08-26)

`HARNESS_API_KEY` is provisioned as a **repository-scoped** secret (see
[Auto Harness automation](reference-harness-automation.md#configuration-and-activation)), not
environment-scoped — `workflow_call`-invoked jobs cannot resolve Environment-scoped secrets, which
is why the migration off the `auto-harness` Environment happened (#10211). Repository secrets are
readable by any job in any workflow run triggered from a same-repository (non-fork) event,
including `pull_request`, independent of `secrets: inherit`: a same-repo PR branch that edits a
workflow file can add a step reading `${{ secrets.HARNESS_API_KEY }}` and have it evaluate before
human review. The `environment: auto-harness` declaration retained on the
[dispatcher](harness-dispatch.yml) still enforces its
main-only branch-policy gate on job _execution_, but no longer gates the secret _value_ — that
protection was lost when the secret left the `auto-harness` Environment.

This was raised in review on #10212 (P1) alongside two mitigations — keep the secret
environment-scoped and restructure the secret-consuming job boundary, or move to a brokered
short-lived credential unreviewed workflows cannot request — and is **accepted as residual risk**
rather than mitigated: the credential only grants Auto Harness dispatch actions
scoped to this repository's own automation principal, same-repo PR authorship already carries a
comparable trust bar to other repo secrets forwarded via `secrets: inherit` in `ci.yml`, and
rotation or a broker credential remain available if this repository's trust model changes. If the
repository becomes public, re-open this decision alongside the
[Fork-PR runner pools](#fork-pr-runner-pools) residual above — the actor-set assumption breaks the
same way.
