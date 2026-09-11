---
name: triage-prs
description: |
  Triage open pull requests: review each one, merge the good ones (mark ready, arm
  squash auto-merge, dispatch pr-shepherd) and close the rest (delete the branch).
  Use when asked to review/triage PRs, clear the PR queue, or process automation-created
  PRs (see docs/development/merge-authority.md). Invocation also authorizes the bounded
  prompt-feedback issue and draft-PR flow in Step 6a.
argument-hint: '[PR scope: numbers, author, label, or blank for all automation-labeled PRs]'
allowed-tools:
  ['Bash', 'Read', 'Write', 'Grep', 'Glob', 'Agent', 'AskUserQuestion', 'TaskCreate', 'TaskUpdate']
---

# /triage-prs — PR Triage

Review open pull requests, merge the good ones, and close the rest.

## Step 1 — Resolve scope

### Default (no argument)

Target every automation-created PR — the universal `automation` label (see
[merge-authority](../../../docs/development/merge-authority.md)) is applied by the
Auto Harness PR-producing prompts on creation and idempotently by `ready-and-shepherd`
Step 4 for interactively-triaged auto-fix PRs, so it covers CI fixes and scheduled prompts alike:

```bash
gh pr list --state open --limit 100 --label automation --json number,title
```

PRs opened before the universal `automation` label existed require an explicit one-time backfill
with `gh pr edit <N> --add-label automation` before they enter the default scope.

### With an argument

Interpret the argument as the scope:

- Explicit PR numbers: use them directly.
- Author: `gh pr list --author <login> --state open --limit 100`
- Label: `gh pr list --label <name> --state open --limit 100`
- `all`: every open PR regardless of author.
- Title substring: `gh pr list ... | jq 'select(.title | test("<pattern>"; "i"))'`

**Safety — broad/non-default scope needs confirmation.** The default `automation`-label
query is a reliable machine-set signal — proceed with the default flow on it directly.
For any broader or non-default scope (`all`, an author, a title-substring match, or a
label other than `automation`), the set can include human-authored PRs, so **always
confirm the close list** with the user (`AskUserQuestion`) before executing closes or
branch deletions.

## Step 2 — Gather status

Fetch CI rollup and diff sizes for the **in-scope PR numbers only** (resolved in
Step 1). Do not re-fetch all open PRs — using a broader list risks pulling
out-of-scope PRs into the review and close queues.

```bash
gh pr view <N> --json number,title,isDraft,additions,deletions,changedFiles,statusCheckRollup
```

Run one call per PR, or pass all resolved numbers to `gh pr list --json … | jq
'select(.number | IN(<N1>,<N2>,…))'` when the set is large.

## Step 3 — Review + steering assessment

Batch the in-scope PRs across up to three parallel Explore agents. Each agent reads
the PR description, full diff, and a [review-ci-logs](../review-ci-logs/SKILL.md)
verdict for failing required checks, then returns per PR:

- **Decision:** `MERGE` or `CLOSE`
- **Reason:** one-line summary
- **Steering:** (MERGE only) whether the shepherd needs direction, and the exact
  PR comment body to post
- **PR creation feedback:** for verified agent-authored PRs, apply the canonical
  [agent-authored PR creation feedback](../agent-workflow/code-review.md#agent-authored-pr-creation-feedback)
  rubric and return its evidence, provenance, exact source target, recommendation,
  and recurrence tag; otherwise `none`

Commands each agent uses:

```bash
gh pr view <N>                                 # description, metadata, labels
gh pr diff <N>                                 # full diff
gh pr checks <N> --json name,state,link        # CI check list
# failing required checks: load review-ci-logs and return a short verdict
```

### Default rubric

- **MERGE** — real bugfix, general root-cause fix, or safe chore. A self-inflicted CI
  failure on the PR's own change is fine — the shepherd drives it green. A merge
  conflict (`CONFLICTING` / `DIRTY`) does **not** by itself warrant a close: if the fix
  is good on the merits (real root-cause fix, not a band-aid), salvage it via the MERGE
  path — mark ready, arm auto-merge, and dispatch `/shepherd` to rebase/resolve the
  conflict and drive CI green. **Salvage by default; do not ask the user.**
- **CLOSE** — narrow per-fingerprint band-aid (prefer general solutions), stale,
  superseded, or scope already landed on main. Close a `CONFLICTING` / `DIRTY` branch
  **only** when it is also one of those — never close a good fix solely because it
  conflicts.
- **Before closing a narrow band-aid, ask whether it can be generalized.** A
  per-fingerprint band-aid often points at a root cause worth a general fix. First
  diagnose the failure it papers over: is it **repository-owned** (our code, config,
  or infra — a step timeout, our Terraform/IAM, our Dockerfile/toolchain, a lock/port
  collision in our own scripts), **deterministic** (hits a fixed budget/limit — litmus
  test: rerun the identical job unchanged, does it hit the same wall every time? If
  yes, raise the limit, remove the bottleneck, or restructure the work), or **transient**
  (the same input sometimes passes — an intermittent race, a propagation delay, or a
  genuinely external 5xx / rate-limit)? Only the transient case is one where broadening
  the retry rule is legitimate; repository-owned and deterministic failures both mean a
  retry rule is invalid and the fix is the root cause. **Anti-fork:** never hardcode a
  concrete resource address (an ARN, an event-bus name, a batch ID) into a fingerprint —
  broaden the existing (consumer × root-cause) rule instead of forking a new one per
  action/status/URL, per `ci/transient-retry/CLAUDE.md`; a rule that hardcodes one
  resource re-fails the moment a different resource hits the same underlying race.
- **The hard cases:** when you cannot classify a failure (no rerun-success evidence
  either way), the correct disposition is a narrow `maxAttempts: 1` interim rule scoped
  tightly to this exact fingerprint **and** a linked root-cause issue in the same PR —
  never a wide `maxAttempts` bump as a substitute for classification. Watch for the
  **treadmill signature**: a rule whose `maxAttempts` gets bumped again on a later PR,
  for the same consumer/root-cause pair, without the underlying cause changing — that
  pair is repository-owned and was mis-elevated the first time; bumping it again repeats
  the mistake instead of fixing it. **Elevate, don't hide:** a repository-owned cause
  must file or link a root-cause-tracking issue as part of the disposition (reuse an
  existing open issue covering the same pair rather than duplicating); `## Follow-ups:
None` on a PR whose root cause is repository-owned is a signal to push back, not
  accept as-is. For deterministic and repository-owned failures, elevate to the
  root-cause fix — close the band-aid (or merge it as an interim stopgap clearly
  described as such in the PR body / Shepherd Journal) and delegate a follow-up issue
  for the general fix to the `github-issue-agent` under the shared
  [github-issue](../github-issue/SKILL.md) policy, or re-scope an existing issue.
  **Generalize-or-elevate beats a plain close.**

This rubric is a default, not a law. The user can provide session steering (e.g.
"avoid narrow fixes") that changes classifications — including flipping an
otherwise-green PR to CLOSE. Present any such steering as context and let it override
the rubric.

### What steering looks like

When a MERGE PR needs shepherd direction, write the exact reviewed comment body to
a temporary file using a file-writing tool, then read the file back in full. Do not
construct the file with shell interpolation, a heredoc, `echo`, or `printf`:

```
<temporary-steering-file-contents>
Prefer the general timeout-bound solution over a transient-retry rule.
```

Pass that file to `ready-and-shepherd` so it posts a separate ordinary PR comment
before the exact standalone `/shepherd` trigger. File-based input prevents shell
metacharacters and backticks in reviewed steering from being expanded.

Example steering comments:

- `Prefer the general timeout-bound solution over a transient-retry rule.`
- `The oxlint error is self-inflicted. Fix it first, then continue.`
- `Do not add a new catalogue rule. Fix the underlying race condition instead.`
- `This deadlock is transient. Broaden the matcher rather than closing the rule.`
- `This timeout is deterministic, not transient. Close the narrow rule and open a root-cause issue for the migration-level timeout.`

## Step 4 — Execute MERGE

Process MERGE decisions in ascending PR-number order through
[ready-and-shepherd](../ready-and-shepherd/SKILL.md):

```
ready-and-shepherd <N> --arm-auto-merge [--steer-file <path>]
```

The shared skill light-reviews the diff, posts any steering before the trigger, transitions the
draft to ready, verifies repository merge settings, and dispatches the exact `/shepherd` comment.
Its activation preflight runs before every mutation. If either `HARNESS_DISPATCH_ENABLED` or
`HARNESS_SHEPHERD_ENABLED` is unset, unreadable, or not exactly `true`, record
`activation disabled — unchanged`; do not describe the PR as ready, armed, dispatched, or
checkpointed.

Classify the outcome:

- **Unsteered and inline arm succeeds:** already armed. Auto-merge may complete once requirements
  pass while the asynchronous shepherd independently checks the PR.
- **Steered, or an unsteered inline arm fails because the branch conflicts:** leave the PR ready and
  unarmed after dispatch. Auto Harness is fire-and-forget; its `running` checkpoint proves session
  acceptance, not terminal agent success. A human must inspect the eventual PR state and explicitly
  decide whether to arm auto-merge later. Do not wait for or infer a `complete` checkpoint.
- **Repository auto-merge disabled:** dispatch the shepherd, report manual merge required, and leave
  auto-merge unchanged.
- **Native GitHub stack:** shepherd owned layers concurrently via **single-PR** polls — safe, because
  pr-shepherd's per-PR ready-delay state is isolated per PR. Never run the aggregate `--stack` poll
  while any single-PR poll is in flight; it shares one timer across every row and resets them all.
  Merge serially bottom-up, each layer on its own explicit human approval, per
  [Merge the bottom layer as soon as it is ready](../stacked-prs/SKILL.md#merge-the-bottom-layer-as-soon-as-it-is-ready) —
  but only as far as this triage run's own decisions cover. Resolve the full stack against the
  Step 1 scope and the Step 3 decisions before draining: if the scope covered only some of the
  stack's layers, or any layer in the stack was classified `CLOSE`, stop the drain before the
  first layer that is out of scope or not `MERGE` rather than continuing past it — do not shepherd
  or merge a layer this run never reviewed or explicitly rejected. GitHub does not support
  auto-merge for stacks, and this batch path's `automerge: true` does not authorize the drain on
  its own (see [Git And PRs](../agent-workflow/git-and-prs.md)).

Do not add a second pass that polls the short dispatch workflow. The workflow ends after Harness
accepts or rejects the session and cannot attest that the remote agent consumed steering or left the
branch mergeable.

## Step 5 — Execute CLOSE

Per PR:

```bash
gh pr close <N> --delete-branch --comment "Closing: <one-line reason>"
```

Branch auto-deletion on merge is a repo setting; it does not apply to closes, so
`--delete-branch` is required here.

After closing each PR, check for linked issues and close them too:

```bash
gh pr view <N> --json closingIssuesReferences \
  --jq '.closingIssuesReferences[] | {number, title}'
```

For each returned issue, close it **only if it appears to be automation-created** — title
starts with `Automation` and carries an automation-owned label. Skip any issue that looks
human-authored: automation sometimes reuses existing human-tracked issues by adding
`Closes #<N>` to a PR body, and closing those alongside a rejected PR would discard
legitimate open work.

```bash
gh issue close <ISSUE_N> --comment "Closing alongside PR #<N>: <same one-line reason>"
```

## Step 5b — Close orphan automation issues

**Default scope only.** This step applies only when `/triage-prs` runs without an
argument (the full automation queue). Skip it for narrow-scope runs (explicit PR
numbers, author, label) — scanning the full issue queue would close issues unrelated
to the PRs that were actually triaged.

After the close pass, scan for open automation issues that have no open PR linked to them
(issues automation created but whose PR was never opened, was already merged/closed
separately, or whose PR was just closed in Step 5).

```bash
# List open automation issues — exclude needs-human (intentionally PR-free backlog items)
gh issue list --state open --limit 100 --json number,title,labels \
  --jq '.[] | select(
       (any(.labels[].name; . == "automation:auto-fix" or . == "automation:scheduled")
         or (.title | test("^Automation"; "i")))
      and (.labels | map(.name) | any(. == "needs-human") | not)
    ) | .number'
```

`needs-human` issues are human-escalation backlog items created when automation fails
repeatedly; they are intentionally open with no associated PR.

For each returned issue number, check for an open linked PR. Note that
`closedByPullRequestsReferences` only captures PRs using `Closes`/`Fixes` keywords —
it is blind to `Refs #N` or `Part of #N` references (used when a PR only partially
addresses an issue). Cross-check with a title search to avoid false positives:

```bash
# Step 1: check closing references (state field is null in this API; look up each PR)
gh issue view <ISSUE_N> --json closedByPullRequestsReferences \
  --jq '.closedByPullRequestsReferences | map(.number) | .[]'
# For each PR number returned, check its state:
gh pr view <PR_N> --json state --jq .state

# Step 2: if closedByPullRequestsReferences is empty, also search for open PRs
# that mention the issue number (catches Refs/Part-of references)
gh pr list --state open --search "#<ISSUE_N>" --json number,title \
  --jq '.[] | .number'
```

Only close the issue if **both** checks find no open PR:

```bash
gh issue close <ISSUE_N> --comment "Closing: orphaned — no open PR is addressing this issue."
```

## Step 6 — Verify, publish preauthorized prompt feedback, and report

Check that merge and close actions landed:

```bash
gh pr view <N> --json isDraft,autoMergeRequest,state
```

Emit a summary table:

| PR  | Decision | Action                                          | Steering          |
| --- | -------- | ----------------------------------------------- | ----------------- |
| #N  | MERGE    | ready + /shepherd + auto-merge armed            | comment text or — |
| #N  | MERGE    | ready + /shepherd, manual verification required | comment text or — |
| #N  | MERGE    | ready + /shepherd, manual merge required        | —                 |
| #N  | MERGE    | activation disabled — unchanged                 | —                 |
| #N  | CLOSE    | closed + branch deleted                         | —                 |

After Steps 4 and 5, amend the Step 3 creation feedback with action-time steering
and CI evidence before grouping it. Do not wait for the newly dispatched
asynchronous shepherd; record only evidence available during this triage run.

### Step 6a — Publish verified prompt feedback

This invocation explicitly authorizes the GitHub mutations in this subsection, but only for
actionable feedback whose provenance and exact source are verified under
[`docs/prompts/**`](../../../docs/prompts/README.md). A PR body containing
`<!-- pr-creation-feedback-origin: triage-prs -->` is a feedback PR from this flow: review it
normally in the queue, but return `none` for its own PR-creation feedback so the loop cannot recur.

For the current batch, combine every qualifying finding — including `one-off` findings — into one
validated `Plan:` issue and one draft feedback PR. The Plan issue is the sole closing source for
that PR; reviewed PRs are evidence only and must never be added as closing references.

Before publication, verify all of the following at action time:

- The PR is verified agent-authored, the source target is an exact `docs/prompts/**` path, and the
  recommendation remains actionable after the refresh.
- Each source exists on refreshed `origin/main`.

#### Duplicate resolution

Compare the marker and the normalized set of exact source paths on open feedback PRs:

- `duplicate: zero-overlap` — create one validated `Plan:` issue and one draft PR.
- `duplicate: exact-match` — reuse the one canonical matching PR and its existing Plan issue;
  create neither.
- `duplicate: ambiguous` — fail closed: any partial overlap, more than one exact match, or any
  uncertain provenance/source set creates nothing.

For a create, use [planning](../planning/SKILL.md) and [github-issue](../github-issue/SKILL.md) for
the Plan issue, then [pr-description](../pr-description/SKILL.md) for the draft PR. The PR body must
include `<!-- pr-creation-feedback-origin: triage-prs -->`, carry the `automation` label, and link
the Plan issue with a closing keyword. Do not ready, shepherd, auto-merge, or merge a generated or
reused feedback PR in the same triage run.

#### Retrospective disposition

- `disposition: published` — use `Disposition: preauthorized-pr #N` after a successful create or
  exact-match reuse.
- `disposition: deferred` — record `deferred` with the concrete Step 6a blocker after a failed,
  partial, or `duplicate: ambiguous` publication; do not ask the user or claim the feedback was
  handled.
- `disposition: user-choice` — keep non-prompt feedback in the normal human follow-up flow.

Group the Step 3 PR-creation recommendations by root cause and invoke
[retrospective](../retrospective/SKILL.md). The retrospective records findings for both merged and
closed PRs. Preserve `none` when no actionable generator improvement was found. Complete that
feedback flow before the final triage report.

## See Also

- [ready-and-shepherd](../ready-and-shepherd/SKILL.md) — the shared draft→ready→shepherd
  mechanics Step 4 delegates to for each MERGE'd PR.
