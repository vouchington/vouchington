# Git hooks

- No pre-commit hook. Every tracked hook payload exits immediately when `GITHUB_ACTIONS=true`.
- `post-rewrite` is the single install point after a rebase; `post-checkout` installs only for
  branch checkouts (`$3=1`) outside a rebase.
- `pre-push` runs `dev/run-impacted-checks.mts`: type-aware oxlint and `oxfmt --check` on the files
  changed against `git merge-base origin/main HEAD`, nothing else. Whole-repository scans, test
  suites and anything needing a database or `.env` stay in CI. Exit 1 blocks the push; exit 2
  (runner could not run) warns only.
