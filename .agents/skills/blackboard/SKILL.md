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
`outbox_flush`, `session_ensure`, `snapshot_export`, `session_archive`) and
the journaling policy; do not restate them here or reload it once read. If neither copy can be
read, report the missing prerequisite and do not apply this overlay alone.

No repository registers an MCP server, plugin, or marketplace. vouchington-machines registers
`vouchington-tooling` for every harness on each machine and pre-approves
`mcp__vouchington-tooling__*`. The hosted deployment and delivery rules are in
[agent-blackboard.md](../../../docs/development/agent-blackboard.md).

## Vouchington additions

Retrospectives are saved only through the `retrospective_check` and `retrospective_save` tools (see the [retrospective skill](../retrospective/SKILL.md)), never `journal_append`.
Hooks do not journal on your behalf, so your contemporaneous entries are the only journal source.

The SessionStart hook prints `Blackboard sessionId: <id>`. Pass it as the explicit `sessionId` of
every tool. An id that the user or task assigns explicitly (for
example a child id its assignment names) wins over the printed line. When the line is absent, take the id from your own
harness only. Claude Code exports `CLAUDE_CODE_SESSION_ID` and Codex exports `CODEX_THREAD_ID`.
Cursor's SessionStart line is its only source. Grok's shell exports `GROK_SESSION_ID`, so use
that when the line is absent. If none of these resolves, do not journal: stop and
report that no session id is available (an automated run continues its primary work and reports
it, see Automated runs). Never guess, derive, or synthesize an id, and never read another
harness's variable or file.

Use `interactive` mode in a human-attended session and `autonomous` mode in an automated run.

## When the server is unavailable

Follow the canonical "When the server is unavailable" section. Vouchington
remediation, told to an interactive user first: if the server is not registered, run
vouchington-machines' `./configure-agents.sh`, check with `./diagnose-agents.sh --repo <checkout>`,
then reconnect (`/mcp` in Claude Code, or restart Codex). If it is registered but disconnected,
reconnect.
An automated run follows Automated runs below.

## Automated runs

An automated session (Auto Harness, scheduled, or shepherd) may not have the server: no repository
registers it, and an automation host only has it when its own home carries the machine
configuration. When it does not, the run continues its primary
work and does not stop at the first journal trigger. The canonical skill's "stop and report the
blocker" and "continue primary work only after persistence succeeds" apply to attended sessions,
not here.

Report in the final report, not as a failure of the task:

- that journaling was unavailable and why (server not connected, or delivery or
  readback failed);
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

Follow the canonical "Credential failures" section. An automated run reports instead of asking
(see Automated runs).

## Reading journal entries back

Use canonical `journal_entries` (policy item 7) and filter `data.type === "journal"`. Do not replace
validated retrospective persistence with `journal_append`.

## Child identity for spawned agents

Follow the canonical "Child identity for spawned agents" section, including its Claude Code
subagent exception. A spawned child resolves its session id from its runtime environment
(`CODEX_THREAD_ID` for Codex, `CLAUDE_CODE_SESSION_ID` for Claude Code). A resolved id must
satisfy `isValidSessionId` in `dev/agent-session-id/valid-id.mts`.
