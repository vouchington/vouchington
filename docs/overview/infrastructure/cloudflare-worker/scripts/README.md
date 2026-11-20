# Cloudflare Worker Scripts

Source entrypoint: [cloudflare-worker/scripts/README.md](../../../../../cloudflare-worker/scripts/README.md)

## `wrangler dev` restart budget

`wrangler dev` can crash mid-suite (a known upstream `workers-sdk` cause). [`start.mts`](../../../../../cloudflare-worker/scripts/wrangler/start.mts) auto-restarts the crashed child, but bounds how many times it
will do so via [`wrangler/restart-policy.mts`](../../../../../cloudflare-worker/scripts/wrangler/restart-policy.mts).

`MAX_RESTARTS` is a **burst-window** budget, not a lifetime cap: an attempt that stays up for at
least `STABLE_UPTIME_MS` (default 60s, the `systemd StartLimitIntervalSec` analogue) is treated as
a recovered incident, and the next crash starts a fresh burst at attempt 1. Only a _burst_ of
crashes within that window can exhaust the budget and stop `start.mts` from restarting further.

Set `WRANGLER_STABLE_UPTIME_MS` to override the window — e.g. down to a few seconds — so fault
injection can exercise burst-vs-reset behavior without waiting a full minute per attempt.

## Related

- Worker rules: [`../AGENTS.md`](../../../../../cloudflare-worker/AGENTS.md)
