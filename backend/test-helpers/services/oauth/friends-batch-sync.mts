import { expect } from 'vitest'
import { createRandomString } from '../../data.mts'
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
    { length: 1001 },
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
  },
): Promise<void> {
  const { providerUserId } = await createFriendsBatchSyncAccount(
    input.provider,
    input.providerUserIdPrefix,
  )
  const friendIds = makeFriendIds(input.staleFriendIdPrefix)
  await insertTestFriends(input.provider, providerUserId, friendIds)
  const rowLock = await acquireTestFriendRowLock(input.provider, providerUserId, friendIds.at(-1)!)
  input.fetchSpy.mockResolvedValueOnce({
    ok: true,
    json: async () => input.emptyPage,
  })

  const sync = input.syncFriends(providerUserId)
  try {
    await expect.poll(() => countTestFriends(input.provider, providerUserId)).toBe(1)
  } finally {
    await rowLock.release()
  }
  await expect(sync).resolves.toBeUndefined()
  await expect(countTestFriends(input.provider, providerUserId)).resolves.toBe(0)
}
