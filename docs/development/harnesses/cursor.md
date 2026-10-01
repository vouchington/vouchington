# Cursor Configuration

Source entrypoint: [.cursor/README.md](../../../.cursor/README.md)

Cursor (including the Grok model in Cursor CLI) is a first-class local assistant
in this repository. It does **not** get copied skills or `AGENTS.md` files.

- Read checked-in `AGENTS.md` files. Do not add `CLAUDE.md`; it is gitignored and would take precedence in Claude Code.
- Skills load from [`.agents/skills/`](../../../.agents/skills) (Cursor also discovers
  `.claude/skills/`).
- Hooks load through Cursor's Claude-compat from [`.claude/settings.json`](../../../.claude/settings.json);
  policy stays in [`dev/codex-hooks/`](../../../dev/codex-hooks). Do not add a `hooks.json` here: a
  second hook source double-fires.
- MCP uses [`mcp.json`](../../../.cursor/mcp.json)'s root-resolving `vouchington-tooling` registration.
  Its server-wide tool approval is kept in both [`cli.json`](../../../.cursor/cli.json) and [`permissions.json`](../../../.cursor/permissions.json);
  loading the server needs a separate per-user approval, see [MCP server approval](#mcp-server-approval).
- CLI allow/deny tokens: [`cli.json`](../../../.cursor/cli.json). Auto-review guidance:
  [`permissions.json`](../../../.cursor/permissions.json).
- OS sandbox: [`sandbox.json`](../../../.cursor/sandbox.json). Matches Codex `workspace-write`
  extra writable roots (pnpm store, pnpm cache/state, no-mistakes cache, cargo,
  macOS temp) and allows outbound network. Private/RFC1918 and
  localhost stay hard-blocked by Cursor, so Docker, Postgres, Valkey, and local
  stack commands still need unsandboxed runs — see
  [start-of-work.md](../../../.agents/skills/agent-workflow/start-of-work.md).
- Agents Window / `agent --worktree` setup: [`worktrees.json`](../../../.cursor/worktrees.json)
  runs `./dev/initialize monorepo` through the generic `setup-worktree`
  command array. Do not put a command array on `setup-worktree-unix`: Cursor
  CLI (`2026.08.11-e8db854`) treats that key as a script path and crashes with
  `The "path" argument must be of type string. Received an instance of Array`.
  Full `./dev/initialize web` stays agent-driven.
- Capability map: [agent-harness-parity.md](../agent-harness-parity.md).
- Session id: Cursor does not inject a session-id env into the agent Shell. Claude-compat
  SessionStart/PreToolUse persist `.local/cursor-session-id` (gitignored) so journal and retro CLIs
  resolve without `--session-id`. Pass `--session-id` or `--jsonl` for transcript facts.
  `./dev/reset-worktree` deletes the persist file.

`worktrees/` is gitignored runtime state.

## MCP server approval

`cli.json` (`Mcp(vouchington-tooling:*)`) and `permissions.json` (`mcpAllowlist`) approve the
server's tool calls. They do not approve loading it: Cursor asks each user once per server, and no
checked-in file can grant that approval. Until it is given, the tools are not offered and the
session cannot journal. The SessionStart health line names the step.

- Interactive: run `cursor-agent mcp enable vouchington-tooling` once, or approve the prompt.
- Headless: `cursor-agent -p --approve-mcps` approves for that run only, so pass it on every
  headless launch.
- Tools: Cursor defers them behind `GetDynamicTools` and `CallDynamicTool`, in the
  `vouchington-tooling` namespace, so look them up (`journal_append`) before concluding the server is
  missing.
