# Logs and Debugging

[Back to Dev Environment Reference](README.md#logs-and-debugging)

- **tmux panes**: each pane streams its service's stdout/stderr live.
- **`./dev/valkey-logs`**: tails Valkey commands for this worktree's container.
- **`./dev/status`**: shows running services across all worktrees and flags orphaned resources.
- **`pnpm exec vouchington retrospective-facts (--pr N | --branch name | --no-pr) [--repo owner/name] [--raw]`**: fetches `origin/main` and prints branch, PR, push/update, and diff facts for retrospectives. At least one of `--pr`, `--branch`, or `--no-pr` is required so identity is never inferred from the current checkout. `--pr` scopes facts to that PR (via the `gh` API) even off its branch; `--branch` measures that named ref (local, else `origin/<name>`) and looks up its PR unless `--no-pr` is also set; `--repo` requires `--pr` and cannot combine with `--branch`.
- **`journal_entries` (`vouchington-tooling` MCP tool)**: reads back every entry of a session (all types, oldest first, full envelope) for the `sessionId` the SessionStart hook printed. See [agent-blackboard](../agent-blackboard.md).
- **`./dev/stop-services`**: stops this worktree's tmux service windows, configured port listeners, and Valkey container without dropping DB data.
