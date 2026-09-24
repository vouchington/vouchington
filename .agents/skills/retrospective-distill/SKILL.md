---
name: retrospective-distill
description: Distill Vouchington agent-blackboard retrospective entries into actionable GitHub issues using the portable workflow and local issue policy.
---

# Vouchington Retrospective Distillation Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:retrospective-distill`; Grok, Cursor, and OpenCode read `node_modules/vouchington-tooling/skills/retrospective-distill/SKILL.md` and resolve its supporting resources relative to that directory. If it cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

## Workflow

Use the local session, readiness, archive, and summary rules below as the consumer-specific
implementation of the portable workflow.

Accept optional `--retro-days <N>` (default 1) and `--session-days <N>` (default 7) invocation args.
Reject either flag before exporting or processing any session unless its value is a finite,
non-negative number: a negative or non-numeric `N` produces a cutoff in the future — or makes every
comparison false — and these flags gate destructive archival. The root computes two ISO cutoffs
once — `retroCutoff = now - retro-days` and `sessionCutoff = now - session-days` — and passes both
into every partition prompt so inspectors never read their own clock.

Use the `agent-blackboard` MCP server in write-capable mode. First call `snapshot_export`; it always
exports only non-archived sessions and returns a private local snapshot path, counts, checksum, and
terminal manifest. This requires `agent-blackboard` 0.5.0 or later; if the installed MCP server lacks
the tool, stop and report the dependency mismatch rather than falling back to paginated session reads.
Never pass `selection.inactiveForHours` to `snapshot_export`: a session with zero entries never
matches that filter (`lastEntryAt === null`), so filtering server-side would permanently hide the
aborted, retro-less sessions this workflow exists to sweep up. Always export unfiltered and classify
age client-side from each record's `createdAt`/`lastEntryAt`.
Before delegation, the root verifies `manifest.schemaVersion === 1`, `manifest.status === "complete"`,
that the generated export returned a nonempty `cleanupToken`, and that manifest counts exactly match
the compact export counts (including the terminal manifest record). It then runs `pnpm exec
agent-blackboard snapshot partition --path <path> --cleanup-token <cleanupToken> --checksum <sha256>
--sessions <count> --entries <count> --records <count> --bytes <count>` once, passing the returned
cleanup capability, checksum, and all four counts. The omitted-path export is an absolute
`agent-blackboard-snapshot-*.jsonl` file directly under the system temp directory; the partitioner
creates read-only JSONL partitions in its own `agent-blackboard-partitions-*` temp directory,
containing at most 25 contiguous session groups or 1 MiB each. Do not pass the original snapshot to
subagents.

Delegate partitions only to read-only inspector subagents, passing each the `retroCutoff` and
`sessionCutoff` computed above. On Codex, dispatch inspectors through the `explore` agent
(`gpt-5.6-luna`, `sandbox_mode = "read-only"`) — never the `implementation` agent's `gpt-5.6-terra`
profile, which has no read-only sandbox and may edit files. On Claude Code, dispatch the built-in
`Explore` subagent (its tool set already excludes `Edit`/`Write`/`NotebookEdit`, unlike a
`general-purpose` subagent) on the `haiku` model, with a plain descriptive name per partition (for
example `inspect-p01`) rather than a proper-noun identity: this role is read-only classification
plus light summarization, exploration-tier work, not implementation-tier. Grok, Cursor, and
OpenCode dispatch conventions are unspecified here. Before reading any entry by hand, each subagent
runs `node dev/retrospective-distill.mts <partition> --retro-cutoff <retroCutoff> --session-cutoff
<sessionCutoff>` against its assigned partition — a read-only, pure-local classifier that needs no
MCP call — and hand-reads only the sessions it reports as `journal-only` or `retrospective`; every
other shape below is fully determined structurally and needs no entry content inspection. Each
subagent then returns one compact disposition summary: partition index, deduplicated evidence
themes — each carrying the session IDs that contributed to it, a mapping the root preserves through
every later merge and deduplication — and each session's disposition. Classify a session's entries
by `data.type`, per `dev/retrospective-save/retrospective-entry.mts` (`data.type === "retrospective"`
marks a retrospective entry), `dev/journal-checkpoint/checkpoint-entry.mts` (`isCheckpointEntry`
marks a mechanically auto-appended journal entry via a structural `data.checkpoint` field, never the
rendered `## Auto-append: ` heading), and
[agent-blackboard.md](../../../docs/development/agent-blackboard.md) (the CLI's `--file` convenience
omits `type` entirely). A session is an **entry-type-unresolved** session when it has at least one
entry whose `type` is missing or is anything other than `"journal"`/`"retrospective"` — even if it
also has a retrospective entry — report it separately and give it no issue-filing pass or archival
this run, regardless of its age, rather than treating an untyped entry as journal evidence; a
**retrospective** session when it has a retrospective entry and no unresolved entry; a
**checkpoint-only** session when it has at least one entry, no retrospective entry, and
every entry satisfies `isCheckpointEntry` (journal auto-append noise, #9337); a **journal-only**
session when it has at least one entry, no retrospective entry, and at least one entry is not a
checkpoint; a **zero-entry-child** session when it has no entries and a non-null `parentSessionId`;
and a **zero-entry-root** session when it has no entries and a null `parentSessionId`. The
zero-entry split names a session-topology fact, not a completion signal: a delegated child that dies
mid-task is a `zero-entry-child` session too, indistinguishable here from one that finished its
bounded assignment cleanly (see [the `blackboard` skill](../blackboard/SKILL.md)'s child
`session_ensure` handshake) — do not read `zero-entry-child` as "completed normally". Compute
`retroAt` as the newest retrospective entry's `createdAt`, and `lastActive` as
`session.lastEntryAt ?? session.createdAt`. Every shape except entry-type-unresolved is **eligible**
when `(has a retrospective AND retroAt < retroCutoff) OR (lastActive < sessionCutoff)` — eligible on
session age alone covers a checkpoint-only, journal-only, or zero-entry session that has simply gone
stale, which is the case a retro-only gate used to leave stuck forever. Everything else is **not yet
eligible** and must be skipped, with a reason. The subagent must not invoke MCP, create issues,
archive sessions, edit files, or retain a copy of the partition.

The root agent merges the summaries — preserving each theme's contributing session IDs through
merging and deduplication — performs the current-repository and duplicate checks below, then creates
or updates issues. Journal-only, zero-entry-child, and zero-entry-root evidence get full
issue-filing rights, subject to the same duplicate, current-state, and dependency-skip checks as
retrospective evidence, plus the
redaction pass in [distilling.md](distilling.md): never quote a journal entry's raw command string or
stderr verbatim in an issue body, since a journal checkpoint (unlike a retrospective, written under
the canonical evidence-minimization boundary) can carry unredacted secrets. An entry-type-unresolved
session gets no issue-filing pass this run.

Before archiving an eligible session, re-read its current `lastEntryAt` and compare it to the value
captured at export time; if it advanced, the session was resumed since the snapshot, and it must be
skipped for archival this run and reconsidered next round. Archive every eligible session after all
issue work completes, whether or not it produced a theme: no actionable content is a disposition, not
a deferral. Two exceptions, both keyed by the theme→session-ID mapping above: skip archival for
exactly the sessions that contributed to a theme whose issue mutation failed this run (they remain
eligible next round), and skip archival for a session whose only themes were deferred — a
recently-fixed-dependency skip ([distilling.md](distilling.md) step 6) or a kept-eligible
PR-creation-feedback theme (below) — since deferral promises re-evaluation next round and archival
would foreclose it. In a `finally` cleanup path owned by the root, run `pnpm exec
agent-blackboard snapshot cleanup --directory <path> --path <path> --cleanup-token <cleanupToken>`;
or, if partitioning failed before a directory was returned, run cleanup with the validated snapshot
path and cleanup token alone. Cleanup happens after summary merging even when no session is eligible
for archival.

Cluster journal and retrospective findings by root cause. A journal item that already names an open
issue is skipped unless a retrospective supplies genuinely new evidence; a closed or superseded
target is eligible again. For every actionable theme, search open issues and open changes, prefer
adding evidence to an existing open issue, and use the local issue agent for a new one. Recent
first-party releases, explicit rejections, completed work, and existing coverage are skips, with a
reason.

Archive every eligible session after all issue work completes (see the eligibility rule above,
including its recheck-before-archive and deferred/failed-theme carve-outs). Report created, updated,
not-yet-eligible, entry-type-unresolved, deferred, and archived counts plus reasons, broken out by
eligible-with-retro vs. eligible-stale (splitting eligible-stale into checkpoint-only, journal-only,
zero-entry-child, and zero-entry-root). Do not ask the user for subset or style; the local summary is
the record of the complete run.

Use the hosted `agent-blackboard` connection documented in
[agent-blackboard.md](../../../docs/development/agent-blackboard.md), then follow
[distilling.md](distilling.md) for Vouchington grouping and disposition policy. Create any issue via
[github-issue](../github-issue/SKILL.md), not by bypassing local taxonomy and duplicate checks.
Keep deferred PR-creation-feedback themes eligible; re-evaluate a theme that names an issue, a PR,
or a tracking issue closed without merging instead of treating its open state alone as conclusive.
