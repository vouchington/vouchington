import type { NodeOAuthClient } from '@atproto/oauth-client-node'

// Revokes the access token at the authorization server and deletes the stored session
// (client.revoke() calls sessionStore.del(did) internally, which — see
// @services/bluesky-accounts/session-store.mts — deletes the bluesky_linked_accounts row
// outright). This is the entire implementation of "unlink a Bluesky account": there is no
// separate application-level delete step.
/* no-mistakes: integration=bluesky */
export async function revokeBlueskySession(client: NodeOAuthClient, did: string): Promise<void> {
  await client.revoke(did)
}
