import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { purgeCacheTags } from '@services/entity-cache/purge'
import { createCachePurgeProcessor } from './processors.mts'

// The Workers Cache purge rate limit (4 per minute across every worker) is the `cache-purge`
// domain's group in the registry, not a worker option.
export const cachePurgeHandlers = [
  backgroundHandler(CACHE_PURGE_TAGS_JOB, createCachePurgeProcessor({ purgeCacheTags })),
]
