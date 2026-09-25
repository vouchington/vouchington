# Command Catalog

[Back to Dev Environment Reference](README.md#command-catalog)

This is the canonical inventory of `dev/` entrypoints. The command audit found an active developer,
CI, hook, or composition use for every entrypoint, so there is no evidence-backed deletion candidate.
Commands may still be internal or narrowly scoped; that is a reason to document their boundary, not
to remove them.

State-changing command-line interfaces follow one safety contract: standalone `-h` or `--help`
prints usage and exits without loading local configuration or changing state, while unknown, extra,
mixed-help, or incomplete arguments are rejected before files, services, databases, Docker, GitHub,
or other external systems are touched. Valid documented invocations keep their existing behavior.

### Public setup and lifecycle

Operating-system and host provisioning is intentionally not a `dev/` entrypoint. See the
[system-dependency contract](../docs/development/system-dependencies.md) and the canonical
[host repository](https://github.com/vouchington/vouchington-machines).

- `./dev/initialize [monorepo|backend|web]` — Current worktree. Checks Git and host prerequisites,
  installs dependencies and tooling, then configures worktree resources. `backend` additionally creates
  local config, database, Valkey, ports, and caches; `web`
  additionally sets up HTTPS certs and the CF Worker/Next.js environment.
- `./dev/tmux [--no-attach] [-v]` — Current web-initialized worktree; starts, reuses a healthy ready
  session, or restores dead managed windows in its one session with `nextjs`, `backend`, `worker`,
  `cloudflare`, and `lambdas` windows.
- `./dev/tmux-name <name>` — Current tmux pane/window metadata only; an empty name clears the title.
- `./dev/stop-services [--keep-valkey]` — Current worktree; closes its managed tmux session, including
  added windows, stops matching service processes and normally its Valkey container, but preserves database data.
- `./dev/reset` — Current disposable worktree; destructively recreates its database, flushes Valkey,
  and runs migrations.
- `./dev/teardown [--yes] [--remove]` — Current disposable worktree; destructively removes services,
  database, and Valkey, and optionally the worktree directory.
- `./dev/reset-worktree [--force]` — Current disposable worktree with dependencies installed; fetches
  `origin/main` before teardown, then returns it to a fresh branch and runs monorepo initialization
  (`pnpm install` follows the reset). `--force` permits discarding uncommitted changes. A second reset
  of the same worktree fails immediately; see
  [git-worktree-locks.md](../docs/development/git-worktree-locks.md).
- `./dev/cleanup [--yes]` — All local Voucha worktrees; removes confirmed orphaned canonical hashed databases, Valkey
  containers, and prunable worktrees.
- `./dev/unstick-locks` — All local worktrees; removes stale zero-byte Git index locks and a dead-owner
  worktree-resource operation lock when no corresponding operation is running.

Generic Git worktree parsing and canonical path hashing come from the published
`vouchington-tooling/scripts/worktree/git-worktrees.sh` through [`lib/git-worktrees.sh`](lib/git-worktrees.sh).
When `node_modules` is missing, the adapter uses its checked-in
[`git-worktrees-recovery.sh`](lib/git-worktrees-recovery.sh) so status, cleanup,
teardown, and service shutdown remain available before reinstallation.
Voucha database, Valkey, and protected-main ownership rules remain in
[`lib/worktree-resource-env.sh`](lib/worktree-resource-env.sh).

`./dev/db-clean` (also `pnpm run db:clean`) is the destructive database/Valkey implementation
primitive used by higher-level workflows. Prefer `./dev/reset` for a complete developer reset;
invoke `db-clean` directly only when a documented workflow specifically needs that lower-level step.

### State-changing diagnostics and optional tooling

- `./dev/ci-local <target> [--dry-run]` — Runs the selected CI-equivalent command in the current
  worktree; `--list` and `--dry-run` are read-only.
- `node dev/pr-description.mts create|update ...` — Creates or replaces a GitHub PR body after
  validation; `validate` is read-only.
- `node dev/blackboard-journal.mts append|entries ...` — Appends one session note as a journal entry
  to the shared agent-blackboard stack, or reads a session's journal entries back.
- `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`
  — Creates the tracked `.claude/skills/<name>` symlink after `.agents/skills/<name>/SKILL.md`
  exists; no-ops when the relative target is already correct.
- `node dev/agent-issue-labels/ensure-labels.mts ...` — Manually verifies or repairs live label
  taxonomy; it is not the agent issue-creation or classification entrypoint.
- `./dev/otel-up` / `./dev/otel-down` — Starts or removes the optional host-local OpenTelemetry
  Docker stack on shared fixed ports.
- `./dev/benchmark-topic-metrics --label baseline|candidate` — Creates, seeds, measures, and
  removes an isolated local sibling PostgreSQL database for a 100-topic batch. It refuses main
  worktrees, remote targets, and pre-existing benchmark databases.

#### Agent issue-label helpers

[`agent-issue-labels/ensure-labels.mts`](agent-issue-labels/ensure-labels.mts) is a supported
manual helper for checking that named labels exist in a repository's live taxonomy and creating
any that are missing. Pass `--repo <owner/repo>` to target another repository and `--update` to
replace existing label metadata. It does not classify or create issues. Agents creating issues
must instead follow the canonical [GitHub issue skill](../.agents/skills/github-issue/SKILL.md),
which reads the target repository's live labels and milestones, applies only existing taxonomy,
and verifies the created issue.

[`agent-issue-labels/labels-from-paths.mts`](agent-issue-labels/labels-from-paths.mts) is the
read-only path-classification helper used by that skill. It reads `.github/labeler.yml` by default;
pass `--labeler <path>` when classifying paths against another repository's downloaded labeler
configuration.

[`agent-issue-labels/batch-issues.mts`](agent-issue-labels/batch-issues.mts) preflights a batch of
proposed `vouchington/vouchington` issues from one agent-authored manifest. It reads live taxonomy and
duplicate-search data, validates every entry fail-closed, and writes only an ephemeral
`preflight-report.json` under the caller's session directory. Issue creation and read-back remain
one-at-a-time operations owned by the canonical
[GitHub issue skill](../.agents/skills/github-issue/SKILL.md). See
[`agent-issue-labels/README.md`](agent-issue-labels/README.md) for the manifest schema and call budget.

#### Blackboard journal

Stage each note in a non-empty UTF-8 file, then append it with:

```bash
node dev/blackboard-journal.mts append --file <note-file> [--session-id <id>] [--parent-session-id <id>] [--agent <name>] [--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]
node dev/blackboard-journal.mts append --file <note-file> --root-codex [--new-root-codex-session] [--agent codex] [--version <version>] [--timestamp <iso8601>] [--repository <owner/name> ...]
```

Read a session's journal entries back (oldest first) with:

```bash
node dev/blackboard-journal.mts entries [--session-id <id> | --root-codex [--new-root-codex-session]]
```

`entries` accepts at most one identity override: `--session-id <id>` or interactive-root
`--root-codex`. Root mode refreshes and reads back the worktree-local identity before the server
read.

The commands accept no positional note or stdin input. `append` reads the file without trimming,
validates it is non-empty UTF-8, idempotently creates the agent-blackboard session if needed, and
appends a `type: "journal"` entry. [`agent-session-id/resolve.mts`](agent-session-id/resolve.mts)
resolves a coherent harness, agent, and session when either CLI override is absent. Cursor CLI also
reads `.local/cursor-session-id`; native Grok with `GROK_AGENT` reads
`.local/grok-session-id`. An interactive root Codex call always passes `--root-codex`; an absent-thread
new root session also passes `--new-root-codex-session` exactly once, then reuses
`.local/codex-session-id`. A real thread id replaces it; children and
detached processes must not pass either root flag. Root Codex uses this script path rather than the MCP
procedure because only the script can invoke the root resolver.

There is no filesystem fallback: any failure (missing token, unreachable blackboard stack, CLI
error) hard-fails nonzero and prints a shell-quoted `Replay with: ...` command re-running the same
`--file`/`--session-id` after the stack is back up. See
[docs/development/agent-blackboard.md](../docs/development/agent-blackboard.md) for bringing the
stack up.

### Read-only helpers

| Command                                                                                                  | Scope and output                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./dev/status`                                                                                           | Reports service and resource state across worktrees, including suspected orphans.                                                                                                                                                                                                       |
| `./dev/valkey-logs`                                                                                      | Runs Valkey `MONITOR` for this worktree; it does not aggregate application logs.                                                                                                                                                                                                        |
| `./dev/logs`                                                                                             | Compatibility alias for `./dev/valkey-logs`.                                                                                                                                                                                                                                            |
| `./dev/audit-rename OLD NEW`                                                                             | Reports repository references to both names before a rename.                                                                                                                                                                                                                            |
| `./dev/config-inventory [--format json]`                                                                 | Reports environment and Dynamic Config readers and contracts.                                                                                                                                                                                                                           |
| `pnpm exec vouchington retrospective-facts --pr N / --branch name / --no-pr [--repo owner/name] [--raw]` | Fetches and reports branch, PR, push, and diff facts without modifying repository files. Requires an explicit identity flag.                                                                                                                                                            |
| `pnpm exec vouchington retrospective-transcript`                                                         | Reports turn, tool-call, and token facts from the current session transcript.                                                                                                                                                                                                           |
| `node dev/retrospective-save.mts check [--session-id <id> \| --root-codex [--new-root-codex-session]]`   | Accepts at most one identity override; reports whether a retrospective entry exists. Root mode refreshes the worktree-local identity. Absent-thread root Codex passes the new-session flag once, then only `--root-codex`; a real thread id replaces its fallback.                      |
| `node dev/retrospective-distill.mts <partition.jsonl> --retro-cutoff <iso> --session-cutoff <iso>`       | Classifies each session in a local `snapshot_export`/`snapshot partition` JSONL file by shape and eligibility for the `retrospective-distill` skill; pure local parsing, no MCP, network, or writes.                                                                                    |
| `pnpm exec pr-shepherd journal extract --body-file <path>`                                               | Reads one explicit local Markdown body file and prints the typed Shepherd Journal extraction JSON plus newline. It never accepts stdin or logs the source body; invalid arguments and file-read errors exit nonzero, while typed `ok: false` extraction results are normal JSON output. |
| `node dev/cloc.mts`                                                                                      | Produces the repository's classified line-count report.                                                                                                                                                                                                                                 |
| `node dev/sandbox-command-audit.mts`                                                                     | Reports sandbox-bypass/denial candidates and escalation pressure from past sessions.                                                                                                                                                                                                    |
| `node dev/session-friction/report.mts [--session-id <id> \| --root-codex [--new-root-codex-session]]`    | Accepts at most one identity override; prints the session's retro blocks. Root mode refreshes the worktree-local identity. Absent-thread root Codex passes the new-session flag once, then only `--root-codex`; a real thread id replaces its fallback.                                 |

#### Retrospective transcript facts

`pnpm exec vouchington retrospective-transcript` resolves `--jsonl` first, then an explicit
`--session-id` across Codex and Claude roots, then `CODEX_THREAD_ID`, `CURSOR_SESSION_ID`, and
finally `CLAUDE_CODE_SESSION_ID`. Cursor JSONL auto-discovery is out of scope; pass `--jsonl` or
`--session-id`. Codex rollouts are discovered recursively under `~/.codex/sessions` and
Claude transcripts under `~/.claude/projects`; use `--codex-sessions-dir` or `--projects-dir` for
fixtures and recovered roots. Empty, malformed-only, unsupported, or mixed-schema input prints an
unavailable block instead of zero metrics. Output includes visible turns, tool calls and structural
failures, command invocations, cumulative token deltas, recursive subagent spend, and compactions.

### Internal hooks and checks

These are invoked by agent hooks, tests, CI, or higher-level scripts rather than as routine developer
commands: `check-fresh-base`, `check-web-init`, `node dev/check-blackboard.mts`,
`dev/blackboard-mcp` (the `agent-blackboard` MCP server entrypoint registered in `.mcp.json` and
`.codex/config.toml`; launched by the agent runtime, not run directly),
`node dev/codex-hooks/persist-grok-session-id.mts`,
`node dev/journal-checkpoint.mts compact [claude|codex]`,
`node dev/codex-hooks/post-tool-use-command.mts <claude|codex>`,
`node dev/session-friction/record.mts [permission-request]`,
`check-worktree-ports`, `check-db-backed-test-setup.mts`, `playwright-server-check`,
`tmux-agent-reminder`, `host-storage-preflight.mts`, `otel-register.mts`, and the `codex-hooks/`
policy entrypoints. Files under `dev/lib/` are sourced implementation helpers, not standalone
commands.

`node dev/journal-checkpoint.mts compact [claude|codex]` and
`node dev/codex-hooks/post-tool-use-command.mts <claude|codex>` are the two halves of the mechanical
journal auto-append trigger for #9337 — a SessionStart(compact) hook, and the merged PostToolUse
hook (which also runs the journal-checkpoint tool pipeline, session-friction recording, and the tmux
reminder in-process, replacing three separately-spawned Codex hook processes per tool call with
one) — that append real `dev/blackboard-journal.mts`-shaped
entries at defined checkpoints (post-compaction, every 3rd repeated high-signal command failure on
Claude Code, and corroborated PR-create/push milestones on both runtimes). Every appended entry keeps
`type: "journal"` but also carries a structural `checkpoint` field
(`dev/journal-checkpoint/checkpoint-entry.mts`'s `CheckpointKind`:
`'compaction' | 'command-failure' | 'pr-create' | 'push'`) so `node dev/retrospective-distill.mts` can
tell an auto-appended checkpoint apart from hand-written journal reflection without depending on the
rendered `## Auto-append: ` heading (#10978). The optional runtime argv is the same contract as
`pre-tool-use.mts`. It is fail-open by design — see
[reference-agent-session-hooks.md](reference-agent-session-hooks.md) and
[agent-blackboard](../docs/development/agent-blackboard.md) — and is not a substitute for
[the `blackboard` skill](../.agents/skills/blackboard/SKILL.md)'s agent-initiated journaling.
