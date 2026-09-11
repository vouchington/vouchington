import type { NodeOAuthClient, OAuthSession } from '@atproto/oauth-client-node'
import {
  createProviderOperationSignal,
  rethrowProviderTransportError,
} from '@modules/api-egress-proxy'

export interface BlueskyOAuthCallbackResult {
  session: OAuthSession
  state: string | null
}

// Completes the AT Protocol OAuth flow from the authorization server's redirect back to this
// app's callback route. Looks up and deletes the matching state (replay-prevention), validates
// the issuer, exchanges the authorization code for a token set, and persists the resulting
// session via the injected SessionStore (client.callback() calls sessionStore.set(did, session)
// internally — see @services/bluesky-accounts/session-store.mts for the callback attribution and
// lifecycle fencing applied by that store). `session.did` is the account's DID;
// `state` is whatever opaque string was passed to beginBlueskyAuthorization's `appState`.
/* no-mistakes: integration=bluesky */
export async function completeBlueskyCallback(
  getClient: (signal: AbortSignal) => Promise<NodeOAuthClient>,
  params: URLSearchParams,
): Promise<BlueskyOAuthCallbackResult> {
  // callback() itself has no signal parameter, so inject the deadline into this operation's SDK
  // fetch boundary. Do not race the full callback: after provider I/O succeeds, sessionStore.set()
  // must settle before the request returns so a timeout cannot report failure while persisting the
  // linked session in the background.
  const signal = createProviderOperationSignal()
  try {
    return await (await getClient(signal)).callback(params)
  } catch (error) {
    rethrowProviderTransportError('Bluesky', error)
  }
}
