import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/wikipedia-recommender/config'
import { processWikipediaRecommenderWorkerJob } from './processors/worker-callback.mts'
import type { DispatchJobData } from '@queues/wikipedia-recommender/types'

export type WikipediaRecommenderWorkerDeps = {
  WorkerCtor?: typeof Worker
  queueName?: typeof QUEUE_NAME
  processor?: (job: Job<DispatchJobData>) => Promise<void>
  connection?: typeof workerQueueConnection
  prefix?: typeof workerQueuePrefix
  concurrency?: number
}

/**
 * Dispatcher-only worker. Recommendation batches execute on the shared ai_agents queue.
 */
export function createWikipediaRecommenderWorker(
  dependencies: WikipediaRecommenderWorkerDeps = {},
): Worker<DispatchJobData> {
  const WorkerCtor = dependencies.WorkerCtor ?? Worker
  const queueName = dependencies.queueName ?? QUEUE_NAME
  const processor = dependencies.processor ?? processWikipediaRecommenderWorkerJob
  const connection = dependencies.connection ?? workerQueueConnection
  const prefix = dependencies.prefix ?? workerQueuePrefix
  const concurrency =
    dependencies.concurrency ?? getWorkerConcurrency('wikipediaRecommender', { baseline: 5 })

  return new WorkerCtor<DispatchJobData>(queueName, processor, {
    connection,
    prefix,
    concurrency,
  })
}

export const wikipediaRecommender = createWikipediaRecommenderWorker()
