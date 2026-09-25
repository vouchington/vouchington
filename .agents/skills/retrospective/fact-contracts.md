# Fact contracts

Full detail for the `## Transcript Facts` and `## CI Failures` sections referenced from
[SKILL.md](SKILL.md). `## Verifiable Facts` has no separate local content contract; prepare it under
the canonical retrospective skill's evidence boundary.

## Transcript Facts

`pnpm exec vouchington retrospective-transcript` resolves Codex from `CODEX_THREAD_ID` and nested
`~/.codex/sessions/**/rollout-*<id>.jsonl` files, including recursive subagents; otherwise it
resolves Claude Code from `CLAUDE_CODE_SESSION_ID` and `~/.claude/projects/*/<id>.jsonl`, including
sibling subagent files. Codex takes precedence when both environment IDs exist.

For Codex, `sub_agent_activity` records fire for every thread a session interacted with — its
parent and siblings, not only its children — so recursive traversal follows an edge only when its
`agent_path` is exactly one segment deeper than the discovering session's own path. `Subagent tool
calls`/`Subagent tokens` therefore reflect only genuine descendants; a leaf session that
merely ran alongside other threads (rather than spawning any) reports zero subagents.

For a detached session, pass `--session-id <id>` to search both roots, or `--jsonl <path>` for a
manually recovered transcript (`--jsonl` takes precedence over `--session-id`).

When no matching transcript or supported, internally consistent schema can be resolved, the command
prints `=== Transcript Facts ===` with `Status: unavailable (<reason>)` and exits 0. Use that status
instead of estimating the numbers yourself.

`Push commands attempted: N` counts every `git push` invocation seen in the transcript, not
verified remote updates — a push that fails or is rejected still increments it.
`./dev/retrospective-facts` (bash, in `## Verifiable Facts`) separately derives the
reflog-verified update count (`remote_update_count`/`push_like_update_count`). Attempts exceeding
verified updates is expected, not a discrepancy to explain away — it means at least one push
failed or was rejected.

## CI Failures

Every retrospective must contain a `## CI Failures` section immediately after
`## Transcript Facts`. This is an **observed-failures log**, not a historical GitHub audit: read the
session journal first (via `node dev/blackboard-journal.mts entries [--root-codex]` for interactive
root Codex), then the raw transcript and
recursive subagent transcripts for failures surfaced during the session. Do not crawl workflow
history for failures the session never observed, and do not infer that no failure occurred merely
because the final run passed.

Use exactly one status line:

- `Status: failures observed`
- `Status: none observed` — only when the journal or transcript was available and showed no failures
- `Status: unavailable (<reason>)` — when neither source can establish whether failures occurred; the
  reason must be non-blank

When failures were observed, group repeated occurrences by root signature and record each group in
this form:

```markdown
- `recurring|one-off` — `GitHub Actions` — <workflow/job/step>
  - Evidence: <commit/push and GitHub run URL>
  - Root diagnostic: <first actionable error, including the affected test, file, or symbol>
  - Disposition: <fixed by commit SHA, unresolved with issue reference, or classified as infrastructure/pre-existing with evidence>
```

Preserve an earlier failure even when a later attempt passes. Report the first/root failure rather
than downstream aggregate or fan-in failures, and state the occurrence count when the same signature
affected multiple pushes. GitHub Actions is in scope; external PR checks
are out of scope unless their failure was emitted inside a GitHub Actions job. Never paste complete
logs, environment dumps, credentials, or tokens into the retrospective.

This grammar is enforced programmatically by `validateRetroDoc` in
[`dev/retrospective-validate.mts`](../../../dev/retrospective-validate.mts) — `node
dev/retrospective-save.mts save` runs it on the staged doc before appending, and rejects a
malformed section before any agent-blackboard call. If this doc and the validator ever disagree,
the validator wins; treat the mismatch as a bug in this doc.

## Wording rules

- **"Direct-to-main"** - only use this phrase if `git branch -r --contains <sha>` returns
  `origin/main` AND the commit appears on `git log --first-parent origin/main`. If the branch is
  unmerged at retro time, say "committed to topic branch X, unmerged at time of retro."
- **Fix-commit costs** - always pair a commit count with a **push count**. The expensive unit is the
  push (triggers CI + bot reviewers), not the commit. Write "N pushes (M commits), each retriggering
  CI/bots" not just "N fix commits."
- **Bot review rounds** - count distinct pushes that triggered a review cycle, not the number of
  individual comments.
