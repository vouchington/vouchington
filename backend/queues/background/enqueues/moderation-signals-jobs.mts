import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Both old queues were DB-only with a worker concurrency of 5 and a 5 per second limiter with no
// documented reason. There is no limiter and no group: the shared worker's concurrency throttles
// work that only touches PostgreSQL. `workerConcurrency` keeps the shared worker sized for both.
export const MODERATION_SIGNALS_DOMAIN = defineBackgroundDomain({
  domain: 'moderation-signals',
  workerConcurrency: 10,
})

export type SpamDetectionData = { id: string; contentSha256?: string }
export type BanEvasionData = { communityId: string; userId: string; postId?: string }

const RETENTION = { removeOnComplete: 100, removeOnFail: 100 } as const

/** Spam detection records its own failures on the post, so the queue never retries it. */
export const MODERATION_SIGNALS_SPAM_DETECTION_JOB = defineBackgroundJob<SpamDetectionData>(
  MODERATION_SIGNALS_DOMAIN,
  { name: 'spam_detection', priority: PRIORITY_TASK, attempts: 1, ...RETENTION },
)

export const MODERATION_SIGNALS_BAN_EVASION_JOB = defineBackgroundJob<BanEvasionData>(
  MODERATION_SIGNALS_DOMAIN,
  {
    name: 'ban_evasion',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    ...RETENTION,
  },
)

export const MODERATION_SIGNALS_JOBS = [
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
  MODERATION_SIGNALS_BAN_EVASION_JOB,
] as const
