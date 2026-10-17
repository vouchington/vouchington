import {
  backgroundHandler,
  backgroundSweepHandler,
} from '@queues/background/enqueues/define-handler'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { processFetchRssFeed, processRssFeedsDispatcher } from './processors.mts'

export const rssFeedsHandlers = [
  backgroundSweepHandler(RSS_FEEDS_DISPATCH_JOB, processRssFeedsDispatcher),
  backgroundHandler(RSS_FEEDS_FETCH_JOB, job => {
    const rssFeedId = job.data?.rssFeedId
    if (!rssFeedId) throw new Error('RSS feed job .rssFeedId is required')
    const ttl = job.data?.ttl
    return processFetchRssFeed(rssFeedId, typeof ttl === 'number' ? ttl : undefined)
  }),
]
