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
        // A rolling deploy can have an old-code replica enqueue `{ tag: string }` while this
        // worker reads the new `{ tags: string[] }` payload. Preserve the legacy tag instead of
        // silently no-oping or throwing during that transition window.
        const tags: string[] = Array.isArray(job.data.tags) ? job.data.tags : [job.data.tag]
        return dependencies.purgeCacheTags(tags).catch(wrapHttpForRetry)
      }
      default: {
        const exhaustiveCheck: never = jobName
        throw new Error(`Cache purge job ${exhaustiveCheck} not found`)
      }
    }
  }
}
