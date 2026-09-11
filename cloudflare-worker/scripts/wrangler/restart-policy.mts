// Governs how many times start.mts will respawn a crashed `wrangler dev` child, and how that
// budget behaves across a long-running suite. See #10819: an upstream wrangler bug can crash the
// worker mid-suite, and MAX_RESTARTS existed to bound blind restart loops -- but treating it as a
// lifetime cap meant unrelated crashes minutes apart, each individually harmless, could exhaust the
// budget and kill the worker for the rest of the run.

const DEFAULT_STABLE_UPTIME_MS = 60_000

export const MAX_RESTARTS = 5

// An attempt that stayed up at least this long is treated as a recovered incident, not a step in an
// ongoing restart loop -- the systemd `StartLimitIntervalSec` analogue. Well above the ~3.5s
// observed wrangler boot time. Overridable so fault injection can exercise the window in seconds
// instead of minutes; see cloudflare-worker/scripts/README.md.
export function readStableUptimeMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WRANGLER_STABLE_UPTIME_MS
  if (!raw) return DEFAULT_STABLE_UPTIME_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STABLE_UPTIME_MS
}

export const STABLE_UPTIME_MS = readStableUptimeMs()

// Pure. Returns the attempt number *within the current crash burst* for the restart about to be
// scheduled. An attempt that survived stableUptimeMs starts a new burst (1); otherwise this crash is
// the next step in the current one (previousAttempt + 1).
//
// A stable-separated crash still spends one slot of its own burst's budget: at the moment its
// restart is scheduled we don't yet know whether the new attempt will also survive the window. If it
// does, the counter resets to 1 again when *it* exits. So a lone stable-separated crash never
// threatens the budget, but a stable crash immediately followed by a burst of rapid ones is bounded
// exactly like a pure rapid-crash burst starting from attempt 1.
export function burstAttemptNumber(
  previousAttempt: number,
  uptimeMs: number,
  stableUptimeMs: number = STABLE_UPTIME_MS,
): number {
  return uptimeMs >= stableUptimeMs ? 1 : previousAttempt + 1
}

export const WRANGLER_RESTART_MARKER_PREFIX = 'start-wrangler: restarting wrangler'

export function formatWranglerRestartMessage(attempt: number, max: number): string {
  return `${WRANGLER_RESTART_MARKER_PREFIX} (attempt ${attempt}/${max})`
}
