import type { QueryOptions } from '@data-stores/psql'
import {
  getBlueskyLinkedAccountForUser,
  getBlueskyOAuthClient,
  runWithAttachedBlueskySession,
  type BlueskyLinkedAccount,
} from '@services/bluesky-accounts'
import { restoreBlueskySession } from '@modules/bluesky-oauth'
import { isFollowingUser } from '@services/users'
import onError from '@modules/on-error'
import {
  deleteBlueskyFollowReceipt,
  getBlueskyFollowReceipt,
  saveBlueskyFollowReceipt,
} from './receipts.mts'
import { createFollowOnBluesky, deleteFollowOnBluesky } from './agent.mts'

// Both helpers below bundle "restore the follower's session" with the dependent RPC that needs it,
// so each reconcile branch has only 2 sequential awaits left: the bundled RPC, then the local
// receipt write (see docs/requirements/platform/api-performance.md's sequential-await guidance).
async function performBlueskyFollow(
  followerUserId: string,
  follower: BlueskyLinkedAccount,
  followeeDid: string,
): Promise<string> {
  return await runWithAttachedBlueskySession(
    followerUserId,
    follower.link_authorization_id,
    async () => {
      const client = await getBlueskyOAuthClient()
      const session = await restoreBlueskySession(client, follower.bluesky_did)
      return createFollowOnBluesky(session, followeeDid)
    },
  )
}

async function performBlueskyUnfollow(
  followerUserId: string,
  follower: BlueskyLinkedAccount,
  followUri: string,
): Promise<void> {
  await runWithAttachedBlueskySession(followerUserId, follower.link_authorization_id, async () => {
    const session = await restoreBlueskySession(await getBlueskyOAuthClient(), follower.bluesky_did)
    await deleteFollowOnBluesky(session, followUri)
  })
}

// Drives a Bluesky app.bsky.graph.follow record to match Voucha's relation__user__follow__user
// state for one (follower, followee) pair. Safe to call repeatedly for the same pair — on both
// follow and unfollow, and from a backfill — because it always re-derives "desired" from the DB
// and only calls Bluesky when desired state and the local receipt (bluesky_follow_records)
// diverge. This is the reconcile pattern documented in
// docs/overview/architecture/fediverse-federation.md's Phase D section: no Follow/UndoFollow
// activity-type discriminant, just "make it match."
//
// No-ops (does not throw) whenever propagation isn't possible or isn't needed: either user
// missing a linked Bluesky account, or desired/receipt state already agree.
export async function reconcileBlueskyFollow(
  followerUserId: string,
  followeeUserId: string,
  options: QueryOptions = {},
): Promise<void> {
  const [followerAccount, followeeAccount] = await Promise.all([
    getBlueskyLinkedAccountForUser(followerUserId, options),
    getBlueskyLinkedAccountForUser(followeeUserId, options),
  ])
  if (!followerAccount || !followeeAccount) return

  const [desired, receipt] = await Promise.all([
    isFollowingUser(followerUserId, followeeUserId),
    getBlueskyFollowReceipt(
      followerUserId,
      followeeUserId,
      followerAccount.bluesky_did,
      followerAccount.link_authorization_id,
      options,
    ),
  ])

  if (desired && !receipt) {
    const uri = await performBlueskyFollow(
      followerUserId,
      followerAccount,
      followeeAccount.bluesky_did,
    )
    try {
      await saveBlueskyFollowReceipt(
        followerUserId,
        followeeUserId,
        followerAccount.bluesky_did,
        followerAccount.link_authorization_id,
        uri,
        options,
      )
    } catch (saveError) {
      // Bluesky now has a follow record with no local receipt tracking it — left alone, the next
      // reconcile would see `desired && !receipt` again and call performBlueskyFollow a second
      // time, minting a duplicate app.bsky.graph.follow record for the same pair. Undo the
      // just-created record so Bluesky and the (still-receiptless) local state agree, then rethrow
      // the original failure. A failure to undo is logged, not swallowed, but must not mask
      // saveError — the caller needs to know the receipt write failed.
      await performBlueskyUnfollow(followerUserId, followerAccount, uri).catch(undoError => {
        onError(undoError instanceof Error ? undoError : new Error(String(undoError)))
      })
      throw saveError
    }
    return
  }

  if (!desired && receipt) {
    await performBlueskyUnfollow(followerUserId, followerAccount, receipt.record_uri)
    await deleteBlueskyFollowReceipt(
      followerUserId,
      followeeUserId,
      followerAccount.bluesky_did,
      followerAccount.link_authorization_id,
      options,
    )
  }

  // desired === !!receipt already — already in sync, nothing to do.
}
