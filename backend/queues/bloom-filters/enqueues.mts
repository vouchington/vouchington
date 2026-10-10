import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  backfillBloomFilterJobOptions,
  backfillUserBookmarkBloomFilterJobOptions,
  deleteUserBookmarkBloomFilterJobOptions,
  QUEUE_NAME,
  rebuildBloomFilterJobOptions,
  rebuildEmbeddingBloomFilterJobOptions,
} from './config.mts'
import { bloomFilters } from './queues.mts'
import type {
  BackfillBloomFilterData,
  BackfillUserBookmarkBloomFilterData,
  BloomFilterProcessorJobs,
  DeleteUserBookmarkBloomFilterData,
  RebuildBloomFilterData,
  RebuildEmbeddingBloomFilterData,
} from './types.mts'

const enqueueBackfillBloomFilterJob = createEnqueueFunction<
  BackfillBloomFilterData,
  BloomFilterProcessorJobs
>({
  queue: bloomFilters,
  queueName: QUEUE_NAME,
  jobName: 'processBackfillBloomFilter',
})

const enqueueBackfillUserBookmarkBloomFilterJob = createEnqueueFunction<
  BackfillUserBookmarkBloomFilterData,
  BloomFilterProcessorJobs
>({
  queue: bloomFilters,
  queueName: QUEUE_NAME,
  jobName: 'processBackfillUserBookmarkBloomFilter',
})

const enqueueDeleteUserBookmarkBloomFilterJob = createEnqueueFunction<
  DeleteUserBookmarkBloomFilterData,
  BloomFilterProcessorJobs
>({
  queue: bloomFilters,
  queueName: QUEUE_NAME,
  jobName: 'processDeleteUserBookmarkBloomFilter',
})

const enqueueRebuildBloomFilterJob = createEnqueueFunction<
  RebuildBloomFilterData,
  BloomFilterProcessorJobs
>({
  queue: bloomFilters,
  queueName: QUEUE_NAME,
  jobName: 'processRebuildBloomFilter',
})

const enqueueRebuildEmbeddingBloomFilterJob = createEnqueueFunction<
  RebuildEmbeddingBloomFilterData,
  BloomFilterProcessorJobs
>({
  queue: bloomFilters,
  queueName: QUEUE_NAME,
  jobName: 'processRebuildEmbeddingBloomFilter',
})

export function enqueueBackfillBloomFilter(
  data: BackfillBloomFilterData,
  priority?: number,
): EnqueueReturnType {
  return enqueueBackfillBloomFilterJob(data, backfillBloomFilterJobOptions(data, priority))
}

export function enqueueBackfillUserBookmarkBloomFilter(
  data: BackfillUserBookmarkBloomFilterData,
  priority?: number,
): EnqueueReturnType {
  return enqueueBackfillUserBookmarkBloomFilterJob(
    data,
    backfillUserBookmarkBloomFilterJobOptions(data, priority),
  )
}

export function enqueueDeleteUserBookmarkBloomFilter(
  data: DeleteUserBookmarkBloomFilterData,
  priority?: number,
): EnqueueReturnType {
  return enqueueDeleteUserBookmarkBloomFilterJob(
    data,
    deleteUserBookmarkBloomFilterJobOptions(data, priority),
  )
}

export const enqueueRebuildBloomFilter = (
  data: RebuildBloomFilterData,
  priority?: number,
): EnqueueReturnType => {
  return enqueueRebuildBloomFilterJob(data, rebuildBloomFilterJobOptions(data, priority))
}

export const enqueueRebuildEmbeddingBloomFilter = (priority?: number): EnqueueReturnType =>
  enqueueRebuildEmbeddingBloomFilterJob({}, rebuildEmbeddingBloomFilterJobOptions(priority))
