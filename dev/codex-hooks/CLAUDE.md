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
  Claude-compat; Cursor does too), `.codex/rules/default.rules`, `.cursor/cli.json`.
  Codex allow prefixes run outside its OS sandbox; every allow must be covered by Claude
  `sandbox.excludedCommands` (enforced by `dev/agent-sandbox-config.test.mts`).
  `.claude/settings.json` is the sole Claude/Cursor/Grok hook source: never add `.cursor/hooks.json`
  or `.grok/hooks/`. Hook code holds only what none of them can express. Every Claude deny must
  hold under Grok's prefix matcher (`dev/claude-settings-grok-bash-deny.test.mts`).
- A PreToolUse block exits 2 with the reason on stderr. Cursor also needs the deny JSON on stdout;
  keep both streams in the shared result instead of adding a runtime-specific hook entrypoint.
- Block coarsely, allow precisely. Any block in the command beats an allow. The only allow is a
  single plain merge in an attended Claude session; it needs a positive attended signal, never
  merely the absence of `CI`.
- Policy decisions are local: `dev/codex-hooks` uses no shell child-process APIs and runs no `gh`,
  git network subcommands, or HTTP (`ast-grep-rules/codex-hooks-no-network.yml`).
  [`local-process.mts`](local-process.mts) is the sole child-process owner and exposes only closed,
  operation-specific local commands; hook modules never import `child_process` directly, and the
  boundary exposes no generic executable or argv. Add a typed operation there instead of parsing a
  command line in an AST rule. Network-backed checks belong in the validators or CI.
  Journal checkpoints (`dev/journal-checkpoint`) may write to agent-blackboard from a hook because
  they fail open and never affect an allow or block.
- Do not duplicate enforcement another owner has (oxlint `max-lines`, no-mistakes doc size, CI).
