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
  deleteBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  type BlueskyFollowReceipt,
} from './receipts.mts'
import { deleteFollowOnBluesky } from './agent.mts'
import { drainBlueskyFolloweeReceiptsPage } from './drain-followee-receipts.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { withBlueskyDisconnectLock } from './disconnect-lock.mts'

type ExactGeneration = { blueskyDid: string; linkAuthorizationId: string }

// Best-effort, like sanitizeStripeCustomers in @services/users/delete.mts: one Bluesky failure
// must not block the others or the disconnect itself. Successful deletes remove receipts eagerly;
// failures leave them until the exact linked-account generation is revoked, whose foreign-key
// cascade prevents any later credential from adopting an old repo URI.
async function deleteBlueskyFollowRecordsForFollower(
  session: OAuthSession,
  receipts: BlueskyFollowReceipt[],
): Promise<void> {
  for (const receipt of receipts) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- serial so one Bluesky outage can't fan out into unbounded concurrent calls
      await deleteFollowOnBluesky(session, receipt.record_uri)
      // oxlint-disable-next-line no-await-in-loop -- see above
      await deleteBlueskyFollowReceipt(
        receipt.follower_user_id,
        receipt.followee_user_id,
        receipt.follower_bluesky_did,
        receipt.follower_account_link_authorization_id,
      )
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
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

async function disconnectAcceptedBlueskyAccountWithoutLock(
  userId: string,
  generation: ExactGeneration,
): Promise<void> {
  const linked = await getExactBlueskyAccountForDisconnect(userId, generation)
  if (!linked) return
  await cleanupBlueskyFollowsBeforeAcceptedDisconnect(userId, linked)
  await disconnectAcceptedBlueskyGeneration(userId, generation)
}

async function cleanupBlueskyFollowsBeforeAcceptedDisconnect(
  userId: string,
  linked: BlueskyLinkedAccount,
): Promise<void> {
  // One page now; a full page enqueues its continuation before revocation, so a failed enqueue
  // leaves the generation retryable instead of stranding the remainder.
  await drainBlueskyFolloweeReceiptsPage(userId)
  await cleanupFollowerRoleBeforeDisconnect(userId, linked)
}

async function cleanupFollowerRoleBeforeDisconnect(
  userId: string,
  linked: BlueskyLinkedAccount,
): Promise<void> {
  let receipts = await listBlueskyFollowReceiptsForFollower(
    userId,
    linked.bluesky_did,
    linked.link_authorization_id,
    null,
  )
  if (receipts.length === 0) return
  await runWithAttachedBlueskySession(userId, linked.link_authorization_id, async () => {
    let session: OAuthSession
    try {
      session = await restoreBlueskySession(await getBlueskyOAuthClient(), linked.bluesky_did)
    } catch (err) {
      // Authentication is best-effort; local page-read failures must leave the generation retryable.
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
    // Every receipt must be attempted before revocation; failed deletes stay behind the cursor.
    /* oxlint-disable no-await-in-loop -- ordered page operations depend on the preceding page */
    for (;;) {
      const cursor = receipts.at(-1)!.followee_user_id

      // no-mistakes-disable-next-line query-reached-per-item: each bounded receipt page is attempted before revocation; failed remote deletes must remain behind the physical cursor
      await deleteBlueskyFollowRecordsForFollower(session, receipts)

      // no-mistakes-disable-next-line query-reached-per-item: one exact-generation keyset page follows the preceding remote-cleanup page
      receipts = await listBlueskyFollowReceiptsForFollower(
        userId,
        linked.bluesky_did,
        linked.link_authorization_id,
        cursor,
      )
      if (receipts.length === 0) break
    }
    /* oxlint-enable no-await-in-loop */
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
