---
name: blackboard
description: Read or record Vouchington session findings in the session journal.
---

# Vouchington Blackboard Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-workflow:blackboard`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/blackboard/SKILL.md`. If neither source is readable,
report the missing prerequisite; never apply this overlay alone. The canonical skill owns the
MCP journal and outbox procedure and the evidence-minimization boundary.

## Vouchington additions

Vouchington's machine configuration registers the `vouchington-tooling` MCP server. Follow
[agent-blackboard](../../../docs/development/agent-blackboard.md) for the hosted connection. If
it is unregistered, use vouchington-machines' `./configure-agents.sh` and
`./diagnose-agents.sh --repo <checkout>`, then reconnect the MCP client. Do not add repository
MCP registration or a credential fallback.

The SessionStart hook prints `Blackboard sessionId: <id>`. An explicitly assigned child id takes
precedence; otherwise use the current harness's own `CODEX_THREAD_ID`,
`CLAUDE_CODE_SESSION_ID`, or `GROK_SESSION_ID` when the printed line is absent. Cursor uses its
SessionStart line. Never use another harness's id or synthesize one. An attended session uses
`interactive` mode; Auto Harness, scheduled, and shepherd runs use `autonomous` mode.

Hooks do not journal on the agent's behalf. Journal only friction as it occurs: denied or
escalated commands, first-party tool surprises, and each CI root cause. A repeated fix push or
plan change alone is not a trigger. The one exception is the merge-outcome note required by
[Close-out](../agent-workflow/git-and-prs.md#close-out).
Use the canonical sandbox block in `blackboard/SKILL.md`
and its journal grammar. For a GitHub Actions failure, include the affected check and run,
root diagnostic, disposition, and whether `no-mistakes` impact selected the failing test or
check. Retrospectives use `retrospective_check` and `retrospective_save` through the
[local retrospective adapter](../retrospective/SKILL.md), never `journal_append`.

For child identity follow the canonical `session_ensure` rule. If an automated run lacks the
server, report the missing journal and any pending outbox counts in its terminal report while
completing the primary work.
