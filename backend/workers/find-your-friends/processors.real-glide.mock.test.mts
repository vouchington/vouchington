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
      for (const id of ids) {
        const owner = await createTestUser()
        await insertTestOAuthAccount(provider, id)
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
        upperIds: { facebook: null, x: null, github: null, [provider]: ids[2]! },
        afterIds: { [provider]: `${prefix}-0` },
      }
      const saved: FriendsDispatchData[] = []
      expect(
        await processFindYourFriendsDispatcher(undefined, data, async next => {
          saved.push(next)
        }),
      ).toEqual({ count: 1, hasMore: true })
      const resumed = saved.at(-1)!
      expect(resumed.afterIds?.[provider]).toBe(ids[0])
      const laterId = `${prefix}-bb`
      const laterOwner = await createTestUser()
      await insertTestOAuthAccount(provider, laterId)
      await connectTestOAuthAccount(provider, laterOwner.id, laterId)
      await setTestOAuthAccountTokens(provider, laterId, { accessToken: 'synthetic-access-token' })
      expect(await processFindYourFriendsDispatcher(undefined, resumed)).toEqual({
        count: 1,
        hasMore: true,
      })
      expect(
        await processFindYourFriendsDispatcher(undefined, {
          ...resumed,
          afterIds: { ...resumed.afterIds, [provider]: ids[1]! },
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
      const key = { facebook: 'facebookUserId', x: 'xUserId', github: 'githubUserId' }[provider]
      expect(
        await findYourFriendsQueue.searchJobs({ name: syncName, data: { [key]: laterId } }),
      ).toEqual([])
    })
  }
})
