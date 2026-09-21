---
name: triage-security
description: |
  Vouchington adapter for the public security-triage plugin. Routes verified
  security-triage handoffs into Vouchington issue policy and PR post-processing.
argument-hint: '[severity filter or finding scope; blank = current critical,high filter]'
allowed-tools: ['Bash', 'Read', 'Grep', 'Glob', 'Agent', 'ToolSearch']
---

# Triage Security

This is a Vouchington-only adapter. Use public `security-triage` plugin version
0.1.0 or later for Codex Security finding intake, classification, approval,
hosted disposition changes, and provider-created fix PRs. It emits the
`codex-security-triage/v1` handoff; do not recreate those generic operations in
this repository.

Before beginning, verify that the installed plugin is `security-triage` version
0.1.0 or later and can produce `codex-security-triage/v1`. If it is unavailable
or incompatible, fail closed: make no hosted finding, issue, or PR mutation.
Install the public plugin using the host-specific instructions at
<https://github.com/vouchington/vouchington-tooling#install>, then restart
discovery and verify the version. Use the host-specific instructions there.

Recompute the adapter binding from the selected remote: fetch its default branch,
then accept only handoff records whose `canonicalRepository` exactly equals
`github.com/vouchington/vouchington`, whose `defaultBranch` exactly matches the
remote default branch, and whose immutable `evidenceSha` exactly equals that
fetched default-branch tip. A dirty or user-selected checkout may inform review,
but cannot satisfy the handoff identity gate. Reject malformed, incomplete,
mismatched, or stale records; re-run the shared plugin rather than inferring a
disposition.

Before any grouping or PR action, require every consumed record to have
`contract === 'codex-security-triage/v1'`, nonempty `selectedRemote`, complete
`finding` (`id`, `url`, and `title`), an allowed `verdict`, and complete
`evidence` (relative paths and rationale). `selectedRemote` is presence-only:
consumer remote names may differ after canonical normalization. Reject a record
missing any required section.

Completed `close` and `lower_severity` records require nonempty execution
receipts. In Vouchington they are verified and reported only: never create an issue,
post-process a PR, or make another mutation for either disposition.

Bucket records only when `disposition: 'grouped_issue'` and
`execution.status: 'proposed'`, then group them by identical
`issueCandidate.groupKey`. Require each issue candidate's group key, title, and
summary. Invoke one `github-issue-agent` workflow per group with all member
findings, never one issue workflow per finding. Reject missing or unstable group
keys. Keep duplicate search, live taxonomy, labels, milestones, issue creation,
and post-create verification local by following
[github-issue](../github-issue/SKILL.md). The shared plugin never creates or
classifies Vouchington issues.

For every provider-created PR record, require `disposition: 'provider_fix_pr'`,
`execution.status: 'completed'`, and `providerPullRequest`, plus a verified
number, URL, and provenance that match the handoff and a nonempty execution
receipt. Immediately before
`ready-and-shepherd`, re-read the live PR state and current diff from
`vouchington/vouchington`; require `OPEN`, the exact canonical repository, matching
provider provenance, number, and URL, a diff that still addresses the source
finding and evidence, and no unrelated changes. Block on mismatch before invoking:

```
ready-and-shepherd <N> --codex-security-local-handoff
```

This is Vouchington post-processing only: it does not create, repair, or replace
the provider PR. Preserve the canonical
[agent-authored PR creation feedback](../agent-workflow/code-review.md#agent-authored-pr-creation-feedback)
record and invoke [retrospective](../retrospective/SKILL.md) once before the
final report.

## See Also

- [ready-and-shepherd](../ready-and-shepherd/SKILL.md) — shared
  provider-PR post-processing flow.
- [github-issue](../github-issue/SKILL.md) — issue search and creation
  conventions for grouped-issue dispositions.
- [SECURITY.md](../../../docs/requirements/security/SECURITY.md) —
  architecture ground truth for judging findings.
