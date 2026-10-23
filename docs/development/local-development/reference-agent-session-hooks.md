# Agent Session Hooks

[Back to Dev Environment Reference](README.md#agent-session-hooks)

Every hook entrypoint under `dev/codex-hooks/` reads its stdin payload through
`hook-payload.mts`, which has no policy imports, so non-policy hooks never load the PreToolUse
policy. Cursor and Grok run the `.claude/settings.json` hooks through Claude-compat, and the payload
reader maps Cursor's dialect to Claude's ([harness parity](../agent-harness-parity.md)).

- **SessionStart** (`dev/check-fresh-base`, `dev/check-web-init`,
  `vouchington agent-blackboard session-start`): advisory context only. They report whether the branch is fresh against
  `origin/main` (unknown freshness is reported, never silently trusted, and the reset-or-rebase
  decision is made after Plan Mode), nudge `./dev/initialize web` before UI work, print the
  `Blackboard sessionId:` line and probe the hosted deployment
  ([availability check](../agent-blackboard.md#sessionstart-availability-check)).
- **PreToolUse** (`pre-tool-use.mts`): the policy hook. A block exits 2 with its reason on stderr. It
  is a guardrail, not a security boundary ([hook threat model](../agent-sandbox.md#hook-threat-model)).
  It enforces merge authority and native stack workflow. Use the structured `pr_create` and
  `pr_update` MCP tools for PR base and content validation, provenance, and Shepherd Journal
  preservation; raw `gh pr create`, `new`, and `edit` commands are not intercepted for those rules.
- **PostToolUse** (`post-tool-use-command.mts`): one merged hook that runs the tmux reminder
  in-process and is fail-open (any error is swallowed). No hook records session evidence or appends
  Blackboard journal entries; agents write their own
  ([blackboard skill](../../../.agents/skills/blackboard/SKILL.md)).
