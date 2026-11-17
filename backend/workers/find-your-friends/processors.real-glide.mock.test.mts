import { createTestOAuthAccountSweepWindow } from '@voucha/test-helpers/oauth-account-sweep-window'
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
import { friendsDispatchConfig } from '@services/friend-recommendations/work-limits'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import type { FriendsDispatchData } from '@queues/find-your-friends/types'
import { processFriendsProviderDispatch } from './processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('friend provider dispatch continuations', () => {
  beforeAll(() =>
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    ),
  )
  afterAll(() => vi.unstubAllEnvs())
  afterAll(() => findYourFriendsQueue.close())

  it('continues after a raw account page with no eligible credentials', async () => {
    const prefix = `raw-page-${randomUUID()}`
    const window = createTestOAuthAccountSweepWindow()
    const owner = await createTestUser()
    const first = `${prefix}-first`
    const second = `${prefix}-second`
    await insertTestOAuthAccount('facebook', first, null, window.firstId)
    await insertTestOAuthAccount('facebook', second, null, window.secondId)
    await connectTestOAuthAccount('facebook', owner.id, second)
    await setTestOAuthAccountTokens('facebook', second, { accessToken: 'synthetic-access-token' })
    overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
      facebook_batch_size: 1,
      facebook_max_rows_per_run: 1,
    })
    const data: FriendsDispatchData = {
      sweepStartedAt: await readTestDatabaseTimestamp(),
      upperId: window.secondId,
      afterId: window.afterId,
    }
    const saved: FriendsDispatchData[] = []
    expect(
      await processFriendsProviderDispatch('facebook', data, async next => {
        saved.push(next)
      }),
    ).toEqual({ count: 0, hasMore: true })
    expect(saved.at(-1)?.afterId).toBe(window.firstId)
    expect(await processFriendsProviderDispatch('facebook', saved.at(-1)!)).toEqual({
      count: 1,
      hasMore: true,
    })
  })

  for (const provider of ['facebook', 'x', 'github'] as const) {
    it(`reaches ${provider} tails despite unfinished earlier accounts`, async () => {
      const prefix = `bounded-${randomUUID()}`
      const ids = ['a', 'b', 'c'].map(suffix => `${prefix}-${suffix}`)
      const window = createTestOAuthAccountSweepWindow()
      const accountIds = [window.firstId, window.secondId, window.upperId]
      for (const [index, id] of ids.entries()) {
        const owner = await createTestUser()
        const account = await insertTestOAuthAccount(provider, id, null, accountIds[index])
        expect(account.account_id).toBe(accountIds[index])
        await connectTestOAuthAccount(provider, owner.id, id)
        await setTestOAuthAccountTokens(provider, id, { accessToken: 'synthetic-access-token' })
      }
      overrideDynamicConfigFieldsForTest(friendsDispatchConfig, {
        [`${provider}_batch_size`]: 1,
        [`${provider}_max_rows_per_run`]: 1,
      })
      // The sweep cutoff is `created_at <= sweepStartedAt`. The runner clock can lag PostgreSQL,
      // so a timestamp taken here can fall before the last insert and drop that tail row.
      const sweepStartedAt = await readTestDatabaseTimestamp()
      const data: FriendsDispatchData = {
        sweepStartedAt,
        upperId: accountIds[2]!,
        afterId: window.afterId,
      }
      expect(
        await processFriendsProviderDispatch(provider, {
          ...data,
          sweepStartedAt: '1970-01-01T00:00:00.000Z',
        }),
      ).toEqual({ count: 0, hasMore: true })
      expect(
        await processFriendsProviderDispatch(provider, { ...data, upperId: accountIds[0]! }),
      ).toEqual({ count: 1, hasMore: true })
      const saved: FriendsDispatchData[] = []
      expect(
        await processFriendsProviderDispatch(provider, data, async next => {
          saved.push(next)
        }),
      ).toEqual({ count: 1, hasMore: true })
      const resumed = saved.at(-1)!
      expect(resumed.afterId).toBe(accountIds[0])
      const laterId = `${prefix}-bb`
      const laterOwner = await createTestUser()
      const laterAccountId = (await insertTestOAuthAccount(provider, laterId)).account_id!
      await connectTestOAuthAccount(provider, laterOwner.id, laterId)
      await setTestOAuthAccountTokens(provider, laterId, { accessToken: 'synthetic-access-token' })
      expect(await processFriendsProviderDispatch(provider, resumed)).toEqual({
        count: 1,
        hasMore: true,
      })
      expect(
        await processFriendsProviderDispatch(provider, { ...resumed, afterId: accountIds[1]! }),
      ).toEqual({ count: 1, hasMore: true })
      // No sync job has run: the first account remains eligible and is retried on a new sweep.
      expect(await processFriendsProviderDispatch(provider, data)).toEqual({
        count: 1,
        hasMore: true,
      })
      const syncName = {
        facebook: 'syncFacebookFriends',
        x: 'syncXFriends',
        github: 'syncGithubFriends',
      }[provider]
      const key = { facebook: 'facebookAccountId', x: 'xAccountId', github: 'githubAccountId' }[
        provider
      ]
      for (const accountId of accountIds) {
        expect(
          await findYourFriendsQueue.searchJobs({ name: syncName, data: { [key]: accountId } }),
        ).not.toEqual([])
      }
      expect(
        await findYourFriendsQueue.searchJobs({ name: syncName, data: { [key]: laterAccountId } }),
      ).toEqual([])
    })
  }
})
