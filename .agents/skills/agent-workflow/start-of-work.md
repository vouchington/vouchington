# Start of work

- Work from the current non-main worktree root. Trusted automation may use its prepared checkout.
  Inspect branch, status, and the fresh-base hook before changing files; never discard local work.
- During planning, inspect `origin/main` without resetting. After acceptance, reset a clean new-task
  worktree with unforced `./dev/reset-worktree`; rebase resumed unstacked work with
  `./dev/rebase-onto-main`. For a resumed stack, re-derive topology from GitHub before using
  `./dev/rebase-onto-main --stack` or `gh stack sync`; see the [stack workflow](../stacked-prs/SKILL.md).
  The helper refuses protected-path changes under `SANDBOX_RUNTIME` or `CURSOR_SANDBOX`; run it
  outside the agent if it refuses. See the [fresh-base procedure](../../../docs/development/README.md#fresh-base-planning).
- Search relevant `docs/**` pages and read the `AGENTS.md` ancestry for planned target paths.
  Verify issue paths against current source. Open indexes selectively; do not ingest whole catalogs.
- Check open PRs and native stacks before opening a competing change; derive ownership from live
  provenance, not a remembered branch name. Follow [stack discovery](../stacked-prs/SKILL.md).
- Initialize only the required capability: `./dev/initialize monorepo` for lint/unit work,
  `./dev/initialize backend` for DB/Valkey-backed tests, or `./dev/initialize web` followed by
  `./dev/tmux` for the local web stack. See [dev instructions](../../../dev/AGENTS.md).
- For frontend screenshot work, run `./dev/initialize monorepo`, then
  `pnpm run pr:attach-screenshots --check-upload-credentials` outside the sandbox before
  `./dev/initialize web`. A credential failure blocks attachment, not local visual QA. Read
  [browser preflight](../planning/references/live-browser-preflight.md) only for work needing it.
- Record `Workspace setup: <initialization command or reason not needed>` in PR validation.
  Automation uses its template's exact workspace line. The PR helper adds Agent/Device/Worktree
  provenance; do not fabricate those lines.
- Use `${TMPDIR:-/tmp}` / `os.tmpdir()` for scratch artifacts and agent-created throwaway worktrees.
  Do not put extra checkouts inside the repo or home directory. Keep harness-owned worktrees intact.
- Use the documented [sandbox recovery](../../../docs/development/agent-sandbox.md) for host git/gh,
  pnpm stores, Docker, or edit-helper failures. A sandbox error is not evidence that credentials are
  missing. Do not inspect or print secrets. Retry only the authorized action with the needed access.
- Keep the tmux title current with `./dev/tmux-name <topic>` outside the sandbox; add `-pr<number>`
  after PR creation. Follow checkpoint hook reminders rather than duplicating their state.
- Keep large logs and analysis results in private temporary artifacts and return bounded summaries.
  For CI diagnosis use [review-ci-logs](../review-ci-logs/SKILL.md).
- Use `rg` for text, `fd` for paths, and structural tools when needed. For TypeScript impact use
  [planning discovery](../planning/references/impact-discovery.md). Run `pnpm exec` serially;
  independent tool processes may use `node_modules/.bin/<tool>` directly.
- Use [blackboard](../blackboard/SKILL.md) for consequential failures, decisions, and reusable
  findings. Its script owns root/child identity and credential handling.
