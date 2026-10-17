import {
  reconcileBlueskyFollow,
  listPendingBlueskyDisconnectPage,
  disconnectAcceptedBlueskyAccountAndCleanupFollows,
  listBlueskyFollowPropagationCandidatePage,
} from '@services/bluesky-follows'
import {
  enqueueBackfillBlueskyDisconnectRequestsContinuation,
  enqueueBackfillBlueskyFollowPropagationContinuation,
  enqueueBulkDisconnectRequested,
  enqueueBulkReconcileBlueskyFollow,
  type DisconnectRequestedData,
  type ReconcileFollowData,
} from '@queues/bluesky-follow-propagation/enqueues'

type ReconcileFollowDependencies = {
  reconcileBlueskyFollow: typeof reconcileBlueskyFollow
}

type BackfillDependencies = {
  enqueueBulkReconcileBlueskyFollow: typeof enqueueBulkReconcileBlueskyFollow
  enqueueBackfillBlueskyFollowPropagationContinuation: typeof enqueueBackfillBlueskyFollowPropagationContinuation
  listBlueskyFollowPropagationCandidatePage: typeof listBlueskyFollowPropagationCandidatePage
}

type DisconnectDependencies = {
  disconnectAcceptedBlueskyAccountAndCleanupFollows: typeof disconnectAcceptedBlueskyAccountAndCleanupFollows
}

type DisconnectBackfillDependencies = {
  enqueueBulkDisconnectRequested: typeof enqueueBulkDisconnectRequested
  enqueueBackfillBlueskyDisconnectRequestsContinuation: typeof enqueueBackfillBlueskyDisconnectRequestsContinuation
  listPendingBlueskyDisconnectPage: typeof listPendingBlueskyDisconnectPage
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

/**
 * Enqueues one bounded page of pending disconnect requests after `afterId`, then continues from the
 * page's last authorization id, so a backlog never runs inside one job.
 */
export async function backfillBlueskyDisconnectRequests(
  afterId?: string,
  dependencies?: Partial<DisconnectBackfillDependencies>,
): Promise<{ enqueued: number; hasMore: boolean }> {
  const listPage =
    dependencies?.listPendingBlueskyDisconnectPage ?? listPendingBlueskyDisconnectPage
  const enqueueBulk = dependencies?.enqueueBulkDisconnectRequested ?? enqueueBulkDisconnectRequested
  const enqueueContinuation =
    dependencies?.enqueueBackfillBlueskyDisconnectRequestsContinuation ??
    enqueueBackfillBlueskyDisconnectRequestsContinuation
  const { requests, hasMore } = await listPage(afterId)
  if (requests.length > 0) await enqueueBulk(requests)
  if (hasMore) await enqueueContinuation(requests.at(-1)!.linkAuthorizationId)
  return { enqueued: requests.length, hasMore }
}

// Idempotent by construction: reconcileBlueskyFollow always re-derives desired state from
// relation__user__follow__user and compares it against the bluesky_follow_records receipt, so
// running this job twice for the same pair (retry, duplicate enqueue, backfill) is a no-op once
// the pair is in sync.
export async function reconcileFollow(
  data: ReconcileFollowData,
  dependencies?: Partial<ReconcileFollowDependencies>,
) {
  const reconcile = dependencies?.reconcileBlueskyFollow ?? reconcileBlueskyFollow
  await reconcile(data.followerUserId, data.followeeUserId)
}

// Enqueues one bounded page of reconcile candidates from PostgreSQL after `after`, then continues
// from the page's last pair. Safe to run at any time — reconcileFollow no-ops for any pair already
// in sync, so over-inclusion is harmless. See @services/bluesky-follows/backfill.mts for the
// candidate query.
export async function backfillBlueskyFollowPropagation(
  after?: ReconcileFollowData,
  dependencies?: Partial<BackfillDependencies>,
) {
  const listPage =
    dependencies?.listBlueskyFollowPropagationCandidatePage ??
    listBlueskyFollowPropagationCandidatePage
  const enqueueBulk =
    dependencies?.enqueueBulkReconcileBlueskyFollow ?? enqueueBulkReconcileBlueskyFollow
  const enqueueContinuation =
    dependencies?.enqueueBackfillBlueskyFollowPropagationContinuation ??
    enqueueBackfillBlueskyFollowPropagationContinuation
  const { candidates, hasMore } = await listPage(after)
  if (candidates.length > 0) await enqueueBulk(candidates)
  if (hasMore) await enqueueContinuation(candidates.at(-1)!)
  return { enqueued: candidates.length, hasMore }
}
