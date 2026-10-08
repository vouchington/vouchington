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

The approved workflow skills are portable plugin skills with thin Vouchington adapters, not copied
implementations. No repository file declares a plugin or marketplace: vouchington-machines enables
the workflow, testing, database, security-triage, and pr-shepherd plugins and registers the
`vouchington` and `jonathanong` marketplaces in each machine's user settings (`./configure-agents.sh`,
then `./diagnose-agents.sh --repo <worktree>`). Claude prompts for the required trust/install consent
on first use, and installs a newly enabled plugin in the background, so the first session after
configuring may not have it yet. Verify provisioning before using an adapter:

```bash
claude plugin marketplace list
claude plugin list
claude plugin details vouchington-workflow@vouchington
claude plugin details vouchington-testing@vouchington
claude plugin details vouchington-database@vouchington
claude plugin details security-triage@vouchington
claude plugin details pr-shepherd@jonathanong
```

The commands must show both marketplaces and all five installed plugins. The machine declarations
are intentionally unversioned; marketplace updates resolve the current plugin manifest. If any
entry is missing or reports a load error, rerun the machine configuration, or install by hand into
user scope, never project scope, which would write a declaration into this repository:

```bash
claude plugin marketplace add vouchington/vouchington-tooling --scope user --sparse .claude-plugin plugins
claude plugin marketplace add jonathanong/pr-shepherd --scope user
claude plugin install vouchington-workflow@vouchington --scope user
claude plugin install vouchington-testing@vouchington --scope user
claude plugin install vouchington-database@vouchington --scope user
claude plugin install security-triage@vouchington --scope user
claude plugin install pr-shepherd@jonathanong --scope user
```

Restart Claude Code from the repository root, then verify again. User trust and local installation
state remain environment-owned and cannot be completed by a repository test. A Claude cloud session
has no plugins: each adapter then reads the installed
`node_modules/vouchington-tooling/skills/<name>/SKILL.md` copy of its canonical skill.

The upstream workflow, testing, and database plugins each ship one canonical `skills/` tree
through both their `.claude-plugin` and `.codex-plugin` manifests. Claude Code and Codex adapters
load the matching domain skill. Keep Vouchington-specific rules in the local adapter or its linked
documentation; do not fork portable guidance. An adapter must stop rather than applying its overlay
alone if the canonical skill is unavailable.

No repository file registers an MCP server: vouchington-machines registers `vouchington-tooling`
once per machine and pre-approves its tools. The server, its tools, and the CLI fallback are
documented in [Agent Blackboard](../docs/development/agent-blackboard.md).

## See Also

- [Root AGENTS.md](../AGENTS.md) — agent entrypoint, workspace index, and shared Claude/Codex/Grok/Cursor/OpenCode workflow policy.
- [`.agents/skills/`](../.agents/skills) — shared skill source for entries that must be available to Claude, Codex, Grok, Cursor, and OpenCode, including local-site-testing, retrospective, and retrospective-distill workflows.
- [Agent Harness Parity](../docs/development/agent-harness-parity.md) — Grok reuses this tree through Claude-compat; do not copy hooks or skills into `.grok/`. Grok prefix-matches `permissions.deny` with no word boundary, so do not add a deny that is a prefix of a sanctioned command (`Bash(git push --force)` blocks `--force-with-lease`). Use `Bash(*git push --force)` for the no-arg form.
