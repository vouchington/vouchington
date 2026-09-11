# Logs and Debugging

[Back to Dev Environment Reference](README.md#logs-and-debugging)

- **tmux panes**: each pane streams its service's stdout/stderr live.
- **`./dev/valkey-logs`**: tails Valkey commands for this worktree's container. `./dev/logs`
  remains a compatibility alias.
- **`./dev/status`**: shows running services across all worktrees and flags orphaned resources.
- **`./dev/retrospective-facts (--pr N | --branch name | --no-pr) [--repo owner/name] [--raw]`**: fetches `origin/main` and prints branch, PR, push/update, and diff facts for retrospectives. At least one of `--pr`, `--branch`, or `--no-pr` is required so identity is never inferred from the current checkout. `--pr` scopes facts to that PR (via the `gh` API) even off its branch; `--branch` measures that named ref (local, else `origin/<name>`) and looks up its PR unless `--no-pr` is also set; `--repo` requires `--pr` and cannot combine with `--branch`.
- **`node dev/blackboard-journal.mts entries [--session-id <id> | --root-codex [--new-root-codex-session]]`**: reads back a session's journal entries, oldest first — including the automatic checkpoint entries `dev/journal-checkpoint.mts` appends at post-compaction, repeated-failure, and PR/push-milestone checkpoints. See [agent-blackboard](../docs/development/agent-blackboard.md).
- **`./dev/stop-services`**: stops this worktree's tmux service windows, configured port listeners, and Valkey container without dropping DB data.
