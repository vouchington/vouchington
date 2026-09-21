---
name: revisit-followups
description: Scan merged Vouchington PR Shepherd Journals, instructions, and closed issues for actionable deferred follow-ups using the portable Vouchington workflow.
---

# Vouchington Follow-up Review Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:revisit-followups`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/revisit-followups/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

### Scope and collection

Accept a duration (`1w`, `2d`, `1m`) or ISO date. If absent, ask the user, proposing a one-week
default, then compute a date-only cutoff and fetch `origin`. Collect only explicit deferred-action
signals from merged PR Shepherd Journals, tracked `CLAUDE.md` files, and closed issue bodies; PR and
issue comments are opt-in (`--include-pr-comments`, `--include-issue-comments`). Settled rejections,
closure decisions, standing policy, and incidental TODO-like text are not follow-ups. Zero candidates
is a correct outcome.

Use an OS-temp scratch directory with separate `candidates/` and `verdicts/` files. If delegating,
each collector gets its own file; never concurrently append. Collectors may fetch PR bodies in
parallel, but they return their body-file paths to the main agent without parsing them. The main
agent runs each `pnpm exec pr-shepherd journal extract --body-file <path>` serially; workspace-write
agents must not run concurrent `pnpm exec` processes. Keep collection/mechanical parsing separate
from actionability triage. Consume each one-line typed JSON result: `ok: false` fails collection for
that body, `journal: null` has no Journal candidate, and a journal supplies ordered entries. The
published CLI owns Journal syntax and ignored-lookalike handling; do not reimplement or broaden its
grammar. Do not print the fetched body outside its private scratch file; remove all scratch files
after collection.

For merged and closed searches use `--limit 500`. A full page is truncation, not exhaustion: split
the date range at a midpoint, retaining both bounds for interior chunks; only the top-level final
chunk may be open-ended. A same-day full result cannot shrink further, so report its truncation and
stop splitting. Closed issue collection is body-first: unchecked boxes and partial numbered work
lists are candidates; fetch issue comments only for body candidates unless comments were requested.
Do not exclude a whole `Plan:` issue or rely on a fixed heading allowlist.

### Triage and batch confirmation

For each candidate, first apply the strict actionability gate. Then verify current state against
`origin/main`, including relevant file history: an absent change can have been implemented and later
reverted, and only an explicit recorded rejection/obsolescence makes that settled. For issue-sourced
candidates, inspect the issue body, linked PRs, and comments around closure before repository history.
Search open and closed issues (limit 100) and open PRs (limit 100); exclude the source issue itself
from deduplication. Preserve evidence, current-state result, and covering issue/PR in the draft.

Cluster by theme aggressively. Present every proposed issue with its source and rationale; after one
batch confirmation, delegate creation to [github-issue](../github-issue/SKILL.md). Do not recreate
its routing, duplicate, taxonomy, or mutation logic. Clean up the scratch directory and report
created, skipped, already-done, already-filed, and truncated-window counts.

Every proposed issue is self-contained and contains exactly these sections: `## Problem`,
`## Proposed fixes` (specific checkboxes), `## Files`, and `## Context`. Context preserves the
source PR/Shepherd Journal, `CLAUDE.md` path, or closed issue text; its current-state check on
`origin/main`; and its covering issue/PR search. Do not put blackboard session IDs, retrospective
filenames, or other session-private identifiers in an issue body.

Use the local [GitHub issue workflow](../github-issue/SKILL.md) for duplicate detection,
classification, and creation. Treat Vouchington `docs/**`, `CLAUDE.md`, and closed-issue comments as
local evidence sources; preserve the source PR and journal references in any created issue. Do not
reopen resolved work or infer authorization to implement a discovered follow-up.
