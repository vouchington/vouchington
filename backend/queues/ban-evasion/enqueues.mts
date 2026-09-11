import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { BAN_EVASION_DEFAULTS, BAN_EVASION_QUEUE_NAME, PRIORITY_DEFAULT } from './config.mts'
import { ban_evasion } from './queues.mts'

type BanEvasionJobData = { communityId: string; userId: string; postId?: string }
type BanEvasionPostEmbeddingTrigger = BanEvasionJobData & {
  postId: string
  inputSha256Hex: string
}

function makeJobOpts(dedupId: string, priority: number): Partial<JobOptions> {
  return {
    priority,
    deduplication: {
      id: dedupId,
      mode: 'debounce',
      ttl: BAN_EVASION_DEFAULTS.deduplicationTtlMs,
    },
  }
}

const defaults = {
  attempts: BAN_EVASION_DEFAULTS.attempts,
  backoff: BAN_EVASION_DEFAULTS.backoff,
  removeOnComplete: BAN_EVASION_DEFAULTS.removeOnComplete,
  removeOnFail: BAN_EVASION_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueBanEvasionJob = createEnqueueFunction<BanEvasionJobData, 'detect'>({
  queue: ban_evasion,
  queueName: BAN_EVASION_QUEUE_NAME,
  jobName: 'detect',
  defaults,
})

export const enqueueBulkDetectBanEvasionAfterPostEmbeddings = createBulkEnqueueFunction<
  BanEvasionPostEmbeddingTrigger,
  BanEvasionJobData,
  'detect'
>({
  queue: ban_evasion,
  queueName: BAN_EVASION_QUEUE_NAME,
  jobName: 'detect',
  defaults,
  buildJob: item => ({
    data: { communityId: item.communityId, userId: item.userId, postId: item.postId },
    opts: makeJobOpts(
      buildPostEmbeddingDedupId(item.communityId, item.userId, item.postId, item.inputSha256Hex),
      PRIORITY_DEFAULT,
    ),
  }),
})

/** Enqueue detection for the first community post trigger (debounce-deduped per user+community). */
export async function enqueueDetectBanEvasion(
  communityId: string,
  userId: string,
  postId: string,
): Promise<void> {
  await enqueueBanEvasionJob(
    { communityId, userId, postId },
    makeJobOpts(`ban_evasion_${communityId}_${userId}`, PRIORITY_DEFAULT),
  )
}

/**
 * Enqueue detection after a first community post's embedding is available.
 * Uses a post-specific dedup key so it cannot be swallowed by the initial first-post trigger.
 */
export async function enqueueDetectBanEvasionAfterPostEmbedding(
  communityId: string,
  userId: string,
  postId: string,
  inputSha256Hex: string,
): Promise<void> {
  await enqueueBanEvasionJob(
    { communityId, userId, postId },
    makeJobOpts(
      buildPostEmbeddingDedupId(communityId, userId, postId, inputSha256Hex),
      PRIORITY_DEFAULT,
    ),
  )
}

/**
 * Enqueue detection for the join trigger.
 * Uses a separate dedup key so a no-post join probe does not block the subsequent
 * first-post detection window from running.
 */
export async function enqueueDetectBanEvasionOnJoin(
  communityId: string,
  userId: string,
): Promise<void> {
  await enqueueBanEvasionJob(
    { communityId, userId },
    makeJobOpts(`ban_evasion_join_${communityId}_${userId}`, PRIORITY_DEFAULT),
  )
}

function buildPostEmbeddingDedupId(
  communityId: string,
  userId: string,
  postId: string,
  inputSha256Hex: string,
): string {
  return `ban_evasion_post_embedding_${communityId}_${userId}_${postId}_${inputSha256Hex}`
}
