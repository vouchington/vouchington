# OpenCode configuration

OpenCode is a first-class local assistant in this repository. It does **not**
get copied hooks, skills, or `AGENTS.md`.

- Read checked-in `CLAUDE.md` files unless `OPENCODE_DISABLE_CLAUDE_CODE` is set.
- Skills load from [`.agents/skills/`](../.agents/skills) and Claude-compat
  [`.claude/skills/`](../.claude/skills).
- Project config: [`opencode.json`](../opencode.json) at the repository root (`autoupdate: false`). It
  registers the local Agent Blackboard wrapper in the V1 `mcp` object and allows exactly its eight
  current provider tools. Local users `/connect` for a provider; this tree does not pin a default model.
- Local review guidance: [`agent/code-review.md`](agent/code-review.md).
- CI code review uses the published
  [vouchington-tooling `opencode-code-review`](https://github.com/vouchington/vouchington-tooling/tree/main/.github/workflows/opencode-code-review.yml)
  reusable workflow, called once per provider from independent workflow files —
  [`opencode-zen-code-review.yml`](../.github/workflows/opencode-zen-code-review.yml) and
  [`opencode-openrouter-code-review.yml`](../.github/workflows/opencode-openrouter-code-review.yml)
  — so a stall in one reviewer can never hold the other's runs. It is purely advisory: it never
  approves, blocks, or gates a required check. Keep the local
  [`agent/code-review.md`](agent/code-review.md) in sync with that copy.
- CI reviewers: OpenRouter `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
  (`OPENROUTER_FREE_API_KEY`) and OpenCode Zen `opencode/muse-spark-1.3-contributor-free`
  (`OPENCODE_FREE_API_KEY`). Zen prompts/completions may train future Meta models; that is an
  accepted CI-only exception.
- Do not add `AGENTS.md`; OpenCode would prefer it over `CLAUDE.md`.
- Capability map: [agent-harness-parity.md](../docs/development/agent-harness-parity.md).
