---
name: retrospective
description: Review a completed Vouchington session using its journal and validation evidence.
---

# Vouchington Retrospective Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:retrospective`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/retrospective/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

**Budget: ≤10 tool calls, ≤5 minutes, ≤25k tokens.** Aggregate already-captured facts; do not
re-mine transcripts. Do not dispatch a subagent or read raw session JSONL, and do not use
`grep`, `rg`, `jq`, or `awk` over transcripts. Permitted evidence sources are the `facts` and
`transcript` inputs of `retrospective_save`'s `compose` argument and the `journal_entries` tool,
all on the `vouchington-tooling` MCP server (if it is unavailable, follow the
[blackboard skill](../blackboard/SKILL.md#when-the-server-is-unavailable)), called with the `sessionId` the
SessionStart hook printed. Unanswerable evidence is `unknown — no journal`, never a guess.

**When to write.** Write one retrospective per PR when you hand it to the human as ready, or one
for a native stack when the stack is handed off, per the Close-out rule in
[Git And PRs](../agent-workflow/git-and-prs.md#close-out). Write it from the session that did the
work, because the collectors read that session's transcripts and journal. Do not write one per stack
layer or intermediate commit. Pass that hand-off's own `sourceEventId` (for example
`handoff-pr<number>`) to both `retrospective_check` and `retrospective_save`, so a second PR or stack
handed off in the same session is not treated as already reported. If the merge changes the outcome
while you are still running, add the short journal note that rule describes instead of a second
retrospective.

Start with the `retrospective_check` tool, passing the SessionStart `sessionId` (and `sourceEventId`
when reporting another task in the same session). The tools take the id explicitly, so no root or
child identity flags exist. An existing retrospective covers only its source event; preserve later
task deltas with a new explicit `sourceEventId`. For the same already-reported event, collect only
the delta since its timestamp or report `no delta since <timestamp>`. Otherwise call
`retrospective_save` with `compose` (and `dryRun: true` first to preview the document) to generate
routine facts, markers, coverage, tool assessments, and architectural assessments through the shared
composer. Its `compose` argument supplies the concise `narrative`, `date`, `issues`, `prs`,
`description`, `facts`, `transcript`, `tools`, and `architecture`; the server adds the session,
repositories, outcome, and coverage from the call's own `workOutcome`, `feedbackCoverage`, and
`repositories` arguments. Unavailable evidence stays explicit. Use an explicit `mode` as described
in [saving.md](saving.md). Pass the SessionStart `sessionId` as the call's `sessionId`; pass
`compose.transcript.harnessSessionId` (the harness session UUID) only when that `sessionId` is not
a UUID. The composer collects routine repository facts and transcript facts, and
builds `## CI Failures` and `## Sandbox & Permission Audit` from the session's hosted journal
entries alone; do not rerun separate collectors solely to fill sections that composition
already generated. A PR in a repository other than the worktree's is recorded as the facts
`{status: "not-assessed", reason}`, never queried. A session unknown to the hosted blackboard reports
both sections as unavailable, not as none observed. The canonical skill owns the
evidence-minimization boundary for durable content. A zero-work session retains the generated
outcome, facts, tool, architecture, and sandbox assessment sections, with `## No Substantive Work`
as its narrative.

Present the five most consequential journal findings, tagged `recurring` or `one-off`; the limit
is a presentation limit, never permission to drop additional captured findings. Preserve all
observations in journal entries. Include an architectural assessment with `finding`, `none observed`,
or `not assessed`/`unavailable` and an evidence-backed reason. Keep work outcome, feedback coverage,
and delivery status separate: a successful task with pending feedback is not fully reported.
Include conditional sections only when they fire: `## Plan vs Actual`, first-party tool feedback
(consequential surprises, false positives, unsupported paths, missing checks, and repeated failures), scheduled prompt suggestions, and
`## PR Creation Feedback`. The last records per-PR findings and grouped themes, then asks whether to
file issues, make a PR, or defer; it is not a license to mutate GitHub without authorization. The
triage-prs Step 6a exception passes `Disposition: preauthorized-pr #N` after it has already created
or reused the bounded feedback PR, so record that disposition without asking again.

## PR Creation Feedback

See the local PR-creation-feedback disposition rule above and [PR feedback](pr-feedback.md).

Read [fact contracts](fact-contracts.md), [saving](saving.md), [PR feedback](pr-feedback.md), and
[sandbox audit](sandbox-audit.md) when their sections apply. Save one validated retrospective only
through the `retrospective_save` tool; it must retain `## Plan vs Actual`, `## CI Failures`, and
consequential tool findings. Routine diagnostic counts and source records are generated evidence;
do not hand-author a narrative for every ordinary lint result. Use [retrospective-distill](../retrospective-distill/SKILL.md) for
actionable follow-ups.
