import { describe, expect, it } from 'vitest'
import {
  countTestBlueskyLinkAuthorizationsForUser,
  createTestUserDirect,
  softDeleteUser,
} from '@voucha/test-helpers'
import { createBlueskyLinkAuthorization } from './link-authorization.mts'

describe('createBlueskyLinkAuthorization active-user fence', () => {
  it('does not create authorization state for a deleted user', async () => {
    const user = await createTestUserDirect()
    await softDeleteUser(user.id)

    await expect(
      createBlueskyLinkAuthorization({
        userId: user.id,
        handle: 'deleted-user.bsky.social',
        callbackMode: 'web',
      }),
    ).rejects.toThrow('cannot own new data after deletion')

    await expect(countTestBlueskyLinkAuthorizationsForUser(user.id)).resolves.toBe(0)
  })
})
