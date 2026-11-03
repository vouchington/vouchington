import { wrapHttpForRetry } from '@modules/queue-errors'
import { purgeCacheTags } from '@services/entity-cache/purge'
import type { Job } from 'glide-mq'

export function processCachePurgeTags(job: Pick<Job, 'data'>): Promise<unknown> {
  if (
    !Array.isArray(job.data.tags) ||
    !job.data.tags.every((tag: unknown) => typeof tag === 'string')
  ) {
    throw new Error('Cache purge job requires tags')
  }
  return purgeCacheTags(job.data.tags).catch(wrapHttpForRetry)
}
