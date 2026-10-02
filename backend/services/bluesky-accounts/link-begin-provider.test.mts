import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  getTestBlueskyLinkAuthorizationRow,
} from '@voucha/test-helpers'
import { getBlueskyOAuthClient } from './client.mts'
import { deleteTestBlueskyLinkFixtures } from '@voucha/test-helpers/entities/bluesky-link-cleanup'
import { beginBlueskyAccountLink } from './link-service.mts'

function fakeHandle(): string {
  return `user-${createRandomString(6)}.bsky.social`
}

describe('beginBlueskyAccountLink provider failure', () => {
  const authorizationIds: string[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await deleteTestBlueskyLinkFixtures({ authorizationIds: authorizationIds.splice(0) })
  })

  it('rejects the durable authorization when the OAuth provider fails to begin', async () => {
    vi.stubEnv('SITE_ORIGIN', 'https://oauth-test.voucha.example')
    const providerError = new Error('OAuth authorization endpoint unavailable')
    const client = await getBlueskyOAuthClient()
    const authorize = vi
      .spyOn(client, 'authorize')
      .mockImplementationOnce(async (_handle, options) => {
        if (!options?.state) throw new Error('OAuth authorization did not include app state')
        const { authorizationId } = JSON.parse(options.state) as { authorizationId: string }
        authorizationIds.push(authorizationId)
        throw providerError
      })
    const user = await createTestUserDirect()
    const handle = fakeHandle()

    await expect(beginBlueskyAccountLink(user.id, handle)).rejects.toBe(providerError)

    expect(authorize).toHaveBeenCalledOnce()
    expect(authorize).toHaveBeenCalledWith(
      handle,
      expect.objectContaining({ state: expect.any(String) }),
    )
    const options = authorize.mock.calls[0]![1]
    if (!options?.state) throw new Error('OAuth authorization did not include app state')
    const { authorizationId } = JSON.parse(options.state) as { authorizationId: string }
    await expect(getTestBlueskyLinkAuthorizationRow(authorizationId)).resolves.toMatchObject({
      id: authorizationId,
      status: 'rejected',
      handle: null,
    })
  })
})
