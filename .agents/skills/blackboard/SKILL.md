---
name: blackboard
description: Read or record Vouchington session findings in the session journal.
---

# Vouchington Blackboard Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:blackboard`. Read
`node_modules/vouchington-tooling/skills/blackboard/SKILL.md` instead when that plugin is not
installed (Claude cloud, an automated run) and in Grok, Cursor, and OpenCode. The canonical skill
owns the `vouchington-tooling` MCP procedure (`journal_append`, `journal_entries`, `outbox_status`,
`outbox_flush`, `session_ensure`, `snapshot_export`, `session_archive`), its **CLI fallback**, and
the journaling policy; do not restate them here or reload it once read. If neither copy can be
read, report the missing prerequisite and do not apply this overlay alone.

No repository registers an MCP server, plugin, or marketplace. vouchington-machines registers
`vouchington-tooling` for every harness on each machine and pre-approves
`mcp__vouchington-tooling__*`. The hosted deployment and delivery rules are in
[agent-blackboard.md](../../../docs/development/agent-blackboard.md).

## Vouchington additions

Retrospectives are saved only through `node dev/retrospective-save.mts`, never `journal_append`.
Hooks do not journal on your behalf, so your contemporaneous entries are the only journal source.

The SessionStart hook prints `Blackboard sessionId: <id>`. Pass it as the explicit `sessionId` of
every tool, and as `--session-id` to the CLI. When the line is absent, take the id from your own
harness only. Claude Code exports `CLAUDE_CODE_SESSION_ID` and Codex exports `CODEX_THREAD_ID`.
Cursor and Grok shells export no session id, so read the worktree-local file their SessionStart
hook persisted, the same source `dev/agent-session-id` uses: `.local/cursor-session-id` for
Cursor, `.local/grok-session-id` for Grok. If none of these resolves, do not journal: stop and
report that no session id is available (an automated run continues its primary work and reports
it, see Automated runs). Never guess, derive, or synthesize an id, and never read another
harness's variable or file.

Use `interactive` mode in a human-attended session and `autonomous` mode in an automated run.

## Falling back to the CLI

Search for `journal_append` by bare name before concluding the server is unavailable. When the
server is not registered or not connected, use the canonical skill's CLI fallback: a machine-installed
`vouchington` at a verified absolute path outside the worktree. Never resolve it through the
worktree's `node_modules/.bin`, `pnpm exec`, or a repository-controlled `PATH`; `pnpm exec
agent-blackboard` is not the fallback. A permission denial is not unavailability.

- **Tell whoever is watching.** An interactive agent tells the user when it falls back, in the
  same turn: MCP is unavailable and the CLI is in use. An automated session states the fallback in
  its final report.
- **No trusted CLI either.** Report the blocker (an automated run follows Automated runs below);
  do not run a repository-supplied executable.

## Automated runs

An automated session (Auto Harness, scheduled, or shepherd) may have neither the server nor a
trusted machine CLI: no repository registers either, and an automation host only has them when its
own home carries the machine configuration. When it has neither, the run continues its primary
work and does not stop at the first journal trigger. The canonical skill's "stop and report the
blocker" and "continue primary work only after persistence succeeds" apply to attended sessions,
not here.

Report in the final report, not as a failure of the task:

- that journaling was unavailable and why (server not connected, no trusted CLI, delivery or
  readback failed, or the sandbox withheld the credential and no unsandboxed run was approved);
- any pending outbox state, with `pendingCount` and `worktreePendingCount`, or that none was
  written (autonomous mode has no outbox, so a failed delivery is an error to report, not retry);
- each finding you would have journaled, in the one-line grammar below, so the caller can journal
  it.

## Mandatory journal triggers

Journal only friction. Append a journal entry immediately, not at session end, when:

- a command is denied or escalated;
- a tool, doc or skill gap costs more than one turn;
- a first-party tool (`no-mistakes`, `pr-shepherd`, `dev/*` and `vouchington` commands) returns a
  surprising result;
- a CI failure, once per root cause (see the CI block below).

A repeated fix push and leaving the plan are not triggers on their own. The retrospective's
`## CI Failures` is built only from the `GitHub Actions` blocks below, and its Plan vs Actual covers
plan changes. The one non-friction entry is the merge note that the
[Close-out rule](../agent-workflow/git-and-prs.md#close-out) asks for when the merge of a PR you
handed off changes the outcome: at most one per PR, appended with `journal_append`. This list
replaces the canonical skill's broader list of observations to capture. Use this one-line
grammar, then optional brief prose:

```
- `recurring|one-off` — <finding> — <file path(s)> — <evidence: PR / commit / exact command> — <issue #N|none>
```

A denied or escalated command uses this block grammar instead, one block per entry, because the
retrospective's `## Sandbox & Permission Audit` is built only from entries that match it:

```
- `sandbox-escalation` — <command and subcommand only: no paths, hosts, branches or secrets> — <what needed elevated access>
  - Outcome: requested|approved|denied|unknown
  - Evidence: <sanitized denial or approval text>
  - Disposition: <allowlist change, issue #N, or none>
```

Use `sandbox-failure` (a sandbox refusal) or `ambiguous-failure` (a failure whose cause is unclear)
in place of `sandbox-escalation` for a command that failed without an escalation; those blocks omit
the `Outcome` line.

A CI failure uses this block grammar instead, one block per root cause, not per run. A flake counts,
even one that passed on a later run with no code change. Record whether it was flaky, the gotcha, how
to get passing CI in fewer commits, and whether the `no-mistakes` test impact assessment selected the
failing test or check:

```
- `recurring|one-off` — `GitHub Actions` — <check name>: <gotcha, or flaky: <test>>
  - Evidence: <run URL and commit>
  - Root diagnostic: <root cause; for a flake, the nondeterminism observed>
  - Disposition: no-mistakes impact: selected|missed (<gap>)|n/a (<why>); <fix commit, issue #N, or none>
```

Agents should know every test to update without running the whole suite locally, and the impact
assessment is how. A failure in a test it did not name is `missed (<gap>)`, a `no-mistakes` gap: fix
the impact rules or file an issue, never "run the full suite locally". A flake that `no-mistakes` ran
and that passed locally is `selected`, recorded as a flake. `n/a (<why>)` is only for a failure with
no test or check logic behind it, such as a cancelled run or a runner outage; a test or check that
failed on its own is always `selected` or `missed`.

Journal the observation before filing or commenting through
[github-issue](../github-issue/SKILL.md). Append its issue disposition afterward; a one-off or
unavailable filing uses `none`. Capture first-party tool and sandbox failures with the observed
command boundary, sanitized diagnostic, occurrence count, and disposition. Architectural findings
need a concrete affected path, an observed contract mismatch, and evidence; distinguish a finding,
`none observed`, and `not assessed` or `unavailable`.

## Credential failures

Never search shell profiles, `env`, or `.env*` files for a credential; never print, inline, export,
or probe its value. Check presence only with `[ -n "${VAR+x}" ] && echo SET || echo UNSET`.
A sandbox denial is expected and is not a recovery target. A missing or stale credential blocks
hosted delivery. In interactive mode the writer retains sanitized feedback in its durable outbox,
visibly pending: do not silently drop it or invent another fallback. Ask the user to refresh the
connection when needed, then restart the MCP client or call `outbox_flush`. Saturation and
persistence failure require reporting the concrete blocker. The fallback CLI needs the token for
delivery and readback: follow the canonical skill's per-run unsandboxed approval, and never read,
print, copy, or export the token to get around the sandbox. An automated run reports instead of
asking (see Automated runs).

## Reading journal entries back

Call `journal_entries({ sessionId })`: it returns `{ sessionId, entries }`, every entry of the
session with its envelope, oldest first. Filter `data.type === "journal"`. The CLI fallback is
`journal entries --session-id <id>`. A zero-entry session is not an error. Do not replace validated
retrospective persistence with `journal_append`.

## Child identity for spawned agents

Pass the parent's own session id in the assignment prompt at spawn time. A spawned child resolves
its own session id from its runtime environment (for example `CODEX_THREAD_ID` for Codex,
`CLAUDE_CODE_SESSION_ID` for Claude Code) through the shared
`dev/agent-session-id/resolve.mts` identity policy, the same way any other Vouchington blackboard
consumer does, and calls `session_ensure` with that resolved `sessionId`, the `parentSessionId` it
was given, its own `agent` name, and its version before any blackboard-aware or substantive work.
If the runtime environment supplies no session identity, or the ensure fails, the child stops and
reports the blocker rather than guessing an ID or substituting its canonical task path. A resolved
id must satisfy the shared plain-token grammar (`isValidSessionId` in
`dev/agent-session-id/valid-id.mts`); never pass a path, URL, or synthesized value to
`session_ensure`.

A Claude Code Agent-tool subagent is the one exception: Claude Code does not expose a session id
distinct from its parent's `CLAUDE_CODE_SESSION_ID`, so a subagent must never call `session_ensure`
with that inherited id as if it were a new child session — doing so reuses the parent's id as both
`sessionId` and `parentSessionId`, which the parent's already-ensured root session (`parentId:
null`) rejects. Its activity is already captured under the parent's own session (as a sidechain
transcript), so it journals only by asking the parent to append on its behalf, or treats this
protocol as inapplicable.
