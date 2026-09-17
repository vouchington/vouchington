# OpenCode configuration

OpenCode is a first-class local assistant in this repository. It does **not**
get copied hooks, skills, or `AGENTS.md`.

- Read checked-in `CLAUDE.md` files unless `OPENCODE_DISABLE_CLAUDE_CODE` is set.
- Skills load from [`.agents/skills/`](../.agents/skills) and Claude-compat
  [`.claude/skills/`](../.claude/skills).
- Project config: [`opencode.json`](../opencode.json) at the repository root (`autoupdate: false`). It
  registers the local Agent Blackboard wrapper in the V1 `mcp` object and allows exactly its eight
  current provider tools. Local users `/connect` for a provider; this tree does not pin a default model.
- Do not add `AGENTS.md`; OpenCode would prefer it over `CLAUDE.md`.
- Capability map: [agent-harness-parity.md](../docs/development/agent-harness-parity.md).
