---
name: stacked-prs
description: |
  Recognize a native GitHub stacked pull request, or a PR whose base branch isn't `main`, and drain
  it from the bottom-most ready layer up. Load whenever a PR is part of a stack: Vouchington command
  catalog, ownership, owned-layer shepherding, and human-gated per-layer merging.
---

# Stacked Pull Requests

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:stacked-prs`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md`. If it cannot be read, stop and report
the missing prerequisite; never apply this overlay alone. Decision owner for whether to stack at all,
one source issue per PR, and the ~5k-changed-line split trigger: [Git And PRs](../agent-workflow/git-and-prs.md).
This page is the CLI contract and procedure after that decision is already yes.

## Vouchington additions

The remaining rules are Vouchington-only mechanics, ownership, and the shepherd/merge procedure.

## Native GitHub stack mechanics

Official docs (do not copy): [About](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs), [CLI](https://docs.github.com/en/pull-requests/reference/stacked-prs-cli-commands), [Managing](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests), [Merging](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests).

Install on first stacked use: `gh extension install github/gh-stack`. This feature is public preview.
If `gh stack` exits 9 (not enabled on the repository), do not bundle the source issues into one PR.
Open one PR targeting `main` for the bottom issue, wait for it to merge, then open the next. Say that
stacks are unavailable.

[`ci.yml`](../../../.github/workflows/ci.yml) must not set `pull_request.branches` or
`branches-ignore`. GitHub docs evaluate `branches: [main]` against `stack.base.ref`, but
`gh stack submit` opens mid-stack PRs before the stack object exists
([github/gh-stack#425](https://github.com/github/gh-stack/issues/425)), so that filter skips those
PRs permanently. After a `ci.yml` trigger change lands on `main`, rebase existing stacks
(`gh stack rebase` or `gh stack sync`) so parent branches include the new file.

### Agent commands

Use only these non-interactive forms:

- `gh stack init <branch>` — hook-enforced, not just advisory: the pre-tool-use hook hard-blocks
  `init` when `--base`/`-b` names anything but `main`, when HEAD is not an ancestor of `origin/main`
  (an off-trunk root), when HEAD is already a layer of an open stack (use `gh stack add` instead), or
  when any other unfinished open stack exists anywhere in the repo — the last case regardless of who
  owns it, since "forgot about the old stack" is a cross-session failure (see "Reconcile before
  starting anything new" below). That last block is a hard stop, not a `confirm` prompt — Codex and
  Grok render `confirm` as a no-op, so a real block is the only thing that fires in every harness. If
  the new stack is genuinely deliberate and separate, reconcile first, then re-run with
  `AGENT_STACK_INIT_CONFIRM_SEPARATE=1` prefixed to acknowledge it.
- `gh stack add <branch>`
- `gh stack checkout <stack-number>` — imports an existing remote stack into this worktree; a PR
  number also works. Run it as the whole command, or as
  `cd <absolute-worktree-path> && gh stack checkout <stack-number>`. Hook-enforced: it is blocked
  while any existing local layer branch differs from its PR head, and the block prints the fix for
  each branch. See
  [Import a stack before acting on it](#import-a-stack-before-acting-on-it).
- `gh stack submit --auto` — creates drafts. Immediately `node dev/pr-description.mts update` each
  new PR; auto titles and bodies are not sufficient. The hook gates `--auto` / no `--open` only; it
  does not check that the body update ran.
- `gh stack view --json` — acting only; never use its output, or `gh stack bottom`, to decide
  topology, ownership, or bottom-ness (see "Local metadata is advisory" below).
- `gh stack rebase`, `gh stack rebase --upstack`, `gh stack rebase --continue`, `gh stack rebase --abort`
- `gh stack sync` — fast-forward against `origin/main`. Do not check out `main`.
- `gh stack push`
- `gh stack up <n>`, `gh stack down <n>`, `gh stack top`, `gh stack bottom` (movement only)
- `gh stack merge <pr> --yes --squash` — see [Merge the bottom layer as soon as it is ready](#merge-the-bottom-layer-as-soon-as-it-is-ready). The PR-number selector is required; bare `gh stack merge` stays banned below. Always include both flags: `--yes` skips the confirmation prompt a non-interactive command runner cannot answer, and `--squash` is the required strategy.
- `gh stack unstack <branch>` / `gh stack delete <branch>` — recovery from a mis-rooted stack. Both
  remove tracking only; pull requests and local branches are preserved, and a merged, merging, or
  queued PR cannot be removed. `unstack` is `delete`'s default-form alias.

The hook allowlist is closed at the subcommand level: only `add`, `bottom`, `checkout`, `delete`,
`down`, `init`, `link`, `merge`, `push`, `rebase`, `submit`, `sync`, `top`, `unstack`, `up`, and
`view` are permitted `gh stack` actions. `merge` requires a numeric PR-number selector, and
`checkout` requires exactly one stack number or PR number and nothing else in the command. The hook does not further enforce
the exact flag combination shown above — `gh stack merge <pr>` and `gh stack merge <pr> --yes` also
pass the hook even though neither is the form this page requires. Do not run interactive TUIs:
`gh stack submit` without `--auto`, `gh stack modify`, bare `gh stack checkout`, `gh stack switch`, or
bare `gh stack merge` (no PR-number selector — it is a TUI and lands the whole stack). The hook also
blocks `gh stack checkout <branch>`: a branch name resolves only against stacks this worktree already
tracks. Do not run `gh stack trunk` — the main worktree already has `main` checked out, and agents
stay in a non-main worktree.

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

1. `gh stack checkout <stack-number>`, with the number from `pulls/<N>.stack.number`. It fetches,
   records the stack, and checks out the top-most unmerged layer.
2. If the hook blocks it, an existing local layer branch differs from its PR head. gh-stack keeps
   existing local branches as they are, so the next rebase would start from stale commits. Apply the
   printed fix for each branch, then rerun the checkout. A branch that is only behind gets a
   fast-forward command. A branch with local-only commits must be reconciled by hand: push commits
   that belong on the PR, or move the branch once you have confirmed they are superseded.

### Lower-layer review fix

Check out the layer that owns the change, commit there, then `gh stack rebase --upstack` and
`gh stack push` once. Do not duplicate the fix in an upper layer.

## Local metadata is advisory — the forge is the only truth

Every fact this procedure branches on — topology, layer state, ownership, head SHA — comes from the
REST/GraphQL API, never from local `gh-stack` metadata. A local base ref can go stale after a remote
relink or rebase and silently replay already-landed commits ([#11426](https://github.com/vouchington/vouchington/issues/11426)).
`gh stack view --json` and `gh stack bottom` are used only to **act**, never to **decide**, and the
former errors from a worktree whose current branch is not in the stack — the normal state right after
a merge retargets the stack.

```bash
gh api "repos/{owner}/{repo}/pulls/<N>" --jq '.stack'   # {base:{ref,sha}, id, number, position, size}
gh api "repos/{owner}/{repo}/stacks/<n>"                # layers bottom→top, with head.sha and author
gh api "repos/{owner}/{repo}/stacks" --jq '[.[] | select(.state == "open")]'   # every open stack;
                                                                               # ?state=open is
                                                                               # ignored server-side
```

Use the **single-stack** endpoint for one stack's layers — the list form returns per-PR `base.ref` as
`null`. `.stack` is a **preview field**: its absence is not proof a PR is not stacked — degrade
explicitly (report "stack membership unknown", never assume unstacked) rather than treat a missing
field as a negative result.

## Procedure: shepherd concurrently, merge serially with a human

The shape: shepherding a layer to ready and merging a layer are different acts. The first covers
every PR this agent owns in the stack at once; the second is serial and is never the agent's decision.

### A. Establish scope

1. Resolve the stack: `gh api repos/{o}/{r}/pulls/<any-layer> --jq '.stack.number'`. Empty → not
   stacked; this procedure does not apply.
2. Read topology from `repos/{o}/{r}/stacks/<n>` (ordered bottom→top). A `closed && merged_at == null`
   entry below an open one means the stack is **broken** — report to the human; never merge across it.
3. **Partition by ownership**, applied to that topology read. Shepherd only PRs this agent owns; never
   poll, fix, rebase, or push the others — but list them in the report so the human sees the whole
   stack. **Owned** means this session opened the PR, or a human named it in this session:
   - The made-by-me half is a durable remote fact: `dev/pr-description/provenance.mts` stamps every
     PR body it updates with `Agent: <harness> (<model>) session <id>`, resolved via
     `inspectHarnessEnvironment` across claude-code, codex, cursor, and grok. Compare against the
     current session with `dev/agent-session-id/resolve.mts`'s `resolveSessionId()`:
     ```bash
     gh api repos/{o}/{r}/pulls/<N> --jq '.body' | grep -E '^Agent: .* (session|thread) <my-id>$'
     ```
   - The assigned-by-a-human half is conversational, not a GitHub field — it cannot be recovered
     remotely; that is acceptable, because the human is present to restate it if a compaction drops it.
   - **Degrade explicitly.** A body with no matching `Agent:` line, or one naming a harness with no
     session id, is **not owned** — report it as "ownership unverifiable", never poll it.

### B. Shepherd the owned PRs

Shepherd every owned layer in one pr-shepherd invocation over that explicit PR set — the canonical
command in [Git And PRs](../agent-workflow/git-and-prs.md) with each owned PR URL — and follow the
pr-shepherd plugin skill and the CLI's printed `## Instructions`. pr-shepherd owns its actions, exit
codes, stack routing, and merge-command output; this page adds only Vouchington's ownership, git, and
merge policy:

- **Owned layers only.** Apply code fixes, rebases, pushes, and review mutations only to owned
  layers. Report work pr-shepherd surfaces on an unowned layer to the human instead.
- **Fix on the owning layer.** Commit there, then `gh stack sync`, `gh stack rebase --upstack`, and
  `gh stack push` **once**, and rerun the shepherd. Bounded implementation work may be dispatched to a
  subagent; the shepherd loop itself stays with this session.
- **Merging is the human's decision, per layer.** Never run a merge command pr-shepherd prints without
  that layer's explicit approval and the checks in
  [Merge the bottom layer as soon as it is ready](#merge-the-bottom-layer-as-soon-as-it-is-ready):
  `gh stack merge <pr>` lands that PR and every layer below it.

**Mutating git does not parallelize.** A layer fix runs `gh stack sync` / `gh stack rebase --upstack`
/ `gh stack push` inside the one shared worktree for this stack. At most one owned layer may be in that
sync/rebase/push phase at a time; stop the shepherd across it, because other layers' branches can be
rewritten underneath it, and rerun it after the push lands.

**Escalations persist to the PR, not the transcript.** When a layer needs a human — ready and waiting
on a merge decision, or genuinely blocked — apply the `needs-human` label and post **one** comment per
escalation event (not per poll) with the layer's position and what it needs. Minimize a superseded
escalation comment via the GraphQL `minimizeComment` mutation (`classifier: OUTDATED`) when a layer
re-escalates. Clear the label once the layer stops needing a human. Relay a printed merge command in
the comment for visibility, but do not present it as safe to run without the bottom-most-layer check
below — GitHub's own readiness check for an upper layer does not require the layers below it to have
merged first.

### C. Report, then let the human decide each merge

When the owned set has settled, present the stack bottom→top: each layer's number, owner, state, and
whether it is ready or blocked and why. Never leave a ready bottom layer sitting under a blocked upper
layer without saying so.

### Merge the bottom layer as soon as it is ready

Do not wait for the whole stack. A stack should be as short as it can be: layers accumulate rebase
surface, CI cost, and review context, and drift against `main`. Merge only on **explicit per-layer
human approval** — there is no standing drain grant; each ready layer needs its own ask.

Immediately before each approved merge, run these checks in order, against the **bottom-most open
layer**:

1. `gh api repos/{o}/{r}/stacks/<bottom>` **must 404.** `gh stack merge` treats a bare number as a
   stack number first, then a pull-request number (verified from `gh stack merge --help`); a 200
   response means the number resolves stack-first and `--yes` would merge **every layer**. Stop and
   ask if it 200s.
2. Re-read topology (A2); confirm the target is still the bottom-most open layer with nothing broken
   below.
3. Capture `S0 = pulls/<bottom>.head.sha` before the final poll and `S1` after; require `S0 == S1`. A
   mismatch means a push landed inside the evaluation window — discard the verdict and re-poll instead
   of merging on stale state.
4. `gh stack merge <bottom> --yes --squash`. Because `<bottom>` is the bottom-most open layer,
   "everything up to and including it" is exactly one PR.
5. Do **not** run `gh stack sync` here — return to A2 and re-read topology remotely instead.
   Unconditional local rebasing right after a merge is the blast radius #11426 already demonstrated;
   sync belongs to a layer fix in B. If no unmerged owned layers remain, the drain is complete.

**Residual TOCTOU, stated honestly:** the window between `S1` and the merge cannot be closed —
`gh stack merge` has no head-SHA pin. The backstop is server-side: branch protection and repository
rules are evaluated when the merge actually runs, and bypassing merge requirements is not supported
for stacks. If a merge is rejected there, return to A2; do not retry blindly. If `main` uses a merge
queue, a successful `gh stack merge` does not mean merged yet — the layer stays open until the queue
processes it; the re-read at step 2 of the next drain iteration handles that normally.

**When you stop or are blocked, report the stack and ask.** Before yielding on an unresolved
escalation, a human interrupt or session pause, repeated fixes with no progress, or an
out-of-scope external blocker: run `gh stack view --json`, report each layer's number and state, and
if the bottom owned layer is ready, ask whether to merge it before continuing.

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
gh api repos/{o}/{r}/stacks --jq '[.[] | select(.state == "open")]'
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

State (which PRs/stacks exist, their position, their status) is always derived this way, never cached.
Only intent — which stack is being built, what a planned-but-not-yet-opened layer is for — is not
derivable, so write it down in the session's own plan or journal, and treat it strictly as a plan, not
as a record of what exists.

## Known gaps

- **Provenance is not tamper-proof.** It is a body line any writer can edit, and it is absent whenever
  a PR was opened without `pr-description.mts`, or the harness exposed no valid session id. It is an
  ownership signal, not an authorization boundary — sound here because every merge is human-gated
  regardless of ownership.
- **Stack/PR number disjointness** is not guaranteed by GitHub — it is a shared repo counter. The
  procedure does not rely on it staying disjoint; it asserts the 404 per merge instead (merge check 1
  above).
