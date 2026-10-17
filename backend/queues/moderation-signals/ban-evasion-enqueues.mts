import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import { MODERATION_SIGNALS_BAN_EVASION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import type { JobOptions } from 'glide-mq'
import { DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT } from './config.mts'

type BanEvasionPostEmbeddingTrigger = {
  communityId: string
  userId: string
  postId: string
  inputSha256Hex: string
}

function makeJobOpts(dedupId: string): Partial<JobOptions> {
  return {
    priority: PRIORITY_DEFAULT,
    deduplication: { id: dedupId, mode: 'debounce', ttl: DEDUPLICATION_TTL_MS },
  }
}

const enqueueBanEvasionJob = createBackgroundEnqueue(MODERATION_SIGNALS_BAN_EVASION_JOB)

export const enqueueBulkDetectBanEvasionAfterPostEmbeddings = createBackgroundBulkEnqueue(
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  (item: BanEvasionPostEmbeddingTrigger) => ({
    data: { communityId: item.communityId, userId: item.userId, postId: item.postId },
    opts: makeJobOpts(
      buildPostEmbeddingDedupId(item.communityId, item.userId, item.postId, item.inputSha256Hex),
    ),
  }),
)

/** Enqueue detection for the first community post trigger (debounce-deduped per user+community). */
export async function enqueueDetectBanEvasion(
  communityId: string,
  userId: string,
  postId: string,
): Promise<void> {
  await enqueueBanEvasionJob(
    { communityId, userId, postId },
    makeJobOpts(`ban_evasion_${communityId}_${userId}`),
  )
}

/**
 * Enqueue detection after a first community post's embedding is available.
 * Uses a post-specific dedup key so it cannot be swallowed by the initial first-post trigger.
 *
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/queues/README.md`.
 */
export async function enqueueDetectBanEvasionAfterPostEmbedding(
  communityId: string,
  userId: string,
  postId: string,
  inputSha256Hex: string,
): Promise<void> {
  await enqueueBanEvasionJob(
    { communityId, userId, postId },
    makeJobOpts(buildPostEmbeddingDedupId(communityId, userId, postId, inputSha256Hex)),
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
    makeJobOpts(`ban_evasion_join_${communityId}_${userId}`),
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
