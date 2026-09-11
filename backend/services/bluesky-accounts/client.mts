import { createBlueskyOAuthClient, type NodeOAuthClient } from '@modules/bluesky-oauth'
import { BlueskyStateStore } from './state-store.mts'
import { BlueskySessionStore } from './session-store.mts'

let clientPromise: Promise<NodeOAuthClient> | undefined

// Lazily constructs (and memoizes) the fully wired AT Protocol OAuth client: the
// @modules/bluesky-oauth SDK boundary, injected with this package's Valkey-backed StateStore and
// Postgres-backed SessionStore. Safe to memoize — NodeOAuthClient itself is stateless per request;
// all per-flow state lives in the injected stores, not on the client instance. Async because
// createBlueskyOAuthClient now resolves the private_key_jwt signing keyset (keyset.mts) before
// constructing the client.
export function getBlueskyOAuthClient(operationSignal?: AbortSignal): Promise<NodeOAuthClient> {
  if (operationSignal) {
    return createBlueskyOAuthClient(
      {
        stateStore: new BlueskyStateStore(),
        sessionStore: new BlueskySessionStore(),
      },
      operationSignal,
    )
  }
  clientPromise ??= createBlueskyOAuthClient({
    stateStore: new BlueskyStateStore(),
    sessionStore: new BlueskySessionStore(),
  })
  return clientPromise
}
