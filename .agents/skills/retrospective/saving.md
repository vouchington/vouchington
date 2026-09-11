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

`date`, `issues`, and `prs` are parsed by `dev/retrospective-save.mts save` and stored as typed
fields on the agent-blackboard entry (`data.date`, `data.issues`, `data.prs`); `description`,
`session_id`, and `worktree` are not extracted separately — they stay readable only inside the
entry's stored `markdown` field. All six are the durable provenance that `retrospective-distill`
copies into GitHub issue bodies — keep them accurate and complete.

## Title

The title should be `Retrospective: PR #s - [session description]`. This is a heading inside the
markdown body (`# Retrospective: <title>`), not a separate stored field.

## File structure

```markdown
---
<front matter>
---

# Retrospective: <title>

## Verifiable Facts

<facts prepared under the canonical retrospective evidence boundary>

## Transcript Facts

<transcript facts prepared under the canonical retrospective evidence boundary>

## CI Failures

Status: <failures observed|none observed|unavailable (reason)>

<required failure groups when failures were observed>

## Findings

## Plan vs Actual

## First-Party Dependency and Tool Feedback

## Scheduled Prompt Suggestions

## PR Creation Feedback

## Sandbox & Permission Audit
```

`## Plan vs Actual`, `## First-Party Dependency and Tool Feedback`, `## Scheduled Prompt Suggestions`, and
`## PR Creation Feedback` are the [SKILL.md](SKILL.md) conditional sections — include each only when
it fires; omit it entirely otherwise. `## Sandbox & Permission Audit` is optional too — derive it
from the default `node dev/session-friction/report.mts [--root-codex]` output under the canonical evidence boundary,
and include it only when the friction log has events.

If you proactively made a GitHub issue already as a follow-up task, link it in the relevant section.

## What `retrospective-save.mts save` does

For non-root or ambient identity, use
`node dev/retrospective-save.mts save --file <staged-path> [--session-id <id>] [--parent-session-id <id>] [--agent <name>]`.
For interactive root Codex, use
`node dev/retrospective-save.mts save --file <staged-path> --root-codex [--new-root-codex-session] [--agent codex]`.
The command:

1. Reads the staged file and rejects it if empty or not valid UTF-8.
2. Runs `validateRetroDoc` (see [fact-contracts.md](fact-contracts.md)) and rejects a malformed
   `## CI Failures` section before any agent-blackboard call.
3. Parses the front-matter `date`/`issues`/`prs` fields; rejects a missing/unclosed front-matter
   block or a non-array `issues`/`prs`.
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
5. If a `type:"retrospective"` entry already exists for this session, reports its `createdAt` and
   skips the duplicate append — safe to re-run. This is the backstop; `check` is the cheap precheck
   meant to catch it first.
6. Otherwise appends a `type:"retrospective"` entry (`{ markdown, issues, prs, date }`) and reads
   entries back to confirm the new entry actually persisted.

Any failure past argument parsing hard-fails: nonzero exit, `Error: <message>` on stderr, and (when
the failure happened after a staged file was supplied) a `Replay with: node
dev/retrospective-save.mts save --file '<path>' [--session-id '<id>'] [--agent '<name>']` line. There is no filesystem
fallback — fix the staged file or bring the [blackboard](../blackboard/SKILL.md) stack back up, then
rerun the printed replay command. Never write the retro anywhere else.

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
blackboard outage does not lose the session's only chance at a retrospective. `save`'s hard-fail +
replay contract remains the backstop either way.
