# Grok configuration

Source entrypoint: [.grok/README.md](../../../.grok/README.md)

Grok is a first-class local assistant in this repository. It does **not** get
copied hooks, skills, or permission allowlists.

- Read checked-in `AGENTS.md` files. Do not add `CLAUDE.md`; it is gitignored and would take precedence in Claude Code.
- Skills load from [`.agents/skills/`](../../../.agents/skills).
- Hooks, permissions, and `github-issue-agent` load through Claude-compat from
  [`.claude/`](../../../.claude).
- MCP: no repository file registers a server. Grok imports the machine's Claude registration of
  `vouchington-tooling` (see vouchington-machines), and its tools appear as
  `vouchington-tooling__<tool>` behind `search_tool` and `use_tool`.
- OS sandbox: launch with `grok --sandbox workspace-write` (or
  `GROK_SANDBOX=workspace-write`). The profile is
  [sandbox.toml](../../../.grok/sandbox.toml). It matches Codex `workspace-write` extra
  writable roots (pnpm store, pnpm cache/state, no-mistakes cache, cargo,
  macOS temp) and does **not** copy Claude `excludedCommands`.
- Capability map: [agent-harness-parity.md](../agent-harness-parity.md).
- Session id: hook processes see `GROK_SESSION_ID`; the main shell usually does not. Claude-compat
  SessionStart/PreToolUse persist `.local/grok-session-id` (gitignored). With `GROK_AGENT` set,
  the retro CLIs resolve that file without `--session-id` and label the session `grok`. The
  SessionStart check prints the payload id for the MCP tools.
  `./dev/reset-worktree` deletes the persist file. Do not add a `.grok/hooks/` tree: a second hook
  source double-fires.
- Project Grok workflows live in [`.grok/workflows/`](../../../.grok/workflows/). They orchestrate skills; they
  do not copy hooks or skills. Staging QA: [`workflows/staging-qa.rhai`](../../../.grok/workflows/staging-qa.rhai).

`.grok/worktrees/` is gitignored runtime state.
