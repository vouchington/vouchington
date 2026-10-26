---
name: retrospective-distill
description: Turn verified Vouchington retrospective findings into actionable issues.
---

# Vouchington Retrospective Distillation Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:retrospective-distill`; Grok, Cursor, and
OpenCode read `node_modules/vouchington-tooling/skills/retrospective-distill/SKILL.md` and its
referenced issue-body procedure. If neither source is readable, report the missing prerequisite;
never apply this overlay alone. The canonical skill owns the snapshot, eligibility, archival,
and MCP `snapshot_cleanup` procedure.

## Vouchington additions

Accept optional `--retro-days <N>` (default 1) and `--session-days <N>` (default 7). Validate
both non-negative finite values before export and compute the cutoffs once. Use the
machine-registered `vouchington-tooling` MCP server and this checkout's
`pnpm exec agent-blackboard snapshot partition` command to create bounded read-only partitions
from the verified export. Only the root retains its cleanup token; follow canonical MCP
`snapshot_cleanup` after all archive checks. Do not use a local cleanup command for the export.

On Codex, partition inspectors use the read-only `explore` role; on Claude Code, the built-in
read-only `Explore` subagent. Before hand-reading entries, each inspector runs
`pnpm exec vouchington agent-blackboard distill classify <partition> --retro-cutoff <retroCutoff> --session-cutoff <sessionCutoff>`.
The historic checkpoint discriminator is `isCheckpointEntry` in
`dev/retrospective-distill/checkpoint-entry.mts`; retrospective storage type is checked by
`dev/retrospective-distill/retrospective-entry.mts`. The local journal CLI `--file` convenience
omits storage type, so unresolved entries remain quarantined under the canonical rule.

The root uses [Vouchington distilling policy](distilling.md) for current-repository verification,
scheduled prompts, redaction, and issue routing. File through the
[github-issue adapter](../github-issue/SKILL.md), applying its taxonomy and authorization gate.
Vouchington authorizes archival of eligible sessions when this skill is invoked; retain sessions
whose themes were deferred or whose issue mutation failed, as the canonical procedure requires.
