import { entityOrderingKey } from '@queues/background/enqueues/define-job'

export const KAGI_SMALLWEB_CRON = '0 5 * * *' // Daily at 5 AM UTC

// Namespaced so no other domain shares the lane: one sync page at a time, outside the domain group
// of five imports.
export const KAGI_SMALLWEB_ORDERING = {
  dispatcher: { key: entityOrderingKey('kagi-smallweb', 'dispatcher') },
} as const

export const KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS = 24 * 60 * 60_000
