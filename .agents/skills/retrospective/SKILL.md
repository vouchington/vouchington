---
name: retrospective
description: Provide a Vouchington session retrospective. Loads the portable Vouchington retrospective workflow, then applies local evidence, validation, and storage rules.
---

# Vouchington Retrospective Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:retrospective`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/retrospective/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

**Budget: ≤10 tool calls, ≤5 minutes, ≤25k tokens.** Aggregate already-captured facts; do not
re-mine transcripts. Do not dispatch a subagent or read raw session JSONL, and do not use
`grep`, `rg`, `jq`, or `awk` over transcripts. Permitted evidence sources are
`pnpm exec vouchington retrospective-facts`, `pnpm exec vouchington retrospective-transcript`,
`node dev/session-friction/report.mts`, and `node dev/blackboard-journal.mts entries [--root-codex]`.
Unanswerable evidence is `unknown — no journal`, never a guess.

Start with `node dev/retrospective-save.mts check [--session-id <id>]`. An interactive root Codex always
adds `--root-codex` to this check, `node dev/blackboard-journal.mts entries`, the eventual
`retrospective-save.mts save`, and `node dev/session-friction/report.mts`; a child never adds that
flag and remains fail-closed when it lacks its own identity. At the beginning of an absent-thread
root session, add `--new-root-codex-session` to exactly one of those script calls, then omit it.
Use `check --source-event-id <task-event-id>` when reporting another task in the same session.
An existing retrospective covers only its source event; preserve later task deltas with a new
explicit source event ID. For the same already-reported event, collect only the delta since its
timestamp or report `no delta since <timestamp>`. Otherwise use
`retrospective-save.mts compose --input <json-file>` to generate routine facts, markers, coverage,
tool assessments, and architectural assessments through the shared composer. Its input supplies
collector options and concise narrative; unavailable evidence stays explicit. Save preserves the
generated outcome and coverage front matter; use an explicit `--mode` as described in
[saving.md](saving.md). The composer collects routine repository facts, transcript facts, hosted
journal observations, and the local friction log itself; do not rerun the standalone report commands
solely to fill sections that composition already generated. The standalone facts and friction
commands remain available for inspection or manual staging. The canonical skill owns the evidence-minimization boundary
for durable content. `retrospective-facts` must fetch `origin/main`; never infer identity from the
checkout. A zero-work session retains the generated outcome, facts, tool, architecture, and
sandbox assessment sections, with `## No Substantive Work` as its narrative.

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
through `node dev/retrospective-save.mts`; it must retain `## Plan vs Actual`, `## CI Failures`, and
consequential tool findings. Routine diagnostic counts and source records are generated evidence;
do not hand-author a narrative for every ordinary lint result. Use [retrospective-distill](../retrospective-distill/SKILL.md) for
actionable follow-ups.
