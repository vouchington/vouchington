import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

/**
 * Crash-recovery window for a claimed sync, not a runtime cap: a live worker keeps the lock by
 * heartbeat, and a crashed one frees the job for another worker after this long. Two minutes is
 * well above the 30s default that a slow Valkey round trip or GC pause could lapse on, yet keeps a
 * crashed one-at-a-time sync from blocking the domain's single group slot for long.
 */
export const ARTICLE_SYNC_LOCK_DURATION_MS = 120_000

// Article sync remains serial across every worker process.
export const ARTICLE_SYNC_DOMAIN = defineBackgroundDomain({
  domain: 'article-sync',
  workerConcurrency: 1,
})

export type ArticleSyncData = { userId: string }

export const ARTICLE_SYNC_PROCESS_JOB = defineBackgroundJob<ArticleSyncData>(ARTICLE_SYNC_DOMAIN, {
  name: 'processArticleSync',
  priority: PRIORITY_TASK,
  attempts: 1,
  lockDuration: ARTICLE_SYNC_LOCK_DURATION_MS,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
})

export const ARTICLE_SYNC_JOBS = [ARTICLE_SYNC_PROCESS_JOB] as const
