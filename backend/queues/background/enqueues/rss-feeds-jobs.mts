import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Feed fetches share the domain lane; the dispatcher has a separate singleton lane.
export const RSS_FEEDS_DOMAIN = defineBackgroundDomain({
  domain: 'rss-feeds',
  deferral: 'job',
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export type RssFeedFetchData = { rssFeedId: string; ttl?: number }
export type RssFeedsDispatchData = {
  cursor?: { lane: number; afterId: string }
  asOf?: string
  remainingBudget?: number
}

export const RSS_FEEDS_FETCH_JOB = defineBackgroundJob<RssFeedFetchData>(RSS_FEEDS_DOMAIN, {
  name: 'fetchRssFeed',
  priority: PRIORITY_TASK,
  ...DEFAULTS,
})
export const RSS_FEEDS_DISPATCH_JOB = defineBackgroundJob<RssFeedsDispatchData>(RSS_FEEDS_DOMAIN, {
  name: 'dispatchRssFeeds',
  priority: PRIORITY_DISPATCH,
  ...DEFAULTS,
  ...pagedDispatchJobOptions('rss'),
})

export const RSS_FEEDS_JOBS = [RSS_FEEDS_FETCH_JOB, RSS_FEEDS_DISPATCH_JOB] as const
