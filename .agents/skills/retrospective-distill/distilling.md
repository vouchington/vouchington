# Distilling (full mechanics)

Full detail for [SKILL.md's Workflow section](SKILL.md#workflow). Covers the current-state
verification and dedup mechanics behind steps 6, 7, 9, and 10, and the issue-body template
behind step 8.

## Snapshot partition boundary

`snapshot_export` is the sole bulk read. Its terminal manifest and client-side checksum establish that
the root received a complete best-effort export before any partition is delegated. The root must first
check schema version, complete status, a nonempty generated-export `cleanupToken`, and exact equality
between manifest counts and compact export counts, then pass the cleanup token, counts, and SHA-256
value to the partition CLI. The partitioner returns `directory` and `partitions`, and preserves a
session's contiguous session record and entry records as an indivisible group. This matches the
upstream `snapshot-stream` writer's `sessionBlock`: it emits one session record, then all entries for
that session, and only then advances to the next session. The partitioner starts a new private
partition before adding the next group that would exceed 25 sessions or 1 MiB. A group that cannot
fit in 1 MiB fails the run rather than weakening the bound.

The root owns the snapshot, partition paths, issue actions, archival, and cleanup. Partition inspectors
receive only their partition path, the `retroCutoff`/`sessionCutoff` computed by the root, and return
summaries, never raw entries. Their summary must distinguish eligible-with-retro, eligible-stale
(checkpoint-only, journal-only, zero-entry-child, and zero-entry-root — see SKILL.md's classification
paragraph and `dev/retrospective-distill.mts`, the read-only classifier every inspector runs before
hand-reading), entry-type-unresolved (an otherwise-eligible session holding an entry whose `type` is
missing or unrecognized — never treat it as journal evidence), and not-yet-eligible sessions, and
must attach the contributing session IDs to every theme so the mapping survives the
root's later merge and deduplication — the root archives only the eligible sessions it fully
processed, and needs that mapping to withhold archival from just the sessions behind a failed or
deferred theme.
Do not archive while inspectors are still running, and re-check each session's `lastEntryAt` against
its exported value immediately before archiving it — a session resumed since the snapshot was taken
must be skipped this round and reconsidered next. Always remove both the generated partition directory
and the exported snapshot after the root merges summaries, including on an issue-validation failure.
Partition and cleanup commands require the original `cleanupToken`; the root retains that capability
and never delegates it. Cleanup retries use the same token with the original directory and snapshot
paths. If partitioning fails before a directory is returned, cleanup receives the validated generated
snapshot path and cleanup token without a directory. The export's omitted default path and all
partition directories are intentionally temporary.

## Verification & Dedup

**Skip recently-fixed first-party dependencies (step 6).** Run `git fetch origin` first (steps 6
and 7 both inspect `origin/main`). If a theme's root cause is in a first-party package (see
`pnpm-release-age-policy.permanentPackages` in `.no-mistakes.yml`), check whether its version in
`pnpm-lock.yaml` was bumped on `origin/main` after the window start of the sessions being
distilled: the oldest processed session's oldest entry `createdAt` (its `retrospective` entry or
`## Verifiable Facts` timestamp when it has one; otherwise its earliest journal entry, or the
session's own `createdAt` when it has no entries at all). If yes, skip that theme and note the skip
in your step 11 summary. Re-evaluate next distill round. Do not archive a session whose only
actionable theme is skipped here — it must remain available for that re-evaluation.

**Verify the problem still exists in the current repo before filing (step 7).** Run
`git fetch origin` first, then inspect against `origin/main` (not local `main`) for each actionable
theme:

- **Process/tooling gaps:** grep the relevant `CLAUDE.md`, `.husky/` hook, CI check,
  skill doc, or config that the proposed fix would touch — confirm the rule or check is not already
  there.
- **Code bugs:** run `git show origin/main:<path>` and `git log origin/main -- <path>` — confirm the
  offending code path has not already been changed on `origin/main` (do not read the local worktree
  file, which may be on an unmerged branch).
- **Recurring fix-commit patterns:** confirm the preventive change hasn't already been merged
  (`git log --first-parent --oneline --grep="<keyword>" origin/main`).
- **Scheduled-prompt suggestions:** a theme built from one or more `## Scheduled Prompt Suggestions`
  findings names only a maintenance concern — the retrospective step deliberately does not open the
  rotation, so distill is the sole classifier. Read
  [docs/prompts/SCHEDULED.md](../../../docs/prompts/SCHEDULED.md) and `docs/prompts/scheduled/`
  **once per distill run** (not once per theme) and classify each theme against the live rotation:
  **new** (no existing scheduled prompt covers the concern — propose one) or **strengthening** (an
  existing prompt already covers the area — cite it by path, e.g. `docs/prompts/scheduled/valkey.md`,
  and propose the specific addition). Put that classification and target file in the issue body's
  `## Proposed fixes`.

If the problem is already fixed, skip the theme and record it as "already fixed in repo" in the
step 11 summary. When unsure, file the issue but note in the body that current-state verification
was inconclusive.

**Skip eligible sessions with no actionable content (step 9).** If multiple **zero-entry-root** or
journal-only sessions cluster together, note that pattern once as its own candidate issue — a
zero-entry-root session has no `parentSessionId`, so it was not a delegated child finishing a
bounded assignment, making a cluster of them genuine evidence of root sessions aborting before the
retrospective step. Do not apply this signal to **zero-entry-child** or **checkpoint-only**
clusters: a delegated child normally finishes its assignment without journaling (see
[the `blackboard` skill](../blackboard/SKILL.md)'s child `session_ensure` handshake), and mechanical
auto-append checkpoints (#9337) are expected routine noise — a cluster of either is not, by itself,
evidence of anything gone wrong, and should be discarded as ordinary volume.

**Verify factual claims before propagating them (step 10).** Retrospectives are written by agents
and may misclassify their own work.

- Prefer the `## Verifiable Facts` section generated by `pnpm exec vouchington retrospective-facts`.
- For merge status, commit counts, diff scope, and direct-to-main claims, verify against
  `origin/main`, not local `main`.
- Before filing claims like "direct-to-main commits" or "merged without CI", check
  `git branch -r --contains <sha>` and `git merge-base --is-ancestor <sha> origin/main`.
- Journal-only evidence has no `## Verifiable Facts` section. Verify any factual claim it makes
  against `origin/main` before it appears in an issue body — do not propagate an agent's own
  in-session narration unverified.
- Journal entries are raw, unminimized notes and automatic checkpoints, not the retrospective
  skill's redacted prose — an automatic failure checkpoint embeds a verbatim failed command and its
  stderr head (`dev/journal-checkpoint/note.mts`'s `renderFailureNote`), which can carry credentials
  or other sensitive local context. Before quoting journal content in an issue body, summarize the
  finding in your own words instead of pasting raw command/stderr text, and strip any long opaque
  token, `VAR=value` assignment, or credential-bearing URL. Verifying a claim against `origin/main`
  (above) checks accuracy; it does not sanitize the text.

## Issue Body Template

Use this issue body shape for both new issues and comments. The issue must be **fully
self-contained** — the source agent-blackboard session is archived in step 11, so the body must
never reference a sessionId. Embed the relevant evidence directly. For comments, prepend a line
like "## Additional context from recent retrospectives" or "**Additional context from recent
retrospectives:**". For comments on existing issues, omit `## Root cause` if already documented in
the issue body, or retitle it `## Additional root cause context` if you have new information:

```markdown
## Root cause

<the underlying process/tooling gap — for recurring themes, why this keeps happening>

## Problem

<symptoms with concrete PR/commit references>

## Proposed fixes

- [ ] <each fix as a checkbox with the file path it touches>

## Files

- <files to modify>

## Context

<Relevant evidence lifted from the source retrospectives — the specific reflection text, root-cause notes,
concrete file paths, and the relevant Verifiable Facts figures (push/commit counts, diff scope) that
motivated this theme. Write this so the issue stands alone after the source session is archived.
Use only durable references: PR #N, issue #N, retro date (YYYY-MM-DD).
Do NOT include retro filenames, .agent-retrospectives/ paths, agent-blackboard sessionIds, or a
journal entry's raw command/stderr text — summarize journal evidence per the redaction rule in
Verification & Dedup step 10.>
```
