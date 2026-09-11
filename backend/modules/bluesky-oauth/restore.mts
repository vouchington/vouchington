import type { NodeOAuthClient, OAuthSession } from '@atproto/oauth-client-node'

// Rehydrates a previously-linked account's session from the stored (and, if expired, transparently
// refreshed) token set, returning an OAuthSession whose `.fetchHandler(pathname, init)` makes
// DPoP-signed, authenticated XRPC calls against the user's PDS. This is how Phase D3's follow
// propagation calls app.bsky.graph.follow on the linked user's behalf — see
// docs/overview/architecture/fediverse-federation.md's Phase D section.
/* no-mistakes: integration=bluesky */
export async function restoreBlueskySession(
  client: NodeOAuthClient,
  did: string,
): Promise<OAuthSession> {
  return client.restore(did)
}
