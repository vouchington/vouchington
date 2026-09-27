# Saving (full contract)

Full detail for [SKILL.md](SKILL.md). Covers the front-matter/title schema, the file structure
template, the provenance contract `retrospective-distill` depends on, and what the `check` precheck
does.

## Front matter

Include in the front matter of the staged doc:

- `date`: the date of the retrospective
- `description`: a brief description of the session
- `issues`: a list of issue numbers relevant to the retrospective
- `prs`: a list of PR numbers relevant to the retrospective
- `session_id`: the session ID, if available
- `worktree`: the name of the worktree where the session took place
- `work_outcome`: the generated terminal work outcome
- `feedback_coverage`: the generated object with `status`, `sources`, and `droppedCount`

`date`, `issues`, and `prs` are parsed by `dev/retrospective-save.mts save` and stored as typed
fields on the agent-blackboard entry (`data.date`, `data.issues`, `data.prs`); `description`,
`session_id`, and `worktree` are not extracted separately — they stay readable only inside the
entry's stored `markdown` field. The paired `work_outcome` and `feedback_coverage` fields are
validated through the shared envelope codec and stored as `data.workOutcome` and
`data.feedbackCoverage`. A document must supply both or neither. Keep durable provenance and
generated metadata accurate and complete.

## Title

The title should be `Retrospective: PR #s - [session description]`. This is a heading inside the
markdown body (`# Retrospective: <title>`), not a separate stored field.

## File structure

```markdown
---
<front matter>
---

# Retrospective: <title>

## Outcome

Work outcome: <terminal-outcome>
Feedback coverage: <coverage-status>
Dropped records: <count>

## Verifiable Facts

<facts prepared under the canonical retrospective evidence boundary>

## Transcript Facts

<transcript facts prepared under the canonical retrospective evidence boundary>

## CI Failures

Status: <failures observed|none observed|unavailable (reason)>

<required failure groups when failures were observed>

## Findings

## Plan vs Actual

## Tool Findings

Status: <findings|none observed (inspected scope)|not assessed (reason)|unavailable (reason)>

## Architecture Findings

Status: <findings|none observed (inspected scope)|not assessed (reason)|unavailable (reason)>

## Scheduled Prompt Suggestions

## PR Creation Feedback

## Sandbox & Permission Audit
```

`## Plan vs Actual`, `## Scheduled Prompt Suggestions`, and `## PR Creation Feedback` are
conditional sections — include each only when it fires. `## Tool Findings` and
`## Architecture Findings` are required with an explicit assessment status and inspected scope
or reason; findings require observations, evidence, and dispositions. The shared composer always
includes `## Sandbox & Permission Audit` with an explicit unavailable assessment when no friction
collector was provided. Derive observed evidence from the default
`node dev/session-friction/report.mts [--root-codex]` output under the canonical evidence boundary;
empty capture is not proof of absence.

If you proactively made a GitHub issue already as a follow-up task, link it in the relevant section.

## What `retrospective-save.mts save` does

For non-root or ambient identity, use
`node dev/retrospective-save.mts save --mode interactive --file <staged-path> [--session-id <id>] [--parent-session-id <id>] [--agent <name>]`.
For interactive root Codex, use
`node dev/retrospective-save.mts save --mode interactive --file <staged-path> --root-codex [--new-root-codex-session] [--agent codex]`.
These recipes preserve the composer's generated outcome and coverage metadata without repeating
it as flags. Explicit outcome or coverage flags may confirm that metadata, but contradictions
fail before delivery. A manually staged file without the paired metadata requires
`--work-outcome <terminal-outcome>` and truthful `--coverage-status`, repeated
`--coverage-source`, and `--dropped-count` flags; omitted coverage remains `not-assessed`.
Delivery mode is never read from the document.

The command:

1. Reads the staged file and rejects it if empty or not valid UTF-8.
2. Runs `validateRetroDoc` (see [fact-contracts.md](fact-contracts.md)) and rejects a malformed
   `## CI Failures` section before any agent-blackboard call.
3. Parses the front-matter `date`/`issues`/`prs` and paired generated metadata; rejects a
   missing/unclosed front-matter block, non-array references, or incomplete metadata pair.
4. Resolves the coherent session and agent identity through
   [`dev/agent-session-id/resolve.mts`](../../../dev/agent-session-id/resolve.mts): `--session-id`
   overrides its field, Claude and Claude-compat signals remain protected, and persisted Cursor/Grok
   identities are only fallbacks. An interactive root Codex session always passes `--root-codex`;
   an absent-thread new root session adds `--new-root-codex-session` exactly once before later calls reuse it;
   children never pass it and remain fail-closed without their own identity.
   Deterministic direct collisions resolve Codex, Grok, then Cursor;
   Claude-compat ambiguous sessions need `--session-id` explicitly; a fully detached process needs
   both `--session-id` and `--agent`. A real Claude Code
   session (`CLAUDECODE=1`) with no `CLAUDE_CODE_SESSION_ID` of its own fails closed instead of
   inheriting a foreign or persisted id, except for a genuine Grok Claude-compat process, whose
   `GROK_SESSION_ID` still resolves. It idempotently ensures the agent-blackboard session exists.
5. Builds the shared validated schema-version-1 retrospective envelope with repository attribution,
   a validated terminal work outcome and separate coverage from the staged metadata or explicit
   CLI flags. Conflicting metadata flags fail before delivery. The default source event ID is
   `retrospective-<session-id>`; a later task in the same session requires its own explicit
   `--source-event-id`. Use matching `check --source-event-id` to avoid hiding later task feedback.
6. Uses the shared writer for sanitization, attribution, append deduplication, and exact read-back.
   Date-derived timestamp and stable event identity make the same staged retrospective replayable.
   Explicit timestamps and every coverage/source/repository flag survive replay.

Interactive save uses `--mode interactive`; a hosted delivery outage returns visible pending state
only after the bounded private outbox durably preserves sanitized feedback. Inspect and flush through
`node dev/blackboard-journal.mts outbox-status|outbox-flush`. Autonomous terminal reporting uses
`--mode autonomous`, never an interactive fallback; a controller must also have enforced fresh
admission before work. A successful work outcome with blocked delivery is not fully reported.
Invalid content, identity conflicts, saturation, and persistence failure exit nonzero with `Error:`
and a pinned replay command. Do not discard pending records or claim acknowledged delivery.

`compose --input <json-file>` accepts the portable `RetrospectiveCompositionInput`: session and
repository identity, date and references, outcome and coverage, concise narrative, facts/transcript
collector options (or explicit unavailable reasons), and tool/architecture assessments. It generates
routine markers and facts plus validated `work_outcome` and `feedback_coverage` front matter,
then applies local document validation. Use observations with evidence and
disposition; `none-observed`, `not-assessed`, and `unavailable` remain distinct. No raw transcript
re-mining or routine hand-written lint narratives are required.

## What `retrospective-save.mts check` does

`node dev/retrospective-save.mts check [--session-id <id> | --root-codex [--new-root-codex-session]]` is the cheap precheck [SKILL.md](SKILL.md)
runs before any fact collection. It resolves the session id the same way `save` does and reads back
the session's existing entries — nothing more.

- `Retrospective already saved for agent-blackboard session <id> (entry created at <createdAt>).` +
  `Covered issues: <list|none>; prs: <list|none>.` — a `type:"retrospective"` entry already exists.
- `No retrospective saved yet for agent-blackboard session <id>.` — the session exists but has no
  retrospective entry.
- `No retrospective saved yet for agent-blackboard session <id> (session not created).` — the
  session itself was never created.

Both no-retrospective states exit 0 and share the `No retrospective saved yet` prefix; the precheck
branches on two prefixes, not three. Unlike `save`, `check` never creates the agent-blackboard session
— it is server-read-only, so running it costs nothing even for a session that will never get a
retrospective. `check --root-codex` may create or refresh the ignored local Codex persistence file.
Interactive root Codex always passes `--root-codex` here, to
`node dev/blackboard-journal.mts entries --root-codex`, and to
`node dev/session-friction/report.mts --root-codex`. Each root-aware read refreshes and reads back
the worktree-local Codex identity before its server request. An absent-thread new root adds
`--new-root-codex-session` to exactly the first root script call; children do none of them.

A failing `check` (missing token, unreachable server, invalid session id format) exits nonzero with
`Error: <message>` on stderr and no `Replay with:` line — there is no staged file to replay. This is
fail-open by design: [SKILL.md](SKILL.md) continues fact collection after a check failure, so a
blackboard outage does not lose the session's only chance at a retrospective. `save`'s explicit delivery mode and durable pending/read-back state remain the backstop either way.
