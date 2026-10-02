import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { BlueskyStateStore, getBlueskyLinkedAccountForUser } from '@services/bluesky-accounts'
import type { NodeSavedState } from '@modules/bluesky-oauth'
import testPrivateKey from '@modules/bluesky-oauth/test-jwk-private-key'

describe('GET /api/v1/auth/bluesky/callback invalid saved app state', () => {
  it.each([
    ['malformed JSON', '{'],
    ['missing authorization identity', '{}'],
  ])('redirects an authenticated user safely for %s', async (_description, appState) => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const store = new BlueskyStateStore()
    const stateKey = crypto.randomUUID()
    const savedState: NodeSavedState = {
      iss: 'https://bsky.social',
      authMethod: { method: 'none' },
      verifier: 'unused-before-provider-completion',
      appState,
      dpopJwk: testPrivateKey,
    }
    await store.set(stateKey, savedState)
    try {
      const response = await request
        .get(`/api/v1/auth/bluesky/callback?code=unused&state=${stateKey}`)
        .expect(302)

      const location = new URL(response.headers.location)
      expect(location.pathname).toBe('/my/identity')
      expect(location.searchParams.get('bluesky_error')).toBe('invalid_request')
      expect(location.searchParams.has('bluesky')).toBe(false)
      await expect(getBlueskyLinkedAccountForUser(user.id)).resolves.toBeNull()
      await expect(store.get(stateKey)).resolves.toEqual(savedState)
    } finally {
      await store.del(stateKey)
    }
  })
})
