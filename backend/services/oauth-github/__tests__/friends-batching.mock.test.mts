import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireTestFriendRowLock,
  connectTestOAuthAccount,
  countTestFriends,
  createRandomString,
  createTestUserDirect,
  getTestFriend,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestFriends,
  insertTestOAuthAccount,
  setTestOAuthAccountAccessToken,
  softDeleteUser,
} from '@voucha/test-helpers'
import { syncGithubFriends } from '../friends.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

describe('syncGithubFriends batching', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
  })

  it('commits a completed provider page before the next page reacquires the deletion fence', async () => {
    const { providerUserId, userId } = await createGithubSyncAccount()
    const firstFriendId = randomGithubId(2_000_000)
    const secondFriendId = randomGithubId(3_000_000)
    fetchSpy
      .mockResolvedValueOnce(
        githubResponse(
          [{ id: firstFriendId, login: 'first-friend' }],
          '<https://api.github.com/user/following?per_page=100&page=2>; rel="next"',
        ),
      )
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => {
          await softDeleteUser(userId)
          return [{ id: secondFriendId, login: 'second-friend' }]
        },
      })

    await expect(syncGithubFriends(providerUserId)).rejects.toThrow(
      'cannot own new data after deletion',
    )
    await expect(
      getTestFriend('github', providerUserId, String(firstFriendId)),
    ).resolves.toHaveLength(1)
    await expect(getTestFriend('github', providerUserId, String(secondFriendId))).resolves.toEqual(
      [],
    )
    await expect(getTestOAuthAccountFriendsSyncedAt('github', providerUserId)).resolves.toBeNull()
  })

  it('commits each bounded stale-row cleanup page separately', async () => {
    const { providerUserId } = await createGithubSyncAccount()
    const friendIds = makeFriendIds('github-stale')
    await insertTestFriends('github', providerUserId, friendIds)
    const rowLock = await acquireTestFriendRowLock('github', providerUserId, friendIds.at(-1)!)
    fetchSpy.mockResolvedValueOnce(githubResponse([]))

    const sync = syncGithubFriends(providerUserId)
    try {
      await expect.poll(() => countTestFriends('github', providerUserId)).toBe(1)
    } finally {
      await rowLock.release()
    }
    await expect(sync).resolves.toBeUndefined()
    await expect(countTestFriends('github', providerUserId)).resolves.toBe(0)
  })
})

async function createGithubSyncAccount(): Promise<{ providerUserId: string; userId: string }> {
  const providerUserId = String(randomGithubId(1_000_000))
  const user = await createTestUserDirect()
  await insertTestOAuthAccount('github', providerUserId, null)
  await connectTestOAuthAccount('github', user.id, providerUserId)
  await setTestOAuthAccountAccessToken('github', providerUserId, 'fake-access-token')
  return { providerUserId, userId: user.id }
}

function githubResponse(users: Array<{ id: number; login: string }>, link?: string): Response {
  return new Response(JSON.stringify(users), {
    status: 200,
    headers: link ? { Link: link } : undefined,
  })
}

function randomGithubId(offset: number): number {
  return offset + Math.floor(Math.random() * 500_000)
}

function makeFriendIds(prefix: string): string[] {
  const suffix = createRandomString(10)
  return Array.from(
    { length: 1001 },
    (_, index) => `${prefix}-${suffix}-${String(index).padStart(4, '0')}`,
  )
}
