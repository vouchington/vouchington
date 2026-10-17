import { wrapHttpForRetry } from '@modules/queue-errors'
import type { Job } from 'glide-mq'

type CachePurgeProcessorDependencies = {
  purgeCacheTags: (tags: readonly string[]) => Promise<unknown>
}

export function createCachePurgeProcessor(dependencies: CachePurgeProcessorDependencies) {
  return (job: Pick<Job, 'data'>): Promise<unknown> => {
    if (
      !Array.isArray(job.data.tags) ||
      !job.data.tags.every((tag: unknown) => typeof tag === 'string')
    ) {
      throw new Error('Cache purge job requires tags')
    }
    return dependencies.purgeCacheTags(job.data.tags).catch(wrapHttpForRetry)
  }
}
