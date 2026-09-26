# Test And Tooling Directories

[Back to Monorepo Map](MONOREPO.md#test-and-tooling-directories)

These directories support packages and workflows. Some have package manifests; others are repo-level tooling without a manifest.

| Directory                                               | CLAUDE.md                                                                | Purpose                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [`.claude/`](../../.claude)                             | [`.claude/README.md`](../../.claude/README.md)                           | Claude Code commands, subagents, rules, settings, and local plugin references.                                  |
| [`.grok/`](../../.grok)                                 | [`.grok/README.md`](../../.grok/README.md)                               | Grok entrypoint. Reuses `CLAUDE.md` and Claude-compat; see [agent-harness-parity.md](agent-harness-parity.md).  |
| [`.cursor/`](../../.cursor)                             | [`.cursor/README.md`](../../.cursor/README.md)                           | Cursor CLI sandbox, MCP, permissions, and worktree setup. Hooks run from `.claude/settings.json`.               |
| [`.opencode/`](../../.opencode)                         | [`.opencode/README.md`](../../.opencode/README.md)                       | OpenCode entrypoint. Reuses `CLAUDE.md` and `.agents/skills`.                                                   |
| [`dev/`](../../dev)                                     | [dev/CLAUDE.md](../../dev/CLAUDE.md)                                     | Local development tooling — `initialize`, `tmux`, `stop-services`, `reset`, `status`, `cleanup`.                |
| [`.husky/`](../../.husky)                               | [.husky/CLAUDE.md](../../.husky/CLAUDE.md)                               | Git hooks (`commit-msg`, `post-checkout`, `post-merge`, `post-rewrite`).                                        |
| [`.github/workflows/`](../../.github/workflows)         | [.github/workflows/CLAUDE.md](../../.github/workflows/CLAUDE.md)         | CI/CD GitHub Actions workflows.                                                                                 |
| [`ci/`](../../ci)                                       | —                                                                        | CI-local reproduction and workflow support tools.                                                               |
| [`docs/`](..)                                           | —                                                                        | Repo documentation. Index: [docs/README.md](../README.md).                                                      |
| [`integration-tests/web/`](../../integration-tests/web) | [integration-tests/web/CLAUDE.md](../../integration-tests/web/CLAUDE.md) | Full-stack web integration tests that hit a real backend, Valkey, and DB.                                       |
| [`playwright/`](../../playwright)                       | [playwright/CLAUDE.md](../../playwright/CLAUDE.md)                       | Playwright config, fixtures, and helpers used by web E2E and visual snapshots.                                  |
| [`static-code-analysis/`](../../static-code-analysis)   | —                                                                        | Repo-specific static-analysis tools and invariant tests for CI wiring, docs, and shell checks.                  |
| [`test-helpers/`](../../test-helpers)                   | —                                                                        | Shared Vitest setup files, reporters, and fork-leak/fake-timer diagnostics reused across workspace test suites. |
| [`email-templates/`](../../email-templates)             | [email-templates/CLAUDE.md](../../email-templates/CLAUDE.md)             | React email templates and preview tooling consumed by backend email systems.                                    |
| [`seed/`](../../seed)                                   | —                                                                        | Seed CSV data (topics) consumed by `pnpm run db:seed`.                                                          |
