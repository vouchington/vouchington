# Agent hooks and harness config

- `dev/codex-hooks` is the shared Claude/Codex/Grok/Cursor policy engine; use [threat model](../../docs/development/agent-sandbox.md#hook-threat-model), [harness wiring](../../docs/development/agent-harness-parity.md), and [Vitest authoring](../../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks.
- Hooks prevent cooperative mistakes, not hostile bypass. Obfuscated/indirect forms (nested shells, xargs, eval, variable executables, reordered gh options, wrappers) remain out of scope.
- Prefer native permissions: `.claude/settings.json` (also Grok/Cursor), `.codex/rules/default.rules`, `.cursor/cli.json`. Every Codex outside-sandbox allow is covered by Claude `sandbox.excludedCommands` (`dev/agent-sandbox-config.test.mts`).
- `.claude/settings.json` alone owns Claude/Cursor/Grok hooks; never add `.cursor/hooks.json` or `.grok/hooks/`. Hook code covers only policy native config cannot express. Claude denies also hold under Grok prefix matching (`dev/claude-settings-grok-bash-deny.test.mts`).
- PreToolUse blocks exit 2 with stderr reason; Cursor also gets stdout deny JSON through the shared result, never a separate runtime entrypoint.
- Any block wins over allows. The only allow is a single plain merge in attended Claude, requiring a positive attended signal, never mere absence of `CI`.
- Policy has no network/shell child-process APIs. [`local-process.mts`](local-process.mts) alone exposes closed, typed, operation-specific local commands; no direct `child_process` imports or generic executable/argv boundary. Extend typed operations instead of AST command parsing; validators/CI own network checks (`codex-hooks-no-network.yml`).
- `dev/journal-checkpoint` may write fail-open Blackboard checkpoints because they never affect allow/block decisions.
- `PROTECTED_HOOK_*` in `policy/protected-hook-paths.mts` is the Edit/Write list. Claude and Cursor
  still deny writes to their settings files in the OS sandbox. A sandboxed git that dies on
  `unable to unlink old '.claude/settings.json'` leaves `HEAD` unchanged. Recover with
  `git reset --hard`, then rerun the command outside the sandbox.
- Do not duplicate existing oxlint line limits, no-mistakes doc limits, or CI enforcement.
