import { describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  getTestFriend,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import { holdTestOAuthAccountRow } from '@voucha/test-helpers/entities/oauth-friend-edge-locks'
import { persistGithubFriendPage } from '../friends-persistence.mts'

describe('GitHub reciprocal friend imports', () => {
  it('resolves both directions without incompatible account row locks', async () => {
    const alice = await createTestUser()
    const bob = await createTestUser()
    const aliceProviderId = `github-alice-${alice.id}`
    const bobProviderId = `github-bob-${bob.id}`
    const aliceAccount = await insertTestOAuthAccount('github', aliceProviderId)
    const bobAccount = await insertTestOAuthAccount('github', bobProviderId)
    if (!aliceAccount.account_id || !bobAccount.account_id) {
      throw new Error('GitHub account ids missing')
    }
    await connectTestOAuthAccount('github', alice.id, aliceProviderId)
    await connectTestOAuthAccount('github', bob.id, bobProviderId)

    // Both production imports must finish while shared account-row holders remain open.
    // A source FOR UPDATE/target FOR SHARE cycle would block here.
    const aliceHold = await holdTestOAuthAccountRow('github', aliceAccount.account_id, 'SHARE')
    const bobHold = await holdTestOAuthAccountRow('github', bobAccount.account_id, 'SHARE')
    try {
      const persisted = await Promise.all([
        persistGithubFriendPage(aliceAccount.account_id, alice.id, [bobProviderId]),
        persistGithubFriendPage(bobAccount.account_id, bob.id, [aliceProviderId]),
      ])
      expect(persisted).toEqual([true, true])
    } finally {
      await Promise.all([aliceHold.release(), bobHold.release()])
    }
    expect((await getTestFriend('github', aliceProviderId, bobProviderId))[0]).toMatchObject({
      friend_github_account_id: bobAccount.account_id,
    })
    expect((await getTestFriend('github', bobProviderId, aliceProviderId))[0]).toMatchObject({
      friend_github_account_id: aliceAccount.account_id,
    })
  })
})
