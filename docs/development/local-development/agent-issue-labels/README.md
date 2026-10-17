# Batch GitHub issue preflight

Source entrypoint: [dev/agent-issue-labels/README.md](../../../../dev/agent-issue-labels/README.md)

[Back to Dev Environment Reference](../README.md#github-issue-tooling)

`batch-issues.mts` validates a batch of proposed Vouchington issues from one agent-authored manifest.
It fetches the live label and milestone taxonomy once, preflights every entry fail-closed, and never
creates or mutates an issue. Each approved write runs separately through the
[github-issue skill](../../../../.agents/skills/github-issue/SKILL.md), which revalidates
repository authority immediately before the mutation and reads the result back.

Scope is deliberately narrow: plain issues in `vouchington/vouchington` only. `Plan:` issues, epics,
sub-issues, and blocked-by relationships go through the one-at-a-time skill flow. All batch state
lives in one caller-created session directory, and the manifest schema and subcommands are defined
by the tool's source and `--help`.
