# Test And Tooling Directories

[Back to Monorepo Map](MONOREPO.md#test-and-tooling-directories)

These directories support packages and workflows. Some have package manifests; others are repo-level tooling without a manifest.

| Directory                                               | AGENTS.md                                                                | Purpose                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [`.claude/`](../../.claude)                             | [`.claude/README.md`](../../.claude/README.md)                           | Claude Code commands, subagents, rules, settings, and local plugin references.                                  |
| [`.grok/`](../../.grok)                                 | [`.grok/README.md`](harnesses/grok.md)                                   | Grok entrypoint. Reuses `AGENTS.md` and Claude-compat; see [agent-harness-parity.md](agent-harness-parity.md).  |
| [`.cursor/`](../../.cursor)                             | [`.cursor/README.md`](harnesses/cursor.md)                               | Cursor CLI sandbox, MCP, permissions, and worktree setup. Hooks run from `.claude/settings.json`.               |
| [`.opencode/`](harnesses/opencode.md)                   | [`.opencode/README.md`](harnesses/opencode.md)                           | OpenCode entrypoint. Reuses `AGENTS.md` and `.agents/skills`.                                                   |
| [`dev/`](../../dev)                                     | [dev/AGENTS.md](../../dev/AGENTS.md)                                     | Local development tooling — `initialize`, `tmux`, `stop-services`, `reset`, `status`, `cleanup`.                |
| [`.husky/`](../../.husky)                               | [.husky/AGENTS.md](../../.husky/AGENTS.md)                               | Git hooks (`commit-msg`, `post-checkout`, `post-merge`, `post-rewrite`).                                        |
| [`.github/workflows/`](../../.github/workflows)         | [.github/workflows/AGENTS.md](../../.github/workflows/AGENTS.md)         | CI/CD GitHub Actions workflows.                                                                                 |
| [`ci/`](../../ci)                                       | —                                                                        | CI-local reproduction and workflow support tools.                                                               |
| [`docs/`](..)                                           | —                                                                        | Repo documentation. Index: [docs/README.md](../README.md).                                                      |
| [`integration-tests/web/`](../../integration-tests/web) | [integration-tests/web/AGENTS.md](../../integration-tests/web/AGENTS.md) | Full-stack web integration tests that hit a real backend, Valkey, and DB.                                       |
| [`playwright/`](../../playwright)                       | [playwright/AGENTS.md](../../playwright/AGENTS.md)                       | Playwright config, fixtures, and helpers used by web E2E and visual snapshots.                                  |
| [`static-code-analysis/`](../../static-code-analysis)   | —                                                                        | Repo-specific static-analysis tools and invariant tests for CI wiring, docs, and shell checks.                  |
| [`test-helpers/`](../../test-helpers)                   | —                                                                        | Shared Vitest setup files, reporters, and fork-leak/fake-timer diagnostics reused across workspace test suites. |
| [`email-templates/`](../../email-templates)             | [email-templates/AGENTS.md](../../email-templates/AGENTS.md)             | React email templates and preview tooling consumed by backend email systems.                                    |
| [`seed/`](../../seed)                                   | —                                                                        | Seed CSV data (topics) consumed by `pnpm run db:seed`.                                                          |
