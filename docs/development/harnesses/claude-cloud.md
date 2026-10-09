# Claude Code Cloud Sessions

Claude Code cloud sessions run in disposable Anthropic-hosted Ubuntu containers as root. They clone
the repository fresh and load [`.claude/settings.json`](../../../.claude/settings.json) hooks, but
nothing from [vouchington-machines](https://github.com/vouchington/vouchington-machines) provisions
the host. The image's default Node.js is older than [`.nvmrc`](../../../.nvmrc), so `pnpm install`
fails the `engines` check until the container is prepared.

## Prepare a session

From the repository root inside the session:

```bash
./dev/claude-cloud            # backend (default)
./dev/claude-cloud monorepo   # lint and unit tests only
./dev/claude-cloud web        # full web stack initialization
```

[`dev/claude-cloud`](../../../dev/claude-cloud) supplies what host provisioning owns elsewhere, then
runs [`./dev/initialize`](../../../dev/initialize) with the requested mode:

- Node.js from `.nvmrc` through the image's preinstalled nvm, plus pnpm and mise from npm. Each
  binary is linked into `~/.local/bin`, which precedes the image's Node.js on `PATH`, so later
  shells and hooks use the pinned runtime without sourcing nvm.
- For `backend` and `web`: the Docker daemon, which the image installs but does not start, and
  CI's digest-pinned PostgreSQL image on `127.0.0.1:5432`, exported to `./dev/initialize` as an
  explicit `DATABASE_URL` the same way the
  [initialize smoke test](../../../.github/workflows/initialize-smoke-test.yml) does. Image pins
  are read from their owners rather than repeated.
- Images are pulled through `mirror.gcr.io` and retagged, because anonymous Docker Hub pulls from
  shared cloud egress are rate-limited.
- After initialization, the `.mise.toml` tool shims are linked into `~/.local/bin`.

The script refuses to run unless `CLAUDE_CODE_REMOTE=true`. Every step is idempotent. Rerun it
when a session resumes on a rebuilt VM, because the Docker daemon and containers do not survive.

A fresh cloud clone is not a linked worktree, so the dev scripts treat it as main: it uses the
shared `voucha` database and Valkey names, and the main-reset guards apply.

## Environment setup script

The cloud environment's setup script runs as root before Claude Code launches, and its filesystem
result is cached for later sessions. Running `VOUCHA_CLAUDE_CLOUD=1 ./dev/claude-cloud monorepo`
from the clone there caches Node.js, pnpm, mise, and dependencies. Background processes are not
cached, so run `./dev/claude-cloud backend` or `web` in the session when services are needed.

## Known limits

- The VM kernel boots with IPv6 disabled. The shared API test server prefers `::1` and falls back
  to `127.0.0.1` there; other code that binds `::1` explicitly fails with `EAFNOSUPPORT`.
- An environment whose agent proxy signs AWS requests exposes placeholder `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` values, which `./dev/initialize` copies into `.env`. With them set,
  backend tests that CI runs without AWS credentials take live-provider paths and trip the test
  network allowlist; unset both before running those suites.
- The session's GitHub proxy only serves `api.github.com` for repositories attached to the session.
  mise resolves some `.mise.toml` tools through that API, so `mise install` can fail on restricted
  networks; `./dev/initialize` reports it as a warning.
- The Agent Blackboard hook needs `AGENT_BLACKBOARD_URL` and `AGENT_BLACKBOARD_TOKEN` in the cloud
  environment's variables; see [Agent Blackboard](../agent-blackboard.md).
- Cloud sessions do not install the plugins listed in the
  [Claude configuration](../../../.claude/README.md#required-agent-plugins); adapters read the
  `vouchington-tooling` copy from `node_modules` instead.
