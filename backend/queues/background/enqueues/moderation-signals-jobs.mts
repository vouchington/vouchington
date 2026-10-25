import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Domain ordering bounds DB-only work globally; workerConcurrency sizes one process.
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
