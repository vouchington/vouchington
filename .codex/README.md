# Codex configuration

Codex reads checked-in `AGENTS.md` files and discovers local skills under `.agents/skills/`.
No repository file installs a plugin or registers an MCP server. vouchington-machines'
`install-dependencies.sh` installs the `jong-skills` (marketplace `harness-plugins`),
`vouchington-workflow` and `pr-shepherd` plugins for Codex, and `./configure-agents.sh`
registers `vouchington-tooling` in the user's Codex config and pre-approves its tools. Run
`./diagnose-agents.sh --repo <worktree>` there to check; the hand-run `codex plugin` install steps
are retired.

Install and verify the unpinned marketplace manifests:

```bash
codex plugin marketplace add jonathanong/harness-plugins --ref main
codex plugin add jong-skills@harness-plugins
codex plugin marketplace list
codex plugin list
```

Plugin installation is local agent state, not a `.codex/config.toml` project setting. The blackboard
MCP server is provided by the `vouchington-tooling` plugin.

See [Agent Harness Parity](../docs/development/agent-harness-parity.md) for the shared ownership
model and [`.claude/README.md`](../.claude/README.md) for Claude Code marketplace provisioning.
