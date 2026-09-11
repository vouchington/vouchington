import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import {
  BLOOM_FILTER_LOCK_DURATION_MS,
  BLOOM_FILTER_STALLED_INTERVAL_MS,
  QUEUE_NAME,
} from '@queues/bloom-filters/config'
import type { BloomFilterProcessorJobs } from '@queues/bloom-filters/types'
import { Worker, BatchError, type Job } from 'glide-mq'
import * as processors from './processors.mts'

function runOne(job: Job): Promise<void> {
  const jobName = job.name as BloomFilterProcessorJobs

  switch (jobName) {
    case 'processPopulateBloomFilter':
      return processors.processPopulateBloomFilter(job.data)
    case 'processRebuildBloomFilter':
      return processors.processRebuildBloomFilter(job.data)
    case 'processBackfillBloomFilter':
      return processors.processBackfillBloomFilter(job.data)
    case 'processBackfillUserBookmarkBloomFilter':
      return processors.processBackfillUserBookmarkBloomFilter(job.data)
    case 'processDeleteUserBookmarkBloomFilter':
      return processors.processDeleteUserBookmarkBloomFilter(job.data)
    case 'processRebuildEmbeddingBloomFilter':
      return processors.processRebuildEmbeddingBloomFilter(job.data)
    default: {
      const exhaustiveCheck: never = jobName
      throw new Error(`Bloom filter job ${exhaustiveCheck} not found`)
    }
  }
}

export const bloomFilters = new Worker(
  QUEUE_NAME,
  async (jobs: Job[]) => {
    const settled = await Promise.allSettled(
      jobs.map(job => Promise.resolve().then(() => runOne(job))),
    )
    const results = settled.map(r =>
      r.status === 'fulfilled'
        ? r.value
        : r.reason instanceof Error
          ? r.reason
          : new Error(String(r.reason)),
    )
    if (settled.some(r => r.status === 'rejected')) throw new BatchError(results)
    return results
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('bloomFilters', { baseline: 5 }),
    lockDuration: BLOOM_FILTER_LOCK_DURATION_MS,
    stalledInterval: BLOOM_FILTER_STALLED_INTERVAL_MS,
    batch: { size: 10, timeout: 1000 },
  },
)
