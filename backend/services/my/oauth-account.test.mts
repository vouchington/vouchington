import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  deleteTestOAuthAuthorizationFixtures,
  getOAuthAccountUnlinkedAt,
  getTestOAuthAccountRaw,
  insertTestGithubFriend,
  testGithubFriendExists,
  createTestRetentionWindow,
  backdateOAuthAccountUnlinkedAt,
  oauthAccountExistsByProviderUserId,
} from '@voucha/test-helpers'
import { upsertOAuthAccount } from '../oauth-accounts/upsert.mts'
import { disconnectOAuthAccount } from './oauth-account.mts'
import { cleanupOAuthFriendEdgePage } from '../data-retention/cleanup-oauth-friend-edges.mts'
import { deleteOrphanedOAuthAccountBatch } from '../data-retention/cleanup-batches.mts'

describe('disconnectOAuthAccount', () => {
  it('scrubs the provider account atomically and drains both edge directions in bounded pages', async () => {
    const user = await createTestUser()
    const providerUserId = `github-disconnect-${randomUUID()}`
    const otherProviderUserId = `github-friend-${randomUUID()}`
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        githubUserIds: [providerUserId, otherProviderUserId],
        userIds: [user.id],
      }),
    )
    const account = await upsertOAuthAccount(
      'github',
      providerUserId,
      `tests+${randomUUID()}@voucha.ai`,
      { login: 'sensitive-profile' },
      { accessToken: 'sensitive-access', refreshToken: 'sensitive-refresh' },
    )
    const other = await upsertOAuthAccount('github', otherProviderUserId, null, {})
    if (!account.account_id || !other.account_id) throw new Error('GitHub account ID missing')
    await connectTestOAuthAccount('github', user.id, providerUserId)
    const ownEdge = await insertTestGithubFriend(
      account.account_id,
      `own-${randomUUID()}`,
      new Date(),
    )
    const incomingEdge = await insertTestGithubFriend(
      other.account_id,
      `incoming-${randomUUID()}`,
      new Date(),
      account.account_id,
    )

    await disconnectOAuthAccount(user.id, 'github')

    expect(await getTestOAuthAccountRaw('github', providerUserId)).toMatchObject({
      user_id: null,
      provider_user_email_address: null,
      provider_user_data: {},
      access_token: null,
      refresh_token: null,
      access_token_expires_at: null,
    })
    expect(await getOAuthAccountUnlinkedAt('github', providerUserId)).toBeInstanceOf(Date)
    expect(await testGithubFriendExists(ownEdge)).toBe(true)
    expect(await testGithubFriendExists(incomingEdge)).toBe(true)
    const window = createTestRetentionWindow()
    await backdateOAuthAccountUnlinkedAt('github', providerUserId, window.firstEligibleDate)
    expect(
      await deleteOrphanedOAuthAccountBatch(
        'github_accounts',
        'github_user_id',
        window.upperBoundDate,
        1,
        window.lowerBoundDate,
      ),
    ).toBe(0)
    expect(await oauthAccountExistsByProviderUserId('github', providerUserId)).toBe(true)
    expect(
      await cleanupOAuthFriendEdgePage(
        'github',
        'erase',
        1,
        new Date('2100-01-01'),
        account.account_id,
      ),
    ).toMatchObject({
      deleted: 1,
      worked: true,
      hasMore: true,
    })
    expect(await testGithubFriendExists(ownEdge)).toBe(false)
    expect(await testGithubFriendExists(incomingEdge)).toBe(true)
    expect(
      await cleanupOAuthFriendEdgePage(
        'github',
        'erase',
        1,
        new Date('2100-01-01'),
        account.account_id,
      ),
    ).toMatchObject({
      deleted: 1,
      worked: true,
      hasMore: false,
    })
    expect(await testGithubFriendExists(incomingEdge)).toBe(false)
    expect(
      await deleteOrphanedOAuthAccountBatch(
        'github_accounts',
        'github_user_id',
        window.upperBoundDate,
        1,
        window.lowerBoundDate,
      ),
    ).toBe(1)
  })
})
