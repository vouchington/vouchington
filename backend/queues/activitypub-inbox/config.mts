import type { JobOptions } from 'glide-mq'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'

export const QUEUE_NAME = 'activitypub-inbox'
export const PROCESS_PRIORITY = 10
export const RECOVERY_PRIORITY = 100
export const RECOVERY_INTERVAL_MS = 300_000
export const CLEANUP_PRIORITY = 1
export const CLEANUP_INTERVAL_MS = ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupIntervalMs

export const ACTIVITYPUB_INBOX_DEFAULTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
