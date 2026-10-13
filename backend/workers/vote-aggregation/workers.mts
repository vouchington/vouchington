import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/vote-aggregation/config'
import { processVoteAggregationJob } from './processors.mts'

export const voteAggregation = createWorker(QUEUE_NAME, processVoteAggregationJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('voteAggregation', { baseline: 10 }),
})
