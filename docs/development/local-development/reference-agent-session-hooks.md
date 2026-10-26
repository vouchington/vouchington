# Agent Session Hooks

[Back to Dev Environment Reference](README.md#agent-session-hooks)

The published `vouchington hook` command reads hook payloads and loads Voucha's rule table and
post-tool adapters from `dev/codex-hooks/policy.mts`. Cursor and Grok run the `.claude/settings.json`
hooks through Claude-compat; the published runner normalizes their payload dialects
([harness parity](../agent-harness-parity.md)). PreToolUse rejects empty or malformed JSON rather
than silently treating it as an empty tool call.

- **SessionStart** (`dev/check-fresh-base`, `dev/check-web-init`,
  `vouchington agent-blackboard session-start`): advisory context only. They report whether the branch is fresh against
  `origin/main` (unknown freshness is reported, never silently trusted, and the reset-or-rebase
  decision is made after Plan Mode), nudge `./dev/initialize web` before UI work, print the
  `Blackboard sessionId:` line and probe the hosted deployment
  ([availability check](../agent-blackboard.md#sessionstart-availability-check)).
- **PreToolUse** (`vouchington hook pre-tool-use`): the policy hook. A block exits 2 with its reason on stderr. It
  is a guardrail, not a security boundary ([hook threat model](../agent-sandbox.md#hook-threat-model)).
  It enforces merge authority and native stack workflow. Use the structured `pr_create` and
  `pr_update` MCP tools for PR base and content validation, provenance, and Shepherd Journal
  preservation; raw `gh pr create`, `new`, and `edit` commands are not intercepted for those rules.
- **PostToolUse** (`vouchington hook post-tool-use`): one merged hook that runs the tmux reminder
  and product edit checks and is fail-open (any error is swallowed). No hook records session evidence or appends
  Blackboard journal entries; agents write their own
  ([blackboard skill](../../../.agents/skills/blackboard/SKILL.md)).
