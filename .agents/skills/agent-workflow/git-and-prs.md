# Git and PRs

## Branch and commit

- Default to one coherent PR against `main`. Split independent work into separate PRs. Do not
  invent source issues just to satisfy a PR workflow. Keep each PR's accepted scope explicit.
- Do not stack unless you have to. Stack in a [native stack](../stacked-prs/SKILL.md) only when one
  PR needs the other's code, or when one changes a contract that the other's new code uses. A
  contract conflict fails only in the merge queue. Before opening a PR, compare its changed files
  and contracts with open PRs to find dependencies. Editing the same file does not require a stack.
  Overlaps in generated output, such as fixtures, schema snapshots, registries, `openapi.json`,
  and `mcp.json`, never require one: whichever PR lands second rebases and regenerates. The same
  goes for handwritten files the second PR can rebase cleanly. Do not enqueue overlapping PRs in
  the same merge-queue batch.
- When a stack is required, stack without asking, whatever its length: add the work as the next
  layer, or rebase it onto the open PR and run `gh stack link <lower> <upper>` before either PR is
  enqueued. Never grow a stack beyond 10 PRs; layer counting and overflow follow the canonical
  stacked-prs (`node_modules/vouchington-tooling/skills/stacked-prs/SKILL.md#work-bottom-up`) skill.
  Put ready layers at the bottom and append later work on top. Never ask whether to stack, or for
  an exception to stacking. Ask the human only when no option above resolves the conflict.
- `pr_create` flags about 5,000 added or 20,000 deleted lines (against `origin/<base>`) for a split decision. Split only
  along independently reviewable boundaries; dependencies and conflicts determine whether to stack.
  Disclose the 150-file automated-review limit for larger atomic changes. Verified CI-generated
  schema snapshots stay with their source when the handwritten diff fits those budgets; verify
  publisher provenance and schema intent, report generated versus total scope, and use
  a `### Large diff` entry in `details` (the stated split decision) without another size approval. Other generated output remains counted.
- Use conventional commit and PR titles; follow the [commit checklist](../../../docs/checklists/commit.md).
  Do not amend, bypass hooks, create merge commits, or use raw force pushes.
- Before rebasing, inspect `git diff --name-only origin/main...HEAD`; for a stack also inspect the
  layer against its parent. Prefer `./dev/rebase-onto-main` for an unstacked PR; for a stack
  prefer `./dev/rebase-onto-main --stack` (add `--upstack` when upper layers must move) or `gh stack
  sync` when there are no local stack commits. Re-derive stack topology from GitHub first. The
  helpers fetch and rebase for convenience; they are not required wrappers. An explicit Git
  rebase is allowed after verifying current refs, stack topology, and the intended commit range.
  Fetch separately before rebasing so those checks use current refs. Do not use
  `git pull --rebase`/`-r` or rebase a mid-stack branch directly onto `origin/main`.
  Resolve conflicts semantically, never with blanket ours/theirs. Continue with
  `GIT_EDITOR=true git rebase --continue`.
- Use `git -C <worktree-root>` for commands with repo-relative paths. After rebase, push with a
  lease. With concurrent writers, capture the remote tip before fetching and use
  `--force-with-lease=<branch>:<sha>` so a later fetch cannot silently widen the lease.
- Claude skips review for the continue, skip, abort, and lease push only when they run bare from
  the session's own worktree, with no `cd` or `-C`
  ([rebase lifecycle](../../../docs/development/agent-sandbox.md#claude-review-skip-for-the-rebase-lifecycle)).

### Reading the four refs

Before any rebase or lease push, follow the canonical
four refs (`node_modules/vouchington-tooling/skills/agent-workflow/references/four-refs.md`)
procedure (setup, ref reading, lease push, unstacked and stacked tables). Vouchington overrides:
the rebase target step is `./dev/rebase-onto-main` (`--stack` for a layer), and the stacked
adoption's follow-up is `./dev/rebase-onto-main --stack`, only when the stack still needs to move
onto `origin/main`; never run the non-stack form on a mid-stack branch.

## Publish and review

- Run [before-push checks](before-pushing.md), push the branch, then create or update a draft with
  the `pr_create` or `pr_update` tool of the `vouchington-tooling` MCP server. Follow
  [PR description](../pr-description/SKILL.md); `pr_update` preserves the live Shepherd Journal.
  Raw `gh pr create` and `gh pr edit --body*` are blocked.
- Pass `workspaceSetup` for the `Workspace setup:` line. Agent, Device, and Worktree lines are
  tool-injected.
  Keep the title and body accurate as scope and validation change.
- Under `## Related issues`, close only real source issues this PR fully resolves. Validate supplied
  references and unchecked tasks. Explain why non-closing references remain open. For a direct
  interactive request without a source issue, use the exact representation in the PR skill;
  scheduled and Fix Main automation keep their own template contracts.
  An incomplete batch uses the [partial-batch representation](../../../docs/development/local-development/reference-pr-description-helper.md)
  with a standalone `Refs` source issue and explains the remaining work; the completing batch
  carries a truthful closing reference.
- Keep a plan outside Git: the PR description, an existing issue/comment, or a persistent native
  plan file can be its sole record. A Plan issue is optional. When an actual multi-PR Plan issue
  exists, it owns the sibling ledger; completing work closes it, partial work references it.
- Run the `pr_validate` tool with `pr` before marking ready. This checks live provenance,
  closing references, and applicable supersession/milestone audits. Keep unrelated issues open with
  a reason; project completion notices remain advisory. See the
  [policy reference](../../../docs/development/local-development/reference-pr-description-helper.md).
- Branches, commits, pushes, and draft PRs within the task need no repeated approval. Merging or
  arming auto-merge requires explicit human authorization; automation must never do either.
  A native stack merge lands every ready bottom layer at once; the approval must cover every layer
  it lands. See [merge authority](../../../docs/development/merge-authority.md) and
  [stacked-prs](../stacked-prs/SKILL.md#merge-every-ready-bottom-layer-at-once).
- After PR creation, set `./dev/tmux-name <topic>-pr<number>` outside the sandbox.
  For an ordinary authored PR, mark ready when required checks pass and actionable review is resolved. Authorized [triage handoffs](../ready-and-shepherd/SKILL.md) follow their recovery criteria.

## Shepherding

- Load the [pr-shepherd plugin](https://github.com/jonathanong/pr-shepherd) for its action contract.
  Resolve the workspace version with `pnpm exec pr-shepherd`, never a global binary.
- Use `pnpm exec pr-shepherd <pr> --until-terminal --quiet-status` for an intentional long phase.
  For a bounded wait use `pnpm exec pr-shepherd <pr> --timeout 4.5m --quiet-status`; one tick uses
  `pnpm exec pr-shepherd iterate <pr>`. Cadence comes from `.pr-shepherdrc.yml`.
- Follow the CLI's printed instructions and terminal actions. Stop for human overrides or external
  out-of-scope blockers; do not emulate polling with repeated forced ticks or Stop hooks.
- A harness-killed `run_in_background` process is not a shepherd terminal action: confirm the last
  state and resume the identical command. A scheduled `ScheduleWakeup` requires ending the turn;
  do not run immediate calls as though the delay already elapsed.
- One worker per native stack owns Shepherd polling and Git writes. The parent reconciles stacks,
  starts independent work when a lower stack is in [decent shape](../stacked-prs/SKILL.md#who-runs-the-stack),
  and carries merge decisions to the human. A terminal result on one layer does not stop other
  owned layers. The single-PR `/shepherd` automation does not spawn another stack.
- If dependencies fail freshness verification after a branch change, run `pnpm install` and retry.
  Resolve disputed CLI syntax against the pinned CLI's live help and actual behavior.

## Close-out

- Follow the canonical Close-out (`node_modules/vouchington-tooling/skills/agent-workflow/SKILL.md#close-out`)
  rules for validation reporting, the hand-off retrospective, and the merge note. A stack's
  retrospective uses its top PR's number in `handoff-pr<number>`.
- Hook mechanics and limitations belong in [agent sandbox](../../../docs/development/agent-sandbox.md)
  and [harness parity](../../../docs/development/agent-harness-parity.md). Do not restate their parser
  implementation here or add new auto-formatting hooks as part of ordinary feature work.
