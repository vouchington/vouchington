import { describe, expect, it, vi } from 'vitest'
import { beginBlueskyAuthorization } from './authorize.mts'
import type { NodeOAuthClient } from '@atproto/oauth-client-node'

describe('beginBlueskyAuthorization', () => {
  it('bounds SDK authorization with a fresh abort signal', async () => {
    const authorize = vi.fn<(typeof NodeOAuthClient.prototype)['authorize']>(
      async () => new URL('https://bsky.social/oauth'),
    )
    const client = { authorize } as Pick<NodeOAuthClient, 'authorize'> as NodeOAuthClient

    await expect(beginBlueskyAuthorization(client, 'alice.bsky.social', 'state')).resolves.toEqual(
      new URL('https://bsky.social/oauth'),
    )
    expect(authorize).toHaveBeenCalledWith(
      'alice.bsky.social',
      expect.objectContaining({ state: 'state', signal: expect.any(AbortSignal) }),
    )
  })
})
