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
If a retrospective already exists, do
not rerun facts or save: collect only the delta since its timestamp, append one journal entry, or
report `no delta since <timestamp>`. Otherwise collect the default outputs, in order,
from `pnpm exec vouchington retrospective-facts --pr <PR_NUMBER>` (or `--no-pr`/explicit `--branch`), transcript
facts, then the session-friction report. The canonical skill owns the evidence-minimization boundary
for durable content. `retrospective-facts` must fetch `origin/main`; never infer identity from the
checkout. A zero-work session writes only front matter, the three facts sections, and
`## No Substantive Work`.

Findings come from the blackboard journal, capped at five and tagged `recurring` or `one-off`.
Include conditional sections only when they fire: `## Plan vs Actual`, first-party tool feedback
(including every observed `no-mistakes` issue), scheduled prompt suggestions, and
`## PR Creation Feedback`. The last records per-PR findings and grouped themes, then asks whether to
file issues, make a PR, or defer; it is not a license to mutate GitHub without authorization. The
triage-prs Step 6a exception passes `Disposition: preauthorized-pr #N` after it has already created
or reused the bounded feedback PR, so record that disposition without asking again.

## PR Creation Feedback

See the local PR-creation-feedback disposition rule above and [PR feedback](pr-feedback.md).

Read [fact contracts](fact-contracts.md), [saving](saving.md), [PR feedback](pr-feedback.md), and
[sandbox audit](sandbox-audit.md) when their sections apply. Save one validated retrospective only
through `node dev/retrospective-save.mts`; it must retain `## Plan vs Actual`, `## CI Failures`, and
every `no-mistakes` issue. Use [retrospective-distill](../retrospective-distill/SKILL.md) for
actionable follow-ups.
