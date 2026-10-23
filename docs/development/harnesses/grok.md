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
- OS sandbox: no project profile. The user's `~/.grok/config.toml` (vouchington-machines) sets
  `sandbox.profile = "off"`, because Grok applies its sandbox process-wide with no per-command
  escalation, so `gh` and the toolchain caches fail inside it.
- Capability map: [agent-harness-parity.md](../agent-harness-parity.md).
- Session id: Grok's own shell and its hook processes both export `GROK_SESSION_ID`, which matches
  the session id herdr reports. The SessionStart line does not reach the model, so the agent reads
  that variable (the [`blackboard` skill](../../../.agents/skills/blackboard/SKILL.md)); with no id
  it stops journaling and reports it. Do not add a `.grok/hooks/` tree: a second hook
  source double-fires.
- Project Grok workflows live in [`.grok/workflows/`](../../../.grok/workflows/). They orchestrate skills; they
  do not copy hooks or skills. Staging QA: [`workflows/staging-qa.rhai`](../../../.grok/workflows/staging-qa.rhai).

`.grok/worktrees/` is gitignored runtime state.
