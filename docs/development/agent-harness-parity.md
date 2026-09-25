# Agent Harness Parity — Claude, Codex, Grok, Cursor, and OpenCode

Local coding agents in this repository share one instruction source and one
policy runner. Grok does not get a copied `.grok/hooks`, `.grok/skills`, or
permission allowlist. It reuses Claude-compat plus the shared `dev/codex-hooks`
adapter. Cursor uses native `.cursor/` config plus thin `dev/cursor-hooks`
adapters over the same policy runner. See [`.grok/README.md`](../../.grok/README.md),
[`.cursor/README.md`](../../.cursor/README.md),
[`.opencode/README.md`](../../.opencode/README.md), and
[agent-workflow](../../.agents/skills/agent-workflow/SKILL.md).

## Reusable domain skills

The following local adapters are overlays, not standalone workflows:
`agent-workflow`, `blackboard`, `git-commit-checklist`, `github-actions-checklist`,
`github-issue`, `organize-github-issues`, `package-json-checklist`, `planning`,
`pr-description`, `retrospective`, `retrospective-distill`, `review-ci-logs`,
`review-github-issue-taxonomy`, `revisit-followups`, `stacked-prs`, and
`static-analysis-checklist`. The testing adapters are `vitest-test-authoring`,
`backend-vitest-test-authoring`, `web-vitest-test-authoring`, `playwright-authoring`,
`storybook-authoring`. The database adapters are `postgres-node-performance-tuning` and
`postgres-partitioning-uuid-v7`. The bijection between these adapters and
`.claude/skills` is enforced by `finite-set-consistency` (`.no-mistakes.yml`), not by a count
here — see [`.agents/catalog/README.md`](../../.agents/catalog/README.md) for the current list.

Claude Code and Codex load each canonical source from the `vouchington-workflow`,
`vouchington-testing`, or `vouchington-database` plugin. The local
`web-vitest-test-authoring` adapter maps to upstream `nextjs-vitest-test-authoring`; other adapter
names match their canonical skill. Grok, Cursor, and OpenCode load the same sources from
`node_modules/vouchington-tooling/skills/<name>/SKILL.md` and resolve its supporting resources
relative to that directory. Every adapter stops if its harness-specific canonical source cannot be
read; it must never apply its Vouchington overlay alone.
`blackboard` additionally reads the provider-owned skill from
`node_modules/agent-blackboard/dist/plugin/skills/agent-blackboard/SKILL.md` in every harness.
Vouchington keeps its existing project MCP registration and does not enable that provider plugin,
which would register a duplicate server.
The package also exposes upstream-only `dotnet-test-authoring`, `swift-test-authoring`,
`github-actions-authoring`, `npm-publishing`, and `test-authoring` skills. Native-client owners use
the first two in `vouchington/vouchington-clients`; Vouchington deliberately does not install local
adapters for them. Do not restate the package's or Vouchington's skill counts here — both drift with
every new skill; the reusable-domain-skills list above and `.agents/catalog/README.md` are the
sources of truth for what Vouchington has adapted.

```mermaid
flowchart LR
  claudeMd[CLAUDE.md] --> claude[Claude Code]
  claudeMd --> codex[Codex fallback]
  claudeMd --> grok[Grok native names]
  claudeMd --> cursor[Cursor CLI]
  claudeMd --> opencode[OpenCode]
  workflowPlugin[vouchington-workflow plugin] --> claude
  workflowPlugin --> codex
  testingPlugin[vouchington-testing plugin] --> claude
  testingPlugin --> codex
  databasePlugin[vouchington-database plugin] --> claude
  databasePlugin --> codex
  skills[.agents/skills local adapters] --> claude
  skills --> grok
  skills --> cursor
  skills --> opencode
  claudeHooks[.claude/settings.json] --> claude
  claudeHooks --> grokCompat[Grok Claude-compat]
  hookRunner[dev/codex-hooks] --> claudeHooks
  hookRunner --> codexConfig[.codex/config.toml]
  hookRunner --> grokCompat
  hookRunner --> cursorHooks[dev/cursor-hooks]
  cursorHooks --> cursorConfig[".cursor/"]
```

## Capability matrix

| Capability    | Claude                                                                                                                       | Codex                                                                                                       | Grok                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructions  | Nested `CLAUDE.md`                                                                                                           | `project_doc_fallback_filenames = ["CLAUDE.md"]`                                                            | Native `CLAUDE.md` / `Claude.md`. Do not add tracked `AGENTS.md`                                                                                                                                         |
| Skills        | Vouchington domain plugin + `.claude/skills` → `.agents/skills` overlays; blackboard also reads its installed provider skill | Vouchington domain plugin + Skill tool / local overlays; blackboard also reads its installed provider skill | `.agents/skills` overlays load installed Vouchington and agent-blackboard provider skills                                                                                                                |
| Custom agents | `.claude/agents/github-issue-agent.md`                                                                                       | `.codex/agents/*.toml`                                                                                      | Reuses the Claude agent via compat. Codex agents are not loaded                                                                                                                                          |
| Hooks         | `.claude/settings.json`                                                                                                      | `.codex/config.toml`                                                                                        | Reuses Claude hooks after camelCase + `deny` + 30s timeout                                                                                                                                               |
| Permissions   | `.claude/settings.json` allow/deny                                                                                           | `.codex/rules/default.rules`                                                                                | Reuses Claude permission strings via compat                                                                                                                                                              |
| Sandbox       | On, with `excludedCommands`                                                                                                  | `workspace-write`; prefixes stay sandboxed; extra roots include pnpm cache/state and no-mistakes cache      | Custom `workspace-write` in [`.grok/sandbox.toml`](../../.grok/sandbox.toml). Launch `--sandbox workspace-write`. Prefixes stay sandboxed; extra roots match Codex (pnpm cache/state, no-mistakes cache) |
| MCP           | `.mcp.json` enabled in `.claude/settings.json`                                                                               | `.codex/config.toml` `[mcp_servers]` with per-tool approvals                                                | Native `.grok/config.toml` with the exact `MCPTool(...)` allowlist                                                                                                                                       |
| Plugins / LSP | `enabledPlugins` marketplace                                                                                                 | Codex plugins                                                                                               | Separate Grok plugin model. Claude marketplace plugins do not load                                                                                                                                       |
| Session id    | `CLAUDE_CODE_SESSION_ID`                                                                                                     | `CODEX_THREAD_ID`                                                                                           | Hook `GROK_SESSION_ID` plus `.local/grok-session-id`. Main shell uses `GROK_AGENT` to select that persist file; pass `--session-id` for transcripts                                                      |
| Merge confirm | Silent `permissionDecision: allow` for one plain merge when attended; empty otherwise                                        | Empty hook output (best-effort)                                                                             | Empty confirm (best-effort, not guaranteed). Hard blocks emit `{decision: deny}`                                                                                                                         |
| Folder trust  | Always loads project settings                                                                                                | Loads project hooks                                                                                         | Project Claude hooks need `/hooks-trust`                                                                                                                                                                 |
| CI            | Local agent only                                                                                                             | Scheduled / dispatch / shepherd                                                                             | Out of scope while CI is being redone                                                                                                                                                                    |

Cursor and OpenCode use the same instruction and skill ownership model through their native
project surfaces:

Ambient Blackboard identity is owned by
[`dev/agent-session-id/resolve.mts`](../../dev/agent-session-id/resolve.mts). It consumes the
policy-neutral environment inspection from `vouchington-tooling`; transcript discovery deliberately
keeps its separate caller-owned order in `dev/retrospective-transcript-facts/resolve.mts`.

### Cursor capability surface

- Instructions: checked-in `CLAUDE.md`; do not add tracked `AGENTS.md`.
- Hooks: native [`.cursor/hooks.json`](../../.cursor/hooks.json) calls thin `dev/cursor-hooks`
  policy adapters.
- Sandbox: native [`.cursor/sandbox.json`](../../.cursor/sandbox.json), with documented
  localhost/private-network gaps.
- CI: local agent only.

### OpenCode capability surface

- Instructions: checked-in `CLAUDE.md` unless `OPENCODE_DISABLE_CLAUDE_CODE` is set; do not add
  tracked `AGENTS.md`.
- Hooks: no copied hook or skill tree.
- Sandbox: provider/client-managed local execution; the repository does not add a second sandbox
  policy.

## How Grok reuses Claude rules

Grok's Claude-compat loader already reads this repo's `.claude/settings.json`
hooks and permissions. Do not copy those files into `.grok/`. A second hook
source would double-fire.

Claude `permissions.deny` strings are also prefix-matched by Grok with no word
boundary. A deny must not be a prefix of a sanctioned command:
`Bash(git push --force)` matches the documented
`git push --force-with-lease` rebase push. Use a space-terminated pattern such
as `Bash(git push --force *)` for raw force-push with arguments, and a
leading-glob `Bash(*git push --force)` for the no-arg form. Leave
`--force-with-lease` itself un-denied so the PreToolUse hook can allow it.
`dev/claude-settings-grok-bash-deny.test.mts` locks this.

The shared runner still has to speak Grok's hook dialect:

- stdin uses `toolInput`, `toolName`, `sessionId`, and `toolResult`
- only `{decision: deny}` blocks PreToolUse; `{decision: block}` fail-opens
- default hook timeout is 5 seconds and fail-opens; the Claude PreToolUse
  command sets `timeout: 30`
- `GROK_SESSION_ID` / `GROK_HOOK_EVENT` override argv `claude` so
  Claude-compat still reaches the Grok deny adapter. `GROK_AGENT` is a
  main-shell marker only and is not used to choose hook deny vs block
- PreToolUse matcher lists both Claude names (`Bash|Write|Edit`) and Grok
  names (`run_terminal_command|search_replace`) so the policy hook fires
  even if Claude-compat name aliases are off

## Cursor native config

Cursor CLI does not use Claude-compat. Native files under [`.cursor/`](../../.cursor/README.md)
call thin adapters in `dev/cursor-hooks/` that reuse `dev/codex-hooks` policy:

- `sandbox.json` — Codex-equivalent `workspace_readwrite` extra roots and `networkPolicy.default: allow`
- `hooks.json` — `beforeShellExecution` emits `{permission: deny|allow|ask}`
- `mcp.json` — Agent Blackboard local wrapper; `cli.json` / `permissions.json` own its exact tool allowlists
- `worktrees.json` — `./dev/initialize monorepo` on Agents Window / `agent --worktree`
  via the generic `setup-worktree` command array. Do not use `setup-worktree-unix` with an
  array: Cursor CLI (`2026.08.11-e8db854`) treats that key as a script path and crashes.
- Session id — `CURSOR_AGENT` / `CURSOR_SESSION_ID` for hooks. Shell has no sessionStart env;
  persist `.local/cursor-session-id` is the no-flag journal path. Pass `--session-id` for transcripts.

Do not add tracked `AGENTS.md` or a second `.cursor/skills/` tree. Cursor already reads
`CLAUDE.md` and `.agents/skills`; reusable workflow overlays load their canonical skill from the
installed `vouchington-tooling` package.

## OpenCode local harness

OpenCode is a first-class local assistant. It already reads `CLAUDE.md` and
`.claude/skills` unless `OPENCODE_DISABLE_CLAUDE_CODE` is set. Do not copy
hooks, skills, or `AGENTS.md` into [`.opencode/`](../../.opencode/README.md).

- Config: [`opencode.json`](../../opencode.json) (`autoupdate: false`) uses its V1 `mcp` object for
  Agent Blackboard and exact `agent-blackboard_<tool>` allow permissions. Leave the local model unset;
  users `/connect`.

## Privacy

Grok is allowed only with `/privacy` coding-data and training opt-out enabled,
the same privacy-mode rule as Cursor, Codex, and Claude Code.

## Related

- [Agent Sandbox](agent-sandbox.md)
- [Agent Blackboard](agent-blackboard.md)
- [Merge Authority](merge-authority.md)
- [`.claude/README.md`](../../.claude/README.md)
- [`.cursor/README.md`](../../.cursor/README.md)
- [`.opencode/README.md`](../../.opencode/README.md)
- [`.codex/README.md`](../../.codex/README.md)
- [`.codex/config.toml`](../../.codex/config.toml)
- Project Grok workflows: [`.grok/workflows/`](../../.grok/workflows/) (orchestrators, not copied skills)
