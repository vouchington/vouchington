import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as analytics from '@data-stores/analytics'
import { flush } from '@data-stores/analytics/backend-local'
import { expect, vi } from 'vitest'
import { createRandomString } from '../../data.mts'
import {
  overrideDynamicConfigFieldsForTest,
  type TestDynamicConfig,
} from '../../dynamic-config.mts'
import {
  acquireTestFriendRowLock,
  countTestFriends,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriends,
  setTestOAuthAccountAccessToken,
} from '../../entities/friends.mts'
import { connectTestOAuthAccount, insertTestOAuthAccount } from '../../entities/oauth-accounts.mts'
import { createTestUserDirect } from '../../entities/users-direct.mts'
import { softDeleteUser } from '../../entities/users-lifecycle.mts'

type FriendsBatchProvider = 'facebook' | 'x'
type FriendsBatchSync = (providerUserId: string) => Promise<void>
type FriendsBatchFetchSpy = {
  mockResolvedValueOnce(page: { ok: true; json: () => Promise<unknown> }): void
}
type FriendsBatchCase = {
  provider: FriendsBatchProvider
  providerUserIdPrefix: string
  syncFriends: FriendsBatchSync
  fetchSpy: FriendsBatchFetchSpy
}

async function createFriendsBatchSyncAccount(
  provider: FriendsBatchProvider,
  providerUserIdPrefix: string,
): Promise<{ providerUserId: string; userId: string }> {
  const providerUserId = `${providerUserIdPrefix}${createRandomString(12)}`
  const user = await createTestUserDirect()
  await insertTestOAuthAccount(provider, providerUserId, null)
  await connectTestOAuthAccount(provider, user.id, providerUserId)
  await setTestOAuthAccountAccessToken(provider, providerUserId, 'fake-access-token')
  return { providerUserId, userId: user.id }
}

function makeFriendIds(prefix: string): string[] {
  const suffix = createRandomString(10)
  return Array.from(
    { length: 4 },
    (_, index) => `${prefix}-${suffix}-${String(index).padStart(4, '0')}`,
  )
}

export async function assertFriendsPageCommitsBeforeDeletionFence(
  input: FriendsBatchCase & {
    firstFriendIdPrefix: string
    secondFriendIdPrefix: string
    firstPage: (friendId: string) => unknown
    secondPage: (friendId: string) => unknown
  },
): Promise<void> {
  const { providerUserId, userId } = await createFriendsBatchSyncAccount(
    input.provider,
    input.providerUserIdPrefix,
  )
  const firstFriendId = `${input.firstFriendIdPrefix}${createRandomString(10)}`
  const secondFriendId = `${input.secondFriendIdPrefix}${createRandomString(10)}`
  input.fetchSpy.mockResolvedValueOnce({
    ok: true,
    json: async () => input.firstPage(firstFriendId),
  })
  input.fetchSpy.mockResolvedValueOnce({
    ok: true,
    json: async () => {
      await softDeleteUser(userId)
      return input.secondPage(secondFriendId)
    },
  })

  await expect(input.syncFriends(providerUserId)).rejects.toThrow(
    'cannot own new data after deletion',
  )
  await expect(getTestFriend(input.provider, providerUserId, firstFriendId)).resolves.toHaveLength(
    1,
  )
  await expect(getTestFriend(input.provider, providerUserId, secondFriendId)).resolves.toEqual([])
  await expect(
    getTestOAuthAccountFriendsSyncedAt(input.provider, providerUserId),
  ).resolves.toBeNull()
}

export async function assertBoundedStaleFriendCleanup(
  input: FriendsBatchCase & {
    staleFriendIdPrefix: string
    emptyPage: unknown
    workConfig: TestDynamicConfig
  },
): Promise<void> {
  const { providerUserId } = await createFriendsBatchSyncAccount(
    input.provider,
    input.providerUserIdPrefix,
  )
  const friendIds = makeFriendIds(input.staleFriendIdPrefix)
  await insertTestFriends(input.provider, providerUserId, friendIds)
  const rowLock = await acquireTestFriendRowLock(input.provider, providerUserId, friendIds.at(-1)!)
  let sync: Promise<void> | undefined
  let rowLockReleased = false
  let restoreWorkLimit: (() => void) | undefined
  let pageRead: Awaited<ReturnType<typeof captureStaleFriendPageRead>> | undefined
  try {
    restoreWorkLimit = overrideDynamicConfigFieldsForTest(input.workConfig, {
      friend_mutation_batch_size: 3,
    })
    pageRead = await captureStaleFriendPageRead(input.provider)
    input.fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => input.emptyPage,
    })
    sync = input.syncFriends(providerUserId)
    await Promise.race([
      pageRead.completed,
      sync.then(() => {
        throw new Error('Sync finished before query event')
      }),
    ])
    await expect(countTestFriends(input.provider, providerUserId)).resolves.toBe(1)
    await rowLock.release()
    rowLockReleased = true
    await expect(sync).resolves.toBeUndefined()
    await expect(countTestFriends(input.provider, providerUserId)).resolves.toBe(0)
  } finally {
    try {
      if (!rowLockReleased) await rowLock.release()
    } finally {
      if (sync) await sync.catch(() => {})
      restoreWorkLimit?.()
      await pageRead?.dispose()
    }
  }
}

async function captureStaleFriendPageRead(
  provider: FriendsBatchProvider,
): Promise<{ completed: Promise<void>; dispose: () => Promise<void> }> {
  const annotation = provider === 'facebook' ? 'getStaleFacebookFriendIds' : 'getStaleXFriendIds'
  const completed = Promise.withResolvers<void>()
  const previous = {
    ANALYTICS_BACKEND: process.env.ANALYTICS_BACKEND,
    ANALYTICS_LOCAL_DIR: process.env.ANALYTICS_LOCAL_DIR,
    PG_QUERY_TIMING_SAMPLE: process.env.PG_QUERY_TIMING_SAMPLE,
  }
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oauth-friend-query-timing-'))
  let restoreSpy: (() => void) | undefined
  try {
    vi.stubEnv('ANALYTICS_BACKEND', 'local')
    vi.stubEnv('ANALYTICS_LOCAL_DIR', directory)
    vi.stubEnv('PG_QUERY_TIMING_SAMPLE', '1')
    const originalEmit = analytics.emit
    // Isolated backend-mocks fork: one active sync; annotation and fixture UUID scope proof.
    const spy = vi.spyOn(analytics, 'emit').mockImplementation((table, timing) => {
      originalEmit(table, timing)
      if (
        table === 'pg_query_timing' &&
        'annotation' in timing &&
        timing.annotation === annotation &&
        'pool' in timing &&
        timing.pool === 'write' &&
        'row_count' in timing &&
        timing.row_count === 1 &&
        'error' in timing &&
        !timing.error
      ) {
        restoreSpy?.()
        completed.resolve()
      }
    })
    restoreSpy = () => spy.mockRestore()
  } catch (err) {
    restoreEnvironment(previous)
    await fs.promises.rm(directory, { recursive: true, force: true })
    throw err
  }
  return {
    completed: completed.promise,
    async dispose() {
      restoreSpy?.()
      try {
        await flush()
      } finally {
        restoreEnvironment(previous)
        await fs.promises.rm(directory, { recursive: true, force: true })
      }
    },
  }
}
function restoreEnvironment(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) vi.stubEnv(key, value)
}
