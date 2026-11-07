import { wrapHttpForRetry } from '@modules/queue-errors'
import { purgeCacheTags } from '@services/entity-cache/purge'
import type {
  CachePurgeJobPayloads,
  CACHE_PURGE_TAGS_JOB_NAME,
} from '@queues/background/enqueues/cache-purge-jobs'
import type { Job } from 'glide-mq'

type CachePurgeJobData = CachePurgeJobPayloads[typeof CACHE_PURGE_TAGS_JOB_NAME]

export function processCachePurgeTags(job: Pick<Job<CachePurgeJobData>, 'data'>): Promise<unknown> {
  if (
    !Array.isArray(job.data.tags) ||
    !job.data.tags.every((tag: unknown) => typeof tag === 'string')
  ) {
    throw new Error('Cache purge job requires tags')
  }
  return purgeCacheTags(job.data.tags).catch(wrapHttpForRetry)
}
