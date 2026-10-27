import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { isActiveProcessorJob } from '@data-stores/valkey-glide-mq/guarded-worker-processors'
import type { EnqueueReturnType } from '@voucha/types'
import {
  backfillBloomFilterJobOptions,
  backfillUserBookmarkBloomFilterJobOptions,
  blocklistBloomRebuildFollowUpJobId,
  BLOOM_FILTER_DEFAULTS,
  bloomFilterRebuildJobId,
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
  if (!isBlocklistRebuild(data)) {
    return enqueueRebuildBloomFilterJob(data, rebuildBloomFilterJobOptions(data, priority))
  }
  return enqueueBlocklistRebuildCoveringLatestCommit(data, priority)
}

type BlocklistRebuildData = RebuildBloomFilterData & {
  filter: 'url-blocklist' | 'email-blocklist'
}

function isBlocklistRebuild(data: RebuildBloomFilterData): data is BlocklistRebuildData {
  return data.filter === 'url-blocklist' || data.filter === 'email-blocklist'
}

/**
 * A duplicate job id drops the commit. Move a queued rebuild out to the lag margin, or
 * admit one follow-up when the rebuild is already active.
 */
async function enqueueBlocklistRebuildCoveringLatestCommit(
  data: BlocklistRebuildData,
  priority?: number,
): Promise<unknown> {
  const primaryId = bloomFilterRebuildJobId(data.filter)
  const followUpId = blocklistBloomRebuildFollowUpJobId(data.filter)
  if (await admitBlocklistRebuild(data, priority, primaryId)) return null
  if (await admitBlocklistRebuild(data, priority, followUpId)) return null
  if (await admitBlocklistRebuild(data, priority, primaryId)) return null
  throw new Error(`Blocklist bloom rebuild for ${data.filter} was not admitted`)
}

async function admitBlocklistRebuild(
  data: BlocklistRebuildData,
  priority: number | undefined,
  jobId: string,
): Promise<boolean> {
  // A running rebuild cannot re-add its own id. The other id carries that commit.
  if (isActiveProcessorJob(QUEUE_NAME, jobId)) return false
  const margin = BLOOM_FILTER_DEFAULTS.replicaLagSafetyMarginMs
  const added = await enqueueRebuildBloomFilterJob(data, {
    ...rebuildBloomFilterJobOptions(data, priority),
    jobId,
    delay: margin,
  })
  if (added != null) return true
  const job = await bloomFilters.getJob(jobId)
  if (!job) return false
  try {
    await job.changeDelay(margin)
    return true
  } catch (err) {
    if (isUnchangeableDelay(err)) return false
    throw err
  }
}

function isUnchangeableDelay(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Cannot change delay:')
}

export const enqueueRebuildEmbeddingBloomFilter = (priority?: number): EnqueueReturnType =>
  enqueueRebuildEmbeddingBloomFilterJob({}, rebuildEmbeddingBloomFilterJobOptions(priority))
