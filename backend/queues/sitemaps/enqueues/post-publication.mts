import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { SitemapPostType } from '@services/sitemaps/types'
import {
  getSitemapsOrderingKeyForDay,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  SITEMAPS_ORDERING,
} from '../config.mts'
import { sitemaps } from '../queues.mts'
import type { PostDayJobData, SitemapPostDayJobs } from '../types.mts'

const enqueueUpdatePostDaySitemapJob = createEnqueueFunction<PostDayJobData, SitemapPostDayJobs>({
  queue: sitemaps,
  queueName: QUEUE_NAME,
  jobName: 'processUpdatePostDaySitemap',
})

/**
 * Enqueues without deduplication so acknowledgement always follows a newly accepted durable job.
 * Ordering still serializes rebuilds for the target day lane.
 */
export async function enqueueUpdatePostDaySitemapForReconciliation(
  postType: SitemapPostType,
  day: string,
  priority = PRIORITY_DEFAULT,
): Promise<void> {
  const data = { postType, day } satisfies PostDayJobData
  const job = await enqueueUpdatePostDaySitemapJob(data, {
    priority,
    ordering: SITEMAPS_ORDERING[getSitemapsOrderingKeyForDay(day)],
  })
  if (!job) throw new Error('Publication reconciliation sitemap job was not accepted')
}
