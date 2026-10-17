# Claude Code Cloud Sessions

Claude Code cloud sessions run in disposable Anthropic-hosted Ubuntu containers as root. They clone
the repository fresh and load [`.claude/settings.json`](../../../.claude/settings.json) hooks, but
nothing from [vouchington-machines](https://github.com/vouchington/vouchington-machines) provisions
the host. The image's default Node.js is older than [`.nvmrc`](../../../.nvmrc), so `pnpm install`
fails the `engines` check until the container is prepared.

Run [`./dev/claude-cloud`](../../../dev/claude-cloud) (`monorepo`, `backend` by default, or `web`)
from the repository root. It supplies what host provisioning owns elsewhere (the pinned Node.js,
pnpm, and mise; for `backend` and `web`, the Docker daemon and CI's digest-pinned PostgreSQL), then
runs `./dev/initialize`. It refuses to run unless `CLAUDE_CODE_REMOTE=true`, and every step is
idempotent: rerun it when a session resumes on a rebuilt VM, because the Docker daemon and
containers do not survive. Images are pulled through `mirror.gcr.io` because anonymous Docker Hub
pulls from shared cloud egress are rate-limited.

A fresh cloud clone is not a linked worktree, so the dev scripts treat it as main: it uses the shared
`voucha` database and Valkey names, and the main-reset guards apply.

The environment's setup script runs as root before Claude Code launches and its filesystem result is
cached, so `VOUCHA_CLAUDE_CLOUD=1 ./dev/claude-cloud monorepo` there caches Node.js, pnpm, mise, and
dependencies. Background processes are not cached; run `backend` or `web` in the session.

## Known limits

- The VM kernel boots with IPv6 disabled, so code that binds `::1` explicitly fails with
  `EAFNOSUPPORT`.
- An environment whose agent proxy signs AWS requests exposes placeholder AWS credentials that
  `./dev/initialize` copies into `.env`. With them set, backend tests that CI runs without AWS
  credentials take live-provider paths and trip the network allowlist; unset both before running
  those suites.
- The session's GitHub proxy only serves `api.github.com` for repositories attached to the session,
  so `mise install` can fail on restricted networks; `./dev/initialize` reports a warning.
- The Agent Blackboard hook needs `AGENT_BLACKBOARD_URL` and `AGENT_BLACKBOARD_TOKEN` in the cloud
  environment's variables; see [Agent Blackboard](../agent-blackboard.md).
- Cloud sessions do not install the plugins in the
  [Claude configuration](../../../.claude/README.md#required-agent-plugins); adapters read the
  `vouchington-tooling` copy from `node_modules` instead.
