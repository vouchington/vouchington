# Fixed-Branch Automation PRs

[Back to Workflow Authoring Reference](AUTHORING.md#fixed-branch-automation-prs)

Before adding or changing a scheduled workflow that force-updates a fixed branch and opens a PR, verify the full write-token path together:

- Run commit-creating jobs on `ubuntu-latest`; persistent self-hosted runners must not receive git identity or fixed-branch writes.
- Use a non-`GITHUB_TOKEN` secret when the workflow needs a follow-on PR, label, comment, merge, or workflow trigger.
- Set `actions/checkout` `persist-credentials: false` when checkout uses a write-capable token, then inject the token only into the single branch update command with `GIT_CONFIG_*`.
- Use `git -c core.hooksPath=/dev/null commit` and the same hook-disabled form for the branch update so repository hooks cannot run inside unattended workflow automation.
- Owner-qualify PR lookups with `headRepositoryOwner.login` and `headRefName`, then validate the result is numeric before commenting, shepherding, auto-merging, or otherwise mutating the PR.
- Pass `GH_TOKEN` to GitHub-backed updater CLIs such as `npx --yes skills update`; do not rely on ambient checkout credentials.
- Update the relevant grouped inventory reference and the canonical [Workflow automation
  map](reference-workflow-automation-map.md) when the workflow is standalone. Update
  [README.md](README.md) and [WORKFLOWS.md](WORKFLOWS.md) navigation only when adding or removing
  a focused reference leaf or group.

Enforced coverage lives in `workflow-automation-safety.test.mts`, `runner-policy.test.mts`, and workflow-specific tests such as `pnpm-dedupe.test.mts`.
