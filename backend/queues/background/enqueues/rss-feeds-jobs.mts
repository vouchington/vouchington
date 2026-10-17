import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's cap was its worker concurrency of 5. Fetches share one domain-wide group of 5;
// the dispatcher keeps its own singleton lane (outside the group) so passes never race. Fetches
// reach independent feed hosts, so a rate-limit signal delays only its own job. A fetch's per-call priority is its crawl tier (1, 3, 7, 12, 20); the job's own
// priority is the default when a caller names no tier.
export const RSS_FEEDS_DOMAIN = defineBackgroundDomain({
  domain: 'rss-feeds',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export type RssFeedFetchData = { rssFeedId: string; ttl?: number }

export const RSS_FEEDS_FETCH_JOB = defineBackgroundJob<RssFeedFetchData>(RSS_FEEDS_DOMAIN, {
  name: 'fetchRssFeed',
  priority: PRIORITY_TASK,
  ...DEFAULTS,
})
export const RSS_FEEDS_DISPATCH_JOB = defineBackgroundJob<Record<string, never>>(RSS_FEEDS_DOMAIN, {
  name: 'dispatchRssFeeds',
  priority: PRIORITY_DISPATCH,
  ...DEFAULTS,
})

export const RSS_FEEDS_JOBS = [RSS_FEEDS_FETCH_JOB, RSS_FEEDS_DISPATCH_JOB] as const
