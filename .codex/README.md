# Codex configuration

Codex reads checked-in `AGENTS.md` files and discovers local adapters under `.agents/skills/`.
No repository file installs a plugin or registers an MCP server. vouchington-machines'
`install-dependencies.sh` installs the `vouchington-workflow`, `vouchington-testing`,
`vouchington-database`, `security-triage` and `pr-shepherd` plugins for Codex, and `./configure-agents.sh`
registers `vouchington-tooling` in the user's Codex config and pre-approves its tools. Run
`./diagnose-agents.sh --repo <worktree>` there to check; the hand-run `codex plugin` install steps
are retired.

Verify the current unpinned marketplace manifests before invoking an adapter:

```bash
codex plugin marketplace list
codex plugin list
```

Plugin installation is local agent state, not a `.codex/config.toml` project setting. If a required
plugin is unavailable, the adapter stops rather than applying its overlay alone. See
[Agent Blackboard](../docs/development/agent-blackboard.md) for the MCP server.

See [Agent Harness Parity](../docs/development/agent-harness-parity.md) for the shared ownership
model and [`.claude/README.md`](../.claude/README.md) for Claude Code marketplace provisioning.
