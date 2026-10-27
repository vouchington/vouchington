import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
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
    const actor = await createTestAccountChangeActor(user.id)
    await softDeleteUser(user.id)

    await expect(
      withPostgresTransactionForTest(query =>
        createBlueskyLinkAuthorization({
          userId: user.id,
          handle: 'deleted-user.bsky.social',
          callbackMode: 'web',
          initiatingSessionId: actor.session.sid,
          query,
        }),
      ),
    ).rejects.toThrow('cannot own new data after deletion')

    await expect(countTestBlueskyLinkAuthorizationsForUser(user.id)).resolves.toBe(0)
  })
})
