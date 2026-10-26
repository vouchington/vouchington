# Vouchington distilling policy

The canonical `vouchington-workflow:retrospective-distill` skill owns snapshot handling,
eligibility, verification, issue drafting, archival, and MCP cleanup. Apply these Vouchington
additions after it.

For `## Scheduled Prompt Suggestions`, read [the rotation](../../../docs/prompts/SCHEDULED.md)
and `docs/prompts/scheduled/` once per run. Classify each theme as a new prompt or a specific
strengthening of an existing prompt. Name the target file and change in `## Proposed fixes`.

File Vouchington issues through the [github-issue adapter](../github-issue/SKILL.md), which owns
priority and component labels, milestones, projects, and external repository routing.
