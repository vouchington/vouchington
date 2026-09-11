import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import {
  processMonthlyBackfillArchiveDispatcher,
  processUpdateFamilySitemap,
  processNightlyBackfillWeekDispatcher,
  processUpdatePostTypeIndex,
  processUpdatePostDaySitemap,
  processUpdatePostsIndex,
  processUpdateRootIndex,
  processWeeklyBackfillMonthDispatcher,
} from './processors.mts'
import { QUEUE_NAME } from '@queues/sitemaps/config'
import type {
  SitemapDispatcherJobs,
  SitemapIndexJobs,
  SitemapPostDayJobs,
} from '@queues/sitemaps/types'
import { requireJobFamily, requireJobPostType, requireJobString } from './processors/job-data.mts'
import { Worker, type Job } from 'glide-mq'

const sitemapJobProcessors = {
  processUpdatePostDaySitemap,
  processUpdatePostTypeIndex,
  processUpdatePostsIndex,
  processUpdateFamilySitemap,
  processUpdateRootIndex,
  processNightlyBackfillWeekDispatcher,
  processWeeklyBackfillMonthDispatcher,
  processMonthlyBackfillArchiveDispatcher,
}

type SitemapJobProcessors = typeof sitemapJobProcessors

export function processSitemapJob(
  job: Job,
  processors: SitemapJobProcessors = sitemapJobProcessors,
) {
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'post_day_today':
    case 'post_day_past': {
      switch (job.name as SitemapPostDayJobs) {
        case 'processUpdatePostDaySitemap':
          return processors.processUpdatePostDaySitemap({
            postType: requireJobPostType(job.data?.postType),
            day: requireJobString(job.data?.day, 'day'),
          })
        default:
          throw new Error(`Sitemap post-day job ${job.name} not found`)
      }
    }
    case 'indexes': {
      switch (job.name as SitemapIndexJobs) {
        case 'processUpdatePostTypeIndex':
          return processors.processUpdatePostTypeIndex(requireJobPostType(job.data?.postType))
        case 'processUpdatePostsIndex':
          return processors.processUpdatePostsIndex()
        case 'processUpdateFamilySitemap':
          return processors.processUpdateFamilySitemap(requireJobFamily(job.data?.family))
        case 'processUpdateRootIndex':
          return processors.processUpdateRootIndex()
        default:
          throw new Error(`Sitemap index job ${job.name} not found`)
      }
    }
    case 'dispatcher': {
      switch (job.name as SitemapDispatcherJobs) {
        case 'processNightlyBackfillWeekDispatcher':
          return processors.processNightlyBackfillWeekDispatcher()
        case 'processWeeklyBackfillMonthDispatcher':
          return processors.processWeeklyBackfillMonthDispatcher()
        case 'processMonthlyBackfillArchiveDispatcher':
          return processors.processMonthlyBackfillArchiveDispatcher()
        default:
          throw new Error(`Sitemap dispatcher job ${job.name} not found`)
      }
    }
    default:
      throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
}

export const sitemaps = new Worker(QUEUE_NAME, processSitemapJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('sitemaps', { baseline: 5 }),
})
