import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  insertTestOAuthAccount,
  readTestDatabaseTimestamp,
  setTestOAuthAccountTokens,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestOAuthAccountSweepWindow } from '@voucha/test-helpers/oauth-account-sweep-window'
import { friendsDispatchConfig } from '@services/friend-recommendations/work-limits'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import type { FriendsDispatchData } from '@queues/find-your-friends/types'
import { processFindYourFriendsDispatcher } from './processors.mts'

const providers = [
  { provider: 'facebook', syncName: 'syncFacebookFriends', key: 'facebookAccountId' },
  { provider: 'x', syncName: 'syncXFriends', key: 'xAccountId' },
  { provider: 'github', syncName: 'syncGithubFriends', key: 'githubAccountId' },
] as const

async function insertEligibleAccount(
  provider: (typeof providers)[number]['provider'],
  accountId: string,
): Promise<void> {
  const providerUserId = `dispatch-${randomUUID()}`
  const owner = await createTestUser()
  const account = await insertTestOAuthAccount(provider, providerUserId, null, accountId)
  expect(account.account_id).toBe(accountId)
  await connectTestOAuthAccount(provider, owner.id, providerUserId)
  await setTestOAuthAccountTokens(provider, providerUserId, {
    accessToken: 'synthetic-access-token',
  })
}

describe('processFindYourFriendsDispatcher', () => {
  beforeAll(() =>
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    ),
  )
  afterAll(() => vi.unstubAllEnvs())

  it('enqueues owned accounts in batches and saves progress after each batch', async () => {
    const window = createTestOAuthAccountSweepWindow()
    const accountIds = [window.firstId, window.secondId, window.upperId]
    for (const accountId of accountIds) await insertEligibleAccount('facebook', accountId)
    overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
      batch_size: 2,
      max_rows_per_provider_per_run: 10,
    })
    const saved: FriendsDispatchData[] = []

    const result = await processFindYourFriendsDispatcher(
      {
        sweepStartedAt: await readTestDatabaseTimestamp(),
        upperIds: { facebook: window.upperId, x: null, github: null },
        afterIds: { facebook: window.afterId },
      },
      async next => {
        saved.push(next)
      },
    )

    expect(result).toEqual({ count: 3, hasMore: false })
    expect(saved.map(next => next.afterIds?.facebook)).toEqual([
      window.afterId,
      window.secondId,
      window.upperId,
      window.upperId,
      window.upperId,
      window.upperId,
    ])
    expect(saved.at(-1)?.finishedProviders).toEqual(['facebook', 'x', 'github'])
    for (const accountId of accountIds) {
      expect(
        await findYourFriendsQueue.searchJobs({
          name: 'syncFacebookFriends',
          data: { facebookAccountId: accountId },
        }),
      ).not.toEqual([])
    }
  })

  it('counts accounts across all providers', async () => {
    overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
      batch_size: 2,
      max_rows_per_provider_per_run: 10,
    })
    const windows = {
      facebook: createTestOAuthAccountSweepWindow(),
      x: createTestOAuthAccountSweepWindow(),
      github: createTestOAuthAccountSweepWindow(),
    }
    for (const { provider } of providers)
      await insertEligibleAccount(provider, windows[provider].upperId)

    const result = await processFindYourFriendsDispatcher({
      sweepStartedAt: await readTestDatabaseTimestamp(),
      upperIds: {
        facebook: windows.facebook.upperId,
        x: windows.x.upperId,
        github: windows.github.upperId,
      },
      afterIds: {
        facebook: windows.facebook.afterId,
        x: windows.x.afterId,
        github: windows.github.afterId,
      },
    })

    expect(result).toEqual({ count: 3, hasMore: false })
    for (const { provider, syncName, key } of providers) {
      expect(
        await findYourFriendsQueue.searchJobs({
          name: syncName,
          data: { [key]: windows[provider].upperId },
        }),
      ).not.toEqual([])
    }
  })
})
