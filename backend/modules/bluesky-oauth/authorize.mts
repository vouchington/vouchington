import type { NodeOAuthClient } from '@atproto/oauth-client-node'
import { withProviderOperationTimeout } from '@modules/api-egress-proxy'

// Begins the AT Protocol OAuth authorization flow for `handle` (a user-supplied Bluesky handle or
// DID). Resolves the account's identity and authorization server, negotiates PAR (falling back to
// a direct authorization URL only if the server doesn't support PAR), and returns the URL the
// caller must redirect the user's browser to. `appState` round-trips opaquely through the
// authorization server and comes back on the callback — used to carry the linking Voucha user ID
// and the originally-typed handle (see @services/bluesky-accounts/link.mts).
/* no-mistakes: integration=bluesky */
export async function beginBlueskyAuthorization(
  client: NodeOAuthClient,
  handle: string,
  appState: string,
): Promise<URL> {
  return withProviderOperationTimeout('Bluesky', signal =>
    client.authorize(handle, { state: appState, signal }),
  )
}
