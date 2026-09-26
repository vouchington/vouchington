# Cursor Configuration

Cursor (including the Grok model in Cursor CLI) is a first-class local assistant
in this repository. It does **not** get copied skills or `AGENTS.md` files.

- Read checked-in `CLAUDE.md` files. Do not add tracked `AGENTS.md` copies.
- Skills load from [`.agents/skills/`](../.agents/skills) (Cursor also discovers
  `.claude/skills/`).
- Hooks load through Cursor's Claude-compat from [`.claude/settings.json`](../.claude/settings.json);
  policy stays in [`dev/codex-hooks/`](../dev/codex-hooks). Do not add a `hooks.json` here: a
  second hook source double-fires.
- MCP uses [`mcp.json`](mcp.json)'s root-resolving Agent Blackboard wrapper. Its exact eight-tool
  allowlist is kept in both [`cli.json`](cli.json) and [`permissions.json`](permissions.json).
- CLI allow/deny tokens: [`cli.json`](cli.json). Auto-review guidance:
  [`permissions.json`](permissions.json).
- OS sandbox: [`sandbox.json`](sandbox.json). Matches Codex `workspace-write`
  extra writable roots (pnpm store, pnpm cache/state, no-mistakes cache, cargo,
  macOS temp) and allows outbound network. Private/RFC1918 and
  localhost stay hard-blocked by Cursor, so Docker, Postgres, Valkey, and local
  stack commands still need unsandboxed runs — see
  [start-of-work.md](../.agents/skills/agent-workflow/start-of-work.md).
- Agents Window / `agent --worktree` setup: [`worktrees.json`](worktrees.json)
  runs `./dev/initialize monorepo` through the generic `setup-worktree`
  command array. Do not put a command array on `setup-worktree-unix`: Cursor
  CLI (`2026.08.11-e8db854`) treats that key as a script path and crashes with
  `The "path" argument must be of type string. Received an instance of Array`.
  Full `./dev/initialize web` stays agent-driven.
- Capability map: [agent-harness-parity.md](../docs/development/agent-harness-parity.md).
- Session id: Cursor does not inject a session-id env into the agent Shell. Claude-compat
  SessionStart/PreToolUse persist `.local/cursor-session-id` (gitignored) so journal and retro CLIs
  resolve without `--session-id`. Pass `--session-id` or `--jsonl` for transcript facts.
  `./dev/reset-worktree` deletes the persist file.

`worktrees/` is gitignored runtime state.
