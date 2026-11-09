import {
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import { enqueueDisconnectRequested } from '@queues/bluesky-follow-propagation/enqueues'
import {
  disconnectAcceptedBlueskyGeneration,
  getExactBlueskyAccountForDisconnect,
  getBlueskyOAuthClient,
  runWithAttachedBlueskySession,
  type BlueskyLinkedAccount,
} from '@services/bluesky-accounts'
import { restoreBlueskySession, type OAuthSession } from '@modules/bluesky-oauth'
import onError from '@modules/on-error'
import {
  deleteBlueskyFollowReceipts,
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage,
  listBlueskyFollowReceiptsForFollower,
  START_OF_IDS,
  type BlueskyFollowReceipt,
} from './receipts.mts'
import { deleteFollowOnBluesky } from './agent.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { withBlueskyDisconnectLock } from './disconnect-lock.mts'
import { getBlueskyFollowsWorkLimit } from './work-limits.mts'

type ExactGeneration = {
  blueskyDid: string
  linkAuthorizationId: string
} & ({ after?: string; followerAfter?: never } | { followerAfter: string; after?: never })

// Best-effort, like sanitizeStripeCustomers in @services/users/delete.mts: one Bluesky failure
// must not block the others or the disconnect itself. Successful deletes remove receipts eagerly;
// failures leave them until the exact linked-account generation is revoked, whose foreign-key
// cascade prevents any later credential from adopting an old repo URI.
async function deleteBlueskyFollowRecordsForFollower(
  userId: string,
  linked: BlueskyLinkedAccount,
  session: OAuthSession,
  receipts: BlueskyFollowReceipt[],
): Promise<void> {
  // The page bounds both provider concurrency and total calls in this job.
  const attempted = await Promise.all(
    receipts.map(async receipt => {
      try {
        await deleteFollowOnBluesky(session, receipt.record_uri)
        return { followeeUserId: receipt.followee_user_id, recordUri: receipt.record_uri }
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    }),
  )
  await deleteBlueskyFollowReceipts(
    userId,
    attempted.filter(receipt => receipt !== null),
    linked.bluesky_did,
    linked.link_authorization_id,
  )
}

// Follower-role receipts (this user is follower_user_id) get one more step first: deleting the
// actual app.bsky.graph.follow record on Bluesky, before the session below is revoked. Skipping
// that and only clearing the local receipt would orphan a still-live follow record with nothing
// tracking it — the next reconcile pass (e.g. after this user re-links, even a different account)
// would see `desired && !receipt` and mint a *second* record for the same pair. Receipts owned by
// other followers need no such step because this user cannot delete records from their repos. A
// self-follow belongs to this user's follower role and must remain for the remote-delete step.
export async function disconnectAcceptedBlueskyAccountAndCleanupFollows(
  userId: string,
  generation: ExactGeneration,
): Promise<void> {
  await withBlueskyDisconnectLock(userId, () =>
    disconnectAcceptedBlueskyAccountWithoutLock(userId, generation),
  )
}

// Each run removes at most one local followee-role page and attempts at most one remote
// follower-role page. Explicit followerAfter continuations skip the already completed followee
// phase; after remains exclusively its follower-id cursor. No lock spans multiple jobs. A lost
// continuation is re-driven from the head by the pending-disconnect sweep. The one-account-per-
// user unique index prevents relinking until the exact generation is revoked.
async function disconnectAcceptedBlueskyAccountWithoutLock(
  userId: string,
  generation: ExactGeneration,
): Promise<void> {
  const linked = await getExactBlueskyAccountForDisconnect(userId, generation)
  if (!linked) return
  if (generation.followerAfter === undefined) {
    const page = await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowersPage(
      userId,
      generation.after ?? START_OF_IDS,
    )
    if (page.hasMore) {
      // Failed admission leaves the generation pending and retryable, before any revocation.
      await enqueueDisconnectRequested({
        userId,
        blueskyDid: linked.bluesky_did,
        linkAuthorizationId: linked.link_authorization_id,
        after: page.lastFollowerUserId!,
      })
      return
    }
  }
  const page = await cleanupFollowerRoleBeforeDisconnect(
    userId,
    linked,
    generation.followerAfter ?? START_OF_IDS,
  )
  if (page.hasMore) {
    await enqueueDisconnectRequested({
      userId,
      blueskyDid: linked.bluesky_did,
      linkAuthorizationId: linked.link_authorization_id,
      followerAfter: page.lastFolloweeUserId!,
    })
    return
  }
  await disconnectAcceptedBlueskyGeneration(userId, generation)
}

async function cleanupFollowerRoleBeforeDisconnect(
  userId: string,
  linked: BlueskyLinkedAccount,
  afterFolloweeUserId: string,
): Promise<{ lastFolloweeUserId: string | null; hasMore: boolean }> {
  const batchSize = getBlueskyFollowsWorkLimit('disconnect_batch_size')
  const receipts = await listBlueskyFollowReceiptsForFollower(
    userId,
    linked.bluesky_did,
    linked.link_authorization_id,
    afterFolloweeUserId,
    batchSize,
  )
  if (receipts.length === 0) return { lastFolloweeUserId: null, hasMore: false }
  return runWithAttachedBlueskySession(userId, linked.link_authorization_id, async () => {
    let session: OAuthSession
    try {
      session = await restoreBlueskySession(await getBlueskyOAuthClient(), linked.bluesky_did)
    } catch (err) {
      // Preserve best-effort authentication: an unavailable credential does not block revocation.
      // Page reads and local batch writes are outside this catch, so datastore failures retry.
      onError(err instanceof Error ? err : new Error(String(err)))
      return { lastFolloweeUserId: null, hasMore: false }
    }
    await deleteBlueskyFollowRecordsForFollower(userId, linked, session, receipts)
    // Advance over every attempted URI, including provider failures, so a failed front item does
    // not starve the rest. Failed receipts remain until the exact-generation revoke cascades them.
    return {
      lastFolloweeUserId: receipts.at(-1)!.followee_user_id,
      hasMore: receipts.length === batchSize,
    }
  })
}

export async function disconnectBlueskyAccountAndCleanupFollows(
  userId: string,
  dependencies?: { query?: TransactionQuery },
): Promise<void> {
  await runWithTransaction(dependencies?.query, async query => {
    await query(
      '/* requestBlueskyDisconnect:lockUser */ SELECT fn_lock_active_user_for_mutation($1)',
      [userId],
    )
    const request = await requestBlueskyDisconnect(userId, { query })
    registerPostCommitAction(query, () =>
      withBlueskyDisconnectLock(userId, async () => {
        try {
          await enqueueDisconnectRequested(request)
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)))
          await disconnectAcceptedBlueskyAccountWithoutLock(userId, request)
        }
      }),
    )
  })
}
