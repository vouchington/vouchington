import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  getTestFriend,
  insertTestGithubFriend,
  insertTestOAuthAccount,
  setTestGithubFriendInvalidation,
  testGithubFriendCleanupComplete,
  testGithubFriendExists,
} from '@voucha/test-helpers'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { getTestFriendSyncStartTime } from '@voucha/test-helpers/entities/oauth-friend-edge-locks'
import { cleanupOAuthFriendEdgePage } from '../data-retention/cleanup-oauth-friend-edges.mts'
import { connectOAuthAccountToUser } from './connect.mts'
import { oauthAccountFriendWorkConfig } from './work-limits.mts'
import { disconnectOAuthAccount } from '../my/oauth-account.mts'

describe('bounded incoming friend resolution', () => {
  afterEach(() => closeScopedDynamicConfigContext([oauthAccountFriendWorkConfig]))

  it('drains a pre-unlink observation within the same millisecond as its marker', async () => {
    const account = await insertTestOAuthAccount('github', `github-microsecond-${randomUUID()}`)
    if (!account.account_id) throw new Error('GitHub account id missing')
    const stale = await insertTestGithubFriend(
      account.account_id,
      `stale-${randomUUID()}`,
      '2020-01-01 00:00:00.123400+00',
    )
    const newer = await insertTestGithubFriend(
      account.account_id,
      `newer-${randomUUID()}`,
      '2020-01-01 00:00:00.124000+00',
    )
    await setTestGithubFriendInvalidation(account.account_id, '2020-01-01 00:00:00.123900+00')

    expect(
      await cleanupOAuthFriendEdgePage(
        'github',
        'erase',
        1,
        new Date('2020-01-02T00:00:00Z'),
        account.account_id,
      ),
    ).toMatchObject({ deleted: 1, hasMore: false })
    expect(await testGithubFriendExists(stale)).toBe(false)
    expect(await testGithubFriendExists(newer)).toBe(true)
    expect(await testGithubFriendCleanupComplete(account.account_id)).toBe(true)
  })

  it('skips an old unresolved edge and completes the fresh target page', async () => {
    overrideDynamicConfigFieldsForTest(oauthAccountFriendWorkConfig, {
      friend_reference_connect_batch_size: 1,
    })
    const target = await createTestUser()
    const targetProviderId = `github-resolution-clock-target-${target.id}`
    const targetAccount = await insertTestOAuthAccount('github', targetProviderId)
    if (!targetAccount.account_id) throw new Error('Target GitHub account id missing')
    await connectTestOAuthAccount('github', target.id, targetProviderId)

    const staleProviderId = `github-resolution-clock-stale-${target.id}`
    const staleAccount = await insertTestOAuthAccount('github', staleProviderId)
    if (!staleAccount.account_id) throw new Error('Stale GitHub source id missing')
    const freshProviderId = `github-resolution-clock-fresh-${target.id}`
    const freshAccount = await insertTestOAuthAccount('github', freshProviderId)
    if (!freshAccount.account_id) throw new Error('Fresh GitHub source id missing')

    const oldObservation = await getTestFriendSyncStartTime()
    await disconnectOAuthAccount(target.id, 'github')
    await insertTestGithubFriend(staleAccount.account_id, targetProviderId, oldObservation)
    await insertTestGithubFriend(
      freshAccount.account_id,
      targetProviderId,
      await getTestFriendSyncStartTime(),
    )
    await connectOAuthAccountToUser('github', target.id, targetProviderId)

    const stale = (await getTestFriend('github', staleProviderId, targetProviderId))[0] as {
      friend_github_account_id: string | null
    }
    const fresh = (await getTestFriend('github', freshProviderId, targetProviderId))[0] as {
      friend_github_account_id: string | null
    }
    expect(stale.friend_github_account_id).toBeNull()
    expect(fresh.friend_github_account_id).toBe(targetAccount.account_id)
    expect(
      await cleanupOAuthFriendEdgePage(
        'github',
        'resolve',
        1,
        new Date('2100-01-01'),
        targetAccount.account_id,
      ),
    ).toMatchObject({ worked: false, hasMore: false })
  })

  it('resolves one edge on connect and resumes the rest from the durable marker', async () => {
    overrideDynamicConfigFieldsForTest(oauthAccountFriendWorkConfig, {
      friend_reference_connect_batch_size: 1,
    })
    const targetUser = await createTestUser()
    const targetProviderId = `github-resolution-target-${targetUser.id}`
    const targetAccount = await insertTestOAuthAccount('github', targetProviderId)
    if (!targetAccount.account_id) throw new Error('Target account id missing')
    const sourceIds: string[] = []
    for (const index of [0, 1]) {
      const sourceUser = await createTestUser()
      const providerId = `github-resolution-source-${index}-${sourceUser.id}`
      const sourceAccount = await insertTestOAuthAccount('github', providerId)
      if (!sourceAccount.account_id) throw new Error('Source account id missing')
      await connectTestOAuthAccount('github', sourceUser.id, providerId)
      await insertTestGithubFriend(sourceAccount.account_id, targetProviderId, new Date())
      sourceIds.push(providerId)
    }

    await connectOAuthAccountToUser('github', targetUser.id, targetProviderId)
    const firstPass = await Promise.all(
      sourceIds.map(
        async sourceId =>
          (await getTestFriend('github', sourceId, targetProviderId))[0] as {
            friend_github_account_id: string | null
          },
      ),
    )
    expect(
      firstPass.filter(row => row.friend_github_account_id === targetAccount.account_id),
    ).toHaveLength(1)
    expect(
      await cleanupOAuthFriendEdgePage(
        'github',
        'resolve',
        1,
        new Date('2100-01-01'),
        targetAccount.account_id,
      ),
    ).toMatchObject({ resolved: 1, hasMore: false })
    const completed = await Promise.all(
      sourceIds.map(
        async sourceId =>
          (await getTestFriend('github', sourceId, targetProviderId))[0] as {
            friend_github_account_id: string | null
          },
      ),
    )
    expect(completed.every(row => row.friend_github_account_id === targetAccount.account_id)).toBe(
      true,
    )
  })
})
