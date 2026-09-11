# Cloudflare Worker Scripts

Helpers used during local Cloudflare Worker development and CI smoke testing.

| Path                                                                             | Purpose                                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`wrangler/dev.mts`](wrangler/dev.mts)                                           | Boots live `wrangler dev` with repo-local runtime paths.             |
| [`wrangler/start.mts`](wrangler/start.mts)                                       | Boots `wrangler dev` with the worktree-specific port and env config. |
| [`tests/smoke-test-cloudflare-worker.sh`](tests/smoke-test-cloudflare-worker.sh) | Smoke test that hits the locally running worker.                     |

## `wrangler dev` restart budget

`wrangler dev` can crash mid-suite (see
[#10819](https://github.com/jonathanong/filaments/issues/10819) for a known upstream
`workers-sdk` cause). `start.mts` auto-restarts the crashed child, but bounds how many times it
will do so via [`wrangler/restart-policy.mts`](wrangler/restart-policy.mts).

`MAX_RESTARTS` is a **burst-window** budget, not a lifetime cap: an attempt that stays up for at
least `STABLE_UPTIME_MS` (default 60s, the `systemd StartLimitIntervalSec` analogue) is treated as
a recovered incident, and the next crash starts a fresh burst at attempt 1. Only a _burst_ of
crashes within that window can exhaust the budget and stop `start.mts` from restarting further.

Set `WRANGLER_STABLE_UPTIME_MS` to override the window — e.g. down to a few seconds — so fault
injection can exercise burst-vs-reset behavior without waiting a full minute per attempt.

## Related

- Worker rules: [`../CLAUDE.md`](../CLAUDE.md)
