---
name: ready-and-shepherd
description: |
  Internal draft-to-shepherded mechanics for the batch-triage skills
  (`triage-prs`, `triage-security`): light-review a draft PR's diff,
  optionally steer the Auto Harness shepherd, mark it ready, optionally arm squash
  auto-merge, and dispatch the external CI-triggered `/shepherd` Auto Harness agent.
  Only meant to be invoked autonomously by those two triage skills — never
  invoke it directly for a PR the current agent is itself going to shepherd
  with the installed plugin or local CLI; those flows own readiness themselves.
argument-hint: '[PR number or URL] [--arm-auto-merge] [--steer-file <path>] [--codex-security-local-handoff]'
allowed-tools: ['Bash', 'Read', 'Write', 'Grep']
---

# Ready And Shepherd

Internal mechanics used by [triage-prs](../triage-prs/SKILL.md) Step 4 and the
Filaments [triage-security](../triage-security/SKILL.md) adapter to move
a batch-triaged draft PR to ready and hand it to the external CI-dispatched Auto Harness
shepherd. **Only these two triage skills invoke this skill.** It is not a
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

## Activation preflight — fail closed before Step 3

Before making **any** GitHub mutation, verify that both the repository's Auto Harness master gate
and exact Shepherd surface gate are explicitly enabled. The sole disabled-dispatch exception is the
provider-local security-triage handoff documented below; no other caller may
use its flag.

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
fi
harness_dispatch_enabled="$(gh variable get HARNESS_DISPATCH_ENABLED 2>/dev/null || true)"
harness_shepherd_enabled="$(gh variable get HARNESS_SHEPHERD_ENABLED 2>/dev/null || true)"
if [ "$harness_dispatch_enabled" != "true" ] || [ "$harness_shepherd_enabled" != "true" ]; then
  if [ "$codex_security_local_handoff" = "true" ]; then
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
    echo "Security-triage provider-local handoff complete; Harness shepherd dispatch remains disabled."
    exit 0
  fi
  echo "Auto Harness shepherd dispatch is disabled; leaving PR comments, readiness, labels, and merge state unchanged."
  exit 0
fi
```

### Security-triage provider-local handoff

`--codex-security-local-handoff` is reserved exclusively for
the Filaments `triage-security` adapter after the public `security-triage` plugin
has created and resolved the provider's PR and the adapter has verified its actual
diff. While Harness dispatch is disabled,
this mode may only transition the draft to ready and idempotently apply the required
`automation` label. It rejects steering and auto-merge, performs no Harness call or
prompt transfer, posts no comment, creates no checkpoint entry, and
exits before Steps 3–8. It fails closed unless the PR is open and post-mutation
verification shows it is ready with the label present. Report `ready: yes`,
`steered: —`, `auto-merge armed: no`,
and `/shepherd dispatched: no (provider-local handoff; activation disabled)`.

### Generic disabled path

An unset, unreadable, empty, or non-`true` value for either gate is disabled. Without the exact
provider-local flag, stop before Steps 3–8: do not post steering, mark the PR ready,
add labels, arm auto-merge, post `/shepherd`, create a checkpoint entry, or wait
for a checkpoint. Report `ready: no (unchanged)`, `steered: —`, `auto-merge armed:
no (unchanged)`, and `/shepherd dispatched: no (activation disabled)`. Do not claim
that a dispatch started; the workflow's own activation gate would skip before
producing a checkpoint.

## Step 3 — Steer (optional)

Only if Step 2 identified steering, and **before** arming auto-merge, read the entire
steering file again and confirm it contains exactly the reviewed comment. Reject a
missing or empty file, then post it as a separate ordinary PR comment:

```bash
steering_file="<path-from---steer-file>"
test -s "$steering_file"
normalized_steering="$(node -e 'const fs = require("node:fs"); process.stdout.write(fs.readFileSync(process.argv[1], "utf8").replaceAll("\r", "").trim())' -- "$steering_file")"
if [ "$normalized_steering" = "/shepherd" ]; then
  echo "Refusing steering that would trigger /shepherd early." >&2
  exit 1
fi
gh pr comment <N> --body-file "$steering_file"
```

Never pass steering through inline `--body` text. The reviewed file prevents shell
metacharacters and backticks in the comment from being expanded. Normalize carriage
returns and surrounding whitespace only for the trigger comparison, and reject the
file if its entire normalized content is `/shepherd`. This comment does not invoke
the shepherd; Step 6 posts the exact standalone trigger afterward.

`gh *` is sandbox-excluded by default (see
[agent-sandbox.md](../../../docs/development/agent-sandbox.md)), but this
`gh pr comment` call has been observed to still fail with a
`~/.config/gh` permission error. If that happens, retry the same call with the
OS-sandbox bypass rather than treating it as a real failure: in Claude Code, use
`dangerouslyDisableSandbox: true`; in Codex, rerun with `sandbox_permissions:
"require_escalated"` instead of only relying on a `prefix_rule`, which remains
OS-sandboxed.

## Step 4 — Mark ready

```bash
if [ "$(gh pr view <N> --json isDraft --jq .isDraft)" = "true" ]; then
  gh pr ready <N>
fi
```

Every PR this skill handles is automation-triaged — both callers (`triage-prs`,
the `triage-security` adapter) only ever act on automation-created PRs. Apply
the `automation` label idempotently (no-op if the PR-producing Harness agent already
applied it — see [merge-authority](../../../docs/development/merge-authority.md)):

```bash
gh pr edit <N> --add-label automation
```

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
per-PR `/shepherd` dispatch rewrites sibling stack branches when a lower
layer runs `gh stack rebase --upstack` / `gh stack push`. This batch path's
`automerge: true` is not the authorization that
[Merge the bottom layer as soon as it is ready](../stacked-prs/SKILL.md#merge-the-bottom-layer-as-soon-as-it-is-ready)
requires (see [Git And PRs](../agent-workflow/git-and-prs.md)) — batch triage
has no human in the loop to ask. Report `/shepherd dispatched: no (stacked;
requires explicit stack-merge authorization outside this batch run)` and stop
here without shepherding or merging any layer; do not enter the drain
procedure from this path. A separate, interactive invocation where a human
has actually granted that authorization may run the drain. Skip Steps 6–7.

If `automerge` is `true` and the PR is not in a stack, branch on whether
Step 3 posted steering:

**Unsteered** (no steering was posted): arm inline, right now.

```bash
gh pr merge <N> --auto --squash
```

In an interactive session, the merge-authority hook lets this command proceed without a prompt —
arming is a human decision, and the human already made it by asking for this work in their own
message. See [merge-authority.md](../../../docs/development/merge-authority.md). Automation
(GitHub Actions) still hard-blocks this command unconditionally.

**Conflicting-branch ordering** (unsteered path only): `gh pr merge --auto`
succeeds even on a `CONFLICTING`/`DIRTY` branch — it queues the merge and
executes automatically once conflicts are resolved and CI is green. Arm it
**before** Step 6 — the shepherd resolves the conflict; the already-armed
auto-merge then executes when CI is green — the shepherd does not re-arm it.
If `gh pr merge --auto` fails despite this, do not re-arm blindly once CI
looks green later. Dispatch in Step 6, leave the PR unarmed, and require explicit human verification.

**Steered** (Step 3 posted a comment): do **not** arm here. Arming now races
the shepherd — `gh pr merge --auto --squash` fires the instant a green PR
flips to ready, before the shepherd has consumed the steering at all, and if
it fires before Step 6's `OPEN` check the dispatch is silently skipped
altogether. Fall through to Step 6 unarmed. The fire-and-forget dispatch has no terminal completion
attestation, so a human must verify the eventual result and explicitly decide whether to arm later.

## Step 6 — Dispatch the shepherd

Detect stack membership here, not only inside Step 5. Step 5 is skipped when
`--arm-auto-merge` is absent, and when repo auto-merge is off it used to fall
through to dispatch before the stack check ran.

```bash
gh api "repos/{owner}/{repo}/pulls/<N>" --jq '.stack // empty'
```

If that output is non-empty, do **not** post `/shepherd`. Concurrent per-PR
dispatch races `gh stack rebase --upstack` / `gh stack push` across layers.
Report `/shepherd dispatched: no (stacked; shepherd layers serially from the
bottom with the in-session CLI)` per
[Merge the bottom layer as soon as it is ready](../stacked-prs/SKILL.md#merge-the-bottom-layer-as-soon-as-it-is-ready).
Skip the rest of Step 6 and Step 7.

Dispatching to the external Auto Harness session is the entire point of this
skill for unstacked PRs. This step runs only after the activation preflight
succeeded and is then subject to the `OPEN`-state check below.

**Never run both shepherds on the same PR.** This is why `ready-and-shepherd` is
triage-only (see the intro): the CI-triggered comment spawns an independent Auto Harness
agent that collides with an in-session `pr-shepherd` loop (both may diagnose and
push a fix for the same failure at once, causing a non-fast-forward push
collision). If you are working a single PR in the current session — including
whenever you're going to run `pr-shepherd`/`$pr-shepherd:pr-shepherd` locally toward
its own `CANCEL`/`ESCALATE` termination — you should never have reached this
skill in the first place. Use the installed
plugin or canonical Voucha CLI without posting the external trigger; pr-shepherd
will mark a clean draft ready, and any human-authorized auto-merge remains a
separate action.

```bash
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
if [ "$(gh pr view <N> --json state --jq .state)" = "OPEN" ]; then
  trigger_comment_id="$(gh api -X POST "repos/$repo/issues/<N>/comments" -f body='/shepherd' --jq .id)"
fi
```

The comment body must be **exactly** `/shepherd` — no extra whitespace, no
surrounding text. This triggers `.github/workflows/shepherd.yml`, which
dispatches Auto Harness to drive CI green and, if steered, act on the preceding ordinary
PR comment. Posting via `gh api -X POST` (rather than `gh pr comment`) is
deliberate: the response body carries `.id`, which identifies the exact immediate checkpoint for
this dispatch rather than an earlier shepherd run's comment on the same PR.

Same caveat as the Step 3 steering comment: if the `gh pr view` state check or
the `gh api` dispatch fails with a `~/.config/gh` permission error, retry the
whole Step 6 block, or the state check plus dispatch, with the OS-sandbox
bypass. In Claude Code, use `dangerouslyDisableSandbox: true`; in Codex, rerun
with `sandbox_permissions: "require_escalated"` instead of only relying on a
`prefix_rule`, which remains OS-sandboxed.

## Step 7 — Record the asynchronous handoff

Auto Harness dispatch is fire-and-forget. The GitHub workflow records a provenance-bound
`queued` checkpoint before dispatch and patches that exact comment to `running` with the session
URL, or `failed` when session creation fails. It does not poll the session and no repository
workflow writes a terminal `complete` checkpoint.

A `running` checkpoint proves only that Harness accepted the session. It does not prove that
steering was consumed, the branch changed, checks passed, or the PR is mergeable. Never infer agent
completion from the short GitHub Actions run, wait for a `complete` checkpoint that cannot arrive,
or arm auto-merge from `queued`/`running` state.

When Step 5 could not arm inline, including every steered PR and an unsteered conflicting-branch
fallback, leave the PR ready and unarmed after Step 6. Report that Auto Harness accepted an
asynchronous handoff when the workflow's exact checkpoint reaches `running`; report dispatch
failure when it reaches `failed`. A human must inspect the eventual PR state and explicitly decide
whether to arm auto-merge later. Re-running this skill must start a fresh reviewed handoff; it must
not turn a prior asynchronous checkpoint into merge authority.

## Step 8 — Verify

```bash
gh pr view <N> --json isDraft,autoMergeRequest,state
```

Confirm `isDraft` is `false`. When Step 5 armed auto-merge inline, accept `OPEN` with
`autoMergeRequest` set or `MERGED` after immediate completion. Otherwise require the PR to remain
`OPEN` with no auto-merge request; report any concurrent human state change without mutating it.

## Output

Report per PR: `ready` (yes/no), `steered` (comment or —), `auto-merge armed`
(yes/no/manual-verification-required/unavailable), `/shepherd dispatched` (yes/no), and the
immediate checkpoint state when observed. When activation is disabled, use the exact unchanged
outcome from the preflight and do not claim a dispatch or checkpoint. A steered or
conflicting-branch handoff is `manual-verification-required`, not `deferred` or `escalated`:
fire-and-forget dispatch deliberately carries no terminal completion attestation.

## See Also

- [triage-prs](../triage-prs/SKILL.md) — calls this skill per MERGE-decided PR with
  `--arm-auto-merge`.
- [triage-security](../triage-security/SKILL.md) — calls this skill for each
  verified provider PR handoff, without `--arm-auto-merge`.
- The installed plugin or canonical Voucha CLI
  (`pnpm exec pr-shepherd <N> --interval 60s --until-terminal --quiet-status`)
  is the local polling alternative to the CI-triggered `/shepherd` comment and
  runs until `CANCEL` (ready-delay elapsed, or merged/closed) or `ESCALATE`.
  Use it directly, without going through `ready-and-shepherd`, and let
  pr-shepherd own the draft-to-ready transition.
