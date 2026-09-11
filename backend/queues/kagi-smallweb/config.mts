export const QUEUE_NAME = 'kagi-smallweb'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const KAGI_SMALLWEB_CRON = '0 5 * * *' // Daily at 5 AM UTC

export const KAGI_SMALLWEB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

export const KAGI_SMALLWEB_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
  process: { key: 'process', concurrency: 5 },
} as const

export const KAGI_SMALLWEB_PROCESS_DEDUP_TTL_MS = 24 * 60 * 60_000
