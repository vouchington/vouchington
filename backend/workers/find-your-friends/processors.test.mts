import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
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
import { processFriendsProviderDispatch } from './processors.mts'

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

describe('processFriendsProviderDispatch', () => {
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
    onTestFinished(
      overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
        facebook_batch_size: 2,
        facebook_max_rows_per_run: 10,
      }),
    )
    const saved: FriendsDispatchData[] = []

    const result = await processFriendsProviderDispatch(
      'facebook',
      {
        sweepStartedAt: await readTestDatabaseTimestamp(),
        upperId: window.upperId,
        afterId: window.afterId,
      },
      async next => {
        saved.push(next)
      },
    )

    expect(result).toEqual({ count: 3, hasMore: false })
    expect(saved.map(next => next.afterId)).toEqual([
      window.afterId,
      window.secondId,
      window.upperId,
    ])
    for (const accountId of accountIds) {
      expect(
        await findYourFriendsQueue.searchJobs({
          name: 'syncFacebookFriends',
          data: { facebookAccountId: accountId },
        }),
      ).not.toEqual([])
    }
  })

  for (const { provider, syncName, key } of providers) {
    it(`enqueues only ${provider} accounts from its own job`, async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
          [`${provider}_batch_size`]: 2,
          [`${provider}_max_rows_per_run`]: 10,
        }),
      )
      const window = createTestOAuthAccountSweepWindow()
      await insertEligibleAccount(provider, window.upperId)

      const result = await processFriendsProviderDispatch(provider, {
        sweepStartedAt: await readTestDatabaseTimestamp(),
        upperId: window.upperId,
        afterId: window.afterId,
      })

      expect(result).toEqual({ count: 1, hasMore: false })
      expect(
        await findYourFriendsQueue.searchJobs({
          name: syncName,
          data: { [key]: window.upperId },
        }),
      ).not.toEqual([])
      for (const other of providers.filter(candidate => candidate.provider !== provider)) {
        expect(
          await findYourFriendsQueue.searchJobs({
            name: other.syncName,
            data: { [other.key]: window.upperId },
          }),
        ).toEqual([])
      }
    })
  }

  it('starts a sweep by reading the provider upper id', async () => {
    const window = createTestOAuthAccountSweepWindow()
    await insertEligibleAccount('facebook', window.upperId)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
        facebook_batch_size: 1,
        facebook_max_rows_per_run: 1,
      }),
    )
    const saved: FriendsDispatchData[] = []

    await processFriendsProviderDispatch('facebook', {}, async next => {
      saved.push(next)
    })

    const facebookUpperId = saved[0]?.upperId
    expect(
      [window.upperId, facebookUpperId]
        .toSorted((a, b) => Number(String(a) > String(b)) - Number(String(a) < String(b)))
        .at(-1),
    ).toBe(facebookUpperId)
    expect(saved[0]?.sweepStartedAt).toEqual(expect.any(String))
  })
})
