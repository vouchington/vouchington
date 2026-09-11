import createHttpError from 'http-errors'
import { revokeBlueskySession } from '@modules/bluesky-oauth'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { getBlueskyOAuthClient } from './client.mts'
import { getBlueskyLinkedAccountForUser, getExactBlueskyAccountForDisconnect } from './connect.mts'
import { runWithAttachedBlueskySession } from './session-lifecycle-context.mts'

// Unlinks the current user's Bluesky account. Looks the DID up scoped to `userId` first (so a
// caller can never revoke another user's session by guessing/knowing their DID), then delegates
// to revokeBlueskySession: client.revoke(did) revokes the token at the authorization server and
// deletes the bluesky_linked_accounts row via SessionStore.del() (session-store.mts) — there is no
// separate application-level delete step.
export async function disconnectBlueskyAccountFromUser(
  userId: string,
  expectedGeneration?: { blueskyDid: string; linkAuthorizationId: string },
): Promise<void> {
  const linked = await getBlueskyLinkedAccountForUser(userId)
  if (expectedGeneration && !linked) return
  if (!linked) throw createHttpError(404, 'No Bluesky account linked')
  if (
    expectedGeneration &&
    (linked.bluesky_did !== expectedGeneration.blueskyDid ||
      linked.link_authorization_id !== expectedGeneration.linkAuthorizationId)
  ) {
    return
  }

  await revokeLinkedBlueskyAccount(userId, linked.bluesky_did, linked.link_authorization_id)
}

export async function disconnectAcceptedBlueskyGeneration(
  userId: string,
  generation: { blueskyDid: string; linkAuthorizationId: string },
): Promise<void> {
  const linked = await getExactBlueskyAccountForDisconnect(userId, generation)
  if (!linked) return
  await revokeLinkedBlueskyAccount(userId, linked.bluesky_did, linked.link_authorization_id)
}

async function revokeLinkedBlueskyAccount(
  userId: string,
  blueskyDid: string,
  linkAuthorizationId: string,
): Promise<void> {
  await runWithAttachedBlueskySession(userId, linkAuthorizationId, async () => {
    await revokeBlueskySession(await getBlueskyOAuthClient(), blueskyDid)
  })
  // Busts the cached GET /api/v1/my/identity read (view_users_private.bluesky_account) — mirrors
  // disconnectOAuthAccount's invalidation call in @services/my/oauth-account.
  void enqueueOnUserUpdated(userId)
}
