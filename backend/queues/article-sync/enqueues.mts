import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { ARTICLE_SYNC_PROCESS_JOB } from '@queues/background/enqueues/article-sync-jobs'
import type { JobOptions } from 'glide-mq'
import { ARTICLE_SYNC_DEDUP_TTL_MS } from './config.mts'
import { articleSync } from './queues.mts'

const enqueueArticleSyncJob = createBackgroundEnqueue(ARTICLE_SYNC_PROCESS_JOB)

export function enqueueArticleSync(userId: string) {
  return enqueueArticleSyncJob({ userId }, {
    deduplication: {
      id: 'article-sync-singleton',
      mode: 'throttle',
      ttl: ARTICLE_SYNC_DEDUP_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

/**
 * Reads one sync job by id. The shared queue holds every domain's jobs, so an id that belongs to
 * another domain reads as no job rather than leaking that job's state to the caller.
 */
export async function readArticleSyncJob(jobId: string) {
  const job = await articleSync.getJob(jobId)
  return job?.name === ARTICLE_SYNC_PROCESS_JOB.name ? job : undefined
}
