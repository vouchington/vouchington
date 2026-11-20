# Git hooks

- No pre-commit hook. Every tracked hook payload exits immediately when `GITHUB_ACTIONS=true`.
- `post-rewrite` is the single install point after a rebase; `post-checkout` installs only for
  branch checkouts (`$3=1`) outside a rebase.
