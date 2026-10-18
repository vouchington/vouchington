import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { processFetchRssFeed, processRssFeedsDispatcher } from './processors.mts'

export const rssFeedsHandlers = [
  backgroundHandler(RSS_FEEDS_DISPATCH_JOB, job =>
    processPagedDispatcher(job, {
      dispatcher: 'rss',
      cursorKey: 'id',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const result = await processRssFeedsDispatcher(undefined, {
          afterId: job.data.afterId,
          limit: pageSize,
        })
        return { result, ...(result.nextAfterId ? { next: { afterId: result.nextAfterId } } : {}) }
      },
      enqueueNext: createBackgroundEnqueue(RSS_FEEDS_DISPATCH_JOB),
    }),
  ),
  backgroundHandler(RSS_FEEDS_FETCH_JOB, job => {
    const rssFeedId = job.data?.rssFeedId
    if (!rssFeedId) throw new Error('RSS feed job .rssFeedId is required')
    const ttl = job.data?.ttl
    return processFetchRssFeed(rssFeedId, typeof ttl === 'number' ? ttl : undefined)
  }),
]
