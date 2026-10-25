import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node'

// createBlueskyOAuthClient's only network-free, synchronously-observable behavior is
// NodeOAuthClient's constructor: it runs validateClientMetadata(clientMetadata, keyset)
// immediately (see @atproto/oauth-client's OAuthClient constructor), which is exactly the check
// that changed when this module switched from token_endpoint_auth_method: 'none' to
// 'private_key_jwt' with an inline jwks. Every other test of this module's collaborators
// (link.mock.test.mts, disconnect.mock.test.mts) mocks createBlueskyOAuthClient entirely, because
// the SDK also rejects the worktree's localhost SITEMAP_BASE_URL as a client_id/redirect_uri
// origin — so nothing else exercises real construction against the new metadata shape. This test
// overrides the site origin to a real https value so construction can run for real, proving the
// keyset + private_key_jwt + inline jwks combination getBlueskyClientMetadata() now produces is
// one validateClientMetadata actually accepts.
function inMemoryStateStore(): NodeSavedStateStore {
  const store = new Map<string, NodeSavedState>()
  return {
    get: async key => store.get(key),
    set: async (key, value) => void store.set(key, value),
    del: async key => void store.delete(key),
  }
}

function inMemorySessionStore(): NodeSavedSessionStore {
  const store = new Map<string, NodeSavedSession>()
  return {
    get: async key => store.get(key),
    set: async (key, value) => void store.set(key, value),
    del: async key => void store.delete(key),
  }
}

describe('createBlueskyOAuthClient', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('constructs a real NodeOAuthClient against a real https origin without throwing', async () => {
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    const { createBlueskyOAuthClient } = await import('./create-client.mts')

    const client = await createBlueskyOAuthClient({
      stateStore: inMemoryStateStore(),
      sessionStore: inMemorySessionStore(),
    })

    expect(client.clientMetadata.token_endpoint_auth_method).toBe('private_key_jwt')
    expect(client.clientMetadata.client_id).toBe('https://example.voucha.ai/client-metadata.json')
  })
})
