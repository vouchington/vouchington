# Git Hooks

Follow [Git and PRs](../.agents/skills/agent-workflow/git-and-prs.md) for agent git behavior and
[Before Pushing](../.agents/skills/agent-workflow/before-pushing.md) for the cheap local commands.
GitHub Actions is the full gate.

Before adding or changing a Vitest test, fixture, or mock here, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).

## Scoped invariants

- There is no pre-push hook. Never bypass remaining hooks with `HUSKY=0`, `--no-verify`, or
  `core.hooksPath`; fix the failure.
- Do not add a pre-commit hook. `.husky/commit-msg` owns commit-message validation.
- Keep `post-rewrite`, `post-merge`, and `post-checkout` synchronized: after a rebase, merge, or
  branch checkout (`post-checkout` `$3=1` only) changes `pnpm-lock.yaml`, any `package.json`, or
  `pnpm-workspace.yaml`, run `pnpm install` so `node_modules` matches the dependency graph before
  later commands run (issues #5269, #10009). File checkouts (`$3=0`) must not install.
- Every tracked hook payload must exit immediately when `GITHUB_ACTIONS=true`. This does not bypass
  local developer or agent hooks: Husky's generated trampoline may still start and source its init,
  while non-Husky hooks are outside this repository-owned guard.
