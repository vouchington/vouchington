# System Dependencies

Host-level package installation and maintenance are owned by
[vouchington-machines](https://github.com/vouchington/vouchington-machines).
That host-only repository provisions developer machines. Voucha does not duplicate brew, apt,
cargo, Docker, or runtime installers.

Agent runtime policy (sandbox, approvals, models, plugins, MCP servers) is host-owned too. After
provisioning, run `./configure-agents.sh` from vouchington-machines (`--dry-run` first;
`./diagnose-agents.sh --repo <worktree>` to check drift). A profile that uses a dedicated
`HOME`, such as an automation profile, needs `--home <profile home>`. See [Agent Sandbox](agent-sandbox.md) for the
project/machine split.

## Product contract

Voucha expects the host repository to provide these capabilities:

- Node.js matching [`.nvmrc`](../../.nvmrc), pnpm, a current JDK, and the native build
  toolchain.
- Git, tmux, lsof, jq, ripgrep, fd, mkcert, GitHub CLI, and `mise`.
- Docker, PostgreSQL with pgvector and UUIDv7 support, and Playwright system dependencies for the full web stack.
- AWS CLI for diagnostics and the optional OpenTofu CLI when working in the separate
  `vouchington-infra` checkout.

The repository-owned [`.mise.toml`](../../.mise.toml) remains the version contract for CI-parity
tools such as shellcheck, actionlint, selene, zizmor, ripgrep, scc, lychee, and gitleaks.
`./dev/initialize` runs `mise install`, but installing or maintaining `mise` itself is a host
responsibility.

Claude Code cloud sessions have no host provisioning; [`./dev/claude-cloud`](../../dev/claude-cloud)
prepares their containers ([Claude Code cloud sessions](harnesses/claude-cloud.md)).

When a host tool is added, removed, or its operating-system installation changes, update the host
repository. Update this page only when Voucha's required capability or repository-owned version
contract changes.

GitHub Actions probes Playwright's Chromium system dependencies before browser installation. A
healthy host skips package-manager coordination; a failed probe repairs drift under the shared
host lock. Browser artifacts remain checkout-time dependencies because their version follows the
repository's pinned Playwright package.

## Initialize the checkout

After the host is provisioned, run `./dev/initialize` from the repository root (modes and
requirements: [Getting Started](README.md)). On macOS, `./dev/initialize web` starts the Homebrew
Homebrew PostgreSQL service only for the default local database target; an explicit `DATABASE_URL`
(including one from `~/voucha.env`) selects a custom target and suppresses that action. Bare libpq
variables such as `PGHOST` or `PGSERVICE` are rejected so initialization and runtime cannot select
different targets. Initialization never deletes host data when its free-space preflight fails.
