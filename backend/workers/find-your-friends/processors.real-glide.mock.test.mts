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
import { processFindYourFriendsDispatcher } from './processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('friend dispatcher continuations', () => {
  beforeAll(() =>
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    ),
  )
  afterAll(() => vi.unstubAllEnvs())
  afterAll(() => findYourFriendsQueue.close())

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
        batch_size: 1,
        max_rows_per_provider_per_run: 1,
      })
      // The sweep cutoff is `created_at <= sweepStartedAt`. The runner clock can lag PostgreSQL,
      // so a timestamp taken here can fall before the last insert and drop that tail row.
      const sweepStartedAt = await readTestDatabaseTimestamp()
      const data: FriendsDispatchData = {
        sweepStartedAt,
        upperIds: { facebook: null, x: null, github: null, [provider]: accountIds[2]! },
        afterIds: { [provider]: window.afterId },
      }
      expect(
        await processFindYourFriendsDispatcher(undefined, {
          ...data,
          sweepStartedAt: '1970-01-01T00:00:00.000Z',
        }),
      ).toEqual({ count: 0, hasMore: false })
      expect(
        await processFindYourFriendsDispatcher(undefined, {
          ...data,
          upperIds: { facebook: null, x: null, github: null, [provider]: accountIds[0]! },
        }),
      ).toEqual({ count: 1, hasMore: false })
      const saved: FriendsDispatchData[] = []
      expect(
        await processFindYourFriendsDispatcher(undefined, data, async next => {
          saved.push(next)
        }),
      ).toEqual({ count: 1, hasMore: true })
      const resumed = saved.at(-1)!
      expect(resumed.afterIds?.[provider]).toBe(accountIds[0])
      const laterId = `${prefix}-bb`
      const laterOwner = await createTestUser()
      const laterAccountId = (await insertTestOAuthAccount(provider, laterId)).account_id!
      await connectTestOAuthAccount(provider, laterOwner.id, laterId)
      await setTestOAuthAccountTokens(provider, laterId, { accessToken: 'synthetic-access-token' })
      expect(await processFindYourFriendsDispatcher(undefined, resumed)).toEqual({
        count: 1,
        hasMore: true,
      })
      expect(
        await processFindYourFriendsDispatcher(undefined, {
          ...resumed,
          afterIds: { ...resumed.afterIds, [provider]: accountIds[1]! },
        }),
      ).toEqual({ count: 1, hasMore: false })
      // No sync job has run: the first account remains eligible and is retried on a new sweep.
      expect(await processFindYourFriendsDispatcher(undefined, data)).toEqual({
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
