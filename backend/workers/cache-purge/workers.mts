import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CACHE_PURGE_LIMITER, QUEUE_NAME } from '@queues/cache-purge/config'
import { Worker } from 'glide-mq'
import { purgeCacheTags } from '@services/entity-cache/purge'
import { createCachePurgeProcessor } from './processors.mts'

export const cachePurge = new Worker(QUEUE_NAME, createCachePurgeProcessor({ purgeCacheTags }), {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('cachePurge', { baseline: 5 }),
  // Workers Cache purge always uses Free-tier 5 req/min (burst 25), not the zone Pro 5/s
  // cap. This GlideMQ limiter is Valkey-keyed by queue name so it throttles aggregate
  // outbound rate across replicas; concurrency stays 5 because it only caps in-process
  // parallelism. See CACHE_PURGE_LIMITER.
  limiter: CACHE_PURGE_LIMITER,
})
