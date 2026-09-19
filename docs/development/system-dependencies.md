# System Dependencies

Host-level package installation and maintenance are owned by
[vouchington-machines](https://github.com/vouchington/vouchington-machines).
That host-only repository provisions developer machines. Voucha does not duplicate brew, apt,
cargo, Docker, or runtime installers.

## Product contract

Voucha expects the host repository to provide these capabilities:

- Node.js matching [`.nvmrc`](../../.nvmrc), pnpm through Corepack, JDK 17 or newer, and the
  native build toolchain.
- Git, tmux, lsof, jq, ripgrep, fd, mkcert, GitHub CLI, and `mise`.
- Docker, PostgreSQL 18 with pgvector, and Playwright system dependencies for the full web stack.
- AWS CLI for diagnostics and the optional OpenTofu CLI when working in the separate
  `vouchington-infra` checkout.

The repository-owned [`.mise.toml`](../../.mise.toml) remains the version contract for CI-parity
tools such as shellcheck, actionlint, selene, zizmor, ripgrep, scc, lychee, and gitleaks.
`./dev/initialize` runs `mise install`, but installing or maintaining `mise` itself is a host
responsibility.

When a host tool is added, removed, or its operating-system installation changes, update the host
repository. Update this page only when Voucha's required capability or repository-owned version
contract changes.

GitHub Actions probes Playwright's Chromium system dependencies before browser installation. A
healthy host skips package-manager coordination; a failed probe repairs drift under the shared
host lock. Browser artifacts remain checkout-time dependencies because their version follows the
repository's pinned Playwright package.

## Initialize the checkout

After the host is provisioned, initialize Voucha from the repository root:

```bash
./dev/initialize monorepo
./dev/initialize web
pnpm exec playwright install chromium
```

`monorepo` installs JavaScript dependencies and pinned repository tools without starting Docker or
database services. `web` additionally configures ports, Valkey, PostgreSQL databases, migrations,
certificates, and local environment files.

On macOS, `./dev/initialize web` starts the Homebrew `postgresql@18` service only for the default
local database target. An explicit `DATABASE_URL`, including one loaded from `~/voucha.env`, selects
a custom target and suppresses that host-service action. Bare libpq target variables such as `PGHOST`
or `PGSERVICE` are rejected because the generated worktree environment and application use
`DATABASE_URL`; set that URL explicitly so initialization and runtime cannot select different targets.
Non-local database initialization and reset remain protected by the explicit opt-ins documented in
the [command catalog](../../dev/reference-command-catalog.md).

Before Node activation, initialization requires at least 5 GiB free on each distinct host
filesystem backing the worktree, home directory, and temporary directory. Web initialization also
checks the pnpm store and Docker storage when discoverable. The preflight reports remediation
commands but never deletes host data.

See [Getting Started](README.md) for the developer flow and
[Backend Setup](BACKEND-SETUP.md) for shared secrets and worktree configuration.
