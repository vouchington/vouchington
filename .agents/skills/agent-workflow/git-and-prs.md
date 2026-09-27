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
  helper fetches and checks protected paths; it refuses changed protected paths under
  `SANDBOX_RUNTIME` or `CURSOR_SANDBOX`, and stack rebases refuse whenever either marker is set. If
  it refuses, run it from a terminal outside the agent. Do not chain raw `git fetch` with `git
rebase`, use `git pull --rebase`/`-r`, or rebase a mid-stack branch directly onto `origin/main`.
  Resolve conflicts semantically, never with blanket ours/theirs. Continue with
  `GIT_EDITOR=true git rebase --continue`.
- Use `git -C <worktree-root>` for commands with repo-relative paths. After rebase, push with a
  lease. With concurrent writers, capture the remote tip before fetching and use
  `--force-with-lease=<branch>:<sha>` so a later fetch cannot silently widen the lease.

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
- The coordinator owns shepherd state and stack sequencing; delegate bounded fixes or CI analysis
  through [review-ci-logs](../review-ci-logs/SKILL.md) when useful.
- If dependencies fail freshness verification after a branch change, run `pnpm install` and retry.
  Resolve disputed CLI syntax against the pinned CLI's live help and actual behavior.

## Close-out

- Report actual validation, open PRs, and remaining blockers. Use [retrospective](../retrospective/SKILL.md)
  for substantive completed work with reusable findings or when requested; do not repeat it for
  every intermediate commit or stack layer.
- Hook mechanics and limitations belong in [agent sandbox](../../../docs/development/agent-sandbox.md)
  and [harness parity](../../../docs/development/agent-harness-parity.md). Do not restate their parser
  implementation here or add new auto-formatting hooks as part of ordinary feature work.
