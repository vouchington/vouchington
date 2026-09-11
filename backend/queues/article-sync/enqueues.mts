import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { ARTICLE_SYNC_DEDUP_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { articleSync } from './queues.mts'
import type { ArticleSyncJobs } from './types.mts'

type ArticleSyncData = { userId: string }

const enqueueArticleSyncJob = createEnqueueFunction<ArticleSyncData, ArticleSyncJobs>({
  queue: articleSync,
  queueName: QUEUE_NAME,
  jobName: 'processArticleSync',
  defaults: {
    attempts: 1,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export function enqueueArticleSync(userId: string) {
  return enqueueArticleSyncJob({ userId }, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: 'article-sync-singleton',
      mode: 'throttle',
      ttl: ARTICLE_SYNC_DEDUP_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}
