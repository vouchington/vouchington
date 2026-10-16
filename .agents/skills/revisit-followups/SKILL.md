---
name: revisit-followups
description: Find verified deferred work in merged PR journals, instructions, and closed issues.
---

# Vouchington Follow-up Review Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:revisit-followups`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/revisit-followups/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

### Scope and collection

Follow the canonical skill's "Scope and collection" for the lookback window, truncation splitting,
scratch files, and body-first collection. Vouchington sources are merged PR Shepherd Journals,
tracked `AGENTS.md` files, and closed issue bodies; PR and issue comments are opt-in
(`--include-pr-comments`, `--include-issue-comments`).

Collectors may fetch PR bodies in parallel, but they return their body-file paths to the main agent
without parsing them. The main agent runs each `pnpm exec pr-shepherd journal extract --body-file <path>`
serially; workspace-write agents must not run concurrent `pnpm exec` processes. Keep
collection/mechanical parsing separate from actionability triage. Consume each one-line typed JSON
result: `ok: false` fails collection for that body, `journal: null` has no Journal candidate, and a
journal supplies ordered entries. The published CLI owns Journal syntax and ignored-lookalike
handling; do not reimplement or broaden its grammar.

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
source PR/Shepherd Journal, `AGENTS.md` path, or closed issue text; its current-state check on
`origin/main`; and its covering issue/PR search. Do not put blackboard session IDs, retrospective
filenames, or other session-private identifiers in an issue body.

Use the local [GitHub issue workflow](../github-issue/SKILL.md) for duplicate detection,
classification, and creation. Treat Vouchington `docs/**`, `AGENTS.md`, and closed-issue comments as
local evidence sources; preserve the source PR and journal references in any created issue. Do not
reopen resolved work or infer authorization to implement a discovered follow-up.
