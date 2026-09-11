import {
  reconcileBlueskyFollow,
  streamPendingBlueskyDisconnectBatches,
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  streamBlueskyFollowPropagationCandidateBatches,
} from '@services/bluesky-follows'
import {
  enqueueBulkDisconnectRequested,
  enqueueBulkReconcileBlueskyFollow,
  type DisconnectRequestedData,
} from '@queues/bluesky-follow-propagation/enqueues'

type ReconcileFollowDependencies = {
  reconcileBlueskyFollow: typeof reconcileBlueskyFollow
}

type BackfillDependencies = {
  enqueueBulkReconcileBlueskyFollow: typeof enqueueBulkReconcileBlueskyFollow
  streamBlueskyFollowPropagationCandidateBatches: typeof streamBlueskyFollowPropagationCandidateBatches
}

type DisconnectDependencies = {
  disconnectAcceptedBlueskyAccountAndCleanupFollows: typeof disconnectAcceptedBlueskyAccountAndCleanupFollows
}

type DisconnectBackfillDependencies = {
  enqueueBulkDisconnectRequested: typeof enqueueBulkDisconnectRequested
  streamPendingBlueskyDisconnectBatches: typeof streamPendingBlueskyDisconnectBatches
}

export async function disconnectRequested(
  data: DisconnectRequestedData,
  dependencies?: Partial<DisconnectDependencies>,
): Promise<void> {
  const disconnect =
    dependencies?.disconnectAcceptedBlueskyAccountAndCleanupFollows ??
    disconnectAcceptedBlueskyAccountAndCleanupFollows
  await disconnect(data.userId, data)
}

export async function backfillBlueskyDisconnectRequests(
  dependencies?: Partial<DisconnectBackfillDependencies>,
): Promise<{ enqueued: number }> {
  const streamBatches =
    dependencies?.streamPendingBlueskyDisconnectBatches ?? streamPendingBlueskyDisconnectBatches
  const enqueueBulk = dependencies?.enqueueBulkDisconnectRequested ?? enqueueBulkDisconnectRequested
  let enqueued = 0
  for await (const batch of streamBatches()) {
    await enqueueBulk(batch)
    enqueued += batch.length
  }
  return { enqueued }
}

// Idempotent by construction: reconcileBlueskyFollow always re-derives desired state from
// relation__user__follow__user and compares it against the bluesky_follow_records receipt, so
// running this job twice for the same pair (retry, duplicate enqueue, backfill) is a no-op once
// the pair is in sync.
export async function reconcileFollow(
  data: { followerUserId: string; followeeUserId: string },
  dependencies?: Partial<ReconcileFollowDependencies>,
) {
  const reconcile = dependencies?.reconcileBlueskyFollow ?? reconcileBlueskyFollow
  await reconcile(data.followerUserId, data.followeeUserId)
}

// Streams reconcile candidates from PostgreSQL and bulk-enqueues one reconcileFollow job per
// batch. Safe to run at any time — reconcileFollow no-ops for any pair already in sync, so
// over-inclusion is harmless. See @services/bluesky-follows/backfill.mts for the candidate query.
export async function backfillBlueskyFollowPropagation(
  dependencies?: Partial<BackfillDependencies>,
) {
  const streamBatches =
    dependencies?.streamBlueskyFollowPropagationCandidateBatches ??
    streamBlueskyFollowPropagationCandidateBatches
  const enqueueBulk =
    dependencies?.enqueueBulkReconcileBlueskyFollow ?? enqueueBulkReconcileBlueskyFollow
  let enqueued = 0
  for await (const batch of streamBatches()) {
    await enqueueBulk(batch)
    enqueued += batch.length
  }
  return { enqueued }
}
