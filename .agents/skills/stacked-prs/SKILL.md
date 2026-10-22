---
name: stacked-prs
description: Discover and shepherd native GitHub PR stacks or PRs based on non-main branches.
---

# Stacked Pull Requests

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:stacked-prs`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md`. If it cannot be read, stop and report
the missing prerequisite; never apply this overlay alone. Decision owner for whether to stack at all
(only dependent or contract-conflicting work stacks, without asking), the 10-PR stack cap, one source issue per PR,
and the ~5k-changed-line split trigger:
[Git And PRs](../agent-workflow/git-and-prs.md).
This page is the CLI contract and procedure after that decision is already yes.

## Vouchington additions

The remaining rules are Vouchington-only mechanics, ownership, and the shepherd/merge procedure.

## Native GitHub stack mechanics

Install on first stacked use: `gh extension install github/gh-stack`. This feature is public preview.
If `gh stack` exits 9 (not enabled on the repository), do not bundle the source issues into one PR.
Open one PR targeting `main` for the bottom issue, wait for it to merge, then open the next. Say that
stacks are unavailable.

The area workflows must not set `pull_request.branches` or `branches-ignore`: `gh stack submit` opens mid-stack PRs before the stack object exists, so a branch filter skips them permanently.

### Agent commands

Use only these non-interactive forms:

- `gh stack init <branch>` — hook-enforced, not just advisory: the pre-tool-use hook hard-blocks
  `init` when `--base`/`-b` names anything but `main`, or when HEAD is not an ancestor of
  `origin/main` (an off-trunk root), or when local `refs/heads/main` exists and differs from
  `refs/remotes/origin/main`. gh-stack roots the first layer at local `main`, not `origin/main`,
  and in a linked worktree `git fetch origin` does not advance it. Fast-forward it with
  `git fetch origin main:main` only when no worktree has main checked out; otherwise the checkout
  that has it fast-forwards itself (`git merge --ff-only origin/main`). Never move it from here.
- `gh stack add <branch>`
- `gh stack checkout <stack-number>` — imports an existing remote stack by stack or PR number. See
  [Import a stack before acting on it](#import-a-stack-before-acting-on-it).
- `gh stack submit --auto` — creates drafts. Immediately `pr_update` (the `vouchington-tooling` MCP tool) each
  new PR from that layer's worktree, since the tool requires the PR head to be the worktree branch; auto titles and bodies are not sufficient.
- `gh stack view --json` — acting only; never use its output, or `gh stack bottom`, to decide
  topology, ownership, or bottom-ness (see "Local metadata is advisory" below).
- `gh stack rebase`, `gh stack rebase --upstack`, `gh stack rebase --continue`, `gh stack rebase --abort`
- `gh stack sync` — fast-forward against `origin/main`. Do not check out `main`.
- `gh stack push`
- `gh stack up <n>`, `gh stack down <n>`, `gh stack top`, `gh stack bottom` (movement only)
- `gh stack merge <pr> --yes --squash` — see [Merge every ready bottom layer at once](#merge-every-ready-bottom-layer-at-once). The PR-number selector is required; bare `gh stack merge` stays banned below. Always include both flags: `--yes` skips the confirmation prompt a non-interactive command runner cannot answer, and `--squash` is the required strategy.
- `gh stack unstack` (active stack or a stack number; removes the remote stack grouping unless `--local`) / `gh stack delete <branch>` — recovery from a mis-rooted stack.

The pre-tool-use hook enforces this allowlist (see `dev/codex-hooks/policy/github-stack-workflow.mts`); do not run interactive TUIs (`gh stack submit` without `--auto`, `modify`, `switch`, bare `checkout`, bare `merge`) or `gh stack trunk`.

### Worktree and scope

One non-main worktree per stack. Move with `up`/`down`. Do not add a worktree per layer:
`gh stack rebase --upstack` rewrites upper-layer branches, and git refuses to update a branch checked
out in another worktree.

- `git diff --name-only origin/main...HEAD` — what lands if this layer and every layer below merge
- `git diff --name-only <parent>...HEAD` — this layer's review scope; it must match the one source issue

### Import a stack before acting on it

`gh stack rebase`, `sync`, `push`, and movement act only on stacks this worktree's local gh-stack
record tracks. A stack created from another worktree, session, or machine is not tracked here.
Before rebasing or pushing a stack layer, including when a pr-shepherd instruction says to, import
the stack into its one worktree:

1. `gh stack checkout <stack-number>`, with the number from `pulls/<N>.stack.number`. It records
   the stack and checks out the top-most unmerged layer. When this worktree already tracks a
   matching stack, it just switches branches, so remote-tracking refs can be stale.
2. Required: gh-stack keeps existing local layer branches as they are, so a stale one would make
   the next rebase start from stale commits. Run `git fetch origin` so each `origin/<b>` is the
   current PR head, then for each unmerged layer branch `<b>`, run
   `git rev-list --left-right --count <b>...origin/<b>` (left = local-only commits, right = commits
   only on the PR head):
   - `0 0` — up to date.
   - `0 N` (only behind) — fast-forward it: `git merge --ff-only origin/<b>` on the checked-out
     layer, `git branch -f <b> origin/<b>` on any other.
   - left count above `0` (ahead or diverged) — follow [Reading the four refs](../agent-workflow/git-and-prs.md#reading-the-four-refs) before rewriting or pushing. Do not open another pull request for this layer.

### Submit and verify the remote stack

A PR's base branch selects its comparison target; chaining base branches alone does not register a
native GitHub stack. `gh stack init` and `add` record a local plan. Neither local tracking nor a
successful PR creation proves that GitHub registered the stack.

Once an authorized upper layer has committed, reviewable work and its before-push checks pass,
submit the layers as drafts with `gh stack submit --auto` while the lower PR is still open and
unqueued. Verify remote registration before asking to merge or enqueue the lower PR; an open PR
already in the merge queue cannot be added to a new stack. If it was queued externally, stop
registration attempts and report the blocker. Do not dequeue it without authorization or rewrite
it; continue upper work that does not rewrite the queued layer. When it leaves the queue, re-read
its state: retry registration if it is still open and unqueued, or use merged-layer recovery below
if it merged. If it closed without merging, report the broken dependency before proceeding.
Do not wait for upper-layer CI or ready status to register the dependency. Do not create empty
placeholder layers or start work held pending approval merely to preserve a stack.

After each submission or link, read every intended PR's `pulls/<N>.stack` and the single-stack
endpoint below. Require the same stack number, the intended bottom-to-top order, and the expected
bases. PR creation can succeed while stack registration fails; inspect both outcomes before
reporting a native stack or starting its stack shepherd. Missing preview metadata leaves membership
unknown; report that limitation and do not infer success from local tracking.

If the lower PR merges before registration, re-read the forge, fetch refs, and rebase the remaining work onto the updated `origin/main` without replaying the merged layer. Register multiple remaining open layers as a stack; for a single survivor, retarget it to `main` and shepherd it individually. Never recreate the merged bottom PR or chain bases manually as a substitute for native registration.

### Lower-layer review fix

Check out the layer that owns the change, commit there, then `gh stack rebase --upstack` and
`gh stack push` once. Do not duplicate the fix in an upper layer.

## Local metadata is advisory — the forge is the only truth

Every fact this procedure branches on — topology, layer state, ownership, head SHA — comes from the
REST/GraphQL API, never from local `gh-stack` metadata. A local base ref can go stale after a remote
relink or rebase and silently replay already-landed commits.
`gh stack view --json` and `gh stack bottom` are used only to **act**, never to **decide**.

```bash
gh api "repos/{owner}/{repo}/pulls/<N>" --jq '{stackPresent: has("stack"), stack: .stack}'
gh api "repos/{owner}/{repo}/stacks/<n>"                # layers bottom→top, with head.sha and author
gh api "repos/{owner}/{repo}/stacks" --jq '[.[] | select(.open)]'   # every open stack; `state`
                                                                   # is null, and ?state=open
                                                                   # is ignored server-side
```

Use the **single-stack** endpoint for one stack's layers — the list form returns per-PR `base.ref` as
`null`. `.stack` is a **preview field**: its absence is not proof a PR is not stacked — degrade
explicitly (report "stack membership unknown", never assume unstacked) rather than treat a missing
field as a negative result.

## Procedure: shepherd concurrently, merge the ready prefix with a human

The shape: shepherding a layer to ready and merging are different acts. The first covers every PR
this agent owns in the stack at once. The second lands every ready bottom layer in one command and
is never the agent's decision.

### Who runs the stack

Bottom-up ordering, the decent-shape rule, layer counting against the cap, lower-layer blocking,
worker ownership, and one poll per stack are canonical:
Work bottom-up (`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md#work-bottom-up`)
and Ownership and workers (`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md#ownership-and-workers`).
Vouchington adds: the parent never runs `pnpm exec pr-shepherd` for a stack; the layer cap and
[must-stack decision](../agent-workflow/git-and-prs.md#branch-and-commit) stay in Git And PRs;
a layer is "decent shape" when its before-push checks have passed. Dependent work is the next layer
of the same stack (`gh stack add`) in the same worktree.

The `/shepherd` automation workflow stays a single-PR waiter. It does not spawn another stack.

### A. Establish scope

1. Resolve the stack from `pulls/<any-layer>.stack`, retaining whether the field is present.
   A stack object supplies its number; explicit `null` means no registered stack. A missing preview
   field leaves membership unknown. Follow the submission recovery above for a failed registration;
   do not interpret an empty `.stack.number` alone as proof that a PR is unstacked.
2. Read topology from `repos/{o}/{r}/stacks/<n>` (ordered bottom→top). A `closed && merged_at == null`
   entry below an open one means the stack is **broken** — report to the human; never merge across it.
3. **Partition by ownership**, applied to that topology read. Shepherd only PRs this agent owns; never
   poll, fix, rebase, or push the others — but list them in the report so the human sees the whole
   stack. **Owned** means this session opened the PR, or a human named it in this session:
   - The made-by-me half is a durable remote fact: the `pr_create` and `pr_update` tools stamp every
     PR body they write with `Agent: <harness> (<model>) session <id>`, resolved via
     `inspectHarnessEnvironment` across claude-code, codex, cursor, and grok. Compare against the
     current session id, the one the SessionStart hook printed as `Blackboard sessionId: <id>`:
     ```bash
     gh api repos/{o}/{r}/pulls/<N> --jq '.body' | grep -E '^Agent: .* (session|thread) <my-id>$'
     ```
   - The assigned-by-a-human half is conversational, not a GitHub field — it cannot be recovered
     remotely; that is acceptable, because the human is present to restate it if a compaction drops it.
   - **Degrade explicitly.** A body with no matching `Agent:` line, or one naming a harness with no
     session id, is **not owned** — report it as "ownership unverifiable", never poll it.
   - **A parent may assign its stack to one worker.** The assignment lists the pull request numbers
     and the provenance session id already stamped on those bodies. The worker treats that list as
     assigned. It does not need its own session id on the `Agent:` line; a worker's `pr_update`
     restamps the line with the worker's session. The worker still refuses a layer outside the list.
     pr-shepherd's `owned` mark stays author-equals-viewer; a layer that mark omits stays untouched.

### B. Shepherd the owned PRs

The stack worker runs one `pnpm exec pr-shepherd stack <pr> --until-terminal --quiet-status` for the
assigned stack — the canonical command in [Git And PRs](../agent-workflow/git-and-prs.md) — and follows
the pr-shepherd plugin skill and the CLI's printed `## Instructions`. pr-shepherd owns its actions, exit
codes, stack routing, and merge-command output; this page adds only Vouchington's ownership, git, and
merge policy:

- **Owned layers only.** Apply code fixes, rebases, pushes, and review mutations only to owned
  layers. Report work pr-shepherd surfaces on an unowned layer to the human instead.
- **Fix on the owning layer.** Commit there, then `./dev/rebase-onto-main --stack` (or
  `gh stack rebase --upstack` when upper layers must move), `gh stack sync` when there are no local
  stack commits, and `gh stack push` **once**, and rerun the shepherd.
- **Shepherd starts with the first pull request.** Do not wait until the last layer is written.
  While the poll is inside a pure wait and the worktree is clean, commit the next layer once the
  lower layer is in decent shape. On `TRIAGE`, finish those instructions on the owning layer
  before more upper edits. A ready-delay schedules the rerun; continue work already owned on a
  later layer, and do not invent unrelated work.
- **Merging is the human's decision.** Never run a merge command pr-shepherd prints unless the
  human's approval covers that layer and every open layer below it, and the checks in
  [Merge every ready bottom layer at once](#merge-every-ready-bottom-layer-at-once) pass:
  `gh stack merge <pr>` lands that PR and every layer below it.

**Mutating git does not parallelize.** A layer fix runs `./dev/rebase-onto-main --stack`,
`gh stack sync`, `gh stack rebase --upstack`, or `gh stack push` inside the one shared worktree for
this stack. Stop the poll before that mutation, because other layers' branches can be rewritten
underneath it. Discard a poll result that was in flight across the mutation, then start the poll
again after the push lands. At most one of those git mutations runs at a time.

### Upper-only fast-forward

A queued lower layer, or any lower layer that must not be rewritten, does not stop an upper-only
fast-forward or upper review and CI work that does not write git.

Before that push, read the forge and capture the parent head, the parent base, the upper remote
head, and the stack order. Read those four again immediately before the push. Push only when all
four still match the capture, the local upper commit is a fast-forward of that remote head, and
that commit still contains the parent. If any value differs, or the lower layer merges or leaves
the queue while the push is being prepared, stop and read the forge again. Do not push from the
stale capture.

Do not amend, force-push, `gh stack sync`, `gh stack rebase`, or `./dev/rebase-onto-main --stack`
a queued parent. Those commands rewrite it. When the lower layer changes, re-read topology before
any branch work that depends on the new parent.

**Escalations persist to the PR, not the transcript.** When a layer needs a human — ready and waiting
on a merge decision, or genuinely blocked — apply the `needs-human` label and post **one** comment per
escalation event (not per poll) with the layer's position and what it needs. Minimize a superseded
escalation comment via the GraphQL `minimizeComment` mutation (`classifier: OUTDATED`) when a layer
re-escalates. Clear the label once the layer stops needing a human. Relay a printed merge command in
the comment for visibility, but do not present it as safe to run without the ready-prefix checks
below. pr-shepherd picks its target from READY receipts alone; it does not know what the human
approved.

### C. Report, then let the human decide each merge

When the owned set has settled, present the stack bottom→top: each layer's number, owner, state, and
whether it is ready or blocked and why. Never leave a ready bottom layer sitting under a blocked upper
layer without saying so.

### Merge every ready bottom layer at once

Do not merge a stack one layer at a time, and do not wait for the whole stack. A stack should be as
short as it can be: layers accumulate rebase surface, CI cost, and review context, and drift against
`main`. As soon as the bottom layer is ready, merge the **ready prefix** with one command. The ready
prefix is the bottom-most open layer plus every consecutive layer above it that is also ready and
inside the human's approval. Its top layer is the merge target. When every layer is ready and
approved, the target is the top of the stack. This overrides the canonical skill's bottom-most
merge target.

`pnpm exec pr-shepherd stack <pr> --merge` prints `gh stack merge <highest ready layer>`. If that
layer is above the approved range, target the highest approved layer of the prefix instead. That is
still one command.

Merge only on **explicit human approval**. The approval names what it covers: one layer, a range of
layers, or the whole stack. Approving the whole stack also covers the next ready prefix after an
earlier merge. It does not cover a layer added to the stack after the approval. Ask before merging
any layer outside the approval.

Immediately before each approved merge, run these checks in order:

1. `gh api repos/{o}/{r}/stacks/<target>` **must 404.** `gh stack merge` treats a bare number as a
   stack number first, then a pull-request number (verified from `gh stack merge --help`); a 200
   response means the number resolves stack-first and `--yes` would merge **every layer** of that
   stack. Stop and ask if it 200s.
2. Re-read topology (A2). Confirm every layer from the bottom-most open layer up to the target is
   open, ready, and inside the approval, with nothing broken below.
3. For **every** layer in the prefix, capture `S0 = pulls/<N>.head.sha` before the final poll and
   `S1` after; require `S0 == S1` for each. A mismatch means a push landed inside the evaluation
   window — discard the verdict and re-poll instead of merging on stale state.
4. `gh stack merge <target> --yes --squash`. It lands the target and every open layer below it,
   which is exactly the ready prefix.
5. Do **not** run `gh stack sync` here — return to A2 and re-read topology remotely instead.
   Unconditional local rebasing right after a merge can replay already-landed commits from a stale
   local base ref; sync belongs to a layer fix in B. Keep shepherding the layers above the prefix;
   when the new bottom layer is ready, merge the next ready prefix the same way. If no unmerged
   owned layers remain, the drain is complete.

**Residual TOCTOU:** the window between `S1` and the merge cannot be closed (`gh stack merge` has no head-SHA pin); branch protection is the server-side backstop. If a merge is rejected, return to A2; do not retry blindly. With a merge queue, a successful `gh stack merge` only means queued; re-read topology on the next drain iteration.

**When you stop or are blocked, report the stack and ask.** Before yielding on an unresolved
escalation, a human interrupt or session pause, repeated fixes with no progress, or an
out-of-scope external blocker: run `gh stack view --json`, report each layer's number and state, and
if the bottom layers are ready, ask whether to merge that ready prefix before continuing.

## Keep track — derive the ledger, never remember it

A hand-maintained scratchpad of "PRs I opened" is the same thing that already failed: it drifts, and a
compaction or a new session erases it. The provenance stamp in step A3 makes the ledger **derivable**
instead, so state is re-read, not recalled.

**Reconcile broadly, partition narrowly.** Losing track happens **across sessions** — a new session
opens a rival stack because it never looks for the old one. So the reconcile query is deliberately
**unfiltered** (what exists, regardless of who made it); only the second, separate query is
session-filtered (what this session may touch):

```bash
# RECONCILE — unfiltered. Must not filter by session, so it still finds a stack this session did
# not create, including right after a compaction or in a brand-new session.
gh api repos/{o}/{r}/stacks --jq '[.[] | select(.open)]'
gh pr list --state open --limit 100 --json number,title,author,body   # explicit --limit: the
                                                                      # default is 30, and Dependabot
                                                                      # noise can push owned PRs off
                                                                      # the end
# PARTITION — session-filtered, applied to the reconcile output above (step A3's grep).
```

Three duties follow:

1. **Reconcile before starting anything new.** At start of work, and before opening any PR or stack,
   run the unfiltered reconcile query. If any open stack or unfinished layer exists, surface it before
   creating more — whether or not this session made it.
2. **Close out, don't drift away.** A layer that will not land gets closed, not abandoned. Ending or
   pausing a session with owned open layers requires reporting them explicitly.
3. **Continue the stack rather than starting a parallel one.** If reconciliation shows an open stack
   this session owns, further dependent work is a new layer on that stack (`gh stack add`), not a
   second stack. If the open stack is not owned, report it and ask rather than adding to it or
   silently starting a rival.

State is always derived this way, never cached; only intent (which stack is being built) belongs in the session's plan or journal.

Provenance is an ownership signal, not an authorization boundary: every merge is human-gated regardless of ownership.
