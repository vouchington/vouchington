# OpenCode configuration

Source entrypoint: [.opencode/README.md](../../../.opencode/README.md)

OpenCode is a first-class local assistant in this repository. It does **not**
get copied hooks, skills, or `AGENTS.md`.

- Read checked-in `AGENTS.md` files. OpenCode prefers `AGENTS.md` over `CLAUDE.md`.
- Skills load from [`.agents/skills/`](../../../.agents/skills) and Claude-compat
  [`.claude/skills/`](../../../.claude/skills). `OPENCODE_DISABLE_CLAUDE_CODE` disables that
  Claude-compat layer; it does not disable `AGENTS.md`.
- Project config: [`opencode.json`](../../../opencode.json) at the repository root (`autoupdate: false`). It
  registers the `vouchington-tooling` server in the V1 `mcp` object and allows its seven tools by
  name (no wildcard is documented). Local users `/connect` for a provider; this tree does not pin a default model.
- Do not add `CLAUDE.md`. It is gitignored.
- Capability map: [agent-harness-parity.md](../agent-harness-parity.md).
