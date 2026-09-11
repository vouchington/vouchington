# Codex configuration

Codex reads checked-in `CLAUDE.md` files and discovers local adapters under `.agents/skills/`.
Install the required public plugins once per Codex environment:

```bash
codex plugin marketplace add vouchington/vouchington-tooling --ref main
codex plugin marketplace add jonathanong/pr-shepherd --ref main
codex plugin add vouchington-workflow@vouchington
codex plugin add vouchington-testing@vouchington
codex plugin add vouchington-database@vouchington
codex plugin add security-triage@vouchington
codex plugin add pr-shepherd@jonathanong
```

Verify the current unpinned marketplace manifests before invoking an adapter:

```bash
codex plugin marketplace list
codex plugin list
```

Plugin installation is local agent state, not a `.codex/config.toml` project setting. If a required
plugin is unavailable, the adapter stops rather than applying its overlay alone.

The project `agent-blackboard` MCP server uses the root-resolving local wrapper. Its eight current
provider tools each require Codex's explicit `approval_mode = "approve"`; see
[Agent Blackboard](../docs/development/agent-blackboard.md).

See [Agent Harness Parity](../docs/development/agent-harness-parity.md) for the shared ownership
model and [`.claude/README.md`](../.claude/README.md) for Claude Code marketplace provisioning.
