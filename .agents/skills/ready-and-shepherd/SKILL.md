---
name: ready-and-shepherd
description: Apply draft-to-shepherd mechanics inside authorized PR or security triage.
argument-hint: '[PR number or URL] [--arm-auto-merge] [--steer-file <path>] [--codex-security-local-handoff]'
allowed-tools: ['Bash', 'Read', 'Write', 'Grep']
---

# Ready And Shepherd

Internal mechanics used by [triage-prs](../triage-prs/SKILL.md) Step 4 and the
Vouchington [triage-security](../triage-security/SKILL.md) adapter to move
a batch-triaged draft PR to ready and hand it to a local shepherd: the session that authored the
PR, or a triage-loop subagent running pr-shepherd. **Only these two triage skills invoke this skill.** It is not a
general-purpose "mark any draft PR ready" tool — if you're working a single PR in
the current session, do not invoke `ready-and-shepherd`. Use the installed plugin
(`/pr-shepherd:pr-shepherd <N>` in Claude Code or
`$pr-shepherd:pr-shepherd <N>` in Codex) or the canonical Voucha CLI form under
the same CANCEL/ESCALATE termination contract and stop/re-arm rules in
[Git And PRs](../agent-workflow/git-and-prs.md). Let pr-shepherd mark a clean draft ready;
arm auto-merge separately only when the human has authorized it.

## Step 1 — Resolve the PR

Use the `$ARGUMENTS` PR number/URL if given, else infer from the current branch:

```bash
gh pr view --json number --jq .number
```

## Step 2 — Light review

Read the diff and CI state before touching anything:

```bash
gh pr diff <N>
gh pr checks <N> --json name,state,link
```

Decide whether the shepherd needs direction (e.g. "prefer the general fix over a
narrow band-aid", "the oxlint failure is self-inflicted — fix it first"). If so,
write the exact PR comment body to a temporary file using a file-writing tool, then
read the file back in full. Do not construct it with shell interpolation, a heredoc,
`echo`, or `printf`. If invoked with `--steer-file <path>`, use that file instead of
deriving one.

## Security-triage handoff mode

`--codex-security-local-handoff` is reserved exclusively for the Vouchington `triage-security`
adapter after the public `security-triage` plugin has created and resolved the provider's PR and
the adapter has verified its actual diff. This mode may only transition the draft to ready and
idempotently apply the required `automation` label. It rejects steering and auto-merge, posts no
comment, and exits before Steps 3-7. It fails closed unless the PR is open and post-mutation
verification shows it is ready with the label present.

```bash
codex_security_local_handoff=false
case " $ARGUMENTS " in
  *" --codex-security-local-handoff "*) codex_security_local_handoff=true ;;
esac
if [ "$codex_security_local_handoff" = "true" ]; then
  case " $ARGUMENTS " in
    *" --arm-auto-merge "*|*" --steer-file "*)
      echo "Security-triage local handoff cannot steer or arm auto-merge." >&2
      exit 1
      ;;
  esac
  if [ "$(gh pr view <N> --json state --jq .state)" != "OPEN" ]; then
    echo "Security-triage local handoff requires an open PR." >&2
    exit 1
  fi
  if [ "$(gh pr view <N> --json isDraft --jq .isDraft)" = "true" ]; then
    gh pr ready <N> || exit 1
  fi
  gh pr edit <N> --add-label automation || exit 1
  if [ "$(gh pr view <N> --json isDraft,labels,state --jq 'select(.state == "OPEN" and (.isDraft | not) and any(.labels[]; .name == "automation")) | .state')" != "OPEN" ]; then
    echo "Security-triage local handoff verification failed." >&2
    exit 1
  fi
  echo "Security-triage local handoff complete."
  exit 0
fi
```

Report `ready: yes`, `steered: —`, `auto-merge armed: no`, and `shepherd: no (provider-local
handoff)`.

## Step 3 — Steer (optional)

Only if Step 2 identified steering, and **before** arming auto-merge, read the entire
steering file again and confirm it contains exactly the reviewed comment. Reject a
missing or empty file, then post it as a separate ordinary PR comment:

```bash
steering_file="<path-from---steer-file>"
test -s "$steering_file"
gh pr comment <N> --body-file "$steering_file"
```

Never pass steering through inline `--body` text. The reviewed file prevents shell
metacharacters and backticks in the comment from being expanded. The local shepherd reads this
comment as ordinary PR context.

`gh *` is sandbox-excluded by the machine policy (see
[agent-sandbox.md](../../../docs/development/agent-sandbox.md)), but this
`gh pr comment` call has been observed to still fail with a
`~/.config/gh` permission error. If that happens, retry the same call with the
OS-sandbox bypass rather than treating it as a real failure: in Claude Code, use
`dangerouslyDisableSandbox: true`; in Codex, rerun with `sandbox_permissions:
"require_escalated"`. A compound command that the machine policy does not exclude may still need
the explicit retry.

## Step 4 — Mark ready

```bash
if [ "$(gh pr view <N> --json isDraft --jq .isDraft)" = "true" ]; then
  gh pr ready <N>
fi
```

Every PR this skill handles is automation-triaged — both callers (`triage-prs`,
the `triage-security` adapter) only ever act on automation-created PRs. Apply
the `automation` label idempotently (no-op if the PR-producing agent already
applied it — see [merge-authority](../../../docs/development/merge-authority.md)):

```bash
gh pr edit <N> --add-label automation
```

Marking ready is the hand-off. If this session did the PR's work, follow the canonical
Close-out (`node_modules/vouchington-tooling/skills/agent-workflow/SKILL.md#close-out`)
(hand-off retrospective, then merge note). A triaged PR this session did not author gets no
hand-off retrospective, because a retrospective reads this session's transcripts, not the author's.

## Step 5 — Arm auto-merge (only with `--arm-auto-merge`)

Without this flag, **skip this step entirely** — merge stays a human decision.
Merging without explicit per-PR human approval is prohibited (see
[Git And PRs](../agent-workflow/git-and-prs.md)); only pass `--arm-auto-merge` when
the caller is itself a human-authorized batch-triage workflow (e.g. `triage-prs`
with an operator-approved MERGE decision).

Pre-check repo merge settings once per session, not per PR:

```bash
gh api repos/{owner}/{repo} --jq '{squash: .allow_squash_merge, automerge: .allow_auto_merge}'
```

If `automerge` is `false`: do not attempt to arm it. Report the limitation and
require a manual merge once CI is green — proceed to Step 6 regardless. No
deferral applies to this path.

GitHub does not support auto-merge on stacked PRs. Detect stack membership
from the REST `stack` object (present only when the pull request is in a
stack; this is a preview field — if Stacked PRs are disabled the object is
absent even for a stacked PR, and GitHub still rejects `gh pr merge --auto`
server-side) before arming:

```bash
gh api "repos/{owner}/{repo}/pulls/<N>" --jq '.stack // empty'
```

If that output is non-empty, treat auto-merge as unavailable for this PR even
when the repo setting is true. Do **not** proceed to Step 6: concurrent
per-PR shepherds rewrite sibling stack branches when a lower layer runs
`gh stack rebase --upstack` / `gh stack push`. This batch path's
`automerge: true` is not the authorization that
[Merge every ready bottom layer at once](../stacked-prs/SKILL.md#merge-every-ready-bottom-layer-at-once)
requires (see [Git And PRs](../agent-workflow/git-and-prs.md)) — batch triage
has no human in the loop to ask. Report `shepherd: no (stacked; requires
explicit stack-merge authorization outside this batch run)` and stop here
without shepherding or merging any layer; do not enter the drain procedure from
this path. A separate, interactive invocation where a human has actually
granted that authorization may run the drain. Skip Steps 6-7.

If `automerge` is `true` and the PR is not in a stack, branch on whether
Step 3 posted steering:

**Unsteered** (no steering was posted): arm inline, right now.

```bash
gh pr merge <N> --auto --squash
```

In an interactive session, the merge-authority hook lets this command proceed without a prompt —
arming is a human decision, and the human already made it by asking for this work in their own
message. See [merge-authority.md](../../../docs/development/merge-authority.md). CI and unattended
Claude sessions still hard-block this command unconditionally.

**Conflicting-branch ordering** (unsteered path only): `gh pr merge --auto`
succeeds even on a `CONFLICTING`/`DIRTY` branch — it queues the merge and
executes automatically once conflicts are resolved and CI is green. Arm it
**before** Step 6 — the shepherd resolves the conflict; the already-armed
auto-merge then executes when CI is green — the shepherd does not re-arm it.
If `gh pr merge --auto` fails despite this, do not re-arm blindly once CI
looks green later. Shepherd in Step 6, leave the PR unarmed, and require explicit human verification.

**Steered** (Step 3 posted a comment): do **not** arm here. Arming now races
the shepherd — `gh pr merge --auto --squash` fires the instant a green PR
flips to ready, before the shepherd has consumed the steering at all. Fall
through to Step 6 unarmed. A human must verify the eventual result and explicitly decide whether
to arm later.

## Step 6 — Shepherd locally

Shepherding is local. Detect stack membership first, not only inside Step 5 (Step 5 is skipped
without `--arm-auto-merge`):

```bash
gh api "repos/{owner}/{repo}/pulls/<N>" --jq '.stack // empty'
```

If that output is non-empty, do **not** start a per-PR shepherd. Concurrent per-PR shepherds race
`gh stack rebase --upstack` / `gh stack push` across layers. Report `shepherd: no (stacked;
shepherd the stack with one in-session CLI poll)` per
[Merge every ready bottom layer at once](../stacked-prs/SKILL.md#merge-every-ready-bottom-layer-at-once).
Skip the rest of Step 6.

Otherwise the shepherd is exactly one of:

- the session that authored the PR, shepherding its own PR; or
- a triage-loop subagent started for this PR (the `vouchington-workflow:triage-loop` skill).

Run the installed plugin (`/pr-shepherd:pr-shepherd <N>` in Claude Code or
`$pr-shepherd:pr-shepherd <N>` in Codex) or `pnpm exec pr-shepherd <N> --until-terminal
--quiet-status` until its `CANCEL`/`ESCALATE` termination, under the stop/re-arm rules in
[Git And PRs](../agent-workflow/git-and-prs.md). **Never run two shepherds on the same PR**: two
agents diagnosing and pushing a fix for the same failure collide with non-fast-forward pushes.
Before starting one, confirm no other session or subagent already owns the PR.

If Step 3 posted steering, the shepherd reads that ordinary PR comment as context before acting.
When Step 5 could not arm inline, including every steered PR and an unsteered conflicting-branch
fallback, leave the PR ready and unarmed; a human must inspect the eventual PR state and
explicitly decide whether to arm auto-merge later. Re-running this skill starts a fresh reviewed
handoff.

## Step 7 — Verify

```bash
gh pr view <N> --json isDraft,autoMergeRequest,state
```

Confirm `isDraft` is `false`. When Step 5 armed auto-merge inline, accept `OPEN` with
`autoMergeRequest` set or `MERGED` after immediate completion. Otherwise require the PR to remain
`OPEN` with no auto-merge request; report any concurrent human state change without mutating it.

## Output

Report per PR: `ready` (yes/no), `steered` (comment or —), `auto-merge armed`
(yes/no/manual-verification-required/unavailable), and `shepherd` (the local owner, or no with the
reason). A steered or conflicting-branch handoff is `manual-verification-required`, not
`deferred` or `escalated`.

## See Also

- [triage-prs](../triage-prs/SKILL.md) — calls this skill per MERGE-decided PR with
  `--arm-auto-merge`.
- [triage-security](../triage-security/SKILL.md) — calls this skill for each
  verified provider PR handoff, without `--arm-auto-merge`.
- The installed plugin or canonical Voucha CLI
  (`pnpm exec pr-shepherd <N> --until-terminal --quiet-status`)
  runs until `CANCEL` (ready-delay elapsed, or merged/closed) or `ESCALATE`.
  Use it directly, without going through `ready-and-shepherd`, when you are working a single PR in
  the current session, and let pr-shepherd own the draft-to-ready transition.
