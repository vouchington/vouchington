# Claude Code Configuration

Repo-scoped Claude Code configuration. Each subdirectory is loaded by Claude Code automatically when relevant.

## Layout

| Directory                 | Loaded as                                 | Purpose                                                                                                                          |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [`agents/`](agents/)      | Subagents available via the Agent tool.   | `github-issue-agent` for searching, creating, updating, and linking GitHub issues.                                               |
| [`skills/`](skills/)      | Skill packs invokable via the Skill tool. | Entries symlink to [`.agents/skills/`](../.agents/skills); migrated reusable adapters load their canonical upstream skill first. |
| `worktrees/` (gitignored) | Per-worktree state.                       | Symlinks to active worktrees managed by `dev/initialize`.                                                                        |

## Key Rules

- Any `.md` file inside [`agents/`](agents/) becomes a subagent — do not put a `README.md` there.

## Required agent plugins

The approved workflow skills are portable plugin skills with thin Filaments adapters, not copied
implementations. Claude Code project settings register the `vouchington` and `jonathanong`
marketplaces and enable the workflow, testing, database, security-triage, and pr-shepherd plugins. Claude prompts for
the required trust/install consent on first use:

```bash
# Claude Code
claude plugin marketplace add vouchington/vouchington-tooling --scope project --sparse .claude-plugin plugins
claude plugin marketplace add jonathanong/pr-shepherd --scope project
claude plugin install vouchington-workflow@vouchington --scope project
claude plugin install vouchington-testing@vouchington --scope project
claude plugin install vouchington-database@vouchington --scope project
claude plugin install security-triage@vouchington --scope project
claude plugin install pr-shepherd@jonathanong --scope project
```

Claude Code reads the project settings when it starts from this repository. After approving the
marketplace trust prompt, restart Claude Code and verify provisioning before using an adapter:

```bash
claude plugin marketplace list
claude plugin list
claude plugin details vouchington-workflow@vouchington
claude plugin details vouchington-testing@vouchington
claude plugin details vouchington-database@vouchington
claude plugin details security-triage@vouchington
claude plugin details pr-shepherd@jonathanong
```

The commands must show both marketplaces and all five installed plugins. The project declarations
are intentionally unversioned; marketplace updates resolve the current plugin manifest. If any
entry is missing or reports a load error, run the explicit install commands above.
Restart Claude Code from the repository root, then verify again. The checked-in settings declare
the required plugins; user trust and local installation state remain environment-owned and cannot
be completed by a repository test.

The upstream workflow, testing, and database plugins each ship one canonical `skills/` tree
through both their `.claude-plugin` and `.codex-plugin` manifests. Claude Code and Codex adapters
load the matching domain skill. Keep Filaments-specific rules in the local adapter or its linked
documentation; do not fork portable guidance. An adapter must stop rather than applying its overlay
alone if the canonical skill is unavailable.

`settings.json` enables the shared `.mcp.json` Agent Blackboard server and preauthorizes its
eight current provider tools. The local wrapper and tool inventory are documented in
[Agent Blackboard](../docs/development/agent-blackboard.md).

## See Also

- [Root CLAUDE.md](../CLAUDE.md) — agent entrypoint, workspace index, and shared Claude/Codex/Grok/Cursor/OpenCode workflow policy.
- [`.agents/skills/`](../.agents/skills) — shared skill source for entries that must be available to Claude, Codex, Grok, Cursor, and OpenCode, including local-site-testing, retrospective, and retrospective-distill workflows.
- [Agent Harness Parity](../docs/development/agent-harness-parity.md) — Grok reuses this tree through Claude-compat; do not copy hooks or skills into `.grok/`. Grok prefix-matches `permissions.deny` with no word boundary, so do not add a deny that is a prefix of a sanctioned command (`Bash(git push --force)` blocks `--force-with-lease`). Use `Bash(*git push --force)` for the no-arg form.
