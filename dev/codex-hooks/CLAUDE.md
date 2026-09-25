# Agent Hooks and Harness Config

`dev/codex-hooks` is the one policy engine for Claude, Codex, Grok, and Cursor. Threat model:
[agent-sandbox.md](../../docs/development/agent-sandbox.md#hook-threat-model). Per-harness wiring:
[agent-harness-parity.md](../../docs/development/agent-harness-parity.md).

Before adding or changing a Vitest test, fixture, or mock for these hooks, load the
[vitest-test-authoring skill](../../.agents/skills/vitest-test-authoring/SKILL.md).

## Scoped invariants

- Hooks catch a cooperative agent's honest mistakes; they are not a security boundary. Do not add
  parsing for obfuscated or indirect forms (nested shells, `xargs` placeholders, `eval`, variable
  executables, reordered gh options, wrapper grammars). Close such reports as out of scope.
- Native harness config first: `.claude/settings.json` permissions (Grok applies them through
  Claude-compat; never copy into `.grok/`), `.codex/rules/default.rules`, `.cursor/cli.json`.
  Hook code holds only what none of them can express. Every Claude deny must hold under Grok's
  prefix matcher (`dev/claude-settings-grok-bash-deny.test.mts`).
- Block coarsely, allow precisely. Any block in the command beats an allow. The only allow is a
  single plain merge in an attended Claude session; it needs a positive attended signal, never
  merely the absence of `CI`.
- Policy decisions are local: `dev/codex-hooks` runs no `gh`, no git network subcommands, and no
  HTTP (`ast-grep-rules/codex-hooks-no-network.yml`). Network-backed checks belong in the
  validators or CI. Journal checkpoints (`dev/journal-checkpoint`) may write to agent-blackboard
  from a hook because they fail open and never affect an allow or block.
- Do not duplicate enforcement another owner has (oxlint `max-lines`, no-mistakes doc size, CI).
