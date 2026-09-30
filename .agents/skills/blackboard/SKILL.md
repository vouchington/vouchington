---
name: blackboard
description: Read or record Vouchington session findings in agent-blackboard.
---

# Vouchington Blackboard Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:blackboard`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/blackboard/SKILL.md`. Resolve supporting resources relative
to their owning skill directories. If the canonical skill cannot be read, stop and report the missing
prerequisite; never apply this overlay alone. It owns the tool contract: the seven tools, what
`sessionId` means for each, the `journal_append` envelope, retry, and the distillation flow. This
overlay adds only repository policy.

## Vouchington additions

Every harness registers the project MCP server `vouchington-tooling` (`vouchington mcp`, launched
from this worktree's `node_modules/.bin`) and approves its tools server-wide; see
[agent-blackboard.md](../../../docs/development/agent-blackboard.md). Call only that server's tools
(`mcp__vouchington-tooling__*` in Claude Code).

- **Never call `mcp__plugin_agent-blackboard_*` tools.** They are the provider plugin's raw tools.
  Its `entry_append` skips the feedback envelope (source identity, outcome, coverage, repository
  attribution, and the outbox), so the entry would be unvalidated and could not be retried
  exactly. Vouchington does not enable that plugin; ignore it if a user-level install offers it.
- **`sessionId` comes from the SessionStart hook.** `dev/check-blackboard.mts` prints
  `Blackboard sessionId: <id>` at every session start, including after compaction. Pass that value
  verbatim wherever a tool takes `sessionId`. It is the same id `dev/agent-session-id/resolve.mts`
  gives the repository scripts, including an interactive root Codex session. If the line reads
  `NOT RESOLVED` or is missing, never guess or reuse another session's id; stop journaling and
  report it.
- **`repositories` defaults to `["vouchington/vouchington"]`.** When the note concerns other
  repositories, list each of them, including `vouchington/vouchington` when it also applies.
- **`mode` is `interactive` for an attended session and `autonomous` for an automation runner.**
  Interactive mode retains a failed delivery in the worktree outbox and reports it as pending.
  Autonomous mode has no outbox, so a failed delivery is an error to report.
- **Retrospectives still go through `node dev/retrospective-save.mts`.** It validates the
  retrospective document and writes to the same worktree outbox that `outbox_status` and
  `outbox_flush` cover.

## Mandatory journal triggers

Append a journal entry immediately, not at session end, when a check or CI run fails, a command is
denied or escalated, implementation leaves the accepted plan, a second fix push lands on one PR, a
doc/tool/skill gap costs more than one turn, or `no-mistakes` fails or returns a surprising result.
Use this one-line grammar, then optional brief prose:

```
- `recurring|one-off` — <finding> — <file path(s)> — <evidence: PR / commit / exact command> — <issue #N|none>
```

Journal the observation before filing or commenting through
[github-issue](../github-issue/SKILL.md). Append its issue disposition afterward; a one-off or
unavailable filing uses `none`. Capture first-party tool and sandbox failures with the observed
command boundary, sanitized diagnostic, occurrence count, and disposition. Architectural findings
need a concrete affected path, an observed contract mismatch, and evidence; distinguish a finding,
`none observed`, and `not assessed` or `unavailable`. Automatic checkpoints are only a fail-open safety net, never a substitute for this
contemporaneous record.

## Credential failures

Never search shell profiles, `env`, or `.env*` files for a credential; never print, inline, export,
or probe its value. Check presence only with `[ -n "${VAR+x}" ] && echo SET || echo UNSET`.
A sandbox denial is expected and is not a recovery target. A missing or stale credential blocks
hosted delivery. In interactive mode `journal_append` retains the sanitized entry in the worktree
outbox and reports it as pending; do not silently drop it or invent another fallback. Ask the user
to refresh the connection when needed and to restart the MCP client (a newly exported value does not
reach a running server), then call `outbox_flush`. Saturation and persistence failure require
reporting the concrete blocker.

## Server unavailable

If the `vouchington-tooling` tools are missing or a call reports the server is not connected, stop
and report it. Do not fall back to a CLI command, a script, or a provider tool, and do not continue
work that depends on the journal. The SessionStart hook prints a `STOP WORK` line when the server
cannot launch from this worktree. The fix is a workspace-setup step, not a deployment outage: run
`./dev/initialize monorepo` from the worktree root, then reconnect with `/mcp` in Claude Code or
restart Codex, and start a fresh session.

## Recording an entry

Make one `journal_append` call and pass the note as `markdown`; no temporary file or replay command
is involved. Fix the ISO 8601 `timestamp` before the first attempt, because a failed or timed-out
call returns no result to learn a server-generated one from. To retry, repeat the same call with the
same `sourceEventId`, content, and `timestamp`. The tool rejects a changed envelope under an
existing `sourceEventId`. Interactive `pending` means the outbox retained the entry: check the count
with `outbox_status` and deliver with `outbox_flush` once the deployment is reachable.

An autonomous runner's admission `journal_append` (after `session_ensure`, before it launches an
attempt) is the exception to reuse: give every attempt its own `sourceEventId`, for example one that
includes the attempt number. Repeating an earlier id returns the earlier receipt, which does not
prove a fresh write. Only a retry of the same attempt repeats its `sourceEventId`.

## Reading journal entries back

Call `journal_entries` with the `sessionId` to read. It returns `{ sessionId, entries }`: every
entry of that one session, of every type (journal, retrospective, and legacy), oldest first, each
with its full envelope (`type`, `repositories`, `sourceEventId`, and the rest). A zero-entry session
has no entries, which is not an error. Use it to find out whether the session already has a
retrospective and to keep an entry's repository tags. It reads one session with no checksum or
manifest, so never distill from it; [retrospective-distill](../retrospective-distill/SKILL.md)
reads the exported snapshot file.

## Child identity for spawned agents

Pass the parent's own session id in the assignment prompt at spawn time. A spawned child needs its
own `sessionId` for every call, obtained in this order:

1. The `Blackboard sessionId:` line its own SessionStart hook printed, when the harness runs the
   hook for the child.
2. Otherwise its runtime environment: `CODEX_THREAD_ID` for Codex, read with
   `printenv CODEX_THREAD_ID`. This is the same id `dev/agent-session-id/resolve.mts` resolves.

The child then calls `session_ensure` with that id as `sessionId`, the parent id it was given as
`parentSessionId`, its own `agent` name, and its version, before any blackboard-aware or substantive
work. Its first `journal_append` also ensures the session, but `session_ensure` is the explicit
identity step. If the child finds no session identity, or the ensure fails, it stops and reports the
blocker instead of guessing an id, borrowing the parent's, or substituting its canonical task path.
A resolved id must satisfy the shared plain-token grammar (`isValidSessionId` in
`dev/agent-session-id/valid-id.mts`); never pass a path, URL, or synthesized value.

A Claude Code Agent-tool subagent is the one exception: Claude Code does not expose a session id
distinct from its parent's `CLAUDE_CODE_SESSION_ID`, so a subagent must never call `session_ensure`
with that inherited id as if it were a new child session — doing so reuses the parent's id as both
`sessionId` and `parentSessionId`, which the parent's already-ensured root session (`parentId:
null`) rejects. Its activity is already captured under the parent's own session (as a sidechain
transcript), so it journals only by asking the parent to append on its behalf, or treats this
protocol as inapplicable.
