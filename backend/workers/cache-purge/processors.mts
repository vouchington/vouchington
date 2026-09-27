import { wrapHttpForRetry } from '@modules/queue-errors'
import type { CachePurgeJobs } from '@queues/cache-purge/types'
import type { Job } from 'glide-mq'

type CachePurgeProcessorDependencies = {
  purgeCacheTags: (tags: readonly string[]) => Promise<unknown>
}

export function createCachePurgeProcessor(dependencies: CachePurgeProcessorDependencies) {
  return (job: Job): Promise<unknown> => {
    const jobName = job.name as CachePurgeJobs
    switch (jobName) {
      case 'processPurgeCacheTag': {
        if (
          !Array.isArray(job.data.tags) ||
          !job.data.tags.every((tag: unknown) => typeof tag === 'string')
        ) {
          throw new Error('Cache purge job requires tags')
        }
        return dependencies.purgeCacheTags(job.data.tags).catch(wrapHttpForRetry)
      }
      default: {
        const exhaustiveCheck: never = jobName
        throw new Error(`Cache purge job ${exhaustiveCheck} not found`)
      }
    }
  }
}
