import {
  reconcileBlueskyFollow,
  listPendingBlueskyDisconnectPage,
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  listBlueskyFollowPropagationCandidatePage,
  drainBlueskyFolloweeReceiptsPage,
} from '@services/bluesky-follows'
import {
  enqueueBackfillBlueskyDisconnectRequestsContinuation,
  enqueueBackfillBlueskyFollowPropagationContinuation,
  enqueueBulkDisconnectRequested,
  enqueueBulkReconcileBlueskyFollow,
  type DisconnectRequestedData,
  type DrainFolloweeReceiptsData,
  type ReconcileFollowData,
} from '@queues/bluesky-follow-propagation/enqueues'

export async function disconnectRequested(data: DisconnectRequestedData): Promise<void> {
  await disconnectAcceptedBlueskyAccountAndCleanupFollows(data.userId, data)
}

/** Deletes one page of other followers' receipts and enqueues the next page when this one was full. */
export async function drainFolloweeReceipts(data: DrainFolloweeReceiptsData): Promise<void> {
  await drainBlueskyFolloweeReceiptsPage(data.userId, data.after)
}

/**
 * Enqueues one bounded page of pending disconnect requests after `afterId`, then continues from the
 * page's last authorization id, so a backlog never runs inside one job.
 */
export async function backfillBlueskyDisconnectRequests(
  afterId?: string,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const { requests, hasMore } = await listPendingBlueskyDisconnectPage(afterId)
  if (requests.length > 0) await enqueueBulkDisconnectRequested(requests)
  if (hasMore)
    await enqueueBackfillBlueskyDisconnectRequestsContinuation(requests.at(-1)!.linkAuthorizationId)
  return { enqueued: requests.length, hasMore }
}

// Idempotent by construction: reconcileBlueskyFollow always re-derives desired state from
// relation__user__follow__user and compares it against the bluesky_follow_records receipt, so
// running this job twice for the same pair (retry, duplicate enqueue, backfill) is a no-op once
// the pair is in sync.
export async function reconcileFollow(data: ReconcileFollowData) {
  await reconcileBlueskyFollow(data.followerUserId, data.followeeUserId)
}

// Enqueues one bounded page of reconcile candidates from PostgreSQL after `after`, then continues
// from the page's last pair. Safe to run at any time — reconcileFollow no-ops for any pair already
// in sync, so over-inclusion is harmless. See @services/bluesky-follows/backfill.mts for the
// candidate query.
export async function backfillBlueskyFollowPropagation(after?: ReconcileFollowData) {
  const { candidates, hasMore } = await listBlueskyFollowPropagationCandidatePage(after)
  if (candidates.length > 0) await enqueueBulkReconcileBlueskyFollow(candidates)
  if (hasMore) await enqueueBackfillBlueskyFollowPropagationContinuation(candidates.at(-1)!)
  return { enqueued: candidates.length, hasMore }
}
