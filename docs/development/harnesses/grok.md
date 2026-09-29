# Grok configuration

Source entrypoint: [.grok/README.md](../../../.grok/README.md)

Grok is a first-class local assistant in this repository. It does **not** get
copied hooks, skills, or permission allowlists.

- Read checked-in `AGENTS.md` files. Do not add `CLAUDE.md`; it is gitignored and would take precedence in Claude Code.
- Skills load from [`.agents/skills/`](../../../.agents/skills).
- Hooks, permissions, and `github-issue-agent` load through Claude-compat from
  [`.claude/`](../../../.claude).
- MCP uses the native [`config.toml`](../../../.grok/config.toml) Agent Blackboard registration, including the
  exact eight-tool `MCPTool(...)` allowlist. Claude compatibility may also read [`.mcp.json`](../../../.mcp.json),
  but the native registration is authoritative.
- OS sandbox: launch with `grok --sandbox workspace-write` (or
  `GROK_SANDBOX=workspace-write`). The profile is
  [sandbox.toml](../../../.grok/sandbox.toml). It matches Codex `workspace-write` extra
  writable roots (pnpm store, pnpm cache/state, no-mistakes cache, cargo,
  macOS temp) and does **not** copy Claude `excludedCommands`.
- Capability map: [agent-harness-parity.md](../agent-harness-parity.md).
- Session id: hook processes see `GROK_SESSION_ID`; the main shell usually does not. Claude-compat
  SessionStart/PreToolUse persist `.local/grok-session-id` (gitignored). With `GROK_AGENT` set,
  journal and retro CLIs resolve that file without `--session-id` and label the session `grok`.
  `./dev/reset-worktree` deletes the persist file. Do not add a `.grok/hooks/` tree: a second hook
  source double-fires.
- Project Grok workflows live in [`.grok/workflows/`](../../../.grok/workflows/). They orchestrate skills; they
  do not copy hooks or skills. Staging QA: [`workflows/staging-qa.rhai`](../../../.grok/workflows/staging-qa.rhai).

`.grok/worktrees/` is gitignored runtime state.
