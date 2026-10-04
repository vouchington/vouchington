---
name: blackboard
description: Read or record Vouchington session findings in agent-blackboard.
---

# Vouchington Blackboard Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:blackboard`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/blackboard/SKILL.md`. Every harness also reads the provider
mechanics in
`node_modules/agent-blackboard/dist/plugin/skills/agent-blackboard/SKILL.md`. Resolve supporting
resources relative to their owning skill directories. If either canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone. Vouchington keeps its
project MCP registration instead of enabling the provider plugin, which would register a duplicate
server.

## Vouchington additions

Use the hosted deployment and delivery rules in
[agent-blackboard.md](../../../docs/development/agent-blackboard.md). The supported local replay
path is `node dev/blackboard-journal.mts`; retrospective persistence still goes through
`node dev/retrospective-save.mts`. Codex, Claude, Cursor, Grok, and OpenCode each register the
same local MCP wrapper and preauthorize exactly the eight-provider-tool catalog documented there.

## Mandatory journal triggers

Journal only friction. Append a journal entry immediately, not at session end, when:

- a command is denied or escalated;
- a tool, doc or skill gap costs more than one turn;
- a first-party tool (`no-mistakes`, `pr-shepherd`, `dev/*` and `vouchington` commands) returns a
  surprising result.

A failed check, a failed CI run, a repeated fix push and leaving the plan are not triggers on their
own. The retrospective collects CI failures from its own sources, and its Plan vs Actual covers plan
changes. This list replaces the canonical skill's broader list of observations to capture. Use this
one-line grammar, then optional brief prose:

```
- `recurring|one-off` — <finding> — <file path(s)> — <evidence: PR / commit / exact command> — <issue #N|none>
```

Journal the observation before filing or commenting through
[github-issue](../github-issue/SKILL.md). Append its issue disposition afterward; a one-off or
unavailable filing uses `none`. Capture first-party tool and sandbox failures with the observed
command boundary, sanitized diagnostic, occurrence count, and disposition. Architectural findings
need a concrete affected path, an observed contract mismatch, and evidence; distinguish a finding,
`none observed`, and `not assessed` or `unavailable`. Hooks do not journal on your behalf, so this
contemporaneous record is the only source of journal entries.

## Credential failures

Never search shell profiles, `env`, or `.env*` files for a credential; never print, inline, export,
or probe its value. Check presence only with `[ -n "${VAR+x}" ] && echo SET || echo UNSET`.
A sandbox denial is expected and is not a recovery target. A missing or stale credential blocks
hosted delivery. In interactive mode use the supported writer so sanitized feedback
is retained durably and visibly pending. Do not silently drop it or invent another fallback. Ask the
user to refresh the connection when needed, then restart the MCP client or retry the supported
outbox flush. Saturation and persistence failure require reporting the concrete blocker.

## MCP procedure

MCP provides provider reads and explicit session management. Raw `entry_append` bypasses the
validated writer; use `dev/blackboard-journal.mts` for journal feedback and
`dev/retrospective-save.mts` for retrospectives. Repository hooks remain local and advisory.

## Script procedure

Write the concrete note to a UTF-8 file under `$TMPDIR`, then run:

```bash
node dev/blackboard-journal.mts append --file <note-file> \
  --mode interactive|autonomous \
  --source-event-id <id> \
  --work-outcome <outcome> \
  --coverage-status <status>
```

Pass `--coverage-source <source,...>` when naming inspected sources, and `--dropped-count <n>` when
the dropped count is not zero. Interactive mode also requires `--outbox-directory <path>`.
Autonomous mode must omit that flag. Stdout is one JSON delivery result: `delivered` is
acknowledged, and interactive `pending` means the supplied outbox retained the note while the
process still exits 0.

The script tags the entry and its session with `vouchington/vouchington`. When the note concerns
other repositories, pass one `--repository <owner/name>` per repository instead, including
`vouchington/vouchington` when it also applies.

For a non-root session pass explicit `--session-id <id>` unless the runtime environment already
supplies it, and for a child, `--parent-session-id <parent-id>`. An interactive root Codex invocation
always passes `--root-codex`. At the start of each new interactive root Codex session where
`CODEX_THREAD_ID` is absent, pass `--new-root-codex-session` exactly once with it; this ignores a
prior fallback and persists a new ignored `.local/codex-session-id`. All later root calls pass only
`--root-codex`; a real thread id always replaces the persisted value. This root-CLI identity is
independent from explicit session ids carried by automatic hook payloads. Never pass either root
flag from a child or detached process. On a nonzero exit, read `Error:` and `Replay with:` from stderr, fix the stated cause, and run the
replay command. Do not write the note to a different path instead. Replay preserves the source event id and the other flags.

When `CODEX_THREAD_ID` is absent, the runtime provides no signal from which tooling can infer the
new-session boundary. Omitting the one-time flag reuses stale identity; passing it twice fragments
one session. Rotate exactly once before any other root-aware call.

Choose at most one CLI identity override: an explicit `--session-id`, or interactive-root
`--root-codex`; the two flags are rejected together. A non-root runtime may still supply its
identity through the environment. Use one identity consistently for the task.

## Reading journal entries back

Use `entry_get({ sessionId, format: "json" })`, filter `data.type === "journal"`, and sort
oldest-first by `createdAt`; or run `node dev/blackboard-journal.mts entries [--session-id <id>]`
(`--root-codex` for interactive root Codex; include `--new-root-codex-session` exactly once only
when that root session first lacks `CODEX_THREAD_ID`).
A zero-entry session reports `No journal entries found` and is not an error. Other read failures use
the same hard-fail contract. Do not replace validated retrospective persistence with a raw append.

## Child identity for spawned agents

Pass the parent's own session id in the assignment prompt at spawn time — there is no separate
identity round-trip. A spawned child resolves its own session id from its runtime environment (for
example `CODEX_THREAD_ID` for Codex, `CLAUDE_CODE_SESSION_ID` for Claude Code) through the shared
`dev/agent-session-id/resolve.mts` identity policy, the same way any
other Vouchington blackboard consumer does, and calls `session_ensure` — or
`node dev/blackboard-journal.mts append` with `--file <note-file>`, `--parent-session-id <parent-id>`,
and the same feedback flags — using that resolved id, the parent id it was given, its own `agent`
name (`--agent` when the runtime
environment mixes harness identities), and its version before any
blackboard-aware or substantive work. If the runtime environment supplies no session identity, or
the ensure fails, the child stops and reports the blocker rather than guessing an ID, passing
`--root-codex`, or
substituting its canonical task path. A resolved id must satisfy the shared plain-token grammar
(`isValidSessionId` in `dev/agent-session-id/valid-id.mts`); never pass a path, URL, or synthesized
value to `session_ensure`.

A Claude Code Agent-tool subagent is the one exception: Claude Code does not expose a session id
distinct from its parent's `CLAUDE_CODE_SESSION_ID`, so a subagent must never call `session_ensure`
with that inherited id as if it were a new child session — doing so reuses the parent's id as both
`sessionId` and `parentSessionId`, which the parent's already-ensured root session (`parentId:
null`) rejects. Its activity is already captured under the parent's own session (as a sidechain
transcript), so it journals only by asking the parent to append on its behalf, or treats this
protocol as inapplicable.
