# Git hooks

- Use [Git and PRs](../.agents/skills/agent-workflow/git-and-prs.md) and [before pushing](../.agents/skills/agent-workflow/before-pushing.md). Load [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests, fixtures, or mocks.
- `.husky/pre-push` rejects a plain force push (`--force`, `-f`, or a `+` refspec) and allows `--force-with-lease`. It exits 0 when `GITHUB_ACTIONS=true` or when it cannot read the `git` process. Do not add a pre-commit hook. `.husky/commit-msg` owns message validation. Never bypass hooks with `HUSKY=0`, `--no-verify`, or `core.hooksPath`.
- Keep `post-rewrite`, `post-merge`, and `post-checkout` synchronized: run `pnpm install` after rebase, merge, or branch checkout changes `pnpm-lock.yaml`, any `package.json`, or `pnpm-workspace.yaml`. `post-checkout` installs only for `$3=1`, never file checkouts (`$3=0`).
- Every tracked hook payload exits immediately when `GITHUB_ACTIONS=true`. Husky's generated trampoline may still initialize; non-Husky hooks remain outside this guard.
