---
name: review-ci-logs
description: Audit Vouchington GitHub Actions failures and misleading CI logs with the portable Vouchington workflow and local CI diagnosis policy.
---

# Vouchington CI Log Review Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:review-ci-logs`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/review-ci-logs/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

First run `gh auth status` and resolve the repository with
`gh repo view --json nameWithOwner --jq .nameWithOwner`. For a supplied run, inspect only that run.
For an ordinary audit, use the deterministic core + failures window: for each active `CI` workflow,
select its latest 10 completed pull-request runs targeting `main`; for each `Main CI (*)` workflow,
select its latest 10 completed push runs on `main`; then query the latest 25 repository-wide failed
runs. Exclude core duplicates, group remaining failures by workflow, failed job, and terminal/root
message, and inspect the newest representative of each group. Also inspect every core failure and
the newest successful representative of each core workflow. Use `gh run list --json
databaseId,workflowName,event,headBranch,status,conclusion,createdAt,url` and
`gh run view <run-id> --json jobs,url,workflowName` for selection.

Download archives to a temporary directory, inspect only failed steps and representative large
entries, then remove the temporary artifacts. Never stream whole run archives into the main session.

Classify every finding as a real error, misleading output, downstream cascade, necessary diagnostic,
or volume-only concern. Rank by frequency × impact × diagnosability and state the first
repository-owned root cause. Keep a noise budget: distinguish recurring actionable noise from
one-off, provider, and unavoidable diagnostic output rather than deleting logs because they are
verbose.

For a scheduled audit, choose at most one bounded, highest-value fix; do not create issues or
dispatch stateful automation. The fix must preserve primary errors, non-zero exits, artifacts,
summaries, and diagnostics. Add focused regression evidence, run local workflow validation, and
compare representative before/after output. Report deferred findings and the post-merge run to
observe when a safe PR-local verification is impossible.

Read [CI development guidance](../../../docs/development/ci.md) and the scoped
[workflow instructions](../../../.github/workflows/CLAUDE.md). Download representative archives
rather than streaming whole runs into context, preserve diagnostics while separating infrastructure
noise from real failures, and Return a short verdict to the calling session. Use the local
transient-classification reference only to diagnose existing CI behavior; this adapter does not
authorize retry-policy changes.
