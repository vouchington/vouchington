import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/vote-weight/config'
import type { VoteWeightJobs } from '@queues/vote-weight/types'
import {
  processRecalculateUserVoteWeight,
  processRecalculateVoteWeightDispatcher,
} from './processors.mts'

async function processJob(job: Job): Promise<void> {
  switch (job.name as VoteWeightJobs) {
    case 'processRecalculateUserVoteWeight':
      await processRecalculateUserVoteWeight(job.data)
      break
    case 'processRecalculateVoteWeightDispatcher':
      await processRecalculateVoteWeightDispatcher(job.data)
      break
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}

export const voteWeight = createWorker(QUEUE_NAME, processJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('voteWeight', { baseline: 5 }),
})
