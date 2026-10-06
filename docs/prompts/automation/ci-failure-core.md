## CI failure rules

These rules are shared by every CI-failure session. The text above it names the failing runs, the
change under test, the fix base (the commit to branch fixes from), how to handle a failure the
change under test caused, and the fix PR's title and `Workspace setup:` line.

### Classify

Read `ci/transient-retry/rules.mts` for the catalogued transient fingerprints. Establish each
failure from its logs, and reproduce it locally when that is cheap. Fingerprint each failure by
workflow, job, and stable error text. Check whether the same fingerprint appears in other recent
`main`, merge-group, or nightly runs that did not include the change under test; when it does, the
failure predates or is independent of that change, and the root cause says so.

Group the failures that share a fingerprint, then choose exactly one outcome per group:

1. **The change under test is the root cause.** It fails deterministically, or conflicts with work
   ahead of it. Handle it as the text above says.
2. **A flaky test.** The failure is nondeterministic, and the change under test did not cause it.
   Fix it.
3. **A CI or architecture defect.** Repository tooling, a ratchet, a dependency, or shared
   infrastructure rejects work that did not cause the failure. When the defect is in this
   repository, fix it. When it lives elsewhere, such as in `no-mistakes`, `vouchington-tooling`,
   GitHub, or hosted infrastructure, find or file one issue with the failing runs, fingerprint, and
   a proposed fix; that issue is the whole outcome.
4. **A transient failure.** The failure matches a catalogued transient, or is clear external
   infrastructure noise such as a registry or download outage. Fix nothing. When the fingerprint
   recurs, find or file one issue.

Every group ends in one of these outcomes, never in a list of options. When the evidence fits more
than one outcome, or several fixes remain, choose the outcome and fix the evidence best supports and
carry it out. A nondeterministic failure that the change under test did not cause is a flaky test
even when its cause is unproven, and a test failure that recurs is a transient only when it matches
a catalogued transient. In the fix PR's `## Root cause`, separate what the evidence proves from what
it only suggests, and put the alternatives in `## Options considered`. When the logs cannot tell the
candidate causes apart, for example a statement timeout with no wait event or plan, the fix PR also
captures the evidence the next occurrence needs, but diagnostics alone are not a fix.

A fix removes the cause. Never raise a test, statement, or job timeout, skip or quarantine a test,
weaken what a test proves, or break the
[test suite rules](../../development/tests.md#test-suite-rules), such as moving a test back to its
own database, to make a failure stop. Never add or broaden a retry, rerun, or transient-retry rule
for a failure this repository owns, even as an interim change. A new catalogued transient is only
for external infrastructure noise, and needs a trimmed real-log fixture and counterfixtures that
reject durable failures. When a timeout is only the symptom, fix what made the work slow or blocked
it.

### Fix

Every flaky test and every defect in this repository gets one fix PR per group:

1. **Check for existing work.** Search open pull requests and issues for the same test, dependency,
   job, fingerprint, and stable error text. When a focused fix PR already exists, reference it; that
   group is done. Repeat this search immediately before creating the PR, because another session
   may have opened one while you worked. Never close or edit related work.
2. **Track it.** Find the open issue for the failure and comment any new evidence on it, or file
   one with the failing runs, fingerprint, and proposed fix. The fix PR closes it.
3. **Keep dependency fixes narrow.** For a dependency-rooted failure, in any ecosystem, change only
   the dependency and its necessary lockfiles, tests, guards, and documentation.
4. **Branch.** Create the fix branch from the fix base, never from a fetched pull-request ref.
   Before creating the PR, require `git log <fix base>..HEAD` to list only your own commits. `main`
   advancing while you work is expected; if the branch stops merging cleanly, rebase it onto
   current `main` and rerun the focused validation.
5. **Implement and validate** the smallest complete change. When the fix adds or tightens an
   assertion, first show that the assertion fails for the expected reason against the pre-fix
   source, per [Implementation](../../../.agents/skills/agent-workflow/implementation.md)'s
   regression-test rule, and record that evidence under `## Implementation choice`.
6. **Publish.** Create one draft PR with
   `node dev/pr-description.mts create --title <title> --body-file <path>`. The body needs
   `## Root cause`, `## Implementation choice`, `## Options considered` with pros and cons,
   implementation details, the failing runs, validation evidence, `## Related issues` with the
   closing reference, remaining follow-ups, and the `Workspace setup:` line named above. Apply both
   the `automation` and `automation:auto-fix` labels, then re-fetch the PR and require both labels.
   Never merge or arm auto-merge.

When the PR body defers work to another repository, resolve the target per
[Implementation](../../../.agents/skills/agent-workflow/implementation.md)'s deferral-target
resolution rule.

For any PR body this session is authorized to create or update, follow the
[PR-description standard](../../../.agents/skills/pr-description/SKILL.md): keep `## Summary` and
`## Impact` visible, including the concrete outcome, affected audience, and material risks. Keep
the required `## Root cause`, `## Implementation choice`, and `## Options considered` headings and
long supporting evidence inside a collapsed `<details>` section. Use before/after tables and
Mermaid when useful. After CI diagnosis, refresh conditional Harness gaps through the approved
description helper and retain established gaps after green checks. Do not add routine successful
local-check lists. This standard does not expand this session's mutation authority.
