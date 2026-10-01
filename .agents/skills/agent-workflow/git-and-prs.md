# Git and PRs

## Branch and commit

- Default to one coherent PR against `main`. Split independent work into separate PRs; use
  [native stacks](../stacked-prs/SKILL.md) only for real dependencies. Do not invent source issues
  just to satisfy a PR workflow. Keep each PR's accepted scope explicit.
- The PR helper flags about 5,000 added or 20,000 deleted lines for a split decision. Split only
  along independently reviewable boundaries; real dependencies determine whether to use a stack.
  Disclose the 150-file automated-review limit for larger atomic changes. Verified CI-generated
  schema snapshots stay with their source when the handwritten diff fits those budgets; verify
  publisher provenance and schema intent, report generated versus total scope, and use
  `--acknowledge-large-diff` without another size approval. Other generated output remains counted.
- Use conventional commit and PR titles; follow the [commit checklist](../../../docs/checklists/commit.md).
  Do not amend, bypass hooks, create merge commits, or use raw force pushes.
- Before rebasing, inspect `git diff --name-only origin/main...HEAD`; for a stack also inspect the
  layer against its parent. Rebase an unstacked PR only with `./dev/rebase-onto-main`; for a stack
  use `./dev/rebase-onto-main --stack` (add `--upstack` when upper layers must move) or `gh stack
sync` when there are no local stack commits. Re-derive stack topology from GitHub first. The
  helper fetches `origin/main`, then rebases. Do not chain raw `git fetch` with `git
rebase`, use `git pull --rebase`/`-r`, or rebase a mid-stack branch directly onto `origin/main`.
  Resolve conflicts semantically, never with blanket ours/theirs. Continue with
  `GIT_EDITOR=true git rebase --continue`.
- Use `git -C <worktree-root>` for commands with repo-relative paths. After rebase, push with a
  lease. With concurrent writers, capture the remote tip before fetching and use
  `--force-with-lease=<branch>:<sha>` so a later fetch cannot silently widen the lease.
- Claude skips review for the continue, skip, abort, and lease push only when they run bare from
  the session's own worktree, with no `cd` or `-C`
  ([rebase lifecycle](../../../docs/development/agent-sandbox.md#claude-review-skip-for-the-rebase-lifecycle)).

### Reading the four refs

Before `./dev/rebase-onto-main` or a lease push, name the four refs and read how they differ. Publish this branch. Do not open a replacement pull request.

Run `git fetch origin main <branch>` as its own command. Do not chain that fetch with rebase, reset, or merge. A missing `.stack` field means membership is unknown, not unstacked. HEAD must be the branch being updated. `gh stack checkout` leaves the top layer checked out, so check out the layer first.

Print `git rev-parse` of HEAD, `origin/<branch>`, `origin/main`, and local `main` when that ref exists. Local main is not the rebase target. When local `main` exists, print `git rev-list --left-right --count main...origin/main`. A nonzero right count means local `main` is behind `origin/main`.

Print `git rev-list --left-right --count HEAD...origin/<branch>` (left = commits only on the local branch, right = commits only on `origin/<branch>`), `git log --oneline --left-right HEAD...origin/<branch>`, `git cherry -v origin/<branch> HEAD`, and `git cherry -v HEAD origin/<branch>`. A leading `-` is the same patch under another SHA. A leading `+` is a patch the other side lacks. `git range-diff` may be read from the base those commits were built on. git range-diff is a reading aid, not the rebase cut. Do not run it from the new stack parent: after a stack rebase that parent makes old parent commits look like unique local work.

A dirty worktree stops you before fast-forward, reset, or rebase. Do not switch branches. Continue a conflict with `GIT_EDITOR=true git rebase --continue`.

Capture `<sha>` with `git rev-parse origin/<branch>` after this fetch and before any rewrite. Push a non-fast-forward with `git push --force-with-lease=<branch>:<sha>`. The capture-before-fetch note above still applies when another agent may push during the fetch. If HEAD equals that SHA, do not push. If the lease push or a non-force push is rejected, fetch again and re-read. It is still this branch.

**Unstacked.** After every move onto `origin/<branch>`, repeat `git merge-base --is-ancestor origin/main HEAD`. Exit 0 means the branch already contains `origin/main`. Nonzero means `./dev/rebase-onto-main`, then the lease push.

- `0 0` and `origin/main` is already an ancestor: stop.
- `0 N`: `git merge --ff-only origin/<branch>`, then the ancestor check.
- `N 0`: read `git log --oneline origin/<branch>..HEAD` before pushing. Those commits are what a push would add, including a remote rewind back to an ancestor. If they are this pull request's unpushed work and `origin/main` is already an ancestor, `git push`. If not, `./dev/rebase-onto-main`, then the lease push. If the log is a rewind you did not make, stop and ask.
- Diverged, and the local-only commits are rewritten copies (cherry `-`, or the same subjects on both sides) with no unique local work: clean tree, `git reset --hard origin/<branch>`, then the ancestor check.
- Diverged, and origin has new patches to keep and HEAD has unique local commits: `git rebase origin/<branch>` as its own command, then the ancestor check. This is the one added unstacked rebase target. It is not a license to rebase onto an arbitrary ref. If the rewrite changed patches and unique local work is mixed in, stop and ask.

Unmatched commits on origin/<branch> are new commits someone pushed.

**Stacked.** A stack rebase is the usual reason origin/<branch> was rewritten. Another agent or a human can rewrite an unstacked branch the same way. On a diverged stack layer, adopt `origin/<branch>` with `git reset --hard` when that layer is checked out, or `git branch -f` when it is not, when the left-right log is the pre-rebase copies (the same layer subjects on both sides, old parent subjects only on the left). Do not `git rebase origin/<branch>` on a stack layer: that replays parent commits onto the layer. Do not run `./dev/rebase-onto-main` without `--stack` on a mid-stack branch. If this layer has unpushed commits that are not the old parent and not already on origin under a new SHA, stop and ask. After adopting the rewritten tip, run `./dev/rebase-onto-main --stack` only when the stack still needs to move onto `origin/main`.

## Publish and review

- Run [before-push checks](before-pushing.md), then create or update a draft with
  `node dev/pr-description.mts create --title <title> --body-file <file>` or
  `node dev/pr-description.mts update <pr> --body-file <file>`. Follow
  [PR description](../pr-description/SKILL.md); the helper preserves the live Shepherd Journal.
- Include `Workspace setup:`. Agent, Device, and Worktree lines are helper-injected.
  Keep the title and body accurate as scope and validation change.
- Under `## Related issues`, close only real source issues this PR fully resolves. Validate supplied
  references and unchecked tasks. Explain why non-closing references remain open. For a direct
  interactive request without a source issue, use the exact representation in the PR skill;
  scheduled and Fix Main automation keep their own template contracts.
- Keep a plan outside Git: the PR description, an existing issue/comment, or a persistent native
  plan file can be its sole record. A Plan issue is optional. When an actual multi-PR Plan issue
  exists, it owns the sibling ledger; completing work closes it, partial work references it.
- Run `node dev/pr-description.mts validate <pr>` before marking ready. This checks live provenance,
  closing references, and applicable supersession/milestone audits. Keep unrelated issues open with
  a reason; project completion notices remain advisory. See the
  [helper reference](../../../docs/development/local-development/reference-pr-description-helper.md).
- Branches, commits, pushes, and draft PRs within the task need no repeated approval. Merging or
  arming auto-merge requires explicit human authorization; automation must never do either.
  Each native stack layer requires its own merge authority. See
  [merge authority](../../../docs/development/merge-authority.md).
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

- Report actual validation, open PRs, and remaining blockers. Use [retrospective](../retrospective/SKILL.md)
  for substantive completed work with reusable findings or when requested; do not repeat it for
  every intermediate commit or stack layer.
- Hook mechanics and limitations belong in [agent sandbox](../../../docs/development/agent-sandbox.md)
  and [harness parity](../../../docs/development/agent-harness-parity.md). Do not restate their parser
  implementation here or add new auto-formatting hooks as part of ordinary feature work.
