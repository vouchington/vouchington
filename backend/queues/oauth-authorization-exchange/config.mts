import { SCHEDULING_FLOOR_MS } from '@modules/scheduled-job-manifest'

export const OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME = 'oauth-authorization-exchange'
export const OAUTH_AUTHORIZATION_EXCHANGE_PRIORITY = 1
export const OAUTH_AUTHORIZATION_EXCHANGE_DISPATCHER_PRIORITY = 100
// Recovery-only path (catches enqueues that failed post-commit, not the latency-critical one).
// Pinned at the global scheduling floor itself, not merely validated against it, so the interval
// can never drift below what validateScheduledJobRepeat allows; worst-case recovery latency
// moving from ~5s to ~60s is an accepted trade-off on a recovery path with zero users behind it.
export const OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS = SCHEDULING_FLOOR_MS
export const OAUTH_AUTHORIZATION_EXCHANGE_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
} as const
