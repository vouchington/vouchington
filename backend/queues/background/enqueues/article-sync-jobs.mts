import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue ran one sync at a time across every worker (concurrency 1, scale ignored), so the
// domain keeps one domain-wide group of one. The job has no ordering key of its own.
export const ARTICLE_SYNC_DOMAIN = defineBackgroundDomain({
  domain: 'article-sync',
  group: { kind: 'domain', concurrency: 1 },
  workerConcurrency: 1,
})

export type ArticleSyncData = { userId: string }

export const ARTICLE_SYNC_PROCESS_JOB = defineBackgroundJob<ArticleSyncData>(ARTICLE_SYNC_DOMAIN, {
  name: 'processArticleSync',
  priority: PRIORITY_TASK,
  attempts: 1,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
})

export const ARTICLE_SYNC_JOBS = [ARTICLE_SYNC_PROCESS_JOB] as const
