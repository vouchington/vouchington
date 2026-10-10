import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/vote-integrity/config'
import type { VoteIntegrityJobs } from '@queues/vote-integrity/types'
import { processVoteIntegrityCheck } from './processors.mts'

async function processJob(job: Job): Promise<void> {
  switch (job.name as VoteIntegrityJobs) {
    case 'processVoteIntegrityCheck':
      await processVoteIntegrityCheck(job.data)
      break
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}

export const voteIntegrity = createWorker(QUEUE_NAME, processJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('voteIntegrity', { baseline: 5 }),
})
