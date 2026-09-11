import { describe, it, expect } from 'vitest'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import type { NodeSavedState } from '@modules/bluesky-oauth'
import { BlueskyStateStore } from './state-store.mts'

const KEY_PREFIX = 'bluesky-oauth-state'

function fakeState(overrides: Partial<NodeSavedState> = {}): NodeSavedState {
  return {
    iss: 'https://bsky.social',
    authMethod: 'none',
    verifier: 'a-pkce-verifier',
    appState: JSON.stringify({ userId: crypto.randomUUID(), handle: 'alice.bsky.social' }),
    dpopJwk: { kty: 'EC', crv: 'P-256', x: 'x-coord', y: 'y-coord', d: 'private-d' },
    ...overrides,
  } as unknown as NodeSavedState
}

describe('BlueskyStateStore', () => {
  it('get returns undefined for a key that was never set', async () => {
    const store = new BlueskyStateStore()
    expect(await store.get(crypto.randomUUID())).toBeUndefined()
  })

  it('round-trips a value through set/get', async () => {
    const store = new BlueskyStateStore()
    const key = crypto.randomUUID()
    const value = fakeState()

    await store.set(key, value)

    expect(await store.get(key)).toEqual(value)
  })

  it('del removes the value', async () => {
    const store = new BlueskyStateStore()
    const key = crypto.randomUUID()

    await store.set(key, fakeState())
    await store.del(key)

    expect(await store.get(key)).toBeUndefined()
  })

  it('sets a bounded TTL rather than persisting indefinitely', async () => {
    const store = new BlueskyStateStore()
    const key = crypto.randomUUID()

    await store.set(key, fakeState())

    const ttlSeconds = await sessionValkeyClient.ttl(`${KEY_PREFIX}:${key}`)
    expect(ttlSeconds).toBeGreaterThan(0)
    expect(ttlSeconds).toBeLessThanOrEqual(600)
  })
})
