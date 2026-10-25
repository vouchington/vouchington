import type {
  NodeOAuthClient,
  NodeSavedStateStore,
  NodeSavedSessionStore,
} from '@atproto/oauth-client-node'
import { createAtprotoOAuthClient } from '@vouchington/oauth-client/atproto'
import { getProviderFetch } from '@modules/api-egress-proxy'
import { getBlueskyClientMetadata } from './client-metadata.mts'
import { getBlueskyKeyset } from './keyset.mts'

export interface BlueskyOAuthStores {
  stateStore: NodeSavedStateStore
  sessionStore: NodeSavedSessionStore
}

// Constructs the AT Protocol OAuth client. Takes the state/session store implementations as
// parameters because @services/bluesky-accounts owns the storage backed by this app's own
// bluesky_linked_accounts table; DPoP, PAR and discovery live in the SDK and
// @vouchington/oauth-client.
//
// clientMetadata and keyset come from the same getBlueskyClientMetadata()/getBlueskyKeyset()
// singletons the GET /client-metadata.json route uses, so the SDK always signs token requests with
// exactly the key it also advertised publicly.
//
// No requestLock is provided: this app has no distributed-lock utility, so the SDK falls back to
// its in-process lock. Concurrent refreshes of one DID across processes can overwrite a rotated
// session and, under refresh-token-reuse detection, force the user to re-link. Every
// Bluesky-token-touching queue job runs at queue-wide concurrency 1, which removes the only
// multi-process writer this app controls; a concurrent interactive request racing a queue job
// remains the narrow exposure.
//
// fetch is bound to the API's egress-routed provider transport so token and PAR requests flow
// through the same egress guardrail as first-party fetches.
/* no-mistakes: integration=bluesky */
export async function createBlueskyOAuthClient(
  stores: BlueskyOAuthStores,
  operationSignal?: AbortSignal,
): Promise<NodeOAuthClient> {
  const [clientMetadata, keyset] = await Promise.all([
    getBlueskyClientMetadata(),
    getBlueskyKeyset(),
  ])
  return createAtprotoOAuthClient({
    clientMetadata,
    keyset,
    stateStore: stores.stateStore,
    sessionStore: stores.sessionStore,
    fetch: getProviderFetch('bluesky_oauth_enabled'),
    operationSignal,
  })
}
