# Agent Session Hooks

[Back to Dev Environment Reference](README.md#agent-session-hooks)

Repository hooks are advisory: they add session context and format edited files, and none blocks a
tool call. Agent behavior is enforced by the harness's permission settings and auto mode
([agent sandbox](../agent-sandbox.md)). Cursor and Grok run the `.claude/settings.json` hooks
through Claude-compat ([harness parity](../agent-harness-parity.md)); Codex has its own
`.codex/config.toml` SessionStart hooks.

- **SessionStart** (`dev/check-fresh-base`, `dev/check-web-init`; Claude also prints the branch, `git status`, recent
  commits, and the current PR): advisory context only. They report whether the branch is fresh against
  `origin/main` (unknown freshness is reported, never silently trusted, and the reset-or-rebase
  decision is made after Plan Mode), nudge `./dev/initialize web` before UI work. The Blackboard session starts from the
  `vouchington-tooling` MCP tools, not a hook (the `vouchington-tooling` plugin provides them).
- **PostToolUse** (`dev/hooks/post-edit-lint.sh`, Claude, Cursor, and Grok): reads the edited path once and
  dispatches by extension: Oxlint `--fix`, an Oxlint report, and Oxfmt for JS and TS; `tsc --noEmit`
  for the owning project of a TS file; the offline link check for Markdown; `rustfmt` for Rust;
  `selene` for Lua. It always exits 0 and only the Oxlint report and link findings reach the agent.
  A second PostToolUse hook, `dev/hooks/post-edit-checks.mts` (plain `node`, no hook engine), warns
  as advisory context when a non-web test mocks an internal module, a `data-pw` value has no
  Playwright spec, or a new `backend/services/*/package.json` appears.
  No hook records session evidence or appends Blackboard journal entries; agents write their own
  ([blackboard skill](../../../.agents/skills/blackboard/SKILL.md)).
