import type { Job } from 'glide-mq'
import { processDispatchDispatcher } from '../processors.mts'
import type { DispatchJobData } from '@queues/wikipedia-recommender/types'

type WikipediaRecommenderWorkerDeps = {
  processDispatch: (data: DispatchJobData) => Promise<void>
}

export async function processWikipediaRecommenderWorkerJob(
  job: Job<DispatchJobData>,
  deps: WikipediaRecommenderWorkerDeps = { processDispatch: processDispatchDispatcher },
): Promise<void> {
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'dispatcher':
      await deps.processDispatch(job.data as DispatchJobData)
      break
    default:
      throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
}
