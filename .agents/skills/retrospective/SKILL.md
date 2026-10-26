---
name: retrospective
description: Review a completed Vouchington session using its journal and validation evidence.
---

# Vouchington Retrospective Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:retrospective`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/retrospective/SKILL.md`. If neither source is readable,
report the missing prerequisite; never apply this overlay alone. Use the canonical evidence,
composition, and preview/save procedure.

## Vouchington additions

Write one retrospective when handing an ordinary PR to the human as ready, or one for a native
stack handoff, under [Close-out](../agent-workflow/git-and-prs.md#close-out). Use that handoff's
`sourceEventId` (for example `handoff-pr<number>`) in both `retrospective_check` and
`retrospective_save`. If an already reported merge later changes the outcome, append the short
journal note prescribed by Close-out instead of another retrospective.

The tools use the SessionStart `sessionId` from [blackboard](../blackboard/SKILL.md). For a PR
in another repository, give `compose.facts`
`{status: "not-assessed", reason}`. Local document structure and validation live in
[fact contracts](fact-contracts.md) and [saving](saving.md); read them only when that detail is
needed.

Present at most five consequential journal findings in the human narrative while preserving
all bounded source observations. Include Vouchington's `## Plan vs Actual` when plans changed,
and use [PR feedback](pr-feedback.md) when PR triage supplied prompt feedback. For sandbox
findings, use the [local audit](sandbox-audit.md). Distill actionable follow-ups under the
[retrospective-distill adapter](../retrospective-distill/SKILL.md).
