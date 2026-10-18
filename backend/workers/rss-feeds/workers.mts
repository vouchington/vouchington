import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { RSS_FEEDS_ORDERING } from '@queues/rss-feeds/config'
import { getCrawlCapacityBudget } from '@services/rss-feeds'
import { processFetchRssFeed, processRssFeedsDispatcher } from './processors.mts'

const enqueueRssContinuation = createBackgroundEnqueue(RSS_FEEDS_DISPATCH_JOB)

export const rssFeedsHandlers = [
  backgroundHandler(RSS_FEEDS_DISPATCH_JOB, async job => {
    const remainingBudget = job.data.remainingBudget ?? getCrawlCapacityBudget()
    if (!Number.isSafeInteger(remainingBudget) || remainingBudget < 0) {
      throw new TypeError('RSS dispatcher remaining budget must be a nonnegative safe integer')
    }
    const asOf = job.data.asOf ?? new Date().toISOString()
    const asOfDate = new Date(asOf)
    if (Number.isNaN(asOfDate.valueOf())) {
      throw new TypeError('RSS dispatcher asOf must be a valid timestamp')
    }
    if (job.data.remainingBudget === undefined || job.data.asOf === undefined) {
      await job.updateData({ ...job.data, remainingBudget, asOf })
    }
    if (remainingBudget === 0) return { count: 0 }
    return processPagedDispatcher(job, {
      dispatcher: 'rss',
      cursorKey: 'lane,id',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const limit = Math.min(pageSize, remainingBudget, getCrawlCapacityBudget())
        const result = await processRssFeedsDispatcher(undefined, {
          cursor: job.data.cursor,
          asOf: asOfDate,
          limit,
        })
        const nextBudget = remainingBudget - result.count
        return {
          result,
          ...(result.nextCursor && nextBudget > 0
            ? { next: { cursor: result.nextCursor, asOf, remainingBudget: nextBudget } }
            : {}),
        }
      },
      enqueueNext: (data, options) =>
        enqueueRssContinuation(data, { ...options, ordering: RSS_FEEDS_ORDERING.dispatcher }),
    })
  }),
  backgroundHandler(RSS_FEEDS_FETCH_JOB, job => {
    const rssFeedId = job.data?.rssFeedId
    if (!rssFeedId) throw new Error('RSS feed job .rssFeedId is required')
    const ttl = job.data?.ttl
    return processFetchRssFeed(rssFeedId, typeof ttl === 'number' ? ttl : undefined)
  }),
]
