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
  deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowers,
  listBlueskyFollowReceiptsForFollower,
  type BlueskyFollowReceipt,
} from './receipts.mts'
import { deleteFollowOnBluesky } from './agent.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import { withBlueskyDisconnectLock } from './disconnect-lock.mts'

type ExactGeneration = { blueskyDid: string; linkAuthorizationId: string }
type DisconnectExactGeneration = (userId: string, generation: ExactGeneration) => Promise<void>

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
        receipt.follower_authorization_id,
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
  dependencies?: { disconnectWithoutLock?: DisconnectExactGeneration },
): Promise<void> {
  await withBlueskyDisconnectLock(userId, () =>
    (dependencies?.disconnectWithoutLock ?? disconnectAcceptedBlueskyAccountWithoutLock)(
      userId,
      generation,
    ),
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
  await deleteBlueskyFollowReceiptsForFolloweeFromOtherFollowers(userId)
  await cleanupFollowerRoleBeforeDisconnect(userId, linked)
}

async function cleanupFollowerRoleBeforeDisconnect(
  userId: string,
  linked: BlueskyLinkedAccount,
): Promise<void> {
  const receipts = await listBlueskyFollowReceiptsForFollower(
    userId,
    linked.bluesky_did,
    linked.link_authorization_id,
  )
  if (receipts.length > 0) {
    try {
      await runWithAttachedBlueskySession(userId, linked.link_authorization_id, async () => {
        const session = await restoreBlueskySession(
          await getBlueskyOAuthClient(),
          linked.bluesky_did,
        )
        await deleteBlueskyFollowRecordsForFollower(session, receipts)
      })
    } catch (err) {
      // Could not even authenticate to attempt cleanup (e.g. an already-invalid session).
      // Disconnect still succeeds; revoking the exact account generation cascades its receipts.
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
}

export async function disconnectBlueskyAccountAndCleanupFollows(
  userId: string,
  dependencies?: {
    enqueueDisconnectRequested?: typeof enqueueDisconnectRequested
    reportError?: typeof onError
    disconnectWithoutLock?: DisconnectExactGeneration
  },
): Promise<void> {
  await withBlueskyDisconnectLock(userId, async () => {
    const request = await requestBlueskyDisconnect(userId)
    try {
      await (dependencies?.enqueueDisconnectRequested ?? enqueueDisconnectRequested)(request)
    } catch (error) {
      const reportError = dependencies?.reportError ?? onError
      reportError(error instanceof Error ? error : new Error(String(error)))
      await (dependencies?.disconnectWithoutLock ?? disconnectAcceptedBlueskyAccountWithoutLock)(
        userId,
        request,
      )
    }
  })
}
