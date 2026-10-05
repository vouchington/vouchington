import { revokeBlueskySession } from '@modules/bluesky-oauth'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { getBlueskyOAuthClient } from './client.mts'
import { getExactBlueskyAccountForDisconnect } from './connect.mts'
import { runWithAttachedBlueskySession } from './session-lifecycle-context.mts'

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
