import {
  NodeOAuthClient,
  type NodeSavedStateStore,
  type NodeSavedSessionStore,
} from '@atproto/oauth-client-node'
import { unicastFetchWrap, type Fetch } from '@atproto-labs/fetch-node'
import { AtprotoHandleResolverNode } from '@atproto-labs/handle-resolver-node'
import { getProviderFetch } from '@modules/api-egress-proxy'
import { getBlueskyClientMetadata } from './client-metadata.mts'
import { getBlueskyKeyset } from './keyset.mts'

export interface BlueskyOAuthStores {
  stateStore: NodeSavedStateStore
  sessionStore: NodeSavedSessionStore
}

// Constructs the AT Protocol OAuth client. Deliberately takes the state/session store
// implementations as parameters rather than reaching for Valkey/Postgres itself — this module
// owns only the @atproto/oauth-client-node SDK boundary (DPoP, PAR, authorization-server metadata
// discovery all happen inside the SDK, not hand-rolled here); @services/bluesky-accounts owns the
// storage implementations backed by this app's own bluesky_linked_accounts table.
//
// clientMetadata and keyset are resolved from the same getBlueskyClientMetadata()/getBlueskyKeyset()
// singletons the GET /client-metadata.json route uses, so the SDK always signs token requests with
// exactly the key it also advertised publicly.
//
// No requestLock is provided: this app has no distributed-lock utility yet (confirmed via repo
// search), so the SDK falls back to its default in-process lock, logging a one-time warning. This
// is a real (if narrow) session-loss risk, not merely a wasted call: if two processes refresh the
// same DID's session concurrently and the authorization server rotates refresh tokens (standard
// OAuth behavior), the loser's stale-refresh-token-derived write can overwrite the winner's
// freshly rotated session in SessionStore — and an AS that additionally does refresh-token-reuse
// detection can then revoke both tokens, permanently invalidating that DID's link and forcing the
// user to re-link. A real distributed lock would close this, but every Bluesky-token-touching
// queue job this codebase adds is required to run at worker concurrency 1, which already removes
// the only multi-process writer this app controls; the remaining exposure is a concurrent
// interactive request racing a queue job, judged rare enough that the lock is a follow-up rather
// than a Phase D blocker.
//
// fetch is bound to the API's guarded external dispatcher (getExternalFetch()) so the SDK's token
// and PAR requests flow through the same egress guardrail as first-party fetches — see
// @modules/utils/http-egress-guardrail.mts.
/* no-mistakes: integration=bluesky */
export async function createBlueskyOAuthClient(
  stores: BlueskyOAuthStores,
  operationSignal?: AbortSignal,
): Promise<NodeOAuthClient> {
  const [clientMetadata, keyset] = await Promise.all([
    getBlueskyClientMetadata(),
    getBlueskyKeyset(),
  ])
  const providerFetch = getProviderFetch('bluesky_oauth_enabled')
  const baseFetch: Fetch = async (input, init) =>
    providerFetch(input, {
      ...init,
      ...(operationSignal
        ? {
            signal: init?.signal
              ? AbortSignal.any([init.signal, operationSignal])
              : operationSignal,
          }
        : {}),
    })
  return new NodeOAuthClient({
    clientMetadata,
    keyset,
    stateStore: stores.stateStore,
    sessionStore: stores.sessionStore,
    fetch: unicastFetchWrap({ fetch: baseFetch }),
    // The resolver adds safeFetchWrap itself; give it the unwrapped base fetch so DNS/IP
    // validation is applied exactly once while ordinary OAuth requests use unicastFetchWrap.
    handleResolver: new AtprotoHandleResolverNode({ fetch: baseFetch }),
  })
}
